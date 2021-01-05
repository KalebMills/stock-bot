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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchHistoricTradeEvents = exports.generatePlotGraphFromTradeEvents = exports.fetchTickerGraph = exports.fetchTickersFromFile = exports.createLogger = exports.runCmd = exports.inCI = exports.createDeferredPromise = void 0;
const cp = __importStar(require("child_process"));
const winston = __importStar(require("winston"));
const fs = __importStar(require("fs"));
const axios_1 = __importDefault(require("axios"));
const path = __importStar(require("path"));
const E = __importStar(require("./exceptions"));
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
        .catch(err => Promise.reject(new E.DefaultError(JSON.stringify(err))));
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
        console.log(data[0]);
        console.log(`Got data, ${data.length} - typeof data = ${Array.isArray(data)}`);
        starterEventArr.push(...data);
        console.log(`Events.length = ${starterEventArr.length}`);
        if (data.length == 50000) {
            return exports.fetchHistoricTradeEvents(ticker, date, starterEventArr[starterEventArr.length - 1].t, starterEventArr);
        }
        else {
            return Promise.resolve(starterEventArr);
        }
    })
        .catch(err => Promise.reject(new E.DefaultError(JSON.stringify(err))));
};
