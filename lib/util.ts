import axios, { AxiosResponse } from 'axios';
import * as cp from 'child_process';
import * as winston from 'winston';
import { Logger } from './base';
import { InvalidDataError } from './exceptions';

export interface IDeferredPromise {
    resolve: Function;
    reject: Function;
    promise: Promise<any>;
    cancellable: Function;
}

export const createDeferredPromise = (): IDeferredPromise => {
    //@ts-ignore
    let deferredPromise!: IDeferredPromise = {};
    
    let p = new Promise((resolve, reject) => {
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

//TODO - this is messy, need to refactor into something more elegant
export const _returnLastOpenDay = (): number => {
    let date = new Date()
    date.setDate(date.getDate() - 1)
    while(true) {
        if(_getMarketStatusOnDate(date) === 'OPEN') {
            return date.getDate()
        }
        date.setDate(date.getDate() - 1)
    }
    
}

export const _getMarketStatusOnDate = (date: Date): string => {
    const isWeekend = date.getDay() % 6
    const holidays = _getMarketHolidays()
    const isHoliday = holidays.filter((holiday: any) => {
        let holidayDate = new Date(Date.parse(holiday.date))
        return holidayDate.getDate() == date.getDate() &&
        holidayDate.getMonth() == date.getMonth()
    })
    return (isHoliday || isWeekend) ? 'OPEN' : 'CLOSED'
}

//TODO - typing
export const _getMarketHolidays = (): any => {
    let holidays: any[] = []
    axios.get('https://api.polygon.io/v1/marketstatus/upcoming', {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || "",
        }
    }).then((data: AxiosResponse) => { holidays = data.data})
    .catch(err => {
        throw new InvalidDataError(`Error in _getMarketHolidays(): innerError: ${err} -- ${JSON.stringify(err)}`)
    })
    return holidays
}

export const _convertDate = (date: Date): string => {
    var yyyy = date.getFullYear().toString();
    var mm = (date.getMonth()+1).toString();
    var dd  = date.getDate().toString();
  
    var mmChars = mm.split('');
    var ddChars = dd.split('');
  
    return yyyy + '-' + (mmChars[1]?mm:"0"+mmChars[0]) + '-' + (ddChars[1]?dd:"0"+ddChars[0]);
  }

export const _minutesSinceOpen = (): number => {
    const now = new Date()
    const marketOpen = new Date()
    //TODO - definitely needs to be changed, set this to market open at UTC... Was thinking of using moment but it seems to be deprecated. Thoughts?
    marketOpen.setHours(14)
    marketOpen.setMinutes(30)
    const minutesPassed = Math.round((now.getTime() - marketOpen.getTime())/60000)
    return minutesPassed
}