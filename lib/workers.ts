import { Worker, IWorker, IWorkerOptions, LogLevel, Logger } from './base';
import axios, { AxiosResponse } from 'axios';
import { AlpacasExchange, Exchange } from './exchange';
import * as Alpacas from '@master-chief/alpaca';
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import * as exception from './exceptions';
import { INotification, NotificationOptions } from './notification';
import { IPurchaseOptions, ITickerChange, IStockChange, BaseStockEvent } from './stock-bot';
import { IDataStore, DataStoreObject } from './data-store';
import { IDataSource, SocialMediaOutput, TwitterAccountType } from './data-source';
import { ActionSignal, ConfidenceScoreOptions, convertDate, createDeferredPromise, extractTweetSignals, getConfidenceScore, getTickerSnapshot, isHighVolume, minutesSinceOpen, returnLastOpenDay, Timer, TweetSignal } from './util';
import { RequestError } from './exceptions';
import { PolygonAggregates, PolygonTickerSnapshot, Snapshot } from '../types';
import { Decimal } from 'decimal.js';
import colors from 'randomcolor';
import { inspect } from 'util';

export interface IStockWorkerOptions<T, TOrderInput, TOrder> extends IWorkerOptions<T> {
    purchaseOptions: IPurchaseOptions;
    // exchange: Exchange<TOrderInput, TOrderInput, TOrder>;
    exchange: AlpacasExchange;
    dataStore: IDataStore<T>;
    dataSource: IDataSource<T>;
    notification: INotification;
    accountPercent: number;
}

//Required interface to allow generic construction of the StockWorker(s)
export interface IStockWorker<TInput, TOuput = any> extends IWorker<TInput, TOuput> {
    new (options: IStockWorkerOptions<BaseStockEvent, Alpacas.PlaceOrder, Alpacas.Order>): IStockWorker<TInput, TOuput>;
};

/*
    Superset the base Worker, so that we can expand upon the StockServiceWorker if needed
    All new algos should extend this class
*/
export abstract class StockWorker<T> extends Worker<T> {
    datastore: IDataStore<T, DataStoreObject<T>>;
    datasource: IDataSource<T>;
    exchange: AlpacasExchange;
    notification: INotification;
    accountPercent: number;
    
    constructor(options: IStockWorkerOptions<T, Alpacas.PlaceOrder, Alpacas.Order>) { //TODO: Needs to be more generically typed
        super(options);
        this.datastore = options.dataStore;
        this.datasource = options.dataSource;
        this.exchange = options.exchange;
        this.notification = options.notification;
        this.metric = options.metric;
        this.accountPercent  = options.accountPercent;
    }
}

export class TopGainerNotificationStockWorker extends StockWorker<ITickerChange> {
    private purchaseOptions: IPurchaseOptions;

    constructor(options: IStockWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>) {
        super(options);
        this.purchaseOptions = options.purchaseOptions;
    }

    process(ticker: ITickerChange): Promise<void> {
        return this._processTicker(ticker);
    }

