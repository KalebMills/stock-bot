import { ITickerChange, IStockChange } from './stock-bot';
import * as joi from 'joi';
import * as U from './util';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { Logger, LogLevel, ICloseable, IInitializable } from './base';
import color from 'chalk';
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { PolygonGainersLosersSnapshot } from '../types/polygonSnapshot'
import { InvalidConfigurationError, InvalidDataError, UnprocessableEvent } from './exceptions'
import { URL } from 'url'
import * as p from 'path';
import { TradeEvent } from './workers';
import twit from 'twit';
import { OAuth } from 'oauth';
import BPromise from 'bluebird';
import { inspect } from 'util';


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
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }

    initialize(): Promise<void> {
        return Promise.resolve()    //noop
        .then(() => {
            this.logger.log(LogLevel.INFO, color.green(`${this.constructor.name}#initialize:SUCCESS`))
        });
    }

    validateData(input: any): boolean {
        const { error } = this.validationSchema.validate(input);
        
        if (error) {
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
    LONG_POSITION = 'LONG_POSITION',
    FAST_POSITION = 'FAST_POSITION',
    OPTIONS_POSITION = 'OPTIONS_POSITION',
    WATCHLIST = 'WATCHLIST',
    UNKNOWN = 'UNKNOWN_POSITION'
}

export interface TwitterAccount {
    id: string;
    name: string;
    type: TwitterAccountType;
}

export interface SocialMediaOutput {
    type: TwitterAccountType;
    account_name: string;
    message: string;
    urls: string[];
}

export interface TwitterDataSourceOptions extends IDataSourceOptions {
    twitterAccounts: TwitterAccount[]; //The ID's of the people to look at
    tickerList: string[];
    twitterKey: string;
    twitterSecret: string;
    twitterAccessToken: string;
    twitterAccessSecret: string;
    scrapeProcessDelay: number; //Milliseconds
    isMock?: boolean;
}

export interface TwitterTimelineTweet {
    id: string;
    text: string;
    urls: string[];
}

export interface _InternalTwitterTimelineTweet extends Omit<TwitterTimelineTweet, 'url'> {
    in_reply_to_user_id?: string;
    attachments: {
        media_keys: string[]
    }
}

export interface TwitterMediaAttachments {
    media_key: string,
    type: "photo",
    url: string
}

export interface TwitterTweetListWithAccountId {
    accountId: string;
    tweets: TwitterTimelineTweet[];
}

export interface TwitterTimelineResponse {
    data: _InternalTwitterTimelineTweet[],
    meta: {
        oldest_id: string;
        newest_id: string;
        result_count: number;
        next_token: string;
    }
    includes: {
        media: TwitterMediaAttachments[];
    }
}

export interface IncomingTweet {
    id: number; //Tweet ID
    text: string;
    user: {
        id: number; //User ID
        screen_name: string;
    }
    timestamp_ms: string; //Unix MS
    retweeted_status?: {    //The presence of this object tells us this is a retweet
        [key: string]: any;
    }
}

const TwitterDataSourceOptionsSchema: joi.Schema = joi.object({
    twitterAccounts: joi.array().required(),
    tickerList: joi.array().required(),
    twitterKey: joi.string().required(),
    twitterSecret: joi.string().required(),
    twitterAccessToken: joi.string().required(),
    twitterAccessSecret: joi.string().required(),
    isMock: joi.boolean()
}).required();

export class TwitterDataSource extends DataSource<SocialMediaOutput> implements IDataSource<SocialMediaOutput> {
    private client!: twit;
    private clientStream!: twit.Stream;
    private twitterAccounts: TwitterAccount[];
    private work: SocialMediaOutput[];
    private tickerList: string[];
    private twitterKey: string;
    private twitterSecret: string;
    private twitterAccessToken: string;
    private twitterAccessSecret: string;
    private _scrapeProcess: Promise<any>; 
    private _scrapeProcessDelay: number; //Milliseconds
    private prevIds: string[];


    constructor (options: TwitterDataSourceOptions) {
        super(options);
        let valid = TwitterDataSourceOptionsSchema.validate(options);

        if (!valid) {
            throw new InvalidConfigurationError('InvalidConfiguration for TwitterDataSource');
        }

        this._scrapeProcess = Promise.resolve();
        this._scrapeProcessDelay = options.scrapeProcessDelay;
        this.prevIds = []; //This property is used to track the latest tweets from each scrape

        this.twitterAccounts = options.twitterAccounts;
        this.tickerList = options.tickerList;
        this.twitterKey = options.twitterKey;
        this.twitterSecret = options.twitterSecret;
        this.twitterAccessSecret = options.twitterAccessSecret;
        this.twitterAccessToken = options.twitterAccessToken;
        this.work = [];
    }

    initialize(): Promise<void> {
        if (!this.isMock) {
        //     this.client = new twit({
        //         consumer_key: this.twitterKey,
        //         consumer_secret: this.twitterSecret,
        //         access_token: this.twitterAccessToken,
        //         access_token_secret: this.twitterAccessSecret,
        //     });
    
        //     this.clientStream = this.client.stream('statuses/filter', { follow: this.twitterAccounts.map(account => account.id), include_rts: false, exclude_replies: true });
    
        //     this.clientStream.on('tweet', (data: IncomingTweet) => {
        //         this._processTweet(data)
        //         .then(output => {
        //             if (output) {
        //                 this.work.push(output);
        //             }
        //         }); //TODO: Error prone since we will be calling a model, should handle here
        //     });
            this.startProcessing();
        }


        return Promise.resolve();
    }

    startProcessing = (): Promise<void> => {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#startProcessing():INVOKED`);

        return BPromise.delay(this._scrapeProcessDelay)
        .then(() => this.publishLatestTweets())
        .catch(err => {
            this.logger.log(LogLevel.ERROR, `Error occurred when scraping Twitter: ${inspect(err)}`)
        })
        .finally(() => {
            this._scrapeProcess = this.startProcessing();
        })
    }

    getAllTickersFromTweet(tweet: IncomingTweet): string[] {
        const { text } = tweet;

        return text.split(" ")
        .filter(word => word.startsWith("$"))
        .map(word => word.replace("\n", "").replace(/[^\w\s]/gi, ''));
    }

    scrapeDatasource(): Promise<SocialMediaOutput[]> {
        return Promise.resolve(this.work)
        .finally(() => {
            this.work = [];
        });
    }

    _getLatestTweetsFromEachAccount = (input: TwitterTweetListWithAccountId[]): Promise<TwitterTweetListWithAccountId[]> => {
        let latestTweets: TwitterTweetListWithAccountId[] = [];

        if (this.prevIds.length > 0) {
            input.forEach(account => {
                //Get the index of latest Tweet in the array (sorted newest to oldest)
                let latestTweetIndex = account.tweets.findIndex(tweet => this.prevIds.includes(tweet.id));

                if (latestTweetIndex !== -1) {
                    const newTweets = account.tweets.slice(0, latestTweetIndex);

                    if (newTweets.length > 0) {
                        latestTweets.push({ accountId: account.accountId, tweets: newTweets });
                    }

                    let oldNewestIndex = this.prevIds.findIndex(id => id === account.tweets[latestTweetIndex].id);

                    this.prevIds[oldNewestIndex] = account.tweets[0].id;
                } else {
                    // this is the first time the account was scraped before the others, so we initialize the first id just like we do in the outter else block
                    this.prevIds.push(account.tweets[0].id);
                    latestTweets.push({ accountId: account.accountId, tweets: [ account.tweets[0] ] });
                }
            });
        } else {
            input.forEach(account => {
                this.prevIds.push(account.tweets[0].id);
                latestTweets.push({ accountId: account.accountId, tweets: [ account.tweets[0] ] });
            })
        }

        return Promise.resolve(latestTweets);
    }

    _scrapeAllTimelines = (): Promise<TwitterTweetListWithAccountId[]> => {
        return Promise.all(this.twitterAccounts.map(acc => {
            return this._fetchLatestTimeline(acc.id);
        })).then(data => data.filter(val => !!val));
    }

    _fetchLatestTimeline = (userId: string): Promise<TwitterTweetListWithAccountId> => {
        let request = new OAuth(
            'https://api.twitter.com/oauth/request_token',
            'https://api.twitter.com/oauth/access_token',
            this.twitterKey,
            this.twitterSecret,
            '1.0A',
            null,
            'HMAC-SHA1'
        )

        return new Promise((resolve, reject) => {
            request.get(
                `https://api.twitter.com/2/users/${userId}/tweets?expansions=attachments.media_keys&media.fields=url&tweet.fields=in_reply_to_user_id`,
                this.twitterAccessToken,
                this.twitterAccessSecret,
                function (e, data, res) {
                    if (e) {
                        reject(e.data)
                    }

                    let formatted: TwitterTimelineResponse =  JSON.parse(data?.toString()!);

                    // Only a Partial for typing purposes
                    let newObj: Partial<TwitterTweetListWithAccountId> = {};

                    //@ts-ignore
                    delete formatted.data['attachments'];

                    newObj['tweets'] = [];
                    newObj['accountId'] = userId;

                    formatted.data.forEach((tweet, i) => {
                        // Skip tweets that are in reply to someone
                        if (tweet.in_reply_to_user_id && tweet.in_reply_to_user_id !== userId) {
                            return;
                        }

                        let tweetUrls: string[] = [];
                        
                        if (tweet.hasOwnProperty('attachments')) {
                            let mediaKeys = tweet.attachments.media_keys;
                            tweetUrls.push(...formatted.includes.media.filter(attachment => mediaKeys.includes(attachment.media_key)).map(attachment => attachment.url));
                        }

                        newObj.tweets?.push({
                            id: tweet.id,
                            text: tweet.text,
                            urls: tweetUrls
                        });
                    });

                    resolve(newObj as TwitterTweetListWithAccountId);
                }
            )
        })
    }

    publishLatestTweets = () => {
        return this._scrapeAllTimelines()
        .then(data => this._getLatestTweetsFromEachAccount(data))
        .then(data => {
            //next need to put the data into the expected shape. It does seem that this shape needs some changes
            data.forEach(account => {
                let configuredAccount = this.twitterAccounts.find(acc => acc.id === account.accountId)!;
                account.tweets.forEach(tweet => {
                    this.logger.log(LogLevel.INFO, `Adding Tweet from ${configuredAccount.name} to work: ${tweet.text}`);
                    this.work.push({
                        account_name: configuredAccount.name,
                        type: configuredAccount.type,
                        message: tweet.text,
                        urls: tweet.urls
                    });
                })
            })
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