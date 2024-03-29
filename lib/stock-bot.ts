import { Service, IServiceOptions, IWorker, IWorkerOptions, LogLevel, promiseRetry } from './base';
import BPromise from 'bluebird';
import { PhonyExchange } from './exchange';
import { AlpacasExchange } from './exchange';
import moment from 'moment';
import * as exception from './exceptions';
import { DataSource, IDataSource } from './data-source';
import * as joi from 'joi';
import { CommandClient, INotification } from './notification';
import * as W from './workers';
import { IDataStore } from './data-store';
import { IDiagnostic } from './diagnostic';
import { isMarketTime } from './util';


export const StockBotOptionsValidationSchema = joi.object({
    datasource: joi.object().instance(DataSource).required(),
    datastore: joi.required(), //TODO: Need a better way to type this
    diagnostic: joi.object().required(), //TODO: Need a better way to type this
    exchange: joi.object().required(), //Currently we don't have a base Exchange class 
    metric: joi.object().required(),
    // exchange: joi.object().instance(AlpacasExchange).instance(PhonyExchange).required(), //Currently we don't have a base Exchange class 
    notification: joi.object().required(), //TODO: Need to figure out a way to do this correctly, like required particular properties
    mainWorker: joi.required(),    //TODO: Need a way to actually type this, though JS makes no differentiation between a function and constructor
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

export interface BaseStockEvent {
    ticker: string; //Ticker name
}

export interface ITickerChange extends BaseStockEvent {
    ticker: string;
    price: number;
    percentChange: IStockChange;
    [key: string]: string | number | IStockChange;
}

export interface IStockServiceOptions extends IServiceOptions {
    datasource: IDataSource;
    datastore: IDataStore;
    diagnostic: IDiagnostic;
    notification: INotification;
    exchange: AlpacasExchange;
    // exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>;
    purchaseOptions: IPurchaseOptions;
    commandClient: CommandClient;
    accountPercent: number;
    mainWorker: W.IStockWorker<BaseStockEvent>; //This is how we pass different algorithms to the service
    runOnlyInMarketTime: boolean;
}

export interface IPurchaseOptions {
    takeProfitPercentage: number;
    stopLimitPercentage: number;
    maxSharePrice: number;
    maxShareCount: number;
    prevStockPriceOptions: {    //How far back are we checking the old stock price
        unit: number;
        measurement: moment.DurationInputArg2
    }
}

export interface IStockChange {
    percentChange: number, 
    persuasion: "up" | "down"
}

export class StockService extends Service<BaseStockEvent, BaseStockEvent> {
    private processables: BaseStockEvent[];
    private purchaseOptions: IPurchaseOptions;
    private mainWorker: W.IStockWorker<BaseStockEvent>;
    exchange: AlpacasExchange;
    // exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>; //TODO: This should be abstracted to the StockService level, and it should take in it's types from there.
    diagnostic: IDiagnostic;
    datasource: IDataSource;
    datastore: IDataStore;
    notification: INotification;
    commandClient: CommandClient;
    accountPercent: number;
    runOnlyInMarketTime: boolean;

    constructor(options: IStockServiceOptions) {
        super(options);
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
                .catch(this.exceptionHandler)
            }, 60000); //Check every minute
        }
    }

    initialize(): Promise<void> {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():INVOKED`);
        return Promise.all([ this.exchange.initialize(), this.notification.initialize(), this.datasource.initialize(), this.diagnostic.initialize(), this.metric.initialize(), this.commandClient.initialize() ])
        .then(() => super.initialize())
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize:SUCCESS`);
        });
    }

    fetchWork = (): Promise<BaseStockEvent[]> => {
        this.logger.log(LogLevel.TRACE, `${this.constructor.name}#fetchWork():CALLED`);
        return this.datasource.scrapeDatasource()
        .catch((err: Error) => {
            this.logger.log(LogLevel.ERROR, JSON.stringify(err), err)
            this.logger.log(LogLevel.ERROR, `Failed to scrape data source, backing off and retrying`);
            return promiseRetry(() => this.fetchWork());
        });
    }

    handleMarketTimeProcessing = (): Promise<void> => {
        this.logger.log(LogLevel.INFO, `Checking if it is market time..`);
        return isMarketTime()
        .then((isMarketTime: boolean) => {
            for (let worker of this.workers.values()) {
                //NOTE: start() and stop() are idempotent
                isMarketTime ? worker.start() : worker.stop();
            }
        })
    }

    /*
        All this function does is verify that the processable work array has data in it.. this is later on called by the Worker class before process
        This should simply be a function for fetching work in a service, the only time a worker should have it process method invoked, is if there is data to supply to it.

        NOTE: preProcess is what workers call before calling their process() function, by checking if market time here,
        we can pause processing of the workers
    */

    preProcess = async (): Promise<BaseStockEvent> => {
        this.logger.log(LogLevel.TRACE, `${this.constructor.name}#preProcess():CALLED`)

        this.metric.push({
            'processablesByteSize': {
                value: Buffer.byteLength(this.processables.toString()),
                labels: {}
            }
        });

        if (this.isClosed) {
            return Promise.reject(new exception.ServiceClosed());
        }

        if(this.processables.length > 0) {
            let ticker = this.processables.shift()!;

            //@ts-ignore
            this.datasource.timeoutTicker(ticker.sym, 180)

            // this.logger.log(LogLevel.TRACE, `Taking ${JSON.stringify(ticker)} out of this.processables, pushing ticker to this.process(${JSON.stringify(ticker)})`);
            //Now update what is processable
            const keys = Array.from(this.datasource.timedOutTickers.keys());     
            //TODO: This should *ONLY* be done everytime that we fetchWork().. we duplicate and expontentially increase the amount of work to be done by doing this here.
            this.processables = this.processables.filter((tkr: BaseStockEvent) => !keys.includes(tkr.ticker));
            return Promise.resolve(ticker);
        } else {
            // this.logger.log(LogLevel.INFO, `this.processables.length = ${this.processables.length}`);
            //Resupply the the work array, and try to process work again
            return this.fetchWork()
            .then((tickers: BaseStockEvent[]) => {
                //This filters out tickers that are timed out.
                const keys = Array.from([...this.datasource.timedOutTickers.keys()]);
                this.processables = tickers.filter((ticker: BaseStockEvent) => !keys.includes(ticker.ticker));
                this.logger.log(LogLevel.TRACE, `this.processables.length after filter = ${this.processables.length}`)

                //TODO: The current problem we have here, is that if we have multiple workers, when `this.preProcess()` is called, 
                // Each worker will then call the Yahoo API again, and refill the `this.processable` Array with all of the same tickers. 
                //While the filter above should handle this case, it's bad practice to be calling the API that many times, just to be getting the same value for each call.
                //We should instead create a `WorkerRefill` Promise to only allow one Yahoo API fetch at a time.

                //NOTE: See TODO in below block. We should also create a "WorkerRefill Promise"

                //NOTE: Also, this if statement should also contain logic to verify that all of the tickers fetched are not also timed out. If that is the case, we should do something like return Promise.all(this.timedoutTickerPromises)
                if(!(this.processables.length > 0)) {
                    //TODO: This logic should be moved to _fetchTickerInfo
                    //NOTE: This is some edgecase code
                    const keys = Array.from([...this.datasource.timedOutTickers.keys()]);     
                    if(this.processables.some((ticker: BaseStockEvent) => !keys.includes(ticker.ticker))) {
                        this.logger.log(LogLevel.WARN, `The fetched tickers are all timed out. Waiting for all of the timed out tickers to resolve.`);
                        const pendingPromises = Array.from(this.datasource.timedOutTickers.values()).map(p => p.promise);

                        return Promise.all(pendingPromises)
                        .then(() => this.preProcess());
                    } else {
                        this.logger.log(LogLevel.TRACE, `this.processables.length = 0, return the backoff promise`);
                        return BPromise.delay(5000).then(() => this.preProcess())
                    }
                } else {
                    this.logger.log(LogLevel.TRACE, `Nothing in this.processables, instead retrying this.preProcess()`);
                    return this.preProcess();
                }
            })
            .catch(err => {
                this.logger.log(LogLevel.ERROR, `this.preProcess():ERROR -> ${err}`);
                throw err;
            });
        }
    }

    makeWorker(options: W.IStockWorkerOptions<any, any, any>): IWorker<BaseStockEvent> {
        return new this.mainWorker({
            ...options,
            _preProcessor: this.preProcess,
            exceptionHandler: this.exceptionHandler,
            purchaseOptions: this.purchaseOptions,
            exchange: this.exchange,
            notification: this.notification,
            dataSource: this.datasource,
            dataStore: this.datastore,
            metric: this.metric,
            accountPercent: this.accountPercent
        });
    }

    exceptionHandler = (err: Error): void => {
        console.log(err, JSON.stringify(err))
        if(err.name === exception.UnprocessableTicker.name) {
            this.logger.log(LogLevel.WARN, `Missing properties, timing out ${err.message}`)
            this.datasource.timeoutTicker(err.message); //Here, with that particular error, the message will be the TICKER
        } else if (err.name === exception.ServiceClosed.name) {
            //Do nothing
            this.logger.log(LogLevel.WARN, `${this.constructor.name}#exceptionHandler - Received ServiceClosed error from Worker Process.`);
        } else {
            this.metric.push({
                'processingErrors': {
                    value: 1,
                    labels: {
                        'errorType' : err.constructor.name 
                    }
                }
            })

            this.logger.log(LogLevel.ERROR, `Caught error in ${this.constructor.name}.exceptionHandler -> Error: ${err}`);
            this.diagnostic.alert({
                level: LogLevel.ERROR,
                title: 'Service Error',
                message: `**ERROR**\n${err.name}\n${err.message}\n${err.stack || null}`
            })
            .catch(err => {
                this.logger.log(LogLevel.ERROR, `${this.diagnostic.constructor.name}#alert():ERROR ${err} - ${JSON.stringify(err)}`);
            })
        }
    }
    
    close(): Promise<void> {
        return super.close()
        .then(() => Promise.all([this.datasource.close(), this.diagnostic.close(), this.exchange.close(), this.notification.close(), this.metric.close(), this.commandClient.close()]))
        .then(() => { });
    }
}