    //TODO: Create algo for understanding what is a good stock to purchase, and what is the stop limit and take profit limit
    _processTicker(ticker: ITickerChange): Promise<void> {
        return this.getPrevStockPrice(ticker.ticker, this.purchaseOptions.prevStockPriceOptions.unit, this.purchaseOptions.prevStockPriceOptions.measurement)
        .then((prevStockPrice: number) => {
            let changePercent = this.getChangePercent(prevStockPrice, ticker.price);
            this.logger.log(LogLevel.TRACE, `Change Percent ${changePercent.percentChange} ${changePercent.persuasion} for ${ticker.ticker}`)
            let takeProfitDollarAmount = ticker.price + (ticker.price * this.purchaseOptions.takeProfitPercentage);
            let stopLossDollarAmount = ticker.price - (ticker.price * this.purchaseOptions.stopLimitPercentage);
            //TODO: Make the expected percentChange expectation configurable in the service
            if((changePercent.percentChange >= .005 && changePercent.persuasion === 'up') && (ticker.price <= this.purchaseOptions.maxSharePrice)) {
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    volume: Number(ticker.currentVol),
                    message: `${ticker.ticker} is up ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        exchange: this.exchange.constructor.name,
                        takeProfitAt: takeProfitDollarAmount,
                        cutLossesAt: stopLossDollarAmount,
                        //TODO: this will break for a yahoo data source, will need to fix
                        //TODO: should probably standardize all these to volumes per minute so they are easier to compare
                        volumeInfo: `Volum was ${ticker.prevDayVol} yesterday, it was ${ticker.prevMinVol} in the past minute`,
                        // current price > vwap is a buy signal fwiw
                        vwap: `The vwap is currently ${ticker.currentVwap}, it was ${ticker.prevDayVwap} yesterday, it was ${ticker.prevMinVwap} in the past minute`,
                        //TODO: calculate current price as a delta% of the below values
                        highOfDay: `${ticker.highOfDay}`,
                        lowOfDay: `${ticker.lowOfDay}`,
                        prevClosePrice: `${ticker.prevDayClose}`,
                        'DataSource': this.datasource.constructor.name,
                        'Action': ActionSignal.UNKNOWN,
                    }
                });
            } else {
                // We need to see if we are missing out on good buys
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    message: `${ticker.ticker} would not alert, it is ${changePercent.persuasion} ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        'Exchange': this.exchange.constructor.name,
                        'DataSource': this.datasource.constructor.name,
                        'Action': ActionSignal.UNKNOWN
                    }
                });
            }
        })
    }

    //TODO: This needs to be on the Exchange interface, this should not be something that a worker can do by itself.
    getPrevStockPrice(ticker: string, amount: number = 15,  unit: moment.DurationInputArg2 = 'minutes', limit: number = 100): Promise<number> {
        let nycTime = momentTimezone.tz(new Date().getTime(), 'America/New_York').subtract(amount, unit);
        let timestamp = nycTime.valueOf();
        return axios.get(`https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${nycTime.format('YYYY-MM-DD')}`, {
            params: {
                timestamp: timestamp,
                limit,
                apiKey: process.env['ALPACAS_API_KEY'] || "",
                reverse: false
            }
        })
        .then((data: AxiosResponse) => {
            //TODO: We should create a type for the data returned here
            if(data.data.results_count > 0) {
                let priceAsNumber = Number(data.data.results[data.data.results_count -1].p);
                return Number(priceAsNumber.toFixed(2));
            } else {
                this.logger.log(LogLevel.ERROR, `Failed to get previous price for ${ticker}`)
                throw new exception.UnprocessableTicker(ticker);
            }
        });
    }

    //Here we take the different prices, and come up with the % of change in the stock price
    getChangePercent(prevPrice: number, currentPrice: number): IStockChange {
        let change: number = (currentPrice - prevPrice) / prevPrice;
        let isPositive: boolean = !change.toString().includes('-');
        let removedSymbols = parseFloat(change.toString().replace('-', ""));
        change = Number(removedSymbols.toFixed(3)); //NOTE: This does rounding to the nearest number
        return { percentChange: change, persuasion: isPositive ? 'up' : 'down' };
    }
}

// {
//     "ev": "Q",              // Event Type
//     "sym": "MSFT",          // Symbol Ticker
//     "bx": 4,                // Bix Exchange ID
//     "bp": 114.125,          // Bid Price
//     "bs": 100,              // Bid Size
//     "ax": 7,                // Ask Exchange ID
//     "ap": 114.128,          // Ask Price
//     "as": 160,              // Ask Size
//     "c": 0,                 // Quote Condition
//     "t": 1536036818784      // Quote Timestamp ( Unix MS )
// }

export interface QuoteEvent extends BaseStockEvent {
    ev: string;
    sym: string;
    bx: number;
    bp: number;
    bs: number;
    ax: number;
    ap: number;
    as: number;
    c: number;
    t: number;
}

