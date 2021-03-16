"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialMediaWorker = exports.LiveDataStockWorker = exports.TopGainerNotificationStockWorker = exports.StockWorker = void 0;
const base_1 = require("./base");
const axios_1 = __importDefault(require("axios"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const exception = __importStar(require("./exceptions"));
const data_source_1 = require("./data-source");
const util_1 = require("./util");
const exceptions_1 = require("./exceptions");
const decimal_js_1 = require("decimal.js");
const randomcolor_1 = __importDefault(require("randomcolor"));
;
/*
    Superset the base Worker, so that we can expand upon the StockServiceWorker if needed
    All new algos should extend this class
*/
class StockWorker extends base_1.Worker {
    constructor(options) {
        super(options);
        this.datastore = options.dataStore;
        this.datasource = options.dataSource;
        this.exchange = options.exchange;
        this.notification = options.notification;
        this.metric = options.metric;
    }
}
exports.StockWorker = StockWorker;
class TopGainerNotificationStockWorker extends StockWorker {
    constructor(options) {
        super(options);
        this.purchaseOptions = options.purchaseOptions;
    }
    process(ticker) {
        return this._processTicker(ticker);
    }
    //TODO: Create algo for understanding what is a good stock to purchase, and what is the stop limit and take profit limit
    _processTicker(ticker) {
        return this.getPrevStockPrice(ticker.ticker, this.purchaseOptions.prevStockPriceOptions.unit, this.purchaseOptions.prevStockPriceOptions.measurement)
            .then((prevStockPrice) => {
            let changePercent = this.getChangePercent(prevStockPrice, ticker.price);
            this.logger.log(base_1.LogLevel.TRACE, `Change Percent ${changePercent.percentChange} ${changePercent.persuasion} for ${ticker.ticker}`);
            let takeProfitDollarAmount = ticker.price + (ticker.price * this.purchaseOptions.takeProfitPercentage);
            let stopLossDollarAmount = ticker.price - (ticker.price * this.purchaseOptions.stopLimitPercentage);
            //TODO: Make the expected percentChange expectation configurable in the service
            if ((changePercent.percentChange >= .005 && changePercent.persuasion === 'up') && (ticker.price <= this.purchaseOptions.maxSharePrice)) {
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
                        'Action': util_1.ActionSignal.UNKNOWN,
                    }
                });
            }
            else {
                // We need to see if we are missing out on good buys
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    message: `${ticker.ticker} would not alert, it is ${changePercent.persuasion} ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        'Exchange': this.exchange.constructor.name,
                        'DataSource': this.datasource.constructor.name,
                        'Action': util_1.ActionSignal.UNKNOWN
                    }
                });
            }
        });
    }
    //TODO: This needs to be on the Exchange interface, this should not be something that a worker can do by itself.
    getPrevStockPrice(ticker, amount = 15, unit = 'minutes', limit = 100) {
        let nycTime = moment_timezone_1.default.tz(new Date().getTime(), 'America/New_York').subtract(amount, unit);
        let timestamp = nycTime.valueOf();
        return axios_1.default.get(`https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${nycTime.format('YYYY-MM-DD')}`, {
            params: {
                timestamp: timestamp,
                limit,
                apiKey: process.env['ALPACAS_API_KEY'] || "",
                reverse: false
            }
        })
            .then((data) => {
            //TODO: We should create a type for the data returned here
            if (data.data.results_count > 0) {
                let priceAsNumber = Number(data.data.results[data.data.results_count - 1].p);
                return Number(priceAsNumber.toFixed(2));
            }
            else {
                this.logger.log(base_1.LogLevel.ERROR, `Failed to get previous price for ${ticker}`);
                throw new exception.UnprocessableTicker(ticker);
            }
        });
    }
    //Here we take the different prices, and come up with the % of change in the stock price
    getChangePercent(prevPrice, currentPrice) {
        let change = (currentPrice - prevPrice) / prevPrice;
        let isPositive = !change.toString().includes('-');
        let removedSymbols = parseFloat(change.toString().replace('-', ""));
        change = Number(removedSymbols.toFixed(3)); //NOTE: This does rounding to the nearest number
        return { percentChange: change, persuasion: isPositive ? 'up' : 'down' };
    }
}
exports.TopGainerNotificationStockWorker = TopGainerNotificationStockWorker;
class LiveDataStockWorker extends StockWorker {
    constructor(options) {
        super(options);
    }
    /*
        The use of this worker assumes the the PolygonLiveDataSource DataSource in the service
        The reason for this is that we expect the data that is coming through to be a different type than ITickerChange

        Because of this, we first want to store the data (for the safety of verifying we successfully saved the data in case of a restart) before trying to process it
        
    */
    process(currTrade) {
        //Track # of processed tickers
        this.metric.push({
            'processedTickers': {
                value: 1,
                labels: {}
            }
        });
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name} processing ${currTrade.ticker}`);
        this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}:process(${JSON.stringify(currTrade)})`);
        const ticker = currTrade.sym;
        return this.datastore.get(ticker) //Fetch the previous quote
            .then(data => data) //TODO: This is required because the DataStore interface only allows DataStoreObject, should change this
            .then((data) => {
            return this.exchange.getClock()
                .then((d) => {
                return [d.is_open, data]; //Not sure why I need to do this, the next then block interprets it poorly
            });
        })
            .then(([isOpen, data]) => {
            let returnPromise = Promise.resolve();
            if (!isOpen) {
                this.logger.log(base_1.LogLevel.TRACE, `Market currently close, disregarding.`);
                return returnPromise;
            }
            if (!(data.length === 1)) {
                this.logger.log(base_1.LogLevel.TRACE, `No data in datastore for ${ticker}`);
                //This is the first receive for a ticker, skip the analysis and just store this event in the DB
                return Promise.resolve();
            }
            else {
                this.logger.log(base_1.LogLevel.TRACE, `PrevTrade: ${JSON.stringify(data)}`);
                const [prevTrade] = data;
                if (new decimal_js_1.Decimal(currTrade.p).lessThanOrEqualTo(prevTrade.p)) {
                    this.logger.log(base_1.LogLevel.INFO, `Skipping ${ticker} for processing, it is at a loss currently.`);
                    return returnPromise;
                }
                const currTradeSeconds = new decimal_js_1.Decimal(currTrade.t).dividedBy(1000);
                const prevTradeSeconds = new decimal_js_1.Decimal(prevTrade.t).dividedBy(1000);
                const timeTaken = currTradeSeconds.minus(prevTradeSeconds);
                const changePercentPerMinute = new decimal_js_1.Decimal(this._getChangePercentPerMinute(currTrade, prevTrade));
                const aboveClosePrice = util_1.createDeferredPromise();
                const vwapPromise = util_1.getTickerSnapshot(ticker)
                    .then(snapshotData => {
                    aboveClosePrice.resolve(snapshotData);
                    return (snapshotData.day.vw > currTrade.p);
                });
                if (isNaN(changePercentPerMinute.toNumber())) {
                    return Promise.reject(new exception.InvalidDataError(`${ticker} has a bad calculation. Current Price ${currTrade.p} -- Previous Price: ${prevTrade.p}`));
                }
                this.logger.log(base_1.LogLevel.INFO, `${ticker} has changed ${changePercentPerMinute.toNumber()} per minute. Time Taken Between Samples: ${timeTaken} seconds`);
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
                    const confidenceOptions = {
                        'relativeVolume': {
                            value: 5,
                            process: this._getRelativeVolume(ticker).then(relativeVolume => !!(relativeVolume >= 2))
                        },
                        'vwap': {
                            value: 5,
                            process: vwapPromise
                        },
                        'aboveOpenPrice': {
                            value: 5,
                            process: aboveClosePrice.promise.then((snapshotData) => !!(currTrade.p > snapshotData.day.o))
                        },
                        'totalVolume': {
                            value: 5,
                            process: util_1.isHighVolume(ticker)
                        }
                    };
                    //Calculating this here so we don't make this calculation for every ticker, this should only be run for potential tickers
                    //TODO: Would be nice to be able to confidenceOptions displayed in additionalData below to see which indicators are giving positive values
                    returnPromise
                        .then(() => util_1.getConfidenceScore(confidenceOptions))
                        .then((confidenceScore) => {
                        this.logger.log(base_1.LogLevel.INFO, `Fetched confidence score for ${ticker} - Got Score: ${confidenceScore}`);
                        this.metric.push({
                            'confidenceScore': {
                                value: confidenceScore / 100,
                                labels: {}
                            }
                        });
                        if (confidenceScore >= 49) {
                            this.logger.log(base_1.LogLevel.INFO, `${ticker} has the required increase and confidence to notify in Discord`);
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
                                    'Action': util_1.ActionSignal.UNKNOWN
                                }
                            })
                                .then(() => {
                                this.logger.log(base_1.LogLevel.TRACE, `${this.notification.constructor.name}#notify():SUCCESS`);
                            });
                        }
                        else {
                            this.logger.log(base_1.LogLevel.INFO, `Confidence score too low for ${ticker}`);
                        }
                    });
                }
            }
            return returnPromise;
        })
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `Completed process()`);
        })
            .finally(() => this.datastore.save(ticker, currTrade)); //Timeout each ticker for 3 minutes
    }
    /**
     * Get the ratio of change given the change % of a stock, and the time it's been between the two compared values
     * @param changePercent The percent the stock has change. This is notated by 1's, i.e 1 == 1%
     * @param timeInSeconds The time (in seconds) of the time taken between the two compared values
     */
    _getChangePercentPerMinute(currTrade, prevTrade) {
        this.logger.log(base_1.LogLevel.TRACE, `currQuote: ${currTrade.p} prevQuote: ${prevTrade.p} -- currQuote.t = ${currTrade.t} --- prevQuote.t = ${prevTrade.t}`);
        this.logger.log(base_1.LogLevel.TRACE, `Time difference in seconds: ${((currTrade.t / 1000) - (prevTrade.t / 1000))}`);
        let currTradePrice = new decimal_js_1.Decimal(currTrade.p);
        let prevTradePrice = new decimal_js_1.Decimal(prevTrade.p);
        // This gets the difference between the two quotes, and get's the % of that change of a share price. i.e (11 - 10) / 11 = 10%;
        let changePercent = new decimal_js_1.Decimal(currTradePrice.minus(prevTradePrice)).dividedBy(currTradePrice).times(100);
        console.log(`ChangePercent: ${changePercent.toString()}`);
        //Gets time difference in seconds, and translate to minutes
        let currTradeSeconds = new decimal_js_1.Decimal(currTrade.t).dividedBy(1000);
        let prevTradeSeconds = new decimal_js_1.Decimal(prevTrade.t).dividedBy(1000);
        let timeDifferenceInMinutes = new decimal_js_1.Decimal(new decimal_js_1.Decimal(currTradeSeconds).minus(prevTradeSeconds)).dividedBy(60);
        console.log(`TimeDifferenceInSeconds: ${timeDifferenceInMinutes.toString()}`);
        //Returns the rate of increase (as a percentage) per minute;
        return changePercent.dividedBy(timeDifferenceInMinutes).toNumber();
    }
    /**
     * Calculates the relative volume.
     * This is the volume for the current day uptil the current minute / the volume from open until that respective minute for the last trading day.
     * For example the relative volume of a ticker at 10:30AM on a Tuesday would be the ratio of the days volume so far and the total volume from open till 10:30AM on Monday (the last trading day)
    */
    _getRelativeVolume(ticker) {
        return __awaiter(this, void 0, void 0, function* () {
            const lastDay = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            lastDay.setDate(yield util_1.returnLastOpenDay(yesterday));
            const lastDate = util_1.convertDate(lastDay);
            const minutesPassed = util_1.minutesSinceOpen();
            return Promise.all([
                axios_1.default.get(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${lastDate}/${lastDate}`, {
                    params: {
                        apiKey: process.env['ALPACAS_API_KEY'] || "",
                        sort: 'asc',
                        limit: minutesPassed
                    }
                }), util_1.getTickerSnapshot(ticker)
            ])
                .then((data) => {
                const lastDayData = data[0].data;
                const today = data[1];
                return lastDayData.results.reduce((a, b) => a + parseInt(b['v']), 0) / (today.day.v);
            }).catch(err => {
                return Promise.reject(new exceptions_1.RequestError(`Error in ${this.constructor.name}._getRelativeVolume(): innerError: ${err} -- ${JSON.stringify(err)}`));
            });
        });
    }
}
exports.LiveDataStockWorker = LiveDataStockWorker;
class SocialMediaWorker extends StockWorker {
    process(input) {
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}:process(${JSON.stringify(input)})`);
        //TODO: Since the tweets that make it to here are viable (filtered by the TwitterDataSource),
        // we can always output them to the Notification class since we want a log (and alert) on any processed tweet
        const { type, message } = input;
        const notificationMessage = {
            ticker: '',
            message,
            color: randomcolor_1.default(),
            additionaData: {
                'Alert Type': type.toString(),
                'User': input.account_name,
                'Action': util_1.ActionSignal.UNKNOWN
            }
        };
        const socialMediaMessage = {
            ticker: '',
            message,
            color: randomcolor_1.default(),
            additionaData: {
                'User': input.account_name,
                'Action': util_1.ActionSignal.UNKNOWN
            },
            urls: input.urls,
            socialMediaMessage: true
        };
        const returnPromise = Promise.resolve();
        if (type === data_source_1.TwitterAccountType.FAST_POSITION) {
            //buy into position
            returnPromise
                .then(() => util_1.getTickerSnapshot(''))
                .then(({ lastTrade: { p } }) => {
                returnPromise.then(() => this.notification.notify(notificationMessage));
                //TODO: Need a MUCH better way to go about determining position size, take profit and stop loss margins
                return this.exchange.getBuyingPower()
                    .then((buyingPower) => {
                    // if (buyingPower > (p * 10)) {
                    //     return this.exchange.placeOrder({
                    //         symbol: ticker,
                    //         qty: 10,
                    //         side: 'buy',
                    //         time_in_force: 'day',
                    //         type: 'market',
                    //         stop_loss: {
                    //             stop_price: p - (p * .05), //Willing to lose 5% on a position
                    //         },
                    //         take_profit: {
                    //             limit_price: p + (p * .15) //We want to try to take 15%
                    //         }
                    //     }).then(() => {});
                    // } else {
                    //     return Promise.resolve();
                    // }
                });
            });
        }
        else if (type === data_source_1.TwitterAccountType.SWING_POSITION) {
            let signals = util_1.extractTweetSignals(message);
            this.logger.log(base_1.LogLevel.INFO, `Got signals for ${data_source_1.TwitterAccountType.SWING_POSITION} -- Signals: ${JSON.stringify(signals)}`);
            for (let signal of signals) {
                if (signal.action == util_1.ActionSignal.UNKNOWN) {
                    this.logger.log(base_1.LogLevel.INFO, `Tweet did not qualify for swing position.`);
                }
                else {
                    const ticker = signal.ticker;
                    notificationMessage.additionaData['Action'] = signal.action;
                    returnPromise
                        .then(() => {
                        if (signal.action == util_1.ActionSignal.BUY) {
                            return Promise.all([this.exchange.sizePosition(ticker, 0.1, signal.sizing), this.exchange.getBuyingPower()])
                                .then(([qty, buyingPower]) => {
                                const TOTAL_COST = new decimal_js_1.Decimal(qty * 10).toNumber();
                                this.logger.log(base_1.LogLevel.INFO, `Buying ${qty} shares of ${ticker}`);
                                notificationMessage.price = 10;
                                notificationMessage.additionaData['Action'] = util_1.ActionSignal.BUY;
                                if (buyingPower > TOTAL_COST) {
                                    return this.exchange.placeOrder({
                                        symbol: ticker,
                                        qty: qty,
                                        side: 'buy',
                                        time_in_force: 'day',
                                        type: 'market',
                                    }).then(() => {
                                        this.logger.log(base_1.LogLevel.INFO, `Placed a BUY for ${ticker} as a ${data_source_1.TwitterAccountType.SWING_POSITION}.`);
                                    });
                                }
                                else {
                                    return Promise.resolve();
                                }
                            });
                        }
                        else if (signal.action == util_1.ActionSignal.SELL) {
                            this.logger.log(base_1.LogLevel.INFO, `Got SELL action for ${ticker}`);
                            return this.exchange.getPositionQty(ticker)
                                .then((qty) => {
                                notificationMessage.additionaData['Action'] = util_1.ActionSignal.SELL;
                                this.logger.log(base_1.LogLevel.INFO, `Selling ${qty} shares of ${ticker}`);
                                return this.exchange.placeOrder({
                                    symbol: ticker,
                                    qty: qty,
                                    side: 'sell',
                                    time_in_force: 'day',
                                    type: 'market',
                                }).then(() => {
                                    this.logger.log(base_1.LogLevel.INFO, `Placed a SELL for ${ticker} as a ${data_source_1.TwitterAccountType.SWING_POSITION}.`);
                                });
                            });
                        }
                    });
                }
            }
            returnPromise.then(() => this.notification.notify(notificationMessage));
        }
        else if (type === data_source_1.TwitterAccountType.LONG_POSITION) {
            returnPromise.then(() => this.notification.notify(notificationMessage));
            this.logger.log(base_1.LogLevel.INFO, `Creating an alert for a Long Position`);
        }
        else if (type === data_source_1.TwitterAccountType.OPTIONS_POSITION) {
            this.logger.log(base_1.LogLevel.INFO, `Creating an alert for a Options Position`);
        }
        else if (type === data_source_1.TwitterAccountType.WATCHLIST) {
            returnPromise.then(() => this.notification.notify(socialMediaMessage));
        }
        else {
            return Promise.reject(new exception.InvalidDataError(`${this.constructor.name}#process received an unsupported AccountType: ${type}`));
        }
        return returnPromise;
    }
}
exports.SocialMediaWorker = SocialMediaWorker;
