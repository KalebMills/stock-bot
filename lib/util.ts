import axios, { AxiosResponse } from 'axios';
import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import { RequestError } from './exceptions';
import { MarketHoliday, PolygonMarketHolidays } from '../types/polygonMarketHolidays';
import Axios from 'axios';
import { Snapshot } from '../types';
import moment from 'moment';

export interface IDeferredPromise {
    resolve: Function;
    reject: Function;
    promise: Promise<any>;
    cancellable: Function;
}

export type actionSignals= "BUY"|"SELL"|"N/A"
export interface tweetSignals {
    tickers: string[],
    action: actionSignals,
    sizing?: number[]
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
    return axios.get('https://api.polygon.io/v1/marketstatus/upcoming', {
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

//TODO: We are making duplicate calls (call to getTickerSnapshot in this class), need to consolidate
export const isHighVolume = (ticker: string): Promise<boolean> => {
    //TODO: make this configurable via config file/process.env
    const threshold = 1000000
    return getTickerSnapshot(ticker).then((data: Snapshot)=> {
        return data.day.v > threshold || data.prevDay.v > threshold
    })
}

export const getCurrentMarketStatus = (): Promise<string> => {
    return Axios.get(`https://api.polygon.io/v1/marketStatus/now`, {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    })
    .then((data: AxiosResponse<any>) => {
        return data.data.market;
    })
    .catch((err: Error) => Promise.reject(new RequestError(err.message)));
}

export class Timer {
    private startTime: [number, number];

    constructor () {
        this.startTime = [0, 0];
    }


    start(): void {
        this.startTime = process.hrtime();
    }

    stop(): number {
        let endTime = process.hrtime(this.startTime);
        let totalNanoSeconds = endTime[0] * 1e9;
        totalNanoSeconds = totalNanoSeconds + endTime[1];

        return totalNanoSeconds;
    }
}

export const extractTweetSignals = (tweet: string): tweetSignals => {
    tweet = tweet.toUpperCase()
    const splitTweet = tweet.replace('\n', '').split(" ");

    //options trading not supported via alpacas
    const blacklist = ["CALL", "PUT", "CALLS", "PUTS"]
    const pos_actions = ["BOT", "BOUGHT", "BUY"]
    const neg_actions = ["SOLD", "SELL", "STOPPED", "SL"]

    const emptySignals: tweetSignals = {
        tickers: [''],
        action: "N/A"
    }

    let tickers = []
    for(let word of splitTweet) {
        if(blacklist.includes(word))
        {
            return emptySignals
        }
        //filtering out dollar amounts and SPAC warrants
        if(word.startsWith("$") && isNaN(+word.substring(1)) && word.substring(-3) !== ".WS") {
            //multiple tickers are sometimes bought or sold and alerted in the same tweet
            tickers.push(word.substring(1))
        }
    }

    //If both a buy and sell signal is part of the tweet, the first action in the tweet is the correct signal. 
    let action: actionSignals
    let buy
    for(let action of pos_actions) {
        if(splitTweet.includes(action)) {
            buy = splitTweet.indexOf(action)
            break
        }
    }
    let sell
    for(let action of neg_actions) {
        if(splitTweet.includes(action)) {
            sell = splitTweet.indexOf(action)
            break
        }
    }
    if(buy != undefined || sell != undefined) {
        action = buy == undefined ? "SELL" : "BUY"
    }
    //no buy or sell signal detected
    else {
        return emptySignals
    }

    const extractedSignals: tweetSignals = {
        tickers: tickers,
        action: action
    }

    return extractedSignals
}