// {
//     "ev": "T",              // Event Type
//     "sym": "MSFT",          // Symbol Ticker
//     "x": 4,                 // Exchange ID
//     "i": "12345",           // Trade ID
//     "z": 3,                 // Tape ( 1=A 2=B 3=C)
//     "p": 114.125,           // Price
//     "s": 100,               // Trade Size
//     "c": [0, 12],           // Trade Conditions
//     "t": 1536036818784      // Trade Timestamp ( Unix MS )
// }

export interface TradeEvent extends BaseStockEvent {
    ev: string;
    sym: string;
    x: number;
    i: string;
    z: number;
    p: number;
    s: number;
    c: number[];
    t: number;
}

export class LiveDataStockWorker extends StockWorker<TradeEvent> {

    constructor(options: IStockWorkerOptions<TradeEvent, Alpacas.PlaceOrder, Alpacas.Order>) {
        super(options);
    }

    /*
        The use of this worker assumes the the PolygonLiveDataSource DataSource in the service
        The reason for this is that we expect the data that is coming through to be a different type than ITickerChange 

        Because of this, we first want to store the data (for the safety of verifying we successfully saved the data in case of a restart) before trying to process it
        
    */
    process(currTrade: TradeEvent): Promise<void> {
        //Track # of processed tickers
        this.metric.push({
            'processedTickers': {
                value: 1,
                labels: {}
            }
        });

        this.logger.log(LogLevel.INFO, `${this.constructor.name} processing ${currTrade.ticker}`);
        this.logger.log(LogLevel.TRACE, `${this.constructor.name}:process(${JSON.stringify(currTrade)})`);
        const ticker = currTrade.sym;
        return this.datastore.get(ticker) //Fetch the previous quote
        .then(data => data as unknown as TradeEvent[]) //TODO: This is required because the DataStore interface only allows DataStoreObject, should change this
        .then((data: TradeEvent[]) => {
            return this.exchange.getClock()
            .then((d) => {
                return [d.is_open, data] as [boolean, TradeEvent[]]; //Not sure why I need to do this, the next then block interprets it poorly
            })            
        })
        .then(([isOpen, data]: [boolean, TradeEvent[]]) => {

            let returnPromise = Promise.resolve();

            if (!isOpen) {
                this.logger.log(LogLevel.TRACE, `Market currently close, disregarding.`);
                return returnPromise;
            }

            if (!(data.length === 1)) {
                this.logger.log(LogLevel.TRACE, `No data in datastore for ${ticker}`);
                //This is the first receive for a ticker, skip the analysis and just store this event in the DB
                return Promise.resolve();
            } else {
                this.logger.log(LogLevel.TRACE, `PrevTrade: ${JSON.stringify(data)}`)
                const [ prevTrade ]: TradeEvent[] = data;


                if (new Decimal(currTrade.p).lessThanOrEqualTo(prevTrade.p)) {
                    this.logger.log(LogLevel.INFO, `Skipping ${ticker} for processing, it is at a loss currently.`);
                    return returnPromise;
                }

                const currTradeSeconds = new Decimal(currTrade.t).dividedBy(1000);
                const prevTradeSeconds = new Decimal(prevTrade.t).dividedBy(1000);
                const timeTaken = currTradeSeconds.minus(prevTradeSeconds);
                const changePercentPerMinute: Decimal = new Decimal(this._getChangePercentPerMinute(currTrade, prevTrade));

                const aboveClosePrice = createDeferredPromise();
                const vwapPromise = getTickerSnapshot(ticker)
                .then(snapshotData => {
                    aboveClosePrice.resolve(snapshotData);
                    return (snapshotData.day.vw > currTrade.p);
                });

                if (isNaN(changePercentPerMinute.toNumber())) {
                    return Promise.reject(new exception.InvalidDataError(`${ticker} has a bad calculation. Current Price ${currTrade.p} -- Previous Price: ${prevTrade.p}`));
                }

                this.logger.log(LogLevel.INFO, `${ticker} has changed ${changePercentPerMinute.toNumber()} per minute. Time Taken Between Samples: ${timeTaken} seconds`);

                //If the change percent is greater than .1% per minute, notify
                if (changePercentPerMinute.greaterThanOrEqualTo(0.0005) && timeTaken.greaterThanOrEqualTo(180)) {

                    this.metric.push({
                        'minRequirementTicker': {
                            value: 1,
                            labels: {
                                'ticker': ticker
                            }
                        }
                    });

                    const confidenceOptions: ConfidenceScoreOptions = {
                        'relativeVolume': {
                            value: 5,
                            process: this._getRelativeVolume(ticker).then(relativeVolume => !!(relativeVolume >= 2))
                        },
                        'vwap': {
                            value: 5,
                            process: vwapPromise
                        },
                        'aboveOpenPrice': {     //Note: Probably wouldn't work in pre-market hours
                            value: 5,
                            process: aboveClosePrice.promise.then((snapshotData: Snapshot) => !!(currTrade.p > snapshotData.day.o))
                        },
                        'totalVolume': {
                            value: 5,
                            process: isHighVolume(ticker)
                        }
                    }

                    //Calculating this here so we don't make this calculation for every ticker, this should only be run for potential tickers
                    //TODO: Would be nice to be able to confidenceOptions displayed in additionalData below to see which indicators are giving positive values
                    returnPromise
                    .then(() => getConfidenceScore(confidenceOptions))
                    .then((confidenceScore: number) => {
                        this.logger.log(LogLevel.INFO, `Fetched confidence score for ${ticker} - Got Score: ${confidenceScore}`);

                        this.metric.push({
                            'confidenceScore': {
                                value: confidenceScore / 100,
                                labels: {}
                            }
                        });

                        if (confidenceScore >= 49) {
                            this.logger.log(LogLevel.INFO, `${ticker} has the required increase and confidence to notify in Discord`);

                            this.metric.push({
                                'confidentTicker': {
                                    value: 1,
                                    labels: {}
                                }
                            });
                        
                            return this.notification.notify({
                                ticker: ticker,
                                price: currTrade.p,
                                message: `Ticker ${ticker} has a rate of increase ${changePercentPerMinute.toFixed(2)}% per minute.`,
                                additionaData: {
                                    'Exchange': this.exchange.constructor.name,
                                    'DataSource': this.datasource.constructor.name,
                                    'Measure Time': `${(((currTrade.t / 1000) - (prevTrade.t / 1000)) / 60).toFixed(2)} Minutes`,
                                    'Previous Price': `${prevTrade.p}`,
                                    'Action Recommendation': 'Purchase',
                                    'Confidence Score': `${confidenceScore}%`,
                                    'Action': ActionSignal.UNKNOWN
                                }
                            })
                            .then(() => {
                                this.logger.log(LogLevel.TRACE, `${this.notification.constructor.name}#notify():SUCCESS`);
                            });
                        } else {
                            this.logger.log(LogLevel.INFO, `Confidence score too low for ${ticker}`);
                        }
                    });
                }
            }

            return returnPromise;
        })
        .then(() => {
            this.logger.log(LogLevel.TRACE, `Completed process()`);
        })
        .finally(() => this.datastore.save(ticker, currTrade)); //Timeout each ticker for 3 minutes
    }

