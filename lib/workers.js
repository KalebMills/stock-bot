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
exports.LiveDataStockWorker = exports.TopGainerNotificationStockWorker = exports.StockWorker = void 0;
const base_1 = require("./base");
const axios_1 = __importDefault(require("axios"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const exception = __importStar(require("./exceptions"));
const util_1 = require("./util");
const exceptions_1 = require("./exceptions");
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
            this.logger.log(base_1.LogLevel.INFO, `Change Percent ${changePercent.percentChange} ${changePercent.persuasion} for ${ticker.ticker}`);
            let takeProfitDollarAmount = ticker.price + (ticker.price * this.purchaseOptions.takeProfitPercentage);
            let stopLossDollarAmount = ticker.price - (ticker.price * this.purchaseOptions.stopLimitPercentage);
            //TODO: Make the expected percentChange expectation configurable in the service
            if ((changePercent.percentChange >= .005 && changePercent.persuasion === 'up') && (ticker.price <= this.purchaseOptions.maxSharePrice)) {
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    eventTimestamp: Date.now(),
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
                        'DataSource': this.datasource.constructor.name
                    }
                });
            }
            else {
                // We need to see if we are missing out on good buys
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    eventTimestamp: Date.now(),
                    message: `${ticker.ticker} would not alert, it is ${changePercent.persuasion} ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        'Exchange': this.exchange.constructor.name,
                        'DataSource': this.datasource.constructor.name
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
    initialize() {
        return super.initialize()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    /*
        The use of this worker assumes the the PolygonLiveDataSource DataSource in the service
        The reason for this is that we expect the data that is coming through to be a different type than ITickerChange

        Because of this, we first want to store the data (for the safety of verifying we successfully saved the data in case of a restart) before trying to process it
        
    */
    process(currTrade) {
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}:process(${JSON.stringify(currTrade)})`);
        return this.datastore.get(currTrade.sym) //Fetch the previous quote
            .then(data => data) //TODO: This is required because the DataStore interface only allows DataStoreObject, should change this
            .then((data) => {
            if (!(data.length === 1)) {
                this.logger.log(base_1.LogLevel.INFO, `No data in datastore for ${currTrade.sym}`);
                //This is the first receive for a ticker, skip the analysis and just store this event in the DB
                return Promise.resolve();
            }
            else {
                this.logger.log(base_1.LogLevel.INFO, `PrevTrade: ${JSON.stringify(data)}`);
                const [prevTrade] = data;
                const timeTaken = ((currTrade.t / 1000) - (prevTrade.t / 1000));
                const changePercentPerMinute = this._getChangePercentPerMinute(currTrade, prevTrade);
                this.logger.log(base_1.LogLevel.INFO, `${currTrade.sym} has changed ${changePercentPerMinute} per minute.`);
                //If the change percent is greater than .5% per minute, notify
                //TODO: Make these values configuration via workerOptions
                if (changePercentPerMinute > .04 && timeTaken >= 180) {
                    const confidenceOptions = {
                        'relativeVolume': {
                            value: 5,
                            process: this._getRelativeVolume(currTrade.sym).then(data => !!(data > 2))
                        },
                        'vwap': {
                            value: 5,
                            process: util_1.getTickerSnapshot(currTrade.sym).then(data => (data.day.vw > currTrade.p))
                        }
                    };
                    //Calculating this here so we don't make this calculation for every ticker, this should only be run for potential tickers
                    return util_1.getConfidenceScore(confidenceOptions)
                        .then((confidenceScore) => {
                        if (confidenceScore >= 49) {
                            this.logger.log(base_1.LogLevel.INFO, `${currTrade.sym} has the required increase and confidence to notify in Discord`);
                            return this.notification.notify({
                                ticker: currTrade.sym,
                                eventTimestamp: currTrade.t,
                                price: currTrade.p,
                                message: `Ticker ${currTrade.sym} has a rate of increase ${changePercentPerMinute.toFixed(2)}% per minute.`,
                                additionaData: {
                                    'Exchange': this.exchange.constructor.name,
                                    'DataSource': this.datasource.constructor.name,
                                    'Measure Time': `${(((currTrade.t / 1000) - (prevTrade.t / 1000)) / 60).toFixed(2)} Minutes`,
                                    'Previous Price': `${prevTrade.p}`,
                                    'Action Recommendation': 'Purchase',
                                    'Confidence Score': `${confidenceScore}%`
                                }
                            })
                                .then(() => {
                                this.logger.log(base_1.LogLevel.INFO, `${this.notification.constructor.name}#notify():SUCCESS`);
                            });
                        }
                        else {
                            this.logger.log(base_1.LogLevel.INFO, `Confidence score too low`);
                        }
                    });
                }
            }
        })
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `Completed process()`);
        })
            .finally(() => this.datastore.save(currTrade.sym, currTrade).then(() => this.datasource.timeoutTicker(currTrade.sym, 180))); //Timeout each ticker for 3 minutes
    }
    /**
     * Get the ratio of change given the change % of a stock, and the time it's been between the two compared values
     * @param changePercent The percent the stock has change. This is notated by 1's, i.e 1 == 1%
     * @param timeInSeconds The time (in seconds) of the time taken between the two compared values
     */
    _getChangePercentPerMinute(currTrade, prevTrade) {
        this.logger.log(base_1.LogLevel.INFO, `currQuote: ${currTrade.p} prevQuote: ${prevTrade.p} -- currQuote.t = ${currTrade.t} --- prevQuote.t = ${prevTrade.t}`);
        this.logger.log(base_1.LogLevel.INFO, `Time difference in seconds: ${((currTrade.t / 1000) - (prevTrade.t / 1000))}`);
        // This gets the difference between the two quotes, and get's the % of that change of a share price. i.e (11 - 10) / 11 = 10%;
        const changePercent = ((currTrade.p - prevTrade.p) / currTrade.p);
        //Gets time difference in seconds, and translate to minutes
        const timeDifferenceInMinutes = ((currTrade.t / 1000) - (prevTrade.t / 1000)) / 60;
        //Returns the rate of increase (as a percentage) per minute;
        return changePercent / timeDifferenceInMinutes;
    }
    close() {
        return super.close();
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
                }), axios_1.default.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {
                    params: {
                        apiKey: process.env['ALPACAS_API_KEY'] || "",
                    }
                })
            ])
                .then((data) => {
                const lastDay = data[0].data;
                const today = data[1].data;
                return lastDay.results.reduce((a, b) => a + parseInt(b['v']), 0) / (today.ticker.day.v);
            }).catch(err => {
                return Promise.reject(new exceptions_1.RequestError(`Error in ${this.constructor.name}._getRelativeVolume(): innerError: ${err} -- ${JSON.stringify(err)}`));
            });
        });
    }
}
exports.LiveDataStockWorker = LiveDataStockWorker;
