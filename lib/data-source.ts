import { ITickerChange, IStockChange, BaseStockEvent } from './stock-bot';
import * as joi from 'joi';
import * as U from './util';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { Logger, LogLevel, ICloseable, IInitializable } from './base';
import color from 'chalk';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PolygonGainersLosersSnapshot } from '../types/polygonSnapshot'
import { InvalidDataError, UnprocessableEvent } from './exceptions'
import { URL } from 'url'
import * as p from 'path';
import { TradeEvent } from './workers';
import twit, { Twitter } from 'twit';


export interface IDataSource <TOutput = ITickerChange> extends ICloseable, IInitializable {
    validationSchema: joi.Schema;
    timedOutTickers: Map<string, U.IDeferredPromise>;
    validateData(input: any): boolean;
    scrapeDatasource(): Promise<TOutput[]>;
    timeoutTicker(ticker: string, timeout?: number): void;
    isMock: boolean;
}

export interface IDataSourceOptions {
    validationSchema: joi.Schema;
    logger: Logger;
    isMock?: boolean;
}

export abstract class DataSource<TOutput> implements IDataSource<TOutput> {
    readonly validationSchema: joi.Schema;
    logger: Logger;
    timedOutTickers: Map<string, U.IDeferredPromise>;
    isMock: boolean; //TODO: Implement the usage of this flag in the other DataSource super classes