    /**
     * Get the ratio of change given the change % of a stock, and the time it's been between the two compared values
     * @param changePercent The percent the stock has change. This is notated by 1's, i.e 1 == 1%
     * @param timeInSeconds The time (in seconds) of the time taken between the two compared values
     */

    _getChangePercentPerMinute (currTrade: TradeEvent, prevTrade: TradeEvent): number {
        this.logger.log(LogLevel.TRACE, `currQuote: ${currTrade.p} prevQuote: ${prevTrade.p} -- currQuote.t = ${currTrade.t} --- prevQuote.t = ${prevTrade.t}`);
        this.logger.log(LogLevel.TRACE, `Time difference in seconds: ${((currTrade.t / 1000) - (prevTrade.t / 1000))}`);
        let currTradePrice = new Decimal(currTrade.p);
        let prevTradePrice = new Decimal(prevTrade.p);
        // This gets the difference between the two quotes, and get's the % of that change of a share price. i.e (11 - 10) / 11 = 10%;
        let changePercent = new Decimal(currTradePrice.minus(prevTradePrice)).dividedBy(currTradePrice).times(100);

        console.log(`ChangePercent: ${changePercent.toString()}`)
        
        //Gets time difference in seconds, and translate to minutes
        let currTradeSeconds = new Decimal(currTrade.t).dividedBy(1000);
        let prevTradeSeconds = new Decimal(prevTrade.t).dividedBy(1000);

        let timeDifferenceInMinutes = new Decimal(new Decimal(currTradeSeconds).minus(prevTradeSeconds)).dividedBy(60);

        console.log(`TimeDifferenceInSeconds: ${timeDifferenceInMinutes.toString()}`)

        //Returns the rate of increase (as a percentage) per minute;
        return changePercent.dividedBy(timeDifferenceInMinutes).toNumber();
    }

