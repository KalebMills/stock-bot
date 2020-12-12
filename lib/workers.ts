import { Worker, IWorker, IWorkerOptions, LogLevel, Logger } from './base';
import axios, { AxiosResponse } from 'axios';
import { Exchange } from './exchange';
import * as Alpacas from '@master-chief/alpaca';
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import * as exception from './exceptions';
import { INotification } from './notification';
import { IPurchaseOptions, ITickerChange, IStockChange } from './stock-bot';


export interface IStockeWorkerOptions<T, TOrderInput, TOrder> extends IWorkerOptions<T> {
    purchaseOptions: IPurchaseOptions;
    exchange: Exchange<TOrderInput, TOrderInput, TOrder>;
    notification: INotification;
}

//Required interface to allow generic construction of the StockWorker(s)
export interface IStockWorker<TInput, TOuput = any> extends IWorker<TInput, TOuput> {
    new (options: IStockeWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>): IStockWorker<TInput, TOuput>;
};

/*
    Superset the base Worker, so that we can expand upon the StockServiceWorker if needed
    All new algos should extend this class
*/
export abstract class StockWorker extends Worker<ITickerChange> {
    constructor(options: IStockeWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>) { //TODO: Needs to be more generically typed
        super(options);
    }
}

export class TopGainerNotificationStockWorker extends StockWorker {
    logger: Logger;
    private purchaseOptions: IPurchaseOptions;
    private notification: INotification;
    exchange: Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order>; //TODO: This should be abstract. The Exchange should use a more abstract and simple interface.

    constructor(options: IStockeWorkerOptions<ITickerChange, Alpacas.PlaceOrder, Alpacas.Order>) {
        super(options);
        this.logger = options.logger;
        this.purchaseOptions = options.purchaseOptions;
        this.exchange = options.exchange;
        this.notification = options.notification;
    }

    process(ticker: ITickerChange): Promise<void> {
        return this._processTicker(ticker);
    }

    //TODO: Create algo for understanding what is a good stock to purchase, and what is the stop limit and take profit limit
    _processTicker(ticker: ITickerChange): Promise<void> {
        return this.getPrevStockPrice(ticker.ticker, this.purchaseOptions.prevStockPriceOptions.unit, this.purchaseOptions.prevStockPriceOptions.measurement)
        .then((prevStockPrice: number) => {
            let changePercent = this.getChangePercent(prevStockPrice, ticker.price);
            this.logger.log(LogLevel.INFO, `Change Percent ${changePercent.percentChange} ${changePercent.persuasion} for ${ticker.ticker}`)
            let takeProfitDollarAmount = ticker.price + (ticker.price * this.purchaseOptions.takeProfitPercentage);
            let stopLossDollarAmount = ticker.price - (ticker.price * this.purchaseOptions.stopLimitPercentage);
            //TODO: Make the expected percentChange expectation configurable in the service
            if((changePercent.percentChange >= .005 && changePercent.persuasion === 'up') && (ticker.price <= this.purchaseOptions.maxSharePrice)) {
                return this.notification.notify({
                    ticker: ticker.ticker,
                    message: `${ticker.ticker} is up ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        exchange: this.exchange.constructor.name,
                        receiveTime: new Date().toISOString(),
                        currentPrice: ticker.price,
                        takeProfitAt: takeProfitDollarAmount,
                        cutLossesAt: stopLossDollarAmount,
                        //TODO: this will break for a yahoo data source, will need to fix
                        //TODO: should probably standardize all these to volumes per minute so they are easier to compare
                        volumeInfo: `The volume is currently ${ticker.currentVol}, it was ${ticker.prevDayVol} yesterday, it was ${ticker.prevMinVol} in the past minute`,
                        // current price > vwap is a buy signal fwiw
                        vwap: `The vwap is currently ${ticker.currentVwap}, it was ${ticker.prevDayVwap} yesterday, it was ${ticker.prevMinVwap} in the past minute`,
                        //TODO: calculate current price as a delta% of the below values
                        highOfDay: `${ticker.highOfDay}`,
                        lowOfDay: `${ticker.lowOfDay}`,
                        prevClosePrice: `${ticker.prevDayClose}`
                        //TODO: We should definitely include a way to denote which datasource this information is coming from
                    }
                });
                //Lets set our buy here, and our different sell and stop limits with the above price
                // return this.exchange.getBuyingPower()
                // .then(amount => {
                //     this.logger.log(LogLevel.INFO, color.green(`Checking buying power.`))
                //     const cost = this.purchaseOptions.maxShareCount * this.purchaseOptions.maxSharePrice;
                //     if(cost < amount) {
                //         return this.notification.notify(`We should purchase ticker ${ticker.ticker}`);
                //     } else {
                //         this.logger.log(LogLevel.WARN, color.magentaBright(`${this.exchange.constructor.name} does not have enough buy power to purchase the configured amount of shares for ${ticker.ticker}`));
                //         return;
                //     }
                // })

            } else {
                // We need to see if we are missing out on good buys
                return this.notification.notify({
                    ticker: ticker.ticker,
                    price: ticker.price,
                    message: `${ticker.ticker} would not alert, it is ${changePercent.persuasion} ${changePercent.percentChange * 100}% from ${this.purchaseOptions.prevStockPriceOptions.unit} ${this.purchaseOptions.prevStockPriceOptions.measurement}s ago`,
                    additionaData: {
                        exchange: this.exchange.constructor.name
                    }
                });
            }
        })
    }

    //TODO: This needs to be on the Exchange interface, this should not be something that a worker can do by itself.
    getPrevStockPrice(ticker: string, amount: number = 15,  unit: moment.DurationInputArg2 = 'minutes', limit: number = 100): Promise<number> {
        let nycTime = momentTimezone.tz(new Date().getTime(), 'America/New_York').subtract(amount, unit);
        let timestamp = nycTime.valueOf();
        return axios.get(`https://api.polygon.io/v2/ticks/stocks/trades/${ticker}/${nycTime.format('YYYY-MM-DD')}`, {
            params: {
                timestamp: timestamp,
                limit,
                apiKey: process.env['ALPACAS_API_KEY'] || "",
                reverse: false
            }
        })
        .then((data: AxiosResponse) => {
            //TODO: We should create a type for the data returned here
            if(data.data.results_count > 0) {
                let priceAsNumber = Number(data.data.results[data.data.results_count -1].p);
                return Number(priceAsNumber.toFixed(2));
            } else {
                this.logger.log(LogLevel.ERROR, `Failed to get previous price for ${ticker}`)
                throw new exception.UnprocessableTicker(ticker);
            }
        });
    }

    //Here we take the different prices, and come up with the % of change in the stock price
    getChangePercent(prevPrice: number, currentPrice: number): IStockChange {
        let change: number = (currentPrice - prevPrice) / prevPrice;
        let isPositive: boolean = !change.toString().includes('-');
        let removedSymbols = parseFloat(change.toString().replace('-', ""));
        change = Number(removedSymbols.toFixed(3)); //NOTE: This does rounding to the nearest number
        return { percentChange: change, persuasion: isPositive ? 'up' : 'down' };
    }
}
