import { Service, Worker, IServiceOptions, IWorker, IWorkerOptions, LogLevel, Logger, promiseRetry } from './base';
import BPromise from 'bluebird';
import axios, { AxiosResponse } from 'axios';
import { Exchange } from './exchange';
import * as Alpacas from '@master-chief/alpaca';
import { AlpacasExchange } from './exchange';
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import * as exception from './exceptions';
import * as sheets from 'google-spreadsheet';
import { DataSource, IDataSource } from './data-source';
import * as joi from 'joi';
import color from 'chalk';
import { INotification } from './notification';

export const StockBotOptionsValidationSchema = joi.object({
    datasource: joi.object().instance(DataSource).required(),
    exchange: joi.object().instance(AlpacasExchange).required(), //Currently we don't have a base Exchange class 
    notification: joi.object().required(), //TODO: Need to figure out a way to do this correctly, like required particular properties
    googleSheets: joi.object({
        id: joi.string().required(),
        authPath: joi.string().required()
    }).length(2).required(),

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

export interface IStockeWorkerOptions<T, TOrderInput, TOrder> extends IWorkerOptions<T> {
    postTransaction: (data: { [key: string]: string | number }) => Promise<void>;
    purchaseOptions: IPurchaseOptions;
    exchange: Exchange<TOrderInput, TOrderInput, TOrder>;
    notification: INotification;
}

export interface IStockServiceOptions extends IServiceOptions {
    datasource: IDataSource;
    notification: INotification;
    exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>;
    googleSheets: {
        id: string;
        authPath: string; //Since the keys are in a JSON file stored on the local machine
    }
    purchaseOptions: IPurchaseOptions;
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
    sheetsClient!: sheets.GoogleSpreadsheetWorksheet;
    private options: IStockServiceOptions;
    private processables: ITickerChange[];
    private purchaseOptions: IPurchaseOptions;
    exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>; //TODO: This should be abstracted to the StockService level, and it should take in it's types from there.
    datasource: IDataSource;
    notification: INotification;

    constructor(options: IStockServiceOptions) {
        super(options);
        this.options = options;
        this.exchange = options.exchange;
        this.datasource = options.datasource;
        this.notification = options.notification;
        this.purchaseOptions = options.purchaseOptions;
        this.processables = []; // This will be an array of tickers that have yet to be processed. This will already be a filtered out from timedout tickers. The data here will be provided `_preProcess`
    }

    initialize(): Promise<void> {
        return Promise.all([ super.initialize(), this.datasource.initialize(), this.exchange.initialize() ])
        .then(() => {
            //TODO: Should make this it's own abstraction, something like 
            let sheet = new sheets.GoogleSpreadsheet(this.options.googleSheets.id);
            return sheet.useServiceAccountAuth(require(this.options.googleSheets.authPath))
            .then(() => sheet.loadInfo())
            .then(() => {
                this.sheetsClient = sheet.sheetsById[0];
            })
        })
        .then(() => {
            this.logger.log(LogLevel.INFO, `Successfully authenticated with Google Sheets API`)
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


    /*
        Notes: Since we want to conserve API calls (for now) to Yahoo, the output of preProcess should be pushed to a "processable" array. Before making an API call, first `preProcess` should check that array for a ticker value
        , and if there is still some, select one and provide it to `process()`, else make an API call and do above logic.

        ALSO - Currently all of our stock data is fetched and groomed via Yahoo Finance. This is OK for now, but in the future, we should look into using Polygon.io with our Alpacas keys.
        All of the below data we scrape, is available via their /v2/snapshot/locale/us/markets/stocks/tickers/{ticker} endpoint

        Also, here is another endpoint we could use for getting the top gainers - v2/snapshot/locale/us/markets/stocks/{direction}
    */
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
            })
        }
    }

    //TODO: We should make this something like a "Tracker" class, that does this type of generic logging
    postTransaction = (data: {[key: string]: string | number}): Promise<void> => {
        let date = momentTimezone().tz('America/Monterrey').format('MM-DD-YYYY');
        let time = momentTimezone().tz('America/Monterrey').format('HH:mm');
        return this.sheetsClient.addRow({ ...data, date, time })
        .then(() => {})
    }

    makeWorker(options: IWorkerOptions): IWorker<ITickerChange> {
        return new StockServiceWorker({
            ...options,
            exceptionHandler: this.exceptionHandler,
            postTransaction: this.postTransaction,
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
            this.logger.log(LogLevel.ERROR, `Caught error in ${this.constructor.name}.exceptionHandler -> Error: ${err}`)
        }
    }
    
    close(): Promise<void> {
        return Promise.all([ this.datasource.close(), this.exchange.close() ])
        .then(() => super.close());
    }
}


export class StockServiceWorker extends Worker<ITickerChange> {
    logger: Logger;
    private postTransaction: (data: {[key: string]: string | number}) => Promise<void>;
    private purchaseOptions: IPurchaseOptions;
    private notification: INotification;
    exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>; //TODO: This should be abstract somehow, these type definitions should not be explicitly Alpaca types

    constructor(options: IStockeWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>) {
        super(options);
        this.logger = options.logger;
        this.postTransaction = options.postTransaction;
        this.purchaseOptions = options.purchaseOptions;
        this.exchange = options.exchange;
        this.notification = options.notification;
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
            //TODO: Make the expected percentChange expectation configurable in the service
            if((changePercent.percentChange >= .0005 && changePercent.persuasion === 'up') && (ticker.price <= this.purchaseOptions.maxSharePrice)) {
                this.logger.log(LogLevel.INFO, `We should buy ${ticker.ticker} at $${ticker.price}/share, previous price ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago was $${prevStockPrice}/share`);
                let takeProfitDollarAmount = ticker.price + (ticker.price * this.purchaseOptions.takeProfitPercentage);
                let stopLossDollarAmount = ticker.price - (ticker.price * this.purchaseOptions.stopLimitPercentage);
               
                //Lets set our buy here, and our different sell and stop limits with the above price
                return this.exchange.getBuyingPower()
                .then(amount => {
                    this.logger.log(LogLevel.INFO, color.green(`Checking buying power.`))
                    const cost = this.purchaseOptions.maxShareCount * this.purchaseOptions.maxSharePrice;
                    if(cost < amount) {
                        return this.notification.notify(`We should purchase ticker ${ticker.ticker}`);
                    } else {
                        this.logger.log(LogLevel.WARN, color.magentaBright(`${this.exchange.constructor.name} does not have enough buy power to purchase the configured amount of shares for ${ticker.ticker}`));
                        return;
                    }
                })

            } else {
                this.logger.log(LogLevel.TRACE, `Ticker: ${ticker} - Change Percent: ${changePercent} - Price: ${prevStockPrice}`)
            }
        })
    }

    //This function should also verify that 1, the range is within trading time, and if the range is past it, return most recent price
    //NOTE: Above is somewhat correct - but this function should not do that check, the caller of the function should do that check, so this method can be indipotent
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
                throw new exception.UnprocessableTicker(ticker);
            }
        })
        .catch(err => {
            this.logger.log(LogLevel.ERROR, `Got error in getPrevStockPrice -> ${err}`)
            throw err;
        })
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
