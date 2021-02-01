"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfidenceScore = void 0;
const util_1 = require("./util");
class ConfidenceScore {
    constructor(ticker) {
        this.ticker = ticker;
    }
    getConfidenceOptions(currTrade, changePercentPerMinute) {
        const confidenceOptions = {};
        // for the following equations the denominator is the interval and the multiplier is the weight. Need a more elegant way of configuring this
        // TODO: explain the equations
        const relativeVolume = util_1.getRelativeVolume(this.ticker).then((data) => data);
        const volRatio = util_1.createDeferredPromise();
        relativeVolume.then((vol) => {
            volRatio.resolve(vol);
        });
        confidenceOptions.relativeVolume = {
            process: volRatio.promise.then((vol) => !!(vol > 1)),
            score: volRatio.promise.then((vol) => vol * 15)
        };
        const relativeVWAP = util_1.getTickerSnapshot(this.ticker).then((data) => (currTrade.p - data.day.vw) / data.day.vw);
        const VWAPRatio = util_1.createDeferredPromise();
        relativeVWAP.then((vwap) => {
            VWAPRatio.resolve(vwap);
        });
        confidenceOptions.vwap = {
            process: VWAPRatio.promise.then((increase) => !!(increase > 0)),
            score: VWAPRatio.promise.then((increase) => Math.abs(increase) / 0.05 * 10)
        };
        confidenceOptions.changePercentPerMinute = {
            process: Promise.resolve(changePercentPerMinute > 0),
            score: Promise.resolve(Math.abs(changePercentPerMinute) / 0.01 * 2)
        };
        return confidenceOptions;
    }
    /**
     * A function that takes in a group of indicators, and based on their value, provides a confidence score based on their signal output
     * @param options An object describing the value of each indicator, and the Promise that will return it's signal
     * @returns A number, which will be between 0-100, which indicates the confidence of the indicators
     */
    getConfidenceScore(options) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`getConfidenceScore():INVOKED`);
            let ConfidenceScoreOptions = yield options;
            let summedValues = 0;
            let summedFalseSignalValues = 0;
            let processes = [];
            Object.keys(ConfidenceScoreOptions).forEach((key) => {
                let indicator = ConfidenceScoreOptions[key];
                //Allows us to map the given value of an indicator, to it's process once it has resolved.
                processes.push(Promise.all([indicator.process, indicator.score]).then((values) => [values[0], values[1]]));
            });
            return Promise.all(processes)
                .then((values) => {
                values.forEach(([signal, value]) => {
                    //If the signal is false, add it's value to the values that are false signals
                    summedValues = summedValues + value;
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
        });
    }
}
exports.ConfidenceScore = ConfidenceScore;
