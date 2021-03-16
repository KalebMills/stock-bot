//@ts-ignore
import * as Alpacas from '@master-chief/alpaca';
import BPromise from 'bluebird';
import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import color from 'chalk';
import { TwelveDataDataSource } from './data-source';
import { CommandClient } from './notification';

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
    commandClient: CommandClient;
}

interface AlpacasExchangeOptions extends ExchangeOptions {
    keyId: string;
    secretKey: string;
}

export interface IAcceptableTrade {
    unit: number;
    type: 'percent' | 'dollar';
}

export class AlpacasExchange extends Alpacas.AlpacaClient implements Exchange<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order> {
    logger: Logger;
    private _dataSource: TwelveDataDataSource; //Explictly this datasource, not the IDataSource interface
    commandClient: CommandClient;

    constructor(options: AlpacasExchangeOptions) {
        super({
            credentials: {
                key: options.keyId,
                secret: options.secretKey
            },
            rate_limit: true
        });

        this._dataSource = new TwelveDataDataSource({
            logger: options.logger
        });

        this.logger = options.logger;
        this.commandClient = options.commandClient;

        this.commandClient.registerCommandHandler({
            command: 'account',
            description: 'An overall look into the accounts value, equity, and buying power.',
            registrar: this.constructor.name,
            handler: () => this.getAccount().then(data => {
                return `\n**Buying Power**: ${data.buying_power}
                        \n**Cash**: ${data.cash}
                        \n**Total Account Value**: ${data.equity}
                        \n**Portfolio Value**: ${data.portfolio_value}
                        \n**Day Trades Made**: ${data.daytrade_count}
                        `
            })
        });

        this.commandClient.registerCommandHandler({
            command: 'positions',
            description: 'Show the current positions the account is in.',
            registrar: this.constructor.name,
            handler: () => this._getPositionsCommand()
        });
    }

    //TODO: Add in the functionality to get data for a ticker, buy, and sell. An exchange may also need a way to keep it's equity value???
    buy(args: Partial<Alpacas.PlaceOrder>): Promise<Alpacas.Order> {
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

    // Assumes fractional shares are available
    sizePosition(ticker: string, accountPercent: number = 0.1, positionSize: number): Promise<number> {
        return Promise.all([this.getBuyingPower(), this.getPriceByTicker(ticker)])
        .then((data) => {
            let buyingPower = data[0]
            let currPrice = data[1]
            return (buyingPower * accountPercent)/currPrice * positionSize
        })
    }

    getPositionQty(ticker: string): Promise<number> {
        return this.getPositions()
        .then((positions) => {
            let position = positions.find(pos => pos.symbol === ticker)
            return position?.qty ?? 0
        })
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
        return this._dataSource.getTickerByPrice(ticker);
    }

    initialize(): Promise<void> {
        return Promise.resolve()
        .then(() => {
            this.logger.log(LogLevel.INFO, color.green(`${this.constructor.name}#initialize():SUCCESS`));
        })
    }

    _getPositionsCommand = (): Promise<string> => {
        return this.getPositions()
        .then(positions => {
            console.log(JSON.stringify(positions))
            let str = '\n';
            
            if (positions.length) {
                positions.forEach(position => {
                    let pos = `$${position.symbol} - Unrealized P&L: ${position.unrealized_pl} - Average Price: ${position.avg_entry_price} - Current Price: ${position.current_price}`;
                    str = str.concat(`${pos}\n`);
                });
            } else {
                str = '**There are currently no positions.**';
            }

            console.log(`str = ${str}`)
            return str;
        });
    }

    

    close(): Promise<void> {
        //This used to close the client.. We may need to track this internally now since the client itself doesn't provide this
        return BPromise.all([ Promise.resolve() ])
        .then(() => this.logger.log(LogLevel.INFO, `${this.constructor.name}#close():SUCCESS`))
        .then(() => {})
    }
}

export interface PhonyExchangeOptions {
    logger: Logger;
    tickers?: { [key: string]: number } //To be used as a map for when calling getBuyingPower()
}

export class PhonyExchange implements Exchange<string, string, string> {
    tickers: { [key: string]: number };
    logger: Logger;
    
    constructor(options: PhonyExchangeOptions) {
        this.logger = options.logger;
        this.tickers = options.tickers || {};
    }

    initialize(): Promise<void> {
        return Promise.resolve()
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#intiialize():SUCCESS`);
        })
    }

    buy(something: string): Promise<string> {
        return Promise.resolve("");
    }

    getBuyingPower(): Promise<number> {
        return Promise.resolve(99999999999999999999);
    }

    getPriceByTicker(ticker: string): Promise<number> {
        if (this.tickers.hasOwnProperty(ticker)) {
            return Promise.resolve(this.tickers[ticker]);
        } else {
            return Promise.resolve(200);
        }
    }

    isMarketTime(): Promise<boolean> {
        return Promise.resolve(true);
    }

    sell(something: string): Promise<string> {
        return Promise.resolve("");
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}