import { ITickerChange, IStockChange } from './stock-bot';
import * as joi from 'joi';
import * as U from './util';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { Logger, LogLevel, ICloseable, IInitializable } from './base';
import color from 'chalk';
import BPromise from 'bluebird';

export interface IDataSource extends ICloseable, IInitializable {
    scrapeUrl: string;
    validationSchema: joi.Schema;
    timedOutTickers: Map<string, U.IDeferredPromise>;
    validateData(input: any): boolean;
    scrapeDatasource(): Promise<ITickerChange[]>;
    timeoutTicker(ticker: string, timeout?: number): void;
}

export interface IDataSourceOptions {
    scrapeUrl: string;
    validationSchema: joi.Schema;
    logger: Logger;
}

export abstract class DataSource implements IDataSource {
    readonly scrapeUrl: string;
    readonly validationSchema: joi.Schema;
    logger: Logger;

    timedOutTickers: Map<string, U.IDeferredPromise>;

    constructor(options: IDataSourceOptions) {
        this.scrapeUrl = options.scrapeUrl;
        this.validationSchema = options.validationSchema;
        this.logger = options.logger;
        this.timedOutTickers = new Map();
    }

    initialize(): Promise<void> {
        return Promise.resolve()    //noop
        .then(() => {
            this.logger.log(LogLevel.INFO, color.green(`${this.constructor.name}#initialize:SUCCESS`))
        });
    }

    validateData(input: any): boolean {
        const { error, errors } = this.validationSchema.validate(input);
        
        if (error || errors) {
            return false;
        } else {
            return true;
        }
    }

    abstract scrapeDatasource(): Promise<ITickerChange[]>;

    timeoutTicker(ticker: string, timeout?: number /* in seconds */): void {
        if (!this.timedOutTickers.has(ticker)) {
            let t: NodeJS.Timeout;
            let timeoutFunction = new Promise((resolve, reject) => {
                t = setTimeout(() => {
                    console.log('Successfully resolved a timed out ticker')
                    resolve()
                }, timeout ? (timeout * 1000) : 600000); //Defaults to 10 minutes
            });
            let deferred = U.createDeferredPromise(timeoutFunction);
            deferred.cancellable = () => {
                t.unref();
            }
            
            //Set the ticker into the timed out Map
            this.timedOutTickers.set(ticker, deferred);

            //Once the promise resolves, delete itself out of the Map
            deferred.promise.then(() => this.timedOutTickers.delete(ticker)); //Maybe should catch here too?

            return;
        } else {
            this.logger.log(LogLevel.WARN, color.yellow(`${ticker} is already in the timedout ticker Map.`));
        }
    }

    close(): Promise<void> {

        //resolve all promises that were used to time out tickers;
        return BPromise.each([ ...this.timedOutTickers.keys() ], key => {
            let p = this.timedOutTickers.get(key);
            p!.resolve();
            this.timedOutTickers.delete(key);
        })
        .then(() => {
            console.log(`${this.constructor.name}#close:SUCCESS`)
        });
    }
}


export class YahooGainersDataSource extends DataSource implements IDataSource {
    constructor(options: IDataSourceOptions) {
        super(options);
    }

    scrapeDatasource(): Promise<ITickerChange[]> {
        return axios.get(this.scrapeUrl)
        .then((data: AxiosResponse) => {
            let html = cheerio.load(data.data);
            const tickers: ITickerChange[] = [];

            //Loops through table headers, if more than Symbol is ever needed
            html('#fin-scr-res-table').find('table').find('tbody').children().map((i, child) => {
                if(child.name === 'tr') {
                    if(child.firstChild.hasOwnProperty('children')) {
                        let ticker = child.firstChild.children[1].firstChild.data! || "";
                        let price = child.children[2].children[0].firstChild.data! || "";
                        let pAsNumber: number;
                        let change = child.children[4].children[0].firstChild.data! || "";
                        let cAsNumber: number;
                        let percentChange: IStockChange;

                        //@ts-ignore
                        let stockObj: ITickerChange = {};

                        try {
                            let pAsFixed = Number(price)
                            pAsNumber = Number.parseFloat(pAsFixed.toFixed(2));
                            let persuasion: "up" | "down" = change.includes("+") ? "up" : "down";
                            let cAsFixed = Number(Number.parseFloat(change));
                            cAsNumber = Number(cAsFixed.toFixed(2));
                            percentChange = { percentChange: cAsNumber, persuasion }

                            stockObj.price = pAsNumber;
                            stockObj.percentChange = percentChange;
                            stockObj.ticker = ticker;

                            this.logger.log(LogLevel.TRACE, `Ticker Scape: ${ticker} -- Price: ${price} -- Change: ${change}`)                      ;      
                        } catch(err) {
                            throw new Error(`Error in ${this.constructor.name}._fetchHighIncreasedTickers(): innerError: ${err} -- ${JSON.stringify(err)}`);
                        }

                        //Where we add or timeout the ticker;
                        if (this.validateData(stockObj)) {
                            this.logger.log(LogLevel.TRACE, `Adding ${ticker} to returnable ticker array`);
                            tickers.push(stockObj);
                        } else {
                            this.logger.log(LogLevel.TRACE, `Timing out ${ticker} - REASON: Value of 'pAsNumber' is falsy, or equal to 0 - VALUE: ${pAsNumber}`)
                            this.timeoutTicker(ticker);
                        }
                    }
                }
            })

            //Filters out tickers that are already timed out;
            const keys = Array.from(this.timedOutTickers.keys());
            return tickers.filter((tkr: ITickerChange) => !keys.includes(tkr.ticker));
        });
    }
}

//TODO: Need to create a client for this url: https://www.barchart.com/stocks/performance/price-change/advances?orderBy=percentChange&orderDir=desc&page=all