    /**
     * Calculates the relative volume.
     * This is the volume for the current day uptil the current minute / the volume from open until that respective minute for the last trading day.
     * For example the relative volume of a ticker at 10:30AM on a Tuesday would be the ratio of the days volume so far and the total volume from open till 10:30AM on Monday (the last trading day)
    */
    async _getRelativeVolume (ticker: string): Promise<number> {
        const lastDay: Date = new Date()
        const yesterday: Date = new Date()

        yesterday.setDate(yesterday.getDate() - 1)
        lastDay.setDate(await returnLastOpenDay(yesterday))
        
        const lastDate: string = convertDate(lastDay)

        const minutesPassed: number = minutesSinceOpen()

        return Promise.all([
            axios.get(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${lastDate}/${lastDate}`, {
                params: {
                    apiKey: process.env['ALPACAS_API_KEY'] || "",
                    sort: 'asc',
                    limit: minutesPassed
                }
            }), getTickerSnapshot(ticker)
        ])
        .then((data) => { 
            const lastDayData: PolygonAggregates = data[0].data
            const today: Snapshot = data[1]
            return (lastDayData.results.reduce((a:any,b:any) => a + parseInt(b['v']), 0) as number) / (today.day.v)
        }).catch(err => {
            return Promise.reject(new RequestError(`Error in ${this.constructor.name}._getRelativeVolume(): innerError: ${err} -- ${JSON.stringify(err)}`));
        })
    }
}

export class SocialMediaWorker extends StockWorker<SocialMediaOutput> {

    process(input: SocialMediaOutput): Promise<void> {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}:process(${JSON.stringify(input)})`);

        //TODO: Since the tweets that make it to here are viable (filtered by the TwitterDataSource),
        // we can always output them to the Notification class since we want a log (and alert) on any processed tweet

        const { type, message } = input;
        const notificationMessage: NotificationOptions = {
            ticker: '',
            message,
            color: colors(),
            additionaData: {
                'Alert Type': type.toString(),
                'User': input.account_name,
                'Action': ActionSignal.UNKNOWN
            }
        }

        const socialMediaMessage: NotificationOptions = {
            ticker: '',
            message,
            color: colors(),
            additionaData: {
                'User': input.account_name,
                'Action': ActionSignal.UNKNOWN
            },
            urls: input.urls,
            socialMediaMessage: true
        }

        let signals: TweetSignal[] = extractTweetSignals(message);
        const returnPromise: Promise<void> = Promise.resolve();
        
        if (type === TwitterAccountType.SWING_POSITION) {

            this.logger.log(LogLevel.INFO, `Got signals for ${TwitterAccountType.SWING_POSITION} -- Signals: ${JSON.stringify(signals)}`);

            for(let signal of signals) {
                if(signal.action == ActionSignal.UNKNOWN) {
                    this.logger.log(LogLevel.INFO, `Tweet did not qualify for swing position.`);
                } else {
                    const ticker = signal.ticker;
                    notificationMessage.additionaData!['Action'] = signal.action;
                    returnPromise
                    .then(() => this.exchange.getPriceByTicker(ticker))
                    .then((price: number) => {
                        if(signal.action == ActionSignal.BUY) {
                            return Promise.all([ this.exchange.sizePosition(ticker, this.accountPercent, signal.sizing), this.exchange.getBuyingPower() ])
                            .then(([ qty, buyingPower]: [number, number]) => {
                                const TOTAL_COST: number = new Decimal(qty * price).toNumber();
                                this.logger.log(LogLevel.INFO, `Buying ${qty} shares of ${ticker} for ${TOTAL_COST}. We have ${buyingPower} Buying Power`);
                                notificationMessage.price = price;
                                notificationMessage.additionaData!['Action'] = ActionSignal.BUY;
                                
                                if (buyingPower > TOTAL_COST) {
                                    return this.exchange.placeOrder({
                                        symbol: ticker,
                                        qty: Math.ceil(qty),
                                        side: 'buy',
                                        time_in_force: 'day',
                                        type: 'market',
                                    }).then(() => {
                                        this.logger.log(LogLevel.INFO, `Placed a BUY for ${ticker} as a ${TwitterAccountType.SWING_POSITION}.`);
                                    });

                                } else {
                                    return Promise.resolve();
                                }
                            })
                        } else if(signal.action == ActionSignal.SELL) {
                            this.logger.log(LogLevel.INFO, `Got SELL action for ${ticker}`);
                            return this.exchange.getPositionQty(ticker)
                            .then((qty: number) => {
                                notificationMessage.additionaData!['Action'] = ActionSignal.SELL;
                                this.logger.log(LogLevel.INFO, `Selling ${qty} shares of ${ticker}`);

                                return this.exchange.placeOrder({
                                    symbol: ticker,
                                    qty: qty,
                                    side: 'sell',
                                    time_in_force: 'day',
                                    type: 'market',
                                }).then(() => {
                                    this.logger.log(LogLevel.INFO, `Placed a SELL for ${ticker} as a ${TwitterAccountType.SWING_POSITION}.`);
                                })
                                .catch(err => {
                                    this.logger.log(LogLevel.ERROR, inspect(err));

                                    throw err;
                                })
                            });
                        } else {
                            this.logger.log(LogLevel.INFO, `Hit the else block for Action: ${signal.action}`)
                        }
                    });
                }
            }

            returnPromise.then(() => this.notification.notify(notificationMessage));
        } else if (type === TwitterAccountType.LONG_POSITION) {
            returnPromise.then(() => this.notification.notify(notificationMessage));
            this.logger.log(LogLevel.INFO, `Creating an alert for a Long Position`);
        } else if (type === TwitterAccountType.OPTIONS_POSITION) {
            this.logger.log(LogLevel.INFO, `Creating an alert for a Options Position`);
        } else if (type === TwitterAccountType.WATCHLIST) {
            returnPromise.then(() => this.notification.notify(socialMediaMessage));
        } else if (type === TwitterAccountType.TRACKER) {            
            for (let signal of signals) {
                let t = signal.ticker;
                this.metric.push({
                    'mentions': {
                        value: 1,
                        labels: {
                            'ticker': t,
                            'account': input.account_name
                        }
                    }
                });

                returnPromise.then(() => this.notification.notify(socialMediaMessage));
            }
        } else {
            
        
            return Promise.reject(new exception.InvalidDataError(`${this.constructor.name}#process received an unsupported AccountType: ${type}`));
        }

        return returnPromise
        .catch(err => {
            this.logger.log(LogLevel.ERROR, inspect(err));
            throw err;
        });
    }
}