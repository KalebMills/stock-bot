import { Worker, IWorker, IWorkerOptions, LogLevel, Logger } from './base';
import axios, { AxiosResponse } from 'axios';
import { AlpacasExchange, Exchange } from './exchange';
import * as Alpacas from '@master-chief/alpaca';
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import * as exception from './exceptions';
import { INotification } from './notification';
import { IPurchaseOptions, ITickerChange, IStockChange } from './stock-bot';
import { IDataStore, DataStoreObject } from './data-store';
import * as uuid from 'uuid';
import { IDataSource } from './data-source';

export interface IStockeWorkerOptions<T, TOrderInput, TOrder> extends IWorkerOptions<T> {
    purchaseOptions: IPurchaseOptions;
    // exchange: Exchange<TOrderInput, TOrderInput, TOrder>;
    exchange: AlpacasExchange;
    dataStore: IDataStore<T>;
    dataSource: IDataSource<T>;
    notification: INotification;
}

//Required interface to allow generic construction of the StockWorker(s)
export interface IStockWorker<TInput, TOuput = any> extends IWorker<TInput, TOuput> {
    new (options: IStockeWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>): IStockWorker<TInput, TOuput>;
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
    constructor(options: IStockeWorkerOptions<T, Alpacas.PlaceOrder, Alpacas.Order>) { //TODO: Needs to be more generically typed
        super(options);
        this.datastore = options.dataStore;
        this.datasource = options.dataSource;
        this.exchange = options.exchange;
        this.notification = options.notification;
    }
}

export class TopGainerNotificationStockWorker extends StockWorker<ITickerChange> {
    private purchaseOptions: IPurchaseOptions;

