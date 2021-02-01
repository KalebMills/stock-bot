import { Identifier } from 'typescript'
import { Snapshot } from '../types'
import { createDeferredPromise, getRelativeVolume, getTickerSnapshot } from './util'
import { TradeEvent } from './workers'

export interface ConfidenceScoreOptions {
    [indicatorName: string]: {
        process: Promise<boolean>
        score: Promise<number>
    };
}

export class ConfidenceScore {
    private ticker: string
    constructor(ticker: string) {
        this.ticker = ticker
    }
    getConfidenceOptions (currTrade: TradeEvent, changePercentPerMinute: number): ConfidenceScoreOptions {
        const confidenceOptions: ConfidenceScoreOptions = {}

        // for the following equations the denominator is the interval and the multiplier is the weight. Need a more elegant way of configuring this
        // TODO: explain the equations
        const relativeVolume: Promise<number> = getRelativeVolume(this.ticker).then((data: number) => data)
        const volRatio = createDeferredPromise()
        relativeVolume.then((vol) => {
            volRatio.resolve(vol)
        })
        confidenceOptions.relativeVolume = {
            process: volRatio.promise.then((vol) => !!(vol>1)),
            score: volRatio.promise.then((vol) => vol * 15)
        }
        
        const relativeVWAP: Promise<number> = getTickerSnapshot(this.ticker).then((data: Snapshot) => (currTrade.p-data.day.vw)/data.day.vw)
        const VWAPRatio = createDeferredPromise()
        relativeVWAP.then((vwap) => {
            VWAPRatio.resolve(vwap)
        })
        confidenceOptions.vwap = {
            process: VWAPRatio.promise.then((increase)=>!!(increase>0)),
            score: VWAPRatio.promise.then((increase)=> Math.abs(increase)/0.05 * 10)
        }

        confidenceOptions.changePercentPerMinute = {
            process: Promise.resolve(changePercentPerMinute>0),
            score: Promise.resolve(Math.abs(changePercentPerMinute)/0.01 * 2)
        }
        return confidenceOptions
    }

    /**
     * A function that takes in a group of indicators, and based on their value, provides a confidence score based on their signal output
     * @param options An object describing the value of each indicator, and the Promise that will return it's signal
     * @returns A number, which will be between 0-100, which indicates the confidence of the indicators
     */

    async getConfidenceScore (options: ConfidenceScoreOptions): Promise<number> {
        console.log(`getConfidenceScore():INVOKED`);

        let ConfidenceScoreOptions = await options
        let summedValues: number = 0;
        let summedFalseSignalValues: number = 0;
        let processes: Promise<[boolean, number]>[] = [];

        Object.keys(ConfidenceScoreOptions).forEach((key: string) => {
            let indicator = ConfidenceScoreOptions[key];
            //Allows us to map the given value of an indicator, to it's process once it has resolved.
            processes.push(Promise.all([indicator.process, indicator.score]).then((values: [boolean, number]) => [values[0], values[1]]));
        });

        return Promise.all(processes)
        .then((values: [boolean, number][]) => {
            values.forEach(([signal, value]: [boolean, number]) => {
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
    }
}