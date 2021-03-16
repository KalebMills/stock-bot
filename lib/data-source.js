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
exports.PhonyDataSource = exports.TwelveDataDataSource = exports.TwitterDataSource = exports.TwitterAccountType = exports.PolygonLiveDataSource = exports.PolygonGainersLosersDataSource = exports.YahooGainersDataSource = exports.DataSource = void 0;
const joi = __importStar(require("joi"));
const U = __importStar(require("./util"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const base_1 = require("./base");
const chalk_1 = __importDefault(require("chalk"));
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const exceptions_1 = require("./exceptions");
const url_1 = require("url");
const p = __importStar(require("path"));
const oauth_1 = require("oauth");
const bluebird_1 = __importDefault(require("bluebird"));
const util_1 = require("util");
class DataSource {
    constructor(options) {
        this.validationSchema = options.validationSchema;
        this.logger = options.logger;
        this.timedOutTickers = new Map();
        this.isMock = options.isMock ? options.isMock : false;
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }
    initialize() {
        return Promise.resolve() //noop
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, chalk_1.default.green(`${this.constructor.name}#initialize:SUCCESS`));
        });
    }
    validateData(input) {
        const { error } = this.validationSchema.validate(input);
        if (error) {
            return false;
        }
        else {
            return true;
        }
    }
    timeoutTicker(ticker, timeout /* in seconds */) {
        if (!this.timedOutTickers.has(ticker)) {
            let deferred = U.createDeferredPromise();
            let timer = setTimeout(() => {
                console.log('Successfully resolved a timed out ticker');
                deferred.resolve();
            }, timeout ? (timeout * 1000) : 600000); //Defaults to 10 minutes
            deferred.cancellable = () => timer.unref();
            deferred.reject = () => { }; //Does nothing
            //Set the ticker into the timed out Map
            this.timedOutTickers.set(ticker, deferred);
            //Once the promise resolves, delete itself out of the Map
            deferred.promise.then(() => {
                this.timedOutTickers.delete(ticker);
            });
            return;
        }
        else {
            this.logger.log(base_1.LogLevel.TRACE, chalk_1.default.yellow(`${ticker} is already in the timedout ticker Map.`));
        }
    }
    close() {
        //resolve all promises that were used to time out tickers;
        return Promise.all([...this.timedOutTickers.keys()].map(k => {
            console.log(`${k}.CLOSE():${this.constructor.name}`);
            let promise = this.timedOutTickers.get(k);
            promise === null || promise === void 0 ? void 0 : promise.resolve();
            this.timedOutTickers.delete(k);
            return promise === null || promise === void 0 ? void 0 : promise.promise;
        }))
            .then(() => {
            console.log(`${this.constructor.name}#close:SUCCESS`);
        });
    }
}
exports.DataSource = DataSource;
class YahooGainersDataSource extends DataSource {
    constructor(options) {
        super(options);
        this.scrapeUrl = 'https://finance.yahoo.com/gainers';
    }
    scrapeDatasource() {
        return axios_1.default.get(this.scrapeUrl)
            .then((data) => {
            let html = cheerio.load(data.data);
            const tickers = [];
            //Loops through table headers, if more than Symbol is ever needed
            html('#fin-scr-res-table').find('table').find('tbody').children().map((i, child) => {
                if (child.name === 'tr') {
                    if (child.firstChild.hasOwnProperty('children')) {
                        let ticker = child.firstChild.children[1].firstChild.data || "";
                        let price = child.children[2].children[0].firstChild.data || "";
                        let pAsNumber;
                        let change = child.children[4].children[0].firstChild.data || "";
                        let cAsNumber;
                        let percentChange;
                        //@ts-ignore
                        let stockObj = {};
                        try {
                            let pAsFixed = Number(price);
                            pAsNumber = Number.parseFloat(pAsFixed.toFixed(2));
                            let persuasion = change.includes("+") ? "up" : "down";
                            let cAsFixed = Number(Number.parseFloat(change));
                            cAsNumber = Number(cAsFixed.toFixed(2));
                            percentChange = { percentChange: cAsNumber, persuasion };
                            stockObj.price = pAsNumber;
                            stockObj.percentChange = percentChange;
                            stockObj.ticker = ticker;
                            this.logger.log(base_1.LogLevel.TRACE, `Ticker Scrape: ${ticker} -- Price: ${price} -- Change: ${change}`);
                        }
                        catch (err) {
                            throw new exceptions_1.InvalidDataError(`Error in ${this.constructor.name}._fetchHighIncreasedTickers(): innerError: ${err} -- ${JSON.stringify(err)}`);
                        }
                        //Where we add or timeout the ticker;
                        if (this.validateData(stockObj)) {
                            this.logger.log(base_1.LogLevel.TRACE, `Adding ${ticker} to returnable ticker array`);
                            tickers.push(stockObj);
                        }
                        else {
                            this.logger.log(base_1.LogLevel.TRACE, `Timing out ${ticker} - REASON: Value of 'pAsNumber' is falsy, or equal to 0 - VALUE: ${pAsNumber}`);
                            this.timeoutTicker(ticker);
                        }
                    }
                }
            });
            //Filters out tickers that are already timed out;
            const keys = Array.from(this.timedOutTickers.keys());
            return tickers.filter((tkr) => !keys.includes(tkr.ticker));
        });
    }
}
exports.YahooGainersDataSource = YahooGainersDataSource;
class PolygonGainersLosersDataSource extends DataSource {
    constructor(options) {
        super(options);
        this.constructPolygonUrl = (path, base) => {
            let apiKey = process.env['ALPACAS_API_KEY'] || "";
            let baseUrl = p.join(base, path);
            let url = new url_1.URL(baseUrl);
            url.searchParams.append("apiKey", apiKey);
            return url.toString();
        };
        this.scrapeUrl = 'https://api.polygon.io/v2/snapshot/locale/us/markets/stocks';
        this.apiKey = process.env['ALPACAS_API_KEY'] || "";
    }
    scrapeDatasource() {
        return Promise.all([axios_1.default.get(this.constructPolygonUrl('/gainers', this.scrapeUrl)), axios_1.default.get(this.constructPolygonUrl('/losers', this.scrapeUrl))])
            .then(((data) => {
            const tickers = [];
            try {
                data.forEach(response => {
                    for (let snapshot of response.data['tickers']) {
                        let persuasion = snapshot.todaysChange > 0 ? "up" : "down";
                        let percentChange = Number(snapshot.todaysChangePerc.toFixed(2));
                        let stockObj = {
                            ticker: snapshot.ticker,
                            price: snapshot.day.c,
                            percentChange: { percentChange, persuasion },
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
                        tickers.push(stockObj);
                        this.logger.log(base_1.LogLevel.TRACE, `Ticker Scrape: ${stockObj.ticker} -- Price: ${stockObj.price} -- Change: ${stockObj.percentChange}`);
                    }
                });
            }
            catch (err) {
                throw new exceptions_1.InvalidDataError(`Error in ${this.constructor.name}.scrapeDatasource(): innerError: ${err} -- ${JSON.stringify(err)}`);
            }
            return tickers;
        }));
    }
}
exports.PolygonGainersLosersDataSource = PolygonGainersLosersDataSource;
class PolygonLiveDataSource extends DataSource {
    constructor(options) {
        super(options);
        this._statusHandler = (data) => {
            switch (data.status) {
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
                    this.logger.log(base_1.LogLevel.WARN, `Unknown status type ${data.status}`);
                    break;
            }
        };
        /*
            NOTE: This message handler only supports the 'status' and 'Q' events, nothing else.
        */
        this._polygonMessageHandler = (data) => {
            data = JSON.parse(data);
            data = data[0];
            const event = data.ev;
            switch (event) {
                case "status":
                    this._statusHandler(data);
                    break;
                case "T":
                    // console.log(JSON.stringify(data))
                    this._tradeHandler(data);
                    break;
                default:
                    throw new exceptions_1.UnprocessableEvent(`${this.constructor.name} not currently configured to handle "${event}" event`);
            }
        };
        this._tradeHandler = (data) => {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#data.length = ${this.data.length}`);
            data['ticker'] = data.sym;
            if (!(this.timedOutTickers.has(data.sym))) {
                this.data.push(data);
            }
            return;
        };
        this.emitter = new events_1.EventEmitter();
        //TODO: If needed, later on we can require the caller to append the required *.TICKER prefix to allow this for more robust usage
        //TODO: Note, this seems like it should be changed to use TradeEvent, since it's more accurate as it pertains to what people are actually paying per share, since it's price is that of a historic nature
        this.subscribeTicker = options.subscribeTicker.map(ticker => `T.${ticker}`);
        this.data = [];
        this.initializePromise = U.createDeferredPromise();
        this.closePromise = U.createDeferredPromise();
        this.scrapeUrl = "wss://socket.polygon.io/stocks";
        this.polygonConn = new ws_1.default(this.scrapeUrl);
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
    initialize() {
        if (!this.apiKey) {
            return Promise.reject(new exceptions_1.InvalidDataError(`ALPACAS_API_KEY environment variable required for ${this.constructor.name}`));
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
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    scrapeDatasource() {
        this.logger.log(base_1.LogLevel.TRACE, `this.processables = ${this.data.length}`);
        let output = [...this.data];
        this.data = [];
        return Promise.resolve(output);
    }
    close() {
        if (this.polygonConn.CLOSED || this.polygonConn.CLOSING || this.polygonConn.CONNECTING) {
            try {
                this.polygonConn.close();
                return Promise.resolve();
            }
            catch (e) {
                //We know sometimes the WebSocket connection won't be connected, and will throw an error
                return Promise.resolve();
            }
        }
        else {
            this.polygonConn.send(JSON.stringify({
                "action": "unsubscribe",
                "params": this.subscribeTicker.join(',')
            }));
            return this.closePromise.promise
                .then(() => {
                this.polygonConn.close();
            })
                .then(() => super.close());
        }
    }
}
exports.PolygonLiveDataSource = PolygonLiveDataSource;
var TwitterAccountType;
(function (TwitterAccountType) {
    TwitterAccountType["SWING_POSITION"] = "SWING_POSITION";
    TwitterAccountType["LONG_POSITION"] = "LONG_POSITION";
    TwitterAccountType["FAST_POSITION"] = "FAST_POSITION";
    TwitterAccountType["OPTIONS_POSITION"] = "OPTIONS_POSITION";
    TwitterAccountType["WATCHLIST"] = "WATCHLIST";
    TwitterAccountType["UNKNOWN"] = "UNKNOWN_POSITION";
})(TwitterAccountType = exports.TwitterAccountType || (exports.TwitterAccountType = {}));
const TwitterDataSourceOptionsSchema = joi.object({
    twitterAccounts: joi.array().required(),
    tickerList: joi.array().required(),
    twitterKey: joi.string().required(),
    twitterSecret: joi.string().required(),
    twitterAccessToken: joi.string().required(),
    twitterAccessSecret: joi.string().required(),
    isMock: joi.boolean()
}).required();
class TwitterDataSource extends DataSource {
    constructor(options) {
        super(options);
        this.startProcessing = () => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#startProcessing():INVOKED`);
            return bluebird_1.default.delay(this._scrapeProcessDelay)
                .then(() => this.publishLatestTweets())
                .catch(err => {
                this.logger.log(base_1.LogLevel.ERROR, `Error occurred when scraping Twitter: ${util_1.inspect(err)}`);
            })
                .finally(() => {
                this._scrapeProcess = this.startProcessing();
            });
        };
        this._getLatestTweetsFromEachAccount = (input) => {
            let latestTweets = [];
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
                    }
                    else {
                        // this is the first time the account was scraped before the others, so we initialize the first id just like we do in the outter else block
                        this.prevIds.push(account.tweets[0].id);
                        latestTweets.push({ accountId: account.accountId, tweets: [account.tweets[0]] });
                    }
                });
            }
            else {
                input.forEach(account => {
                    this.prevIds.push(account.tweets[0].id);
                    latestTweets.push({ accountId: account.accountId, tweets: [account.tweets[0]] });
                });
            }
            return Promise.resolve(latestTweets);
        };
        this._scrapeAllTimelines = () => {
            return Promise.all(this.twitterAccounts.map(acc => {
                return this._fetchLatestTimeline(acc.id);
            })).then(data => data.filter(val => !!val));
        };
        this._fetchLatestTimeline = (userId) => {
            let request = new oauth_1.OAuth('https://api.twitter.com/oauth/request_token', 'https://api.twitter.com/oauth/access_token', this.twitterKey, this.twitterSecret, '1.0A', null, 'HMAC-SHA1');
            return new Promise((resolve, reject) => {
                request.get(`https://api.twitter.com/2/users/${userId}/tweets?expansions=attachments.media_keys&media.fields=url&tweet.fields=in_reply_to_user_id`, this.twitterAccessToken, this.twitterAccessSecret, function (e, data, res) {
                    if (e) {
                        reject(e.data);
                    }
                    let formatted = JSON.parse(data === null || data === void 0 ? void 0 : data.toString());
                    // Only a Partial for typing purposes
                    let newObj = {};
                    //@ts-ignore
                    delete formatted.data['attachments'];
                    newObj['tweets'] = [];
                    newObj['accountId'] = userId;
                    formatted.data.forEach((tweet, i) => {
                        var _a;
                        // Skip tweets that are in reply to someone except to the users own self
                        if (tweet.in_reply_to_user_id && tweet.in_reply_to_user_id !== userId) {
                            return;
                        }
                        let tweetUrls = [];
                        if (tweet.hasOwnProperty('attachments')) {
                            let mediaKeys = tweet.attachments.media_keys;
                            let matchedMediaKeysToAttachments = formatted.includes.media.filter(attachment => mediaKeys.includes(attachment.media_key)).map(attachment => attachment.url);
                            tweetUrls.push(...matchedMediaKeysToAttachments);
                        }
                        (_a = newObj.tweets) === null || _a === void 0 ? void 0 : _a.push({
                            id: tweet.id,
                            text: tweet.text,
                            urls: tweetUrls
                        });
                    });
                    resolve(newObj);
                });
            });
        };
        this.publishLatestTweets = () => {
            return this._scrapeAllTimelines()
                .then(data => this._getLatestTweetsFromEachAccount(data))
                .then(data => {
                data.forEach(account => {
                    let configuredAccount = this.twitterAccounts.find(acc => acc.id === account.accountId);
                    account.tweets.forEach(tweet => {
                        this.logger.log(base_1.LogLevel.INFO, `Adding Tweet from ${configuredAccount.name} to work: ${tweet.text}`);
                        this.work.push({
                            account_name: configuredAccount.name,
                            type: configuredAccount.type,
                            message: tweet.text,
                            urls: tweet.urls
                        });
                    });
                });
            });
        };
        let valid = TwitterDataSourceOptionsSchema.validate(options);
        if (!valid) {
            throw new exceptions_1.InvalidConfigurationError('InvalidConfiguration for TwitterDataSource');
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
    initialize() {
        if (!this.isMock) {
            this.startProcessing();
        }
        return Promise.resolve();
    }
    getAllTickersFromTweet(tweet) {
        const { text } = tweet;
        return text.split(" ")
            .filter(word => word.startsWith("$"))
            .map(word => word.replace("\n", "").replace(/[^\w\s]/gi, ''));
    }
    scrapeDatasource() {
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#scrapeDataSource():INVOKED -- Returning: ${JSON.stringify(this.work)}`);
        return Promise.resolve(this.work)
            .finally(() => {
            this.work = [];
        });
    }
    close() {
        return Promise.resolve();
    }
}
exports.TwitterDataSource = TwitterDataSource;
class TwelveDataDataSource {
    constructor(options) {
        this.host = 'twelve-data1.p.rapidapi.com';
        this.secret = options.secret || (process.env['TWELVE_DATA_API_KEY'] || "");
        this.logger = options.logger;
    }
    initialize() {
        return Promise.resolve();
    }
    //TODO: Perhaps this is a worthy method to be added to the IDataSource interface
    getTickerByPrice(ticker) {
        const headers = {
            "x-rapidapi-key": this.secret,
            "x-rapidapi-host": "twelve-data1.p.rapidapi.com",
        };
        return axios_1.default.get(`https://${this.host}/price`, {
            headers,
            params: {
                symbol: ticker,
                format: 'json',
                outputsize: '1'
            }
        }).then(data => data.data.price);
    }
    close() {
        return Promise.resolve();
    }
}
exports.TwelveDataDataSource = TwelveDataDataSource;
class PhonyDataSource extends DataSource {
    constructor(options) {
        super(options);
        this.returnData = options.returnData;
    }
    scrapeDatasource() {
        return Promise.resolve([this.returnData]);
    }
}
exports.PhonyDataSource = PhonyDataSource;
