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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveDataStockWorker = exports.TopGainerNotificationStockWorker = exports.StockWorker = void 0;
const base_1 = require("./base");
const axios_1 = __importDefault(require("axios"));
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const exception = __importStar(require("./exceptions"));
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
            }
            else {
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
                const [prevTrade] = data;
                const changePercentPerMinute = this._getChangePercentPerMinute(currTrade, prevTrade);
                const secondsTaken = ((currTrade.t / 1000) - (prevTrade.t / 1000));
                this.logger.log(base_1.LogLevel.INFO, `${currTrade.sym} has changed ${changePercentPerMinute} per minute.`);
                //If the change percent is greater than .5% per minute, notify
                if (changePercentPerMinute > .009 && secondsTaken >= 180) {
                    this.logger.log(base_1.LogLevel.INFO, `${currTrade.sym} has the required increase to notify in Discord`);
                    //BUY
                    //Notify for now
                    return this.notification.notify({
                        ticker: currTrade.sym,
                        price: currTrade.p,
                        message: `Ticker ${currTrade.sym} has a rate of increase ${changePercentPerMinute} per minute.`,
                        additionaData: {
                            exchange: this.exchange.constructor.name,
                            datasource: this.datasource.constructor.name,
                            'Measure Time': `${((currTrade.t / 1000) - (prevTrade.t / 1000)) / 60} Minutes`,
                            'Previous Price': `${prevTrade.p}`,
                            'Action-Recommendation': 'Purchase'
                        }
                    })
                        .then(() => {
                        this.logger.log(base_1.LogLevel.INFO, `${this.notification.constructor.name}#notify():SUCCESS`);
                    });
                }
                else {
                    this.logger.log(base_1.LogLevel.TRACE, `${currTrade.sym} did not meet the standard, it's changePerMinute = ${this._getChangePercentPerMinute(currTrade, prevTrade)}`);
                    return;
                }
            }
        })
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `Completed process()`);
        })
            .finally(() => this.datastore.save(currTrade.sym, currTrade)); //Timeout each ticker for 3 minutes
    }
    /**
     * Get the ratio of change given the change % of a stock, and the time it's been between the two compared values
     * @param changePercent The percent the stock has change. This is notated by 1's, i.e 1 == 1%
     * @param timeInSeconds The time (in seconds) of the time taken between the two compared values
     */
    _getChangePercentPerMinute(currQuote, prevQuote) {
        this.logger.log(base_1.LogLevel.INFO, `currQuote: ${currQuote.p} prevQuote: ${prevQuote.p} -- currQuote.t = ${currQuote.t} --- prevQuote.t = ${prevQuote.t}`);
        this.logger.log(base_1.LogLevel.INFO, `Time difference in seconds: ${((currQuote.t / 1000) - (prevQuote.t / 1000))}`);
        // This gets the difference between the two quotes, and get's the % of that change of a share price. i.e (11 - 10) / 11 = 10%;
        const changePercent = ((currQuote.p - prevQuote.p) / currQuote.p);
        //Gets time difference in seconds, and translate to minutes
        const timeDifferenceInMinutes = ((currQuote.t / 1000) - (prevQuote.t / 1000)) / 60;
        //Returns the rate of increase (as a percentage) per minute;
        return changePercent / timeDifferenceInMinutes;
    }
    close() {
        return super.close();
    }
}
exports.LiveDataStockWorker = LiveDataStockWorker;
