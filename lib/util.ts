import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import * as fs from 'fs';
import Axios, { AxiosRequestConfig } from 'axios';
import { TradeEvent } from './workers';
import * as path from 'path';
import { StringResolvable } from 'discord.js';
import * as E from './exceptions';

export interface IDeferredPromise {
    resolve: Function;
    reject: Function;
    promise: Promise<any>;
    cancellable: Function;
}

export const createDeferredPromise = (): IDeferredPromise => {
    //@ts-ignore
    let deferredPromise!: IDeferredPromise = {};
    
    let p = new Promise<void>((resolve, reject) => {
        deferredPromise.cancellable = () => {};
        deferredPromise.reject = () => {
            deferredPromise.cancellable();
            reject();
        };
        deferredPromise.resolve = () => {
            console.log(`Called resolve() on deferred Promise`)
            deferredPromise.cancellable();
            resolve();
        };
    });

    deferredPromise.promise = p;

    return deferredPromise;
}

/**
 * Used to know when the tests are being ran by Github Actions: https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables
*/

export const inCI = (): boolean => !!process.env['GITHUB_ACTIONS'];

export const runCmd = (cmd: string): Promise<{ stderr: string, stdout: StringResolvable }> => {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, (err, stdout: string, stderr: string) => {
            if (err || stderr) {
                reject({ err, stderr });
            } else {
                resolve({ stderr, stdout });
            }
        })
    });
}

export const createLogger = (options: Partial<winston.LoggerOptions>): Logger => {
    let transports: winston.transports.ConsoleTransportInstance[] = [new winston.transports.Console()];

    if (options.transports) {
        if (Array.isArray(options.transports)) {
            //@ts-ignore
            transports.push(...options.transports);
        } else {
            //@ts-ignore
            transports.push(options.transports)
        }
    }

    return winston.createLogger({
        transports,
        ...options
    })
}

export const fetchTickersFromFile = (thePath: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        fs.readFile(thePath, (err, data) => {
            if (err) {
                reject(err);
            } else {
                let tickers = data.toString().split('\n').filter(ticker => !!ticker);
                resolve(tickers);
            }
        })
    })
}

/**
 * Function to generate a link to a graph in TradingView
 * @param ticker ticker to create the link for
 * @returns Link to a graph for the given ticker
 */

export const fetchTickerGraph = (ticker: string): Promise<string> => {
    return Axios.get(`https://symbol-search.tradingview.com/symbol_search/?text=${ticker}&exchange=&type=&hl=true&lang=en&domain=production`)
    .then(data => {
        const output = data.data[0];
        console.log(JSON.stringify(output))
        if (output.hasOwnProperty('prefix')) {
            return `https://www.tradingview.com/symbols/${output.prefix}-${ticker}/`;
        } else {
            return `https://www.tradingview.com/symbols/${output.exchange}-${ticker}/`;
        }
    })
    .catch(err => Promise.reject(new E.DefaultError(JSON.stringify(err))));
}

//TODO: Finish writing actual script

/**
 * Calls a python script to generate a graph, given a JSON file of TradeEvents
 * @param absolutePathToJsonFile 
 * @returns path to the generated graph
 */

export const generatePlotGraphFromTradeEvents = (absolutePathToJsonFile: string): Promise<string> => {
    const pathToScript = path.join(__dirname, 'resources', 'scripts', 'generate-plot.py');
    return runCmd(`python3 ${pathToScript} ${absolutePathToJsonFile}`)
    .then(({ stdout, stderr }) => {
        if (stderr) {
            return Promise.reject(stderr);
        } else {
            return Promise.resolve(stdout);
        }
    });
}

/**
 * Given the inputs, returns all trade events for that day 
 * @param ticker The ticker to get the trade events for
 * @param date The date which the events will be fetched for
 * @param timestamp Used for recursion, the timestamp of the last received event
 * @param events the array of events that is kept through recursion
 */

export const fetchHistoricTradeEvents = (ticker: string, date: Date, timestamp?: number, events?: TradeEvent[]): Promise<TradeEvent[]> => {
    let month = (date.getMonth() + 1).toString().length < 2 ? (`0${date.getMonth() + 1}`) : date.getMonth() + 1;
    let d = (date.getDate()).toString().length < 2 ? (`0${date.getDate()}`) : date.getDate();
    let day = `${date.getFullYear()}-${month}-${d}`
    let starterEventArr: TradeEvent[] = events || [];

    let params: AxiosRequestConfig = {
        params: {
            limit: 50000,
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    }

    if (timestamp) {
        params.params = {
            ...params.params,
            timestamp
        };
    }

    console.log(`Fetching https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${day}/`)

    return Axios.get(`https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${day}/`, params).then(data => {
        return data.data.results as TradeEvent[];
    })
    .then(data => {
        console.log(data[0])
        console.log(`Got data, ${data.length} - typeof data = ${Array.isArray(data)}`)
        starterEventArr.push(...data);
        console.log(`Events.length = ${starterEventArr.length}`);
        if (data.length == 50000) {
            return fetchHistoricTradeEvents(ticker, date, starterEventArr[starterEventArr.length - 1].t, starterEventArr);
        } else {
            return Promise.resolve(starterEventArr!);
        }
    })
    .catch(err => Promise.reject(new E.DefaultError(JSON.stringify(err))));
}