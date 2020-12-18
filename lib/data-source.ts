import { ITickerChange, IStockChange } from './stock-bot';
import * as joi from 'joi';
import * as U from './util';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { Logger, LogLevel, ICloseable, IInitializable } from './base';
import color from 'chalk';
import BPromise, { reject } from 'bluebird';
import { PolygonSnapshot } from '../types/polygonSnapshot'
import { InvalidDataError } from './exceptions'
import { URL } from 'url'
import * as p from 'path';

export interface IDataSource extends ICloseable, IInitializable {
    validationSchema: joi.Schema;
    timedOutTickers: Map<string, U.IDeferredPromise>;
    validateData(input: any): boolean;
    scrapeDatasource(): Promise<ITickerChange[]>;
    timeoutTicker(ticker: string, timeout?: number): void;
}

export interface IDataSourceOptions {
    validationSchema: joi.Schema;
    logger: Logger;
}

export abstract class DataSource implements IDataSource {
    readonly validationSchema: joi.Schema;
    logger: Logger;

    timedOutTickers: Map<string, U.IDeferredPromise>;

    constructor(options: IDataSourceOptions) {
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
            let deferred = U.createDeferredPromise();
            let timer = setTimeout(() => {
                    console.log('Successfully resolved a timed out ticker')
                    deferred.resolve()
                }, timeout ? (timeout * 1000) : 600000); //Defaults to 10 minutes
            deferred.cancellable = () => timer.unref();
            deferred.reject = () => {}; //Does nothing
            
            //Set the ticker into the timed out Map
            this.timedOutTickers.set(ticker, deferred);

            //Once the promise resolves, delete itself out of the Map
            deferred.promise.then(() => {
                this.timedOutTickers.delete(ticker);
            });
            return;
        } else {
            this.logger.log(LogLevel.WARN, color.yellow(`${ticker} is already in the timedout ticker Map.`));
        }
    }

    close(): Promise<void> {

        //resolve all promises that were used to time out tickers;
        return Promise.all([ ...this.timedOutTickers.keys()].map(k => {
            console.log(`${k}.CLOSE():${this.constructor.name}`)
            let promise = this.timedOutTickers.get(k);
            promise?.resolve();
            this.timedOutTickers.delete(k);

            return promise?.promise;
        }))
        .then(() => {
            console.log(`${this.constructor.name}#close:SUCCESS`)
        });
    }
}


export class YahooGainersDataSource extends DataSource implements IDataSource {
    scrapeUrl: string;
    constructor(options: IDataSourceOptions) {
        super(options);
        this.scrapeUrl = 'https://finance.yahoo.com/gainers'
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

                            this.logger.log(LogLevel.TRACE, `Ticker Scrape: ${ticker} -- Price: ${price} -- Change: ${change}`)                      ;      
                        } catch(err) {
                            throw new InvalidDataError(`Error in ${this.constructor.name}._fetchHighIncreasedTickers(): innerError: ${err} -- ${JSON.stringify(err)}`);
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


export class PolygonGainersLosersDataSource extends DataSource implements IDataSource {
    scrapeUrl: string;
    apiKey: string;
    constructor(options: IDataSourceOptions) {
        super(options);
        this.scrapeUrl = 'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks';
        this.apiKey = process.env['ALPACAS_API_KEY'] || "";
    }

    scrapeDatasource(): Promise<ITickerChange[]> {
        return Promise.all([axios.get(this.constructPolygonUrl('/gainers', this.scrapeUrl)), axios.get(this.constructPolygonUrl('/losers', this.scrapeUrl))])
        .then(((data: AxiosResponse<PolygonSnapshot>[]) => {
            const tickers: ITickerChange[] = [];
            try {
                data.forEach(response => {
                    for(let snapshot of response.data['tickers']) {
                        let persuasion: "up" | "down" = snapshot.todaysChange > 0 ? "up" : "down";
                        let percentChange: number = Number(snapshot.todaysChangePerc.toFixed(2))
                        let stockObj: ITickerChange = {
                            ticker: snapshot.ticker,
                            price: snapshot.day.c!,
                            percentChange: { percentChange, persuasion},
                            currentVol: snapshot.day.v,
                            currentVwap: snapshot.day.vw,
                            openPrice: snapshot.day.o,
                            highOfDay: snapshot.day.h,
                            lowOfDay: snapshot.day.l,
                            prevDayVol: snapshot.prevDay.v,
                            prevDayVwap: snapshot.prevDay.vw,
                            prevDayClose: snapshot.prevDay.c,
                            prevMinVol: snapshot.min.v,
                            prevMinVwap: snapshot.min.vw
                        };
                        tickers.push(stockObj)
                        this.logger.log(LogLevel.TRACE, `Ticker Scrape: ${stockObj.ticker} -- Price: ${stockObj.price} -- Change: ${stockObj.percentChange}`)
                    }
                })
            } catch(err) {
                throw new InvalidDataError(`Error in ${this.constructor.name}.scrapeDatasource(): innerError: ${err} -- ${JSON.stringify(err)}`);
            }
            return tickers
        }))
    }

    constructPolygonUrl = (path: string, base: string): string => {
        let apiKey = process.env['ALPACAS_API_KEY'] || "";
        let baseUrl = p.join(base, path);
        let url = new URL(baseUrl);
        url.searchParams.append("apiKey", apiKey);
        return url.toString();
    }
}
//TODO: Need to create a client for this url: https://www.barchart.com/stocks/performance/price-change/advances?orderBy=percentChange&orderDir=desc&page=all