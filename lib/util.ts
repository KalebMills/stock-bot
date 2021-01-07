import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import * as fs from 'fs';
import Axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { TradeEvent } from './workers';
import * as path from 'path';
import { StringResolvable } from 'discord.js';
import { RequestError, DefaultError } from './exceptions';
import { MarketHoliday } from '../types/polygonMarketHolidays';
import { Snapshot } from '../types';
import moment from 'moment';

export interface IDeferredPromise {
    resolve: Function;
    reject: Function;
    promise: Promise<any>;
    cancellable: Function;
}

export type MarketStatus = "OPEN" | "CLOSED"

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
    .catch(err => Promise.reject(new DefaultError(JSON.stringify(err))));
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
        starterEventArr.push(...data);
        if (data.length == 50000) {
            return fetchHistoricTradeEvents(ticker, date, starterEventArr[starterEventArr.length - 1].t, starterEventArr);
        } else {
            return Promise.resolve(starterEventArr!);
        }
    })
    .catch(err => Promise.reject(new DefaultError(JSON.stringify(err))));
}

export const returnLastOpenDay = (date: Date): Promise<number> => {
    return getMarketStatusOnDate(date)
    .then(marketStatus => {
        if (marketStatus === 'CLOSED') {
            date.setDate(date.getDate() - 1);
            return returnLastOpenDay(date);
        } else {
            return date.getDate();
        }
    });
}

export const getMarketStatusOnDate = async (date: Date): Promise<MarketStatus> => {

    const isWeekend: boolean = !!(date.getDay() % 6 === 0);
    const holidays: MarketHoliday[] = await getMarketHolidays();
    const isHoliday: boolean = holidays.some((holiday: any) => {
        let holidayDate = new Date(Date.parse(holiday.date));

        return holidayDate.getDate() == date.getDate() &&
        holidayDate.getMonth() == date.getMonth();
    });
    return (isHoliday || isWeekend) ? 'CLOSED' : 'OPEN';
}

export const getMarketHolidays = (): Promise<MarketHoliday[]> => {
    return Axios.get('https://api.polygon.io/v1/marketstatus/upcoming', {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || "",
        }
    })
    .then((data: AxiosResponse<MarketHoliday[]>) => data.data)
    .catch(err => {
        return Promise.reject(new RequestError(`Error in _getMarketHolidays(): innerError: ${err} -- ${JSON.stringify(err)}`));
    })
}

export const convertDate = (date: Date): string => {
    var yyyy: string = date.getFullYear().toString();
    var mm: string = (date.getMonth()+1).toString();
    var dd: string  = date.getDate().toString();
  
    var mmChars: string[] = mm.split('');
    var ddChars: string[] = dd.split('');
  
    return yyyy + '-' + (mmChars[1] ? mm : `0${mmChars[0]}`) + '-' + (ddChars[1] ? dd : `0${ddChars[0]}`);
  }

export const minutesSinceOpen = (): number => {
    const now: Date = new Date()
    const marketOpen: moment.Moment = moment();
    
    marketOpen.set({ hour: 14, minutes: 30 });
    const minutesPassed: number = Math.round((now.getTime() - marketOpen.toDate().getTime()) / 60000)
    return minutesPassed;
}

export const getTickerSnapshot = (ticker: string): Promise<Snapshot> => {
    return Axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    })
    .then((data: AxiosResponse<{status: string, ticker: Snapshot}>) => {
        // console.log(`getTickerSnapshot():OUTPUT -- ${JSON.stringify(data.data.ticker)}`);
        return data.data.ticker;
    })
    .catch((err: Error) => Promise.reject(new RequestError(err.message)));
}


export interface ConfidenceScoreOptions {
    [indicatorName: string]: {
        value: number
        process: Promise<boolean>
    };
}

/*
    TODO: getConfidenceScore should also return what the indicator signals were, so we can also show such information
    in notifications, and logging when we enable auto buys


    {
        "relativeVolume": true,
        "vwap": false
    }
*/

/**
 * A function that takes in a group of indicators, and based on their value, provides a confidence score based on their signal output
 * @param options An object describing the value of each indicator, and the Promise that will return it's signal
 * @returns A number, which will be between 0-100, which indicates the confidence of the indicators
 */

export const getConfidenceScore = (options: ConfidenceScoreOptions): Promise<number> => {
    console.log(`getConfidenceScore():INVOKED`);
    let summedValues: number = 0;
    let summedFalseSignalValues: number = 0;
    let processes: Promise<[boolean, number]>[] = [];

    Object.keys(options).forEach((key: string) => {
        let indicator = options[key];
        summedValues = summedValues + indicator.value;
        //Allows us to map the given value of an indicator, to it's process once it has resolved.
        processes.push(indicator.process.then((val: boolean) => [val, indicator.value]));

    });

    return Promise.all(processes)
    .then((values: [boolean, number][]) => {
        values.forEach(([signal, value]: [boolean, number]) => {
            //If the signal is false, add it's value to the values that are false signals
            if (!signal) {
                summedFalseSignalValues = summedFalseSignalValues + value;
            }
        });
    })
    .then(() => {
        //Rounded to 2 decimals
        let calculation = 100 - ((summedFalseSignalValues / summedValues) * 100);
        return Number(calculation.toFixed(2));
    });
}