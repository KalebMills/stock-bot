import { Service, Worker, IServiceOptions, IWorker, IWorkerOptions, LogLevel, Logger, promiseRetry } from './base';
import BPromise from 'bluebird';
import axios, { AxiosResponse } from 'axios';
import { Exchange, PhonyExchange } from './exchange';
import * as Alpacas from '@master-chief/alpaca';
import { AlpacasExchange } from './exchange';
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import * as exception from './exceptions';
import { DataSource, IDataSource } from './data-source';
import * as joi from 'joi';
import { INotification } from './notification';
import * as W from './workers';
import { IDiagnostic } from './diagnostic';

export const StockBotOptionsValidationSchema = joi.object({
    datasource: joi.object().instance(DataSource).required(),
    diagnostic: joi.object().required(), //TODO: Need a better way to type this
    exchange: joi.object().instance(AlpacasExchange).instance(PhonyExchange).required(), //Currently we don't have a base Exchange class 
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
    }).length(5).required(),
    //Worker Options
    concurrency: joi.number().required(),
    logger: joi.object().required(), //Winston is not actually a class,
    workerOptions: joi.object({
        tickTime: joi.number().required()
    }).required()
})

export interface ITickerChange {
    ticker: string;
    price: number;
    percentChange: IStockChange;
    [key: string]: string | number | IStockChange;
}

export interface IStockServiceOptions extends IServiceOptions {
    datasource: IDataSource;
    diagnostic: IDiagnostic;
    notification: INotification;
    exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>;
    purchaseOptions: IPurchaseOptions;
    mainWorker: W.IStockWorker<ITickerChange>; //This is how we pass different algorithms to the service
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

export class StockService extends Service<ITickerChange, ITickerChange> {
    private processables: ITickerChange[];
    private purchaseOptions: IPurchaseOptions;
    private mainWorker: W.IStockWorker<ITickerChange>;

    exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>; //TODO: This should be abstracted to the StockService level, and it should take in it's types from there.
    diagnostic: IDiagnostic;
    datasource: IDataSource;
    notification: INotification;

    constructor(options: IStockServiceOptions) {
        super(options);
        this.exchange = options.exchange;
        this.datasource = options.datasource;
        this.diagnostic = options.diagnostic;
        this.notification = options.notification;
        this.purchaseOptions = options.purchaseOptions;
        this.processables = []; // This will be an array of tickers that have yet to be processed. This will already be a filtered out from timedout tickers. The data here will be provided `_preProcess`
        this.mainWorker = options.mainWorker;
    }

    initialize(): Promise<void> {
        return Promise.all([ super.initialize(), this.datasource.initialize(), this.diagnostic.initialize(), this.exchange.initialize(), this.notification.initialize() ])
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize:SUCCESS`);
        });
    }

    _fetchHighIncreasedTickers = (): Promise<ITickerChange[]> => {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#_fetchHighIncreasedTickers():CALLED`);
        return this.datasource.scrapeDatasource()
        .then(tickers => {
            //Filters out tickers that are already timed out, and tickers who's price per share is above our threshold
            //TODO: We should look into this. This code seems to be duplicated all through this Bot, and should be able to be condensed to one spot. If nothing else, the code should become a function.  
            const keys = Array.from(this.datasource.timedOutTickers.keys());     
            return tickers.filter((tkr: ITickerChange) => !keys.includes(tkr.ticker));
        })
        .catch((err: Error) => {
            this.logger.log(LogLevel.ERROR, JSON.stringify(err), err)
            this.logger.log(LogLevel.ERROR, `Failed to scrape data source, backing off and retrying`);
            return promiseRetry(() => this._fetchHighIncreasedTickers());
        })
    }

