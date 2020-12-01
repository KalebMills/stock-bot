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
exports.TickerStreamDataSource = exports.YahooGainersDataSource = exports.DataSource = void 0;
const U = __importStar(require("./util"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const base_1 = require("./base");
const chalk_1 = __importDefault(require("chalk"));
const bluebird_1 = __importDefault(require("bluebird"));
const Alpacas = __importStar(require("@master-chief/alpaca"));
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
class DataSource {
    constructor(options) {
        this.scrapeUrl = options.scrapeUrl;
        this.validationSchema = options.validationSchema;
        this.logger = options.logger;
        this.timedOutTickers = new Map();
    }
    initialize() {
        return Promise.resolve() //noop
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, chalk_1.default.green(`${this.constructor.name}#initialize:SUCCESS`));
        });
    }
    validateData(input) {
        const { error, errors } = this.validationSchema.validate(input);
        if (error || errors) {
            return false;
        }
        else {
            return true;
        }
    }
    timeoutTicker(ticker, timeout /* in seconds */) {
        if (!this.timedOutTickers.has(ticker)) {
            let t;
            let timeoutFunction = new Promise((resolve, reject) => {
                t = setTimeout(() => {
                    console.log('Successfully resolved a timed out ticker');
                    resolve();
                }, timeout ? (timeout * 1000) : 600000); //Defaults to 10 minutes
            });
            let deferred = U.createDeferredPromise(timeoutFunction);
            deferred.cancellable = () => {
                t.unref();
            };
            //Set the ticker into the timed out Map
            this.timedOutTickers.set(ticker, deferred);
            //Once the promise resolves, delete itself out of the Map
            deferred.promise.then(() => this.timedOutTickers.delete(ticker)); //Maybe should catch here too?
            return;
        }
        else {
            this.logger.log(base_1.LogLevel.WARN, chalk_1.default.yellow(`${ticker} is already in the timedout ticker Map.`));
        }
    }
    close() {
        //resolve all promises that were used to time out tickers;
        return bluebird_1.default.each([...this.timedOutTickers.keys()], key => {
            let p = this.timedOutTickers.get(key);
            p.resolve();
            this.timedOutTickers.delete(key);
        })
            .then(() => {
            console.log(`${this.constructor.name}#close:SUCCESS`);
        });
    }
}
exports.DataSource = DataSource;
class YahooGainersDataSource extends DataSource {
    constructor(options) {
        super(options);
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
                            this.logger.log(base_1.LogLevel.TRACE, `Ticker Scape: ${ticker} -- Price: ${price} -- Change: ${change}`);
                        }
                        catch (err) {
                            throw new Error(`Error in ${this.constructor.name}._fetchHighIncreasedTickers(): innerError: ${err} -- ${JSON.stringify(err)}`);
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
class TickerStreamDataSource extends Alpacas.AlpacaStream {
    constructor(options) {
        super({
            credentials: {
                key: (process.env['ALPACAS_API_KEY'] || ""),
                secret: (process.env['ALPACAS_SECRET_KEY'] || "")
            },
            stream: "market_data"
        });
        this.tickers = options.tickers;
    }
    initialize() {
        return new Promise((resolve) => {
            this.on('authenticated', () => {
                this.subscribe(this.tickers);
                resolve();
            });
        });
    }
    listen() {
        this.on('quote', (quote) => {
            console.log(JSON.stringify(quote));
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            this.unsubscribe(this.tickers);
            this.on('close', () => resolve());
        });
    }
}
exports.TickerStreamDataSource = TickerStreamDataSource;
//TODO: Need to create a client for this url: https://www.barchart.com/stocks/performance/price-change/advances?orderBy=percentChange&orderDir=desc&page=all
// const p = new TickerStreamDataSource({
//     tickers: ['Q.TSLA', 'Q.RCL']
// });
// p.initialize()
// .then(() => {
//     p.listen()
// })
let socket = new ws_1.default("wss://socket.polygon.io/stocks");
let emitter = new events_1.EventEmitter();
const tickers = ['Q.TSLA', 'Q.NIO', 'Q.RCL', 'Q.CRSR', 'Q.RWT', 'Q.MITT', 'Q.OPK', 'Q.BNS', 'Q.RY', 'Q.GPOR', 'Q.DGX', 'Q.AAL',
    'Q.AACQ', 'Q.AAME', 'Q.AAOI', 'Q.AAPL', 'Q.AAWW', 'Q.AAXJ', 'Q.AAXN', 'Q.ABCB', 'Q.ABCM', 'Q.ABEO', 'Q.ABIO', 'Q.ABMD', 'Q.ABST',
    'Q.ABTX', 'Q.ABUS', 'Q.EUFN', 'Q.EVBG', 'Q.EVER', 'Q.EVGBC', 'Q.EVK', 'Q.EVOL', 'Q.EVOP', 'Q.EXAS', 'Q.EXC', 'Q.EXPD', 'Q.EXPE',
    'Q.FRGI', 'Q.FSFG', 'Q.FSLR', 'Q.FSV', 'Q.FSTX', 'Q.FROG', 'Q.FREEW', 'Q.FRLN', 'Q.GLUU', 'Q.GMAB', 'Q.GLDD', 'Q.GRBK', 'Q.GROW',
    'Q.GRVY', 'Q.LIND', 'Q.LI', 'Q.LIVK', 'Q.LIXTW', 'Q.LMB', 'Q.LMAT', 'Q.LNT', 'Q.LOOP', 'Q.LOGC', 'Q.LOCO', 'Q.LMNL', 'Q.MERC',
    'Q.MESA', 'Q.MESO', 'Q.MFH', 'Q.MFIN'
];
socket.on('message', (data) => {
    data = JSON.parse(data);
    data = JSON.parse(JSON.stringify(data[0]));
    console.log(`MESSAGE: ${JSON.stringify(data)}`);
    console.log(`Event: ${data.ev}`);
    console.log(`Status: ${data.status}`);
    switch (data.ev) {
        case "status":
            //AUTHENTICATE
            switch (data.status) {
                case 'connected':
                    console.log('Connected');
                    emitter.emit('connected', emitter);
                    break;
                case 'auth_success':
                    emitter.emit('authenticated', emitter);
                    break;
                default:
                    console.log('Unknown status type');
                    break;
            }
            break;
        case "Q":
            console.log(JSON.stringify(data));
            break;
        default:
            console.log('Reached default case');
            break;
    }
});
emitter.on('connected', () => {
    socket.send(JSON.stringify({
        "action": "auth",
        "params": process.env['ALPACAS_API_KEY']
    }));
});
emitter.on('authenticated', () => {
    console.log(`Emitter received authenticated`);
    let t = '';
    tickers.forEach(ticker => t.concat(`${ticker},`));
    t = t.substring(0, t.length - 1);
    socket.send(JSON.stringify({
        "action": "subscribe",
        "params": `${tickers}`
    }));
});
