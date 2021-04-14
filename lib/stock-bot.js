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
const exception = __importStar(require("./exceptions"));
const data_source_1 = require("./data-source");
const joi = __importStar(require("joi"));
const util_1 = require("./util");
exports.StockBotOptionsValidationSchema = joi.object({
    datasource: joi.object().instance(data_source_1.DataSource).required(),
    datastore: joi.required(),
    diagnostic: joi.object().required(),
    exchange: joi.object().required(),
    metric: joi.object().required(),
    // exchange: joi.object().instance(AlpacasExchange).instance(PhonyExchange).required(), //Currently we don't have a base Exchange class 
    notification: joi.object().required(),
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
    }).length(5),
    //Worker Options
    concurrency: joi.number().required(),
    logger: joi.object().required(),
    accountPercent: joi.number().required(),
    commandClient: joi.object().required(),
    runOnlyInMarketTime: joi.boolean().required()
    //Winston is not actually a class
});
class StockService extends base_1.Service {
    constructor(options) {
        super(options);
        this.fetchWork = () => {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#fetchWork():CALLED`);
            return this.datasource.scrapeDatasource()
                .catch((err) => {
                this.logger.log(base_1.LogLevel.ERROR, JSON.stringify(err), err);
                this.logger.log(base_1.LogLevel.ERROR, `Failed to scrape data source, backing off and retrying`);
                return base_1.promiseRetry(() => this.fetchWork());
            });
        };
        this.handleMarketTimeProcessing = () => {
            this.logger.log(base_1.LogLevel.INFO, `Checking if it is market time..`);
            return util_1.isMarketTime()
                .then((isMarketTime) => {
                if (isMarketTime) {
                    //NOTE: worker.start() is idempotent
                    for (let worker of this.workers.values()) {
                        worker.start();
                    }
                }
                else {
                    for (let worker of this.workers.values()) {
                        worker.stop();
                    }
                }
            });
        };
        /*
            All this function does is verify that the processable work array has data in it.. this is later on called by the Worker class before process
            This should simply be a function for fetching work in a service, the only time a worker should have it process method invoked, is if there is data to supply to it.
    
            NOTE: preProcess is what workers call before calling their process() function, by checking if market time here,
            we can pause processing of the workers
        */
        this.preProcess = () => __awaiter(this, void 0, void 0, function* () {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#preProcess():CALLED`);
            this.metric.push({
                'processablesByteSize': {
                    value: Buffer.byteLength(this.processables.toString()),
                    labels: {}
                }
            });
            if (this.isClosed) {
                return Promise.reject(new exception.ServiceClosed());
            }
            if (this.processables.length > 0) {
                let ticker = this.processables.shift();
                //@ts-ignore
                this.datasource.timeoutTicker(ticker.sym, 180);
                // this.logger.log(LogLevel.TRACE, `Taking ${JSON.stringify(ticker)} out of this.processables, pushing ticker to this.process(${JSON.stringify(ticker)})`);
                //Now update what is processable
                const keys = Array.from(this.datasource.timedOutTickers.keys());
                //TODO: This should *ONLY* be done everytime that we fetchWork().. we duplicate and expontentially increase the amount of work to be done by doing this here.
                this.processables = this.processables.filter((tkr) => !keys.includes(tkr.ticker));
                return Promise.resolve(ticker);
            }
            else {
                // this.logger.log(LogLevel.INFO, `this.processables.length = ${this.processables.length}`);
                //Resupply the the work array, and try to process work again
                return this.fetchWork()
                    .then((tickers) => {
                    //This filters out tickers that are timed out.
                    const keys = Array.from([...this.datasource.timedOutTickers.keys()]);
                    this.processables = tickers.filter((ticker) => !keys.includes(ticker.ticker));
                    this.logger.log(base_1.LogLevel.TRACE, `this.processables.length after filter = ${this.processables.length}`);
                    //TODO: The current problem we have here, is that if we have multiple workers, when `this.preProcess()` is called, 
                    // Each worker will then call the Yahoo API again, and refill the `this.processable` Array with all of the same tickers. 
                    //While the filter above should handle this case, it's bad practice to be calling the API that many times, just to be getting the same value for each call.
                    //We should instead create a `WorkerRefill` Promise to only allow one Yahoo API fetch at a time.
                    //NOTE: See TODO in below block. We should also create a "WorkerRefill Promise"
                    //NOTE: Also, this if statement should also contain logic to verify that all of the tickers fetched are not also timed out. If that is the case, we should do something like return Promise.all(this.timedoutTickerPromises)
                    if (!(this.processables.length > 0)) {
                        //TODO: This logic should be moved to _fetchTickerInfo
                        //NOTE: This is some edgecase code
                        const keys = Array.from([...this.datasource.timedOutTickers.keys()]);
                        if (this.processables.some((ticker) => !keys.includes(ticker.ticker))) {
                            this.logger.log(base_1.LogLevel.WARN, `The fetched tickers are all timed out. Waiting for all of the timed out tickers to resolve.`);
                            const pendingPromises = Array.from(this.datasource.timedOutTickers.values()).map(p => p.promise);
                            return Promise.all(pendingPromises)
                                .then(() => this.preProcess());
                        }
                        else {
                            this.logger.log(base_1.LogLevel.TRACE, `this.processables.length = 0, return the backoff promise`);
                            return bluebird_1.default.delay(5000).then(() => this.preProcess());
                        }
                    }
                    else {
                        this.logger.log(base_1.LogLevel.TRACE, `Nothing in this.processables, instead retrying this.preProcess()`);
                        return this.preProcess();
                    }
                })
                    .catch(err => {
                    this.logger.log(base_1.LogLevel.ERROR, `this.preProcess():ERROR -> ${err}`);
                    throw err;
                });
            }
        });
        this.exceptionHandler = (err) => {
            console.log(err, JSON.stringify(err));
            if (err.name === exception.UnprocessableTicker.name) {
                this.logger.log(base_1.LogLevel.WARN, `Missing properties, timing out ${err.message}`);
                this.datasource.timeoutTicker(err.message); //Here, with that particular error, the message will be the TICKER
            }
            else if (err.name === exception.ServiceClosed.name) {
                //Do nothing
                this.logger.log(base_1.LogLevel.WARN, `${this.constructor.name}#exceptionHandler - Received ServiceClosed error from Worker Process.`);
            }
            else {
                this.metric.push({
                    'processingErrors': {
                        value: 1,
                        labels: {
                            'errorType': err.constructor.name
                        }
                    }
                });
                this.logger.log(base_1.LogLevel.ERROR, `Caught error in ${this.constructor.name}.exceptionHandler -> Error: ${err}`);
                this.diagnostic.alert({
                    level: base_1.LogLevel.ERROR,
                    title: 'Service Error',
                    message: `**ERROR**\n${err.name}\n${err.message}\n${err.stack || null}`
                })
                    .catch(err => {
                    this.logger.log(base_1.LogLevel.ERROR, `${this.diagnostic.constructor.name}#alert():ERROR ${err} - ${JSON.stringify(err)}`);
                });
            }
        };
        this.exchange = options.exchange;
        this.datasource = options.datasource;
        this.datastore = options.datastore;
        this.diagnostic = options.diagnostic;
        this.notification = options.notification;
        this.purchaseOptions = options.purchaseOptions;
        this.processables = []; // This will be an array of tickers that have yet to be processed. This will already be a filtered out from timedout tickers. The data here will be provided `_preProcess`
        this.mainWorker = options.mainWorker;
        this.commandClient = options.commandClient;
        this.accountPercent = options.accountPercent;
        this.runOnlyInMarketTime = options.runOnlyInMarketTime;
        if (this.runOnlyInMarketTime) {
            setTimeout(() => {
                this.handleMarketTimeProcessing()
                    .catch(this.exceptionHandler);
            }, 10000);
        }
    }
    initialize() {
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize():INVOKED`);
        return Promise.all([this.exchange.initialize(), this.notification.initialize(), this.datasource.initialize(), this.diagnostic.initialize(), this.metric.initialize(), this.commandClient.initialize()])
            .then(() => super.initialize())
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize:SUCCESS`);
        });
    }
    makeWorker(options) {
        return new this.mainWorker(Object.assign(Object.assign({}, options), { _preProcessor: this.preProcess, exceptionHandler: this.exceptionHandler, purchaseOptions: this.purchaseOptions, exchange: this.exchange, notification: this.notification, dataSource: this.datasource, dataStore: this.datastore, metric: this.metric, accountPercent: this.accountPercent }));
    }
    close() {
        return super.close()
            .then(() => Promise.all([this.datasource.close(), this.diagnostic.close(), this.exchange.close(), this.notification.close(), this.metric.close(), this.commandClient.close()]))
            .then(() => { });
    }
}
exports.StockService = StockService;
