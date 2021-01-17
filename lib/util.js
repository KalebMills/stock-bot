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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._getRelativeVolume = exports.getCurrentMarketStatus = exports.isHighVolume = exports.getTickerSnapshot = exports.minutesSinceOpen = exports.convertDate = exports.getMarketHolidays = exports.getMarketStatusOnDate = exports.returnLastOpenDay = exports.createLogger = exports.runCmd = exports.inCI = exports.createDeferredPromise = void 0;
const axios_1 = __importDefault(require("axios"));
const cp = __importStar(require("child_process"));
const winston = __importStar(require("winston"));
const exceptions_1 = require("./exceptions");
const axios_2 = __importDefault(require("axios"));
const moment_1 = __importDefault(require("moment"));
exports.createDeferredPromise = () => {
    //@ts-ignore
    let deferredPromise = {};
    let p = new Promise((resolve, reject) => {
        deferredPromise.cancellable = () => { };
        deferredPromise.reject = () => {
            deferredPromise.cancellable();
            reject();
        };
        deferredPromise.resolve = () => {
            console.log(`Called resolve() on deferred Promise`);
            deferredPromise.cancellable();
            resolve();
        };
    });
    deferredPromise.promise = p;
    return deferredPromise;
};
/**
 * Used to know when the tests are being ran by Github Actions: https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables
*/
exports.inCI = () => !!process.env['GITHUB_ACTIONS'];
exports.runCmd = (cmd) => {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, (err, stdout, stderr) => {
            if (err || stderr) {
                reject({ err, stderr });
            }
            else {
                resolve();
            }
        });
    });
};
exports.createLogger = (options) => {
    let transports = [new winston.transports.Console()];
    if (options.transports) {
        if (Array.isArray(options.transports)) {
            //@ts-ignore
            transports.push(...options.transports);
        }
        else {
            //@ts-ignore
            transports.push(options.transports);
        }
    }
    return winston.createLogger(Object.assign({ transports }, options));
};
exports.returnLastOpenDay = (date) => {
    return exports.getMarketStatusOnDate(date)
        .then(marketStatus => {
        if (marketStatus === 'CLOSED') {
            date.setDate(date.getDate() - 1);
            return exports.returnLastOpenDay(date);
        }
        else {
            return date.getDate();
        }
    });
};
exports.getMarketStatusOnDate = (date) => __awaiter(void 0, void 0, void 0, function* () {
    const isWeekend = !!(date.getDay() % 6 === 0);
    const holidays = yield exports.getMarketHolidays();
    const isHoliday = holidays.some((holiday) => {
        let holidayDate = new Date(Date.parse(holiday.date));
        return holidayDate.getDate() == date.getDate() &&
            holidayDate.getMonth() == date.getMonth();
    });
    return (isHoliday || isWeekend) ? 'CLOSED' : 'OPEN';
});
exports.getMarketHolidays = () => {
    return axios_1.default.get('https://api.polygon.io/v1/marketstatus/upcoming', {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || "",
        }
    })
        .then((data) => data.data)
        .catch(err => {
        return Promise.reject(new exceptions_1.RequestError(`Error in _getMarketHolidays(): innerError: ${err} -- ${JSON.stringify(err)}`));
    });
};
exports.convertDate = (date) => {
    var yyyy = date.getFullYear().toString();
    var mm = (date.getMonth() + 1).toString();
    var dd = date.getDate().toString();
    var mmChars = mm.split('');
    var ddChars = dd.split('');
    return yyyy + '-' + (mmChars[1] ? mm : `0${mmChars[0]}`) + '-' + (ddChars[1] ? dd : `0${ddChars[0]}`);
};
exports.minutesSinceOpen = () => {
    const now = new Date();
    const marketOpen = moment_1.default();
    marketOpen.set({ hour: 14, minutes: 30 });
    const minutesPassed = Math.round((now.getTime() - marketOpen.toDate().getTime()) / 60000);
    return minutesPassed;
};
exports.getTickerSnapshot = (ticker) => {
    return axios_2.default.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    })
        .then((data) => {
        // console.log(`getTickerSnapshot():OUTPUT -- ${JSON.stringify(data.data.ticker)}`);
        return data.data.ticker;
    })
        .catch((err) => Promise.reject(new exceptions_1.RequestError(err.message)));
};
//TODO: We are making duplicate calls (call to getTickerSnapshot in this class), need to consolidate
exports.isHighVolume = (ticker) => {
    //TODO: make this configurable via config file/process.env
    const threshold = 1000000;
    return exports.getTickerSnapshot(ticker).then((data) => {
        return data.day.v > threshold || data.prevDay.v > threshold;
    });
};
exports.getCurrentMarketStatus = () => {
    return axios_2.default.get(`https://api.polygon.io/v1/marketStatus/now`, {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    })
        .then((data) => {
        return data.data.market;
    })
        .catch((err) => Promise.reject(new exceptions_1.RequestError(err.message)));
};
/**
 * Calculates the relative volume.
 * This is the volume for the current day uptil the current minute / the volume from open until that respective minute for the last trading day.
 * For example the relative volume of a ticker at 10:30AM on a Tuesday would be the ratio of the days volume so far and the total volume from open till 10:30AM on Monday (the last trading day)
*/
function _getRelativeVolume(ticker) {
    return __awaiter(this, void 0, void 0, function* () {
        const lastDay = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        lastDay.setDate(yield exports.returnLastOpenDay(yesterday));
        const lastDate = exports.convertDate(lastDay);
        const minutesPassed = exports.minutesSinceOpen();
        return Promise.all([
            axios_1.default.get(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${lastDate}/${lastDate}`, {
                params: {
                    apiKey: process.env['ALPACAS_API_KEY'] || "",
                    sort: 'asc',
                    limit: minutesPassed
                }
            }), exports.getTickerSnapshot(ticker)
        ])
            .then((data) => {
            const lastDay = data[0].data;
            const today = data[1];
            return lastDay.results.reduce((a, b) => a + parseInt(b['v']), 0) / (today.day.v);
        }).catch(err => {
            return Promise.reject(new exceptions_1.RequestError(`Error in _getRelativeVolume(): innerError: ${err} -- ${JSON.stringify(err)}`));
        });
    });
}
exports._getRelativeVolume = _getRelativeVolume;
