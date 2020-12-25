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
exports._minutesSinceOpen = exports._convertDate = exports._getMarketHolidays = exports._getMarketStatusOnDate = exports._returnLastOpenDay = exports.createLogger = exports.runCmd = exports.inCI = exports.createDeferredPromise = void 0;
const axios_1 = __importDefault(require("axios"));
const cp = __importStar(require("child_process"));
const winston = __importStar(require("winston"));
const exceptions_1 = require("./exceptions");
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
//TODO - this is messy, need to refactor into something more elegant
exports._returnLastOpenDay = () => {
    let date = new Date();
    date.setDate(date.getDate() - 1);
    while (exports._getMarketStatusOnDate(date) !== 'OPEN') {
        date.setDate(date.getDate() - 1);
    }
    return date.getDate();
};
//TODO - typing
exports._getMarketStatusOnDate = (date) => {
    const isWeekend = date.getDay() % 6 == 0 ? true : false;
    const holidays = exports._getMarketHolidays();
    const isHoliday = holidays.some((holiday) => {
        let holidayDate = new Date(Date.parse(holiday.date));
        return holidayDate.getDate() == date.getDate() &&
            holidayDate.getMonth() == date.getMonth();
    });
    return (isHoliday || isWeekend) ? 'OPEN' : 'CLOSED';
};
//TODO - typing
exports._getMarketHolidays = () => {
    let holidays = [];
    axios_1.default.get('https://api.polygon.io/v1/marketstatus/upcoming', {
        params: {
            apiKey: process.env['ALPACAS_API_KEY'] || "",
        }
    }).then((data) => { holidays = data.data; })
        .catch(err => {
        throw new exceptions_1.InvalidDataError(`Error in _getMarketHolidays(): innerError: ${err} -- ${JSON.stringify(err)}`);
    });
    return holidays;
};
exports._convertDate = (date) => {
    var yyyy = date.getFullYear().toString();
    var mm = (date.getMonth() + 1).toString();
    var dd = date.getDate().toString();
    var mmChars = mm.split('');
    var ddChars = dd.split('');
    return yyyy + '-' + (mmChars[1] ? mm : "0" + mmChars[0]) + '-' + (ddChars[1] ? dd : "0" + ddChars[0]);
};
exports._minutesSinceOpen = () => {
    const now = new Date();
    const marketOpen = new Date();
    //TODO - definitely needs to be changed, set this to market open at UTC... Was thinking of using moment but it seems to be deprecated. Thoughts?
    marketOpen.setHours(14);
    marketOpen.setMinutes(30);
    const minutesPassed = Math.round((now.getTime() - marketOpen.getTime()) / 60000);
    return minutesPassed;
};
