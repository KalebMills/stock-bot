//@ts-ignore
import * as Alpacas from '@master-chief/alpaca';
import BPromise from 'bluebird';
import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import color from 'chalk';

export interface Exchange<TBuyInput, TSellInput, TOrderOuput> extends IInitializable, ICloseable {
    logger: Logger;
    buy(args: TBuyInput): Promise<TOrderOuput>;
    sell(args: TSellInput): Promise<TOrderOuput>;
    getPriceByTicker(ticker: string): Promise<number>;
    isMarketTime(): Promise<boolean>;
    getBuyingPower(): Promise<number>;
}

export interface ExchangeOptions {
    logger: Logger;
    acceptableGain: IAcceptableTrade;
    acceptableLoss: IAcceptableTrade;

}

interface AlpacasExchangeOptions extends ExchangeOptions {
    keyId: string;
    secretKey: string;
    testing?: boolean;
}

export interface IAcceptableTrade {
    unit: number;
    type: 'percent' | 'dollar';
}

export class AlpacasExchange extends Alpacas.AlpacaClient implements Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order> {
    logger: Logger;
    private acceptableGain: IAcceptableTrade;
    private acceptableLoss: IAcceptableTrade;

    constructor(options: AlpacasExchangeOptions) {
        super({
            credentials: {
                key: options.keyId,
                secret: options.secretKey
            },
            rate_limit: true
        });

        this.logger = options.logger;
        this.acceptableGain = options.acceptableGain;
        this.acceptableLoss = options.acceptableLoss;

        if(options.testing) {
            this.logger.log(LogLevel.INFO, color.bgYellowBright.blackBright(`${this.constructor.name}#constructor - In PAPER mode, no real trades will be executed.`))
        }
    }

    //TODO: Add in the functionality to get data for a ticker, buy, and sell. An exchange may also need a way to keep it's equity value???
    buy(args: Partial<Alpacas.PlaceOrder>): Promise<Alpacas.Order> {

        const currStockPrice: number = 0; //Place holder until we have the ability to fetch that stocks current price
        let takeProfitLimitPrice: number = currStockPrice + (currStockPrice * .3);  //BAD, this should be passed in

        return this.placeOrder({
            symbol: args.symbol!,
            qty: args.qty!,
            side: 'buy',
            time_in_force: 'day',
            type: 'market',
            order_class: 'bracket',
            stop_loss: {
                stop_price: args.stop_loss!.stop_price,
                limit_price: args.stop_loss!.limit_price
            },
            take_profit: {
                limit_price: args.take_profit!.limit_price
            }
        });
    }

    //This is a manual sell function, while 
    sell(args: Alpacas.PlaceOrder): Promise<Alpacas.Order> {
        return this.placeOrder({
            symbol: args.symbol,
            qty: args.qty,
            side: 'sell',
            type: 'market',
            time_in_force: 'day'
        });
    }

    isMarketTime(): Promise<boolean> {
        return this.getClock()
        .then(data => data.is_open);
    }

    getBuyingPower(): Promise<number> {
        return this.getAccount()
        .then(res => res.buying_power);
    }

    getPriceByTicker(ticker: string): Promise<number> {
        return this.getLastTrade({ symbol: ticker })
        .then((trade: Alpacas.LastTrade) => trade.last.price);
    }

    initialize(): Promise<void> {
        this.logger.log(LogLevel.INFO, color.green(`${this.constructor.name}#initialize():SUCCESS`))
        return Promise.resolve();
    }

    close(): Promise<void> {
        //This used to close the client.. We may need to track this internally now since the client itself doesn't provide this
        return BPromise.all([ Promise.resolve() ])
        .then(() => this.logger.log(LogLevel.INFO, `${this.constructor.name}#close():SUCCESS`))
        .then(() => {})
    }
}