    constructor(options: IStockeWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>) {
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
            this.logger.log(LogLevel.INFO, `Change Percent ${changePercent.percentChange} ${changePercent.persuasion} for ${ticker.ticker}`)
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
                        prevClosePrice: `${ticker.prevDayClose}`
                        //TODO: We should definitely include a way to denote which datasource this information is coming from
                    }
                });
                //Lets set our buy here, and our different sell and stop limits with the above price
                // return this.exchange.getBuyingPower()
                // .then(amount => {
                //     this.logger.log(LogLevel.INFO, color.green(`Checking buying power.`))
                //     const cost = this.purchaseOptions.maxShareCount * this.purchaseOptions.maxSharePrice;
                //     if(cost < amount) {
                //         return this.notification.notify(`We should purchase ticker ${ticker.ticker}`);
                //     } else {
                //         this.logger.log(LogLevel.WARN, color.magentaBright(`${this.exchange.constructor.name} does not have enough buy power to purchase the configured amount of shares for ${ticker.ticker}`));
                //         return;
                //     }
                // })

            } else {
                // We need to see if we are missing out on good buys
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    message: `${ticker.ticker} would not alert, it is ${changePercent.persuasion} ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        exchange: this.exchange.constructor.name
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

export interface QuoteEvent {
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

export interface TradeEvent {
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

export class LiveDataStockWorker extends StockWorker<QuoteEvent> {

    constructor(options: IStockeWorkerOptions<QuoteEvent, Alpacas.PlaceOrder, Alpacas.Order>) {
        super(options);
    }

    initialize(): Promise<void> {
        return super.initialize()
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    /*
        The use of this worker assumes the the PolygonLiveDataSource DataSource in the service
        The reason for this is that we expect the data that is coming through to be a different type than ITickerChange 

        Because of this, we first want to store the data (for the safety of verifying we successfully saved the data in case of a restart) before trying to process it
        
    */
    process(currQuote: QuoteEvent): Promise<void> {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}:process(${JSON.stringify(currQuote)})`);

        return this.datastore.get(currQuote.sym) //Fetch the previous quote
        .then(data => data as unknown as QuoteEvent[]) //TODO: This is required because the DataStore interface only allows DataStoreObject, should change this
        .then((data: QuoteEvent[]) => {
            if (!(data.length === 1)) {
                this.logger.log(LogLevel.INFO, `No data in datastore for ${currQuote.sym}`);
                //This is the first receive for a ticker, skip the analysis and just store this event in the DB
                return Promise.resolve();
            } else {
                this.logger.log(LogLevel.INFO, `PrevQuote: ${JSON.stringify(data)}`)
                const [prevQuote]: QuoteEvent[] = data;
                const changePercentPerMinute: number = this._getChangePercentPerMinute(currQuote, prevQuote);
                this.logger.log(LogLevel.INFO, `${currQuote.sym} has changed ${changePercentPerMinute} per minute.`);

                //If the change percent is greater than .5% per minute, notify
                if (changePercentPerMinute > .009) {
                    this.logger.log(LogLevel.INFO, `${currQuote.sym} has the required increase to notify in Discord`)
                    
                    return this.notification.notify({
                        ticker: currQuote.sym,
                        price: currQuote.ap,
                        message: `Ticker ${currQuote.sym} has a rate of increase ${changePercentPerMinute} per minute.`,
                        additionaData: {
                            'Exchange': this.exchange.constructor.name,
                            'DataSource': this.datasource.constructor.name,
                            'Measure Time': `${((currQuote.t / 1000) - (prevQuote.t / 1000)) / 60} Minutes`,
                            'Previous Ask Price': `${prevQuote.ap}`,
                            'Action Recommendation': 'Purchase',
                            'Current Bid Price': currQuote.bp,
                            'Current Ask Price': currQuote.ap
                        }
                    })
                    .then(() => {
                        //TODO: Once we are not using this in Paper mode, this needs to be wrapped in a conditional block to track the # of day trades already made.
                        // return this.exchange.placeOrder({
                        //     qty: 1,
                        //     order_class: 'bracket',
                        //     time_in_force: 'day',
                        //     symbol: currQuote.sym,
                        //     side: 'buy',
                        //     type: 'limit',
                        //     take_profit: {
                        //         limit_price: currQuote.ap + (currQuote.ap * .05), //Take 3% profit
                        //     },
                        //     stop_loss: {
                        //         stop_price: currQuote.ap - (currQuote.ap * .1), //Only allow 1% loss
                        //     }
                        // })
                        // .then(() => {
                        //     this.logger.log(LogLevel.INFO, `Place PAPER order for ${currQuote.sym}`)
                        // });
                    })
                    .then(() => {
                        this.logger.log(LogLevel.INFO, `${this.notification.constructor.name}#notify():SUCCESS`);
                    });
                } else {
                    this.logger.log(LogLevel.TRACE, `${currQuote.sym} did not meet the standard, it's changePerMinute = ${this._getChangePercentPerMinute(currQuote, prevQuote)}`)
                    return;
                }
            }
        })
        .then(() => {
            this.logger.log(LogLevel.INFO, `Completed process()`);
        })
        .finally(() => this.datastore.save(currQuote.sym, currQuote)); //Timeout each ticker for 3 minutes
    }

    /**
     * Get the ratio of change given the change % of a stock, and the time it's been between the two compared values
     * @param changePercent The percent the stock has change. This is notated by 1's, i.e 1 == 1%
     * @param timeInSeconds The time (in seconds) of the time taken between the two compared values
     */

    private _getChangePercentPerMinute (currQuote: QuoteEvent, prevQuote: QuoteEvent): number {
        this.logger.log(LogLevel.INFO, `currQuote: ${currQuote.ap} prevQuote: ${prevQuote.ap} -- currQuote.t = ${currQuote.t} --- prevQuote.t = ${prevQuote.t}`)
        this.logger.log(LogLevel.INFO, `Time difference in seconds: ${((currQuote.t / 1000) - (prevQuote.t / 1000))}`)
        // This gets the difference between the two quotes, and get's the % of that change of a share price. i.e (11 - 10) / 11 = 10%;
        const changePercent = ((currQuote.ap - prevQuote.ap) / currQuote.ap);
        //Gets time difference in seconds, and translate to minutes
        const timeDifferenceInMinutes = ((currQuote.t / 1000) - (prevQuote.t / 1000)) / 60;

        //Returns the rate of increase (as a percentage) per minute;
        return changePercent / timeDifferenceInMinutes;
    }

    close(): Promise<void> {
        return super.close();
    }
}