    constructor(options: IDataSourceOptions) {
        this.validationSchema = options.validationSchema;
        this.logger = options.logger;
        this.timedOutTickers = new Map();
        this.isMock = options.isMock ? options.isMock : false;

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

    abstract scrapeDatasource(): Promise<TOutput[]>;

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
            this.logger.log(LogLevel.TRACE, color.yellow(`${ticker} is already in the timedout ticker Map.`));
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


export class YahooGainersDataSource extends DataSource<ITickerChange> implements IDataSource {
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

export class PolygonGainersLosersDataSource extends DataSource<ITickerChange> implements IDataSource {
    scrapeUrl: string;
    apiKey: string;
    constructor(options: IDataSourceOptions) {
        super(options);
        this.scrapeUrl = 'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks';
        this.apiKey = process.env['ALPACAS_API_KEY'] || "";
    }

    scrapeDatasource(): Promise<ITickerChange[]> {
        return Promise.all([axios.get(this.constructPolygonUrl('/gainers', this.scrapeUrl)), axios.get(this.constructPolygonUrl('/losers', this.scrapeUrl))])
        .then(((data: AxiosResponse<PolygonGainersLosersSnapshot>[]) => {
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

export interface IPolygonLiveDataSourceOptions extends IDataSourceOptions {
    subscribeTicker: string[];
}

export class PolygonLiveDataSource extends DataSource<TradeEvent> implements IDataSource<TradeEvent> {
    private readonly scrapeUrl: string;
    private data: TradeEvent[];
    private emitter: EventEmitter;
    private polygonConn!: WebSocket;
    private subscribeTicker: string[];
    private initializePromise: U.IDeferredPromise;
    private closePromise: U.IDeferredPromise;
    private apiKey: string;
    
    constructor(options: IPolygonLiveDataSourceOptions) {
        super(options);
        this.emitter = new EventEmitter();
        //TODO: If needed, later on we can require the caller to append the required *.TICKER prefix to allow this for more robust usage
        //TODO: Note, this seems like it should be changed to use TradeEvent, since it's more accurate as it pertains to what people are actually paying per share, since it's price is that of a historic nature
        this.subscribeTicker = options.subscribeTicker.map(ticker => `T.${ticker}`);
        this.data = [];
        this.initializePromise = U.createDeferredPromise();
        this.closePromise = U.createDeferredPromise();
        this.scrapeUrl = "wss://socket.polygon.io/stocks";
        this.polygonConn = new WebSocket(this.scrapeUrl);
        this.apiKey = (process.env['ALPACAS_API_KEY'] || "");

        //Event Handlers
        //Our generic message handler for incoming messages
        this.polygonConn.on('message', this._polygonMessageHandler);

        //Once connected, authenticate with Polygon
        this.emitter.on('CONNECTED', () => {
            this.polygonConn.send(JSON.stringify({
                "action": "auth",
                "params": process.env['ALPACAS_API_KEY']
            }));
        });
        //Once Authenticated, subscribe to tickers
        this.emitter.on('AUTHENTICATED', () => {
            this.polygonConn.send(JSON.stringify({
                "action": "subscribe",
                "params": `${this.subscribeTicker.join(',')}`
            }));
        });

        //Once subscribed to all tickers, allow initialize method to resolve
        this.emitter.on('SUBSCRIBED', () => this.initializePromise.resolve());
        //Once close is called, only resolve the method call once the final ticker is unsubscribed from
        this.emitter.on('UNSUBSCRIBED', () => this.closePromise.resolve());
    }

    initialize(): Promise<void> {
        if (!this.apiKey) {
            return Promise.reject(new InvalidDataError(`ALPACAS_API_KEY environment variable required for ${this.constructor.name}`));
        }

        return this.initializePromise.promise
        .then(() => super.initialize())
        .then(() => {
            //Handle all incoming quotes
            //TODO: May want to refactor this, but the idea is we don't want to handle incoming quotes until our promise is resolved
            this.emitter.on('TRADE', data => {
                this._tradeHandler(data);
            });
        })
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    scrapeDatasource(): Promise<TradeEvent[]> {
        this.logger.log(LogLevel.TRACE, `this.processables = ${this.data.length}`);
        let output = [...this.data];
        this.data = [];
        return Promise.resolve(output);
    }

    private _statusHandler = (data: any): void => {
        switch(data.status) {
            case 'connected':
                this.emitter.emit('CONNECTED', this.emitter);
                break;
            case 'auth_success':
                this.emitter.emit('AUTHENTICATED', this.emitter);
                break;
            case 'success':
                //Used to tell the class when we have successfully subscribed to the last ticker in the list
                if (data.message.includes(this.subscribeTicker[this.subscribeTicker.length - 1])) {
                    const eventName = data.message.includes('unsubscribed') ? 'UNSUBSCRIBED' : 'SUBSCRIBED';
                    this.emitter.emit(eventName, this.emitter);
                }
                break;
            default: 
                this.logger.log(LogLevel.WARN, `Unknown status type ${data.status}`);
                break;
        }
    }

    /*
        NOTE: This message handler only supports the 'status' and 'Q' events, nothing else.
    */
    private _polygonMessageHandler = (data: any): void => {
        data = JSON.parse(data);
        data = data[0];
        const event = data.ev;

        switch(event) {
            case "status":
                this._statusHandler(data);
                break;
            case "T":
                // console.log(JSON.stringify(data))
                this._tradeHandler(data);
                break;

            default:
                throw new UnprocessableEvent(`${this.constructor.name} not currently configured to handle "${event}" event`);
        }
    }

    _tradeHandler = (data: TradeEvent) => {
        this.logger.log(LogLevel.TRACE, `${this.constructor.name}#data.length = ${this.data.length}`);
        data['ticker'] = data.sym;
        
        if (!(this.timedOutTickers.has(data.sym))) {
            this.data.push(data);
        }
        return;
    }

    close(): Promise<void> {
        if (this.polygonConn.CLOSED || this.polygonConn.CLOSING || this.polygonConn.CONNECTING) {
            try {
                this.polygonConn.close();
                return Promise.resolve();
            } catch (e) {
                //We know sometimes the WebSocket connection won't be connected, and will throw an error
                return Promise.resolve();
            }
        } else {
            this.polygonConn.send(JSON.stringify({
                "action": "unsubscribe",
                "params": this.subscribeTicker.join(',')
            }));
    
    
            return this.closePromise.promise
            .then(() => {
                this.polygonConn.close();
            })
            .then(() => super.close())
        }
    }
}

export enum TwitterAccountType {
    LONG_POSITION,
    FAST_POSITION,
    OPTIONS_POSITION
}

export interface TwitterAccount {
    id: string;
    type: TwitterAccountType;
}

export interface SocialMediaOutput {
    ticker: string;
    type: TwitterAccountType;
}

export interface TwitterDataSourceOptions extends IDataSourceOptions {
    twitterAccounts: TwitterAccount[]; //The ID's of the people to look at
    tickerList: string[];
    twitterKey: string;
    twitterSecret: string;
    isMock?: boolean;
}

export class TwitterDataSource extends DataSource<SocialMediaOutput> implements IDataSource<SocialMediaOutput> {
    private client!: twit;
    private clientStream!: twit.Stream;
    private twitterAccounts: TwitterAccount[];
    private work: SocialMediaOutput[];
    private tickerList: string[];
    private twitterKey: string;
    private twitterSecret: string;


    constructor (options: TwitterDataSourceOptions) {
        super(options);
        this.twitterAccounts = options.twitterAccounts;
        this.tickerList = options.tickerList;
        this.twitterKey = options.twitterKey;
        this.twitterSecret = options.twitterSecret;
        this.work = [];
    }

    initialize(): Promise<void> {
        if (!this.isMock) {
            this.client = new twit({
                consumer_key: this.twitterKey,
                consumer_secret: this.twitterSecret
            });
    
            this.clientStream = this.client.stream('user', { follow: this.twitterAccounts.map(account => account.id) });
    
            this.clientStream.on('tweet', (tweet: string) => {
                let output = this._processTweet(tweet);
    
                if (output) {
                    this.work.push({ ticker: output, type: TwitterAccountType.FAST_POSITION }); //TODO: Placeholder
                }
            });
        }

        return Promise.resolve();
    }

    /**
     * Currently we only support 2 ways of finding a ticker,
     * 1. check if a word with $ at the beginning of it is a ticker
     * 2. If we can match a word that is 4 characters long to a ticker in this.tickerList
     * 
     * @param tweet The tweet to process
     * @returns {string | void} the ticker in the tweet, or nothing if the tweet does not contain a ticker
     */

    
    _processTweet(tweet: string): string | void {
        const splitTweet: string[] = tweet.replace('\n', '').split(" ");

        const ticker = splitTweet.filter(word => word.startsWith("$"));
        
        const hasTicker: boolean = ticker.length > 0 && this.tickerList.includes(ticker[0].toUpperCase());

        if (hasTicker) {
            return ticker[0].replace("$", '');
        } else {
            return this._compareWordsToList(splitTweet);
        }
    }

    _compareWordsToList(words: string[]): string | void {
        let outputWord: string = '';
        let filteredForTickerLength = words.filter(word => word.length <= 5); //5 because here it may be something like $AAPL

        filteredForTickerLength.forEach((word: string) => {
            let cleanWord: string = word.toUpperCase().replace('\n', '').replace(/[^\w\s]/gi, '');
            let isTicker: boolean = this.tickerList.includes(cleanWord);

            if (isTicker) {
                outputWord = cleanWord;
            }
        });


        if (outputWord) {
            return outputWord;
        }
    }

    scrapeDatasource(): Promise<SocialMediaOutput[]> {
        return Promise.resolve(this.work)
        .finally(() => {
            this.work = [];
        });
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}

export interface PhonyDataSourceOptions<T> extends DataSource<T> {
    returnData: T;
}

export class PhonyDataSource<T> extends DataSource<T> {
    returnData: T;
    constructor(options: PhonyDataSourceOptions<T>){
        super(options);
        this.returnData = options.returnData;
    }

    scrapeDatasource(): Promise<T[]> {
        return Promise.resolve([this.returnData]);
    }
}