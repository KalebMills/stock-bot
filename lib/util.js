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
exports.extractTweetSignals = exports.Timer = exports.getCurrentMarketStatus = exports.isHighVolume = exports.getConfidenceScore = exports.getTickerSnapshot = exports.minutesSinceOpen = exports.convertDate = exports.getMarketHolidays = exports.getMarketStatusOnDate = exports.returnLastOpenDay = exports.createLogger = exports.runCmd = exports.inCI = exports.createDeferredPromise = exports.ActionSignal = void 0;
const axios_1 = __importDefault(require("axios"));
const cp = __importStar(require("child_process"));
const winston = __importStar(require("winston"));
const exceptions_1 = require("./exceptions");
const axios_2 = __importDefault(require("axios"));
const moment_1 = __importDefault(require("moment"));
var ActionSignal;
(function (ActionSignal) {
    ActionSignal[ActionSignal["BUY"] = 0] = "BUY";
    ActionSignal[ActionSignal["SELL"] = 1] = "SELL";
    ActionSignal[ActionSignal["UNKNOWN"] = 2] = "UNKNOWN";
})(ActionSignal = exports.ActionSignal || (exports.ActionSignal = {}));
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
/**
 * A function that takes in a group of indicators, and based on their value, provides a confidence score based on their signal output
 * @param options An object describing the value of each indicator, and the Promise that will return it's signal
 * @returns A number, which will be between 0-100, which indicates the confidence of the indicators
 */
exports.getConfidenceScore = (options) => {
    console.log(`getConfidenceScore():INVOKED`);
    let summedValues = 0;
    let summedFalseSignalValues = 0;
    let processes = [];
    Object.keys(options).forEach((key) => {
        let indicator = options[key];
        summedValues = summedValues + indicator.value;
        //Allows us to map the given value of an indicator, to it's process once it has resolved.
        processes.push(indicator.process.then((val) => [val, indicator.value]));
    });
    return Promise.all(processes)
        .then((values) => {
        values.forEach(([signal, value]) => {
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
class Timer {
    constructor() {
        this.startTime = [0, 0];
    }
    start() {
        this.startTime = process.hrtime();
    }
    stop() {
        let endTime = process.hrtime(this.startTime);
        let totalNanoSeconds = endTime[0] * 1e9;
        totalNanoSeconds = totalNanoSeconds + endTime[1];
        return totalNanoSeconds;
    }
}
exports.Timer = Timer;
// TODO: Figure out a reliable way to extract position sizes from tweets, for now sizing is 1
exports.extractTweetSignals = (tweet) => {
    tweet = tweet.toUpperCase();
    const splitTweet = tweet.replace('\n', '').split(" ");
    //options trading not supported via alpacas
    const blacklist = ["CALL", "PUT", "CALLS", "PUTS"];
    const pos_actions = ["BOT", "BOUGHT", "BUY"];
    const neg_actions = ["SOLD", "SELL", "STOPPED", "SL"];
    const emptySignals = [{
            ticker: "",
            action: ActionSignal.UNKNOWN,
            sizing: 0
        }];
    let extractedSignals = [];
    //If both a buy and sell signal is part of the tweet, the first action in the tweet is the correct signal. 
    let action;
    let buy = pos_actions.findIndex(word => splitTweet.includes(word));
    let sell = neg_actions.findIndex(word => splitTweet.includes(word));
    if (buy || sell) {
        action = buy == undefined ? ActionSignal.SELL : ActionSignal.BUY;
    }
    //no buy or sell signal detected
    else {
        return emptySignals;
    }
    for (let word of splitTweet) {
        if (blacklist.includes(word)) {
            return emptySignals;
        }
        //filtering out dollar amounts
        if (word.startsWith("$") && isNaN(+word.substring(1))) {
            //multiple tickers are sometimes bought or sold and alerted in the same tweet
            extractedSignals.push({
                ticker: word.substring(1),
                action: action,
                sizing: 1
            });
        }
    }
    return extractedSignals;
};
