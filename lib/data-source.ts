import { ITickerChange, IStockChange } from './stock-bot';
import * as joi from 'joi';
import * as U from './util';
import axios, { AxiosResponse } from 'axios';
import * as cheerio from 'cheerio';
import { Logger, LogLevel, ICloseable, IInitializable } from './base';
import color from 'chalk';
import BPromise from 'bluebird';
import * as Alpacas from '@master-chief/alpaca';
import * as ws from 'websocket';
import WebSocket from 'ws';
import { EventEmitter } from 'events';

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

export interface TickerStreamDataSourceOptions {
    tickers: string[];
}

export class TickerStreamDataSource extends Alpacas.AlpacaStream implements IInitializable, ICloseable {
    private readonly tickers: string[];
    
    constructor(options: TickerStreamDataSourceOptions) {
        super({
            credentials: {
                key: (process.env['ALPACAS_API_KEY'] || ""),
                secret: (process.env['ALPACAS_SECRET_KEY'] || "")
            },
            stream: "market_data"
        });

        this.tickers = options.tickers;
    }

    initialize(): Promise<void> {
        return new Promise((resolve) => {
            this.on('authenticated', () => {
                this.subscribe(this.tickers);
                resolve();
            })
        });
    }

    listen() {
        this.on('quote', (quote) => {
            console.log(JSON.stringify(quote));
        })
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.unsubscribe(this.tickers);
            this.on('close', () => resolve());
        });
    }
}

//TODO: Need to create a client for this url: https://www.barchart.com/stocks/performance/price-change/advances?orderBy=percentChange&orderDir=desc&page=all

// const p = new TickerStreamDataSource({
//     tickers: ['Q.TSLA', 'Q.RCL']
// });

// p.initialize()
// .then(() => {
//     p.listen()
// })


let socket = new WebSocket("wss://socket.polygon.io/stocks");

let emitter = new EventEmitter();

const tickers = ['Q.TSLA', 'Q.NIO', 'Q.RCL', 'Q.CRSR', 'Q.RWT', 'Q.MITT', 'Q.OPK', 'Q.BNS', 'Q.RY', 'Q.GPOR', 'Q.DGX', 'Q.AAL',
'Q.AACQ', 'Q.AAME', 'Q.AAOI', 'Q.AAPL', 'Q.AAWW', 'Q.AAXJ', 'Q.AAXN', 'Q.ABCB', 'Q.ABCM', 'Q.ABEO', 'Q.ABIO', 'Q.ABMD', 'Q.ABST',
'Q.ABTX', 'Q.ABUS', 'Q.EUFN', 'Q.EVBG', 'Q.EVER', 'Q.EVGBC', 'Q.EVK', 'Q.EVOL', 'Q.EVOP', 'Q.EXAS', 'Q.EXC', 'Q.EXPD', 'Q.EXPE',
'Q.FRGI', 'Q.FSFG', 'Q.FSLR', 'Q.FSV', 'Q.FSTX', 'Q.FROG', 'Q.FREEW', 'Q.FRLN', 'Q.GLUU', 'Q.GMAB', 'Q.GLDD', 'Q.GRBK', 'Q.GROW',
'Q.GRVY', 'Q.LIND', 'Q.LI', 'Q.LIVK', 'Q.LIXTW', 'Q.LMB', 'Q.LMAT', 'Q.LNT', 'Q.LOOP', 'Q.LOGC', 'Q.LOCO', 'Q.LMNL', 'Q.MERC',
'Q.MESA', 'Q.MESO', 'Q.MFH', 'Q.MFIN'
]

socket.on('message', (data: any) => {
    data = JSON.parse(data)
    data = JSON.parse(JSON.stringify(data[0]))
    console.log(`MESSAGE: ${JSON.stringify(data)}`);
    console.log(`Event: ${data.ev}`);
    console.log(`Status: ${data.status}`)
    switch(data.ev) {
        case "status":
            //AUTHENTICATE
            switch(data.status) {
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
    }))
})

emitter.on('authenticated', () => {
    console.log(`Emitter received authenticated`)
    let t = ''
    tickers.forEach(ticker => t.concat(`${ticker},`));
    t = t.substring(0, t.length - 1)
    socket.send(JSON.stringify({
        "action": "subscribe",
        "params": `${tickers}`
    }));
});