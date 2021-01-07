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
exports.getConfidenceScore = exports.getTickerSnapshot = exports.minutesSinceOpen = exports.convertDate = exports.getMarketHolidays = exports.getMarketStatusOnDate = exports.returnLastOpenDay = exports.fetchHistoricTradeEvents = exports.generatePlotGraphFromTradeEvents = exports.fetchTickerGraph = exports.fetchTickersFromFile = exports.createLogger = exports.runCmd = exports.inCI = exports.createDeferredPromise = void 0;
const cp = __importStar(require("child_process"));
const winston = __importStar(require("winston"));
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const path = __importStar(require("path"));
const exceptions_1 = require("./exceptions");
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
                resolve({ stderr, stdout });
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
exports.fetchTickersFromFile = (thePath) => {
    return new Promise((resolve, reject) => {
        fs.readFile(thePath, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                let tickers = data.toString().split('\n').filter(ticker => !!ticker);
                resolve(tickers);
            }
        });
    });
};
/**
 * Function to generate a link to a graph in TradingView
 * @param ticker ticker to create the link for
 * @returns Link to a graph for the given ticker
 */
exports.fetchTickerGraph = (ticker) => {
    return axios_1.default.get(`https://symbol-search.tradingview.com/symbol_search/?text=${ticker}&exchange=&type=&hl=true&lang=en&domain=production`)
        .then(data => {
        const output = data.data[0];
        console.log(JSON.stringify(output));
        if (output.hasOwnProperty('prefix')) {
            return `https://www.tradingview.com/symbols/${output.prefix}-${ticker}/`;
        }
        else {
            return `https://www.tradingview.com/symbols/${output.exchange}-${ticker}/`;
        }
    })
        .catch(err => Promise.reject(new exceptions_1.DefaultError(JSON.stringify(err))));
};
//TODO: Finish writing actual script
/**
 * Calls a python script to generate a graph, given a JSON file of TradeEvents
 * @param absolutePathToJsonFile
 * @returns path to the generated graph
 */
exports.generatePlotGraphFromTradeEvents = (absolutePathToJsonFile) => {
    const pathToScript = path.join(__dirname, 'resources', 'scripts', 'generate-plot.py');
    return exports.runCmd(`python3 ${pathToScript} ${absolutePathToJsonFile}`)
        .then(({ stdout, stderr }) => {
        if (stderr) {
            return Promise.reject(stderr);
        }
        else {
            return Promise.resolve(stdout);
        }
    });
};
/**
 * Given the inputs, returns all trade events for that day
 * @param ticker The ticker to get the trade events for
 * @param date The date which the events will be fetched for
 * @param timestamp Used for recursion, the timestamp of the last received event
 * @param events the array of events that is kept through recursion
 */
exports.fetchHistoricTradeEvents = (ticker, date, timestamp, events) => {
    let month = (date.getMonth() + 1).toString().length < 2 ? (`0${date.getMonth() + 1}`) : date.getMonth() + 1;
    let d = (date.getDate()).toString().length < 2 ? (`0${date.getDate()}`) : date.getDate();
    let day = `${date.getFullYear()}-${month}-${d}`;
    let starterEventArr = events || [];
    let params = {
        params: {
            limit: 50000,
            apiKey: process.env['ALPACAS_API_KEY'] || ""
        }
    };
    if (timestamp) {
        params.params = Object.assign(Object.assign({}, params.params), { timestamp });
    }
    console.log(`Fetching https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${day}/`);
    return axios_1.default.get(`https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${day}/`, params).then(data => {
        return data.data.results;
    })
        .then(data => {
        starterEventArr.push(...data);
        if (data.length == 50000) {
            return exports.fetchHistoricTradeEvents(ticker, date, starterEventArr[starterEventArr.length - 1].t, starterEventArr);
        }
        else {
            return Promise.resolve(starterEventArr);
        }
    })
        .catch(err => Promise.reject(new exceptions_1.DefaultError(JSON.stringify(err))));
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
    return axios_1.default.get(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {
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
