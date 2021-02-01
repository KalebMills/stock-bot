import axios, { AxiosResponse } from 'axios';
import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import { RequestError } from './exceptions';
import { MarketHoliday, PolygonMarketHolidays } from '../types/polygonMarketHolidays';
import Axios from 'axios';
import { PolygonAggregates, Snapshot } from '../types';
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

/**
 * Calculates the relative volume.
 * This is the volume for the current day uptil the current minute / the volume from open until that respective minute for the last trading day.
 * For example the relative volume of a ticker at 10:30AM on a Tuesday would be the ratio of the days volume so far and the total volume from open till 10:30AM on Monday (the last trading day)
*/
export async function getRelativeVolume(ticker: string): Promise<number> {
    const lastDay: Date = new Date()
    const yesterday: Date = new Date()

    yesterday.setDate(yesterday.getDate() - 1)
    lastDay.setDate(await returnLastOpenDay(yesterday))

    const lastDate: string = convertDate(lastDay)

    const minutesPassed: number = minutesSinceOpen()

    return Promise.all([
        axios.get(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${lastDate}/${lastDate}`, {
            params: {
                apiKey: process.env['ALPACAS_API_KEY'] || "",
                sort: 'asc',
                limit: minutesPassed
            }
        }), getTickerSnapshot(ticker)
    ])
    .then((data) => { 
        const lastDay: PolygonAggregates = data[0].data
        const today: Snapshot = data[1]
        return (lastDay.results.reduce((a:any,b:any) => a + parseInt(b['v']), 0) as number) / (today.day.v)
    }).catch(err => {
        return Promise.reject(new RequestError(`Error in getRelativeVolume(): innerError: ${err} -- ${JSON.stringify(err)}`));
    })
}