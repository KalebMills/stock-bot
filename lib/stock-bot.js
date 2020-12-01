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
exports.StockService = exports.StockBotOptionsValidationSchema = void 0;
const base_1 = require("./base");
const bluebird_1 = __importDefault(require("bluebird"));
const exchange_1 = require("./exchange");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const exception = __importStar(require("./exceptions"));
const sheets = __importStar(require("google-spreadsheet"));
const data_source_1 = require("./data-source");
const joi = __importStar(require("joi"));
exports.StockBotOptionsValidationSchema = joi.object({
    datasource: joi.object().instance(data_source_1.DataSource).required(),
    exchange: joi.object().instance(exchange_1.AlpacasExchange).required(),
    notification: joi.object().required(),
    googleSheets: joi.object({
        id: joi.string().required(),
        authPath: joi.string().required()
    }).length(2).required(),
    mainWorker: joi.required(),
    purchaseOptions: joi.object({
        takeProfitPercentage: joi.number().required(),
        stopLimitPercentage: joi.number().required(),
        maxSharePrice: joi.number().required(),
        maxShareCount: joi.number().required(),
        prevStockPriceOptions: joi.object({
            unit: joi.number().required(),
            measurement: joi.string().required()
        }).length(2).required()
    }).length(5).required(),
    //Worker Options
    concurrency: joi.number().required(),
    logger: joi.object().required(),
    workerOptions: joi.object({
        tickTime: joi.number().required()
    }).required()
});
class StockService extends base_1.Service {
    constructor(options) {
        super(options);
        this._fetchHighIncreasedTickers = () => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#_fetchHighIncreasedTickers():CALLED`);
            return this.datasource.scrapeDatasource()
                .then(tickers => {
                //Filters out tickers that are already timed out, and tickers who's price per share is above our threshold
                //TODO: We should look into this. This code seems to be duplicated all through this Bot, and should be able to be condensed to one spot. If nothing else, the code should become a function.  
                const keys = Array.from(this.datasource.timedOutTickers.keys());
                return tickers.filter((tkr) => !keys.includes(tkr.ticker));
            })
                .catch((err) => {
                this.logger.log(base_1.LogLevel.ERROR, JSON.stringify(err), err);
                this.logger.log(base_1.LogLevel.ERROR, `Failed to scrape data source, backing off and retrying`);
                return base_1.promiseRetry(() => this._fetchHighIncreasedTickers());
            });
        };
        this.preProcess = () => __awaiter(this, void 0, void 0, function* () {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#preProcess():CALLED`);
            let marketIsOpen = (yield this.exchange.isMarketTime());
            if (!marketIsOpen) {
                this.logger.log(base_1.LogLevel.INFO, 'Market is currently closed. Delaying next try by 30 minutes.');
                return bluebird_1.default.delay(30 * 60000).then(() => this.preProcess());
            } // else continue
            if (this.processables.length > 0) {
                let ticker = this.processables[0];
                this.datasource.timeoutTicker(ticker.ticker);
                this.logger.log(base_1.LogLevel.TRACE, `Taking ${ticker.ticker} out of this.processables, pushing ticker to this.process(${ticker.ticker})`);
                //Now update what is processable
                const keys = Array.from(this.datasource.timedOutTickers.keys());
                this.processables = this.processables.filter((tkr) => !keys.includes(tkr.ticker));
                return Promise.resolve(ticker);
            }
            else {
                //Resupply the the work array, and try to process work again
                return this._fetchHighIncreasedTickers()
                    .then((tickers) => {
                    //This filters out tickers that are timed out.
                    const keys = Array.from(this.datasource.timedOutTickers.keys());
                    this.processables = tickers.filter((ticker) => !keys.includes(ticker.ticker));
                    //TODO: The current problem we have here, is that if we have multiple workers, when `this.preProcess()` is called, 
                    // Each worker will then call the Yahoo API again, and refill the `this.processable` Array with all of the same tickers. 
                    //While the filter above should handle this case, it's bad practice to be calling the API that many times, just to be getting the same value for each call.
                    //We should instead create a `WorkerRefill` Promise to only allow one Yahoo API fetch at a time.
                    //NOTE: See TODO in below block. We should also create a "WorkerRefill Promise"
                    //NOTE: Also, this if statement should also contain logic to verify that all of the tickers fetched are not also timed out. If that is the case, we should do something like return Promise.all(this.timedoutTickerPromises)
                    if (!(this.processables.length > 0)) {
                        //TODO: This logic should be moved to _fetchTickerInfo
                        //NOTE: This is some edgecase code
                        const keys = Array.from(this.datasource.timedOutTickers.keys());
                        if (this.processables.some((ticker) => !keys.includes(ticker.ticker))) {
                            this.logger.log(base_1.LogLevel.TRACE, `The fetched tickers are all timed out. Waiting for all of the timed out tickers to resolve.`);
                            const pendingPromises = Array.from(this.datasource.timedOutTickers.values()).map(p => p.promise);
                            return Promise.all(pendingPromises)
                                .then(() => this.preProcess());
                        }
                        else {
                            //TODO: Instead of immediately trying to scrape, we should create a "backoffPromise" that is just a setTimeout, and we should check if it is present instead. This way, all workers can be on the same backoff as well
                            this.logger.log(base_1.LogLevel.INFO, `We are currently on a backoff of 5 seconds to refetch new tickers.`);
                            return base_1.promiseRetry(() => this.preProcess(), 500);
                        }
                    }
                    else {
                        this.logger.log(base_1.LogLevel.TRACE, `Nothing in this.processables, instead retrying this.preProcess()`);
                        return this.preProcess();
                    }
                })
                    .catch(err => {
                    this.logger.log(base_1.LogLevel.ERROR, `Error caught in preprocess -> ${err}`);
                    throw err;
                });
            }
        });
        //TODO: This should be in some type of database abstraction
        this.postTransaction = (data) => {
            let date = moment_timezone_1.default().tz('America/Monterrey').format('MM-DD-YYYY');
            let time = moment_timezone_1.default().tz('America/Monterrey').format('HH:mm');
            return this.sheetsClient.addRow(Object.assign(Object.assign({}, data), { date, time }))
                .then(() => { });
        };
        this.exceptionHandler = (err) => {
            console.log(err, JSON.stringify(err));
            if (err.name === exception.UnprocessableTicker.name) {
                this.logger.log(base_1.LogLevel.WARN, `Missing properties, timing out ${err.message}`);
                this.datasource.timeoutTicker(err.message); //Here, with that particular error, the message will be the TICKER
            }
            else {
                this.logger.log(base_1.LogLevel.ERROR, `Caught error in ${this.constructor.name}.exceptionHandler -> Error: ${err}`);
            }
        };
        this.options = options;
        this.exchange = options.exchange;
        this.datasource = options.datasource;
        this.notification = options.notification;
        this.purchaseOptions = options.purchaseOptions;
        this.processables = []; // This will be an array of tickers that have yet to be processed. This will already be a filtered out from timedout tickers. The data here will be provided `_preProcess`
        this.mainWorker = options.mainWorker;
    }
    initialize() {
        return Promise.all([super.initialize(), this.datasource.initialize(), this.exchange.initialize(), this.notification.initialize()])
            .then(() => {
            //TODO: Should make this it's own abstraction, something like 
            let sheet = new sheets.GoogleSpreadsheet(this.options.googleSheets.id);
            return sheet.useServiceAccountAuth(require(this.options.googleSheets.authPath))
                .then(() => sheet.loadInfo())
                .then(() => {
                this.sheetsClient = sheet.sheetsById[0];
            });
        })
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `Successfully authenticated with Google Sheets API`);
        });
    }
    makeWorker(options) {
        return new this.mainWorker(Object.assign(Object.assign({}, options), { exceptionHandler: this.exceptionHandler, postTransaction: this.postTransaction, purchaseOptions: this.purchaseOptions, exchange: this.exchange, notification: this.notification }));
    }
    close() {
        return Promise.all([this.datasource.close(), this.exchange.close(), this.notification.close()])
            .then(() => super.close());
    }
}
exports.StockService = StockService;