    preProcess = async (): Promise<ITickerChange> => {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#preProcess():CALLED`)
        let marketIsOpen = (await this.exchange.isMarketTime());

        if(!marketIsOpen) {
            this.logger.log(LogLevel.INFO, 'Market is currently closed. Delaying next try by 30 minutes.')
            return BPromise.delay(30 * 60000).then(() => this.preProcess());
        } // else continue

        if(this.processables.length > 0) {
            let ticker = this.processables[0];
            this.datasource.timeoutTicker(ticker.ticker);

            this.logger.log(LogLevel.TRACE, `Taking ${ticker.ticker} out of this.processables, pushing ticker to this.process(${ticker.ticker})`)
            //Now update what is processable
            const keys = Array.from(this.datasource.timedOutTickers.keys());     
            this.processables = this.processables.filter((tkr: ITickerChange) => !keys.includes(tkr.ticker));
            return Promise.resolve(ticker);
        } else {
            //Resupply the the work array, and try to process work again
            return this._fetchHighIncreasedTickers()
            .then((tickers: ITickerChange[]) => {
                //This filters out tickers that are timed out.
                const keys = Array.from(this.datasource.timedOutTickers.keys());     
                this.processables = tickers.filter((ticker: ITickerChange) => !keys.includes(ticker.ticker));

                //TODO: The current problem we have here, is that if we have multiple workers, when `this.preProcess()` is called, 
                // Each worker will then call the Yahoo API again, and refill the `this.processable` Array with all of the same tickers. 
                //While the filter above should handle this case, it's bad practice to be calling the API that many times, just to be getting the same value for each call.
                //We should instead create a `WorkerRefill` Promise to only allow one Yahoo API fetch at a time.

                //NOTE: See TODO in below block. We should also create a "WorkerRefill Promise"

                //NOTE: Also, this if statement should also contain logic to verify that all of the tickers fetched are not also timed out. If that is the case, we should do something like return Promise.all(this.timedoutTickerPromises)
                if(!(this.processables.length > 0)) {
                    //TODO: This logic should be moved to _fetchTickerInfo
                    //NOTE: This is some edgecase code
                    const keys = Array.from(this.datasource.timedOutTickers.keys());     
                    if(this.processables.some((ticker: ITickerChange) => !keys.includes(ticker.ticker))) {
                        this.logger.log(LogLevel.TRACE, `The fetched tickers are all timed out. Waiting for all of the timed out tickers to resolve.`);
                        const pendingPromises = Array.from(this.datasource.timedOutTickers.values()).map(p => p.promise);

                        return Promise.all(pendingPromises)
                        .then(() => this.preProcess());
                    } else {
                        //TODO: Instead of immediately trying to scrape, we should create a "backoffPromise" that is just a setTimeout, and we should check if it is present instead. This way, all workers can be on the same backoff as well
                        this.logger.log(LogLevel.INFO, `We are currently on a backoff of 5 seconds to refetch new tickers.`);
                        return promiseRetry(() => this.preProcess(), 500);
                    }
                } else {
                    this.logger.log(LogLevel.TRACE, `Nothing in this.processables, instead retrying this.preProcess()`)
                    return this.preProcess();
                }
            })
            .catch(err => {
                this.logger.log(LogLevel.ERROR, `Error caught in preprocess -> ${err}`);
                throw err;
            });
        }
    }

    makeWorker(options: IWorkerOptions): IWorker<ITickerChange> {
        return new this.mainWorker({
            ...options,
            exceptionHandler: this.exceptionHandler,
            purchaseOptions: this.purchaseOptions,
            exchange: this.exchange,
            notification: this.notification
        });
    }

    exceptionHandler = (err: Error): void => {
        console.log(err, JSON.stringify(err))
        if(err.name === exception.UnprocessableTicker.name) {
            this.logger.log(LogLevel.WARN, `Missing properties, timing out ${err.message}`)
            this.datasource.timeoutTicker(err.message); //Here, with that particular error, the message will be the TICKER
        } else {
            this.logger.log(LogLevel.ERROR, `Caught error in ${this.constructor.name}.exceptionHandler -> Error: ${err}`);
            this.diagnostic.alert({
                level: LogLevel.ERROR,
                title: 'Service Error',
                message: `**ERROR**\n${err.name}\n${err.message}\n${err.stack || null}`
            })
        }
    }
    
    close(): Promise<void> {
        return Promise.all([ this.datasource.close(), this.diagnostic.close(), this.exchange.close(), this.notification.close() ])
        .then(() => super.close());
    }
}
