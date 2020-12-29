import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import * as fs from 'fs';
import Axios from 'axios';

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

export const runCmd = (cmd: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, (err, stdout, stderr) => {
            if (err || stderr) {
                reject({ err, stderr });
            } else {
                resolve();
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
    });
}