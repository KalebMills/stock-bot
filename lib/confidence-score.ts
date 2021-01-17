import { Promise } from 'bluebird'
import { Snapshot } from '../types'
import { _getRelativeVolume, getTickerSnapshot } from './util'
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
    async getConfidenceOptions (currTrade: TradeEvent, changePercentPerMinute: number): Promise<ConfidenceScoreOptions> {
        const confidenceOptions: ConfidenceScoreOptions = {}

        const relativeVolume: Promise<number> = _getRelativeVolume(this.ticker).then((data: number) => data)
        confidenceOptions.relativeVolume = {
            process: relativeVolume.then((vol)=>!!(vol>1)),
            score: relativeVolume.then((vol) => vol/1 * 10)
        }
        
        const vwap: Promise<number> = getTickerSnapshot(this.ticker).then((data: Snapshot) => (currTrade.p-data.day.vw)/data.day.vw)
        confidenceOptions.vwap = {
            process: vwap.then((increase)=>!!(increase>0)),
            score: vwap.then((increase)=> Math.abs(increase)/0.05 * 5)
        }

        const process: Promise<boolean> = new Promise(()=> changePercentPerMinute > 0)
        confidenceOptions.changePercentPerMinute = {
            process: process,
            score: new Promise(()=>Math.abs(changePercentPerMinute)/0.01 * 2)
        }
        return confidenceOptions
    }

    /**
     * A function that takes in a group of indicators, and based on their value, provides a confidence score based on their signal output
     * @param options An object describing the value of each indicator, and the Promise that will return it's signal
     * @returns A number, which will be between 0-100, which indicates the confidence of the indicators
     */

    getConfidenceScore (options: ConfidenceScoreOptions): Promise<number> {
        console.log(`getConfidenceScore():INVOKED`);
        let summedValues: number = 0;
        let summedFalseSignalValues: number = 0;
        let processes: Promise<[boolean, number]>[] = [];

        Object.keys(options).forEach((key: string) => {
            let indicator = options[key];
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