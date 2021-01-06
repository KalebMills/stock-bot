import axios, { AxiosResponse } from 'axios';
import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import { RequestError } from './exceptions';
import { PolygonMarketHolidays } from '../types/polygonMarketHolidays';
import Axios from 'axios';
import { PolygonTickerSnapshot, Snapshot } from '../types';

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

export const returnLastOpenDay = async (date: Date): Promise<number> => {
    if(await getMarketStatusOnDate(date) === 'CLOSED') {
        date.setDate(date.getDate() - 1)
        await returnLastOpenDay(date)
    }
    return date.getDate()
    
}

export const getMarketStatusOnDate = async (date: Date): Promise<MarketStatus> => {
    const isWeekend: boolean = date.getDay() % 6 == 0 ? true: false
    let holidays: PolygonMarketHolidays[] = await getMarketHolidays().then((data: AxiosResponse) => data.data)
    const isHoliday: boolean = holidays.some((holiday: any) => {
        let holidayDate = new Date(Date.parse(holiday.date))
        return holidayDate.getDate() == date.getDate() &&
        holidayDate.getMonth() == date.getMonth()
    })
    return (isHoliday || isWeekend) ? 'CLOSED' : 'OPEN'
}

export const getMarketHolidays = (): Promise<AxiosResponse> => {
    return axios.get('https://api.polygon.io/v1/marketstatus/upcoming', {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || "",
        }
    })
    .then((data: AxiosResponse)=> data)
    .catch(err => {
        throw new RequestError(`Error in _getMarketHolidays(): innerError: ${err} -- ${JSON.stringify(err)}`)
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
    const marketOpen: Date = new Date()
    //TODO - definitely needs to be changed, set this to market open at UTC, will need to account for daylight savings
    // Can probobly use moment for this
    marketOpen.setHours(14)
    marketOpen.setMinutes(30)
    const minutesPassed: number = Math.round((now.getTime() - marketOpen.getTime())/60000)
    return minutesPassed
}

export const getTickerSnapshot = (ticker: string): Promise<Snapshot> => {
    return Axios.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    })
    .then((data: AxiosResponse<Snapshot>) => data.data)
    .catch(err => Promise.reject(new RequestError(JSON.stringify(err))));
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