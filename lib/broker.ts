//@ts-ignore
import * as Alpacas from '@master-chief/alpaca';
import BPromise from 'bluebird';
import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import color from 'chalk';
import { TwelveDataDataSource } from './data-source';
import { CommandClient } from './notification';
import { Decimal } from 'decimal.js';
import { isMarketOpen } from './util';
import { NotSupported } from './exceptions';


export interface Broker<TBuyInput, TSellInput, TOrderOuput> extends IInitializable, ICloseable {
    logger: Logger;
    buy(args: TBuyInput): Promise<TOrderOuput>;
    sell(args: TSellInput): Promise<TOrderOuput>;
    getPriceByTicker(ticker: string): Promise<number>;
    isMarketTime(): Promise<boolean>;
    getBuyingPower(): Promise<number>;
    getAccountValue(): Promise<number>;
}

export interface BrokerOptions {
    logger: Logger;
    commandClient: CommandClient;
}

interface AlpacasBrokerOptions extends BrokerOptions {
    keyId: string;
    secretKey: string;
}

export interface IAcceptableTrade {
    unit: number;
    type: 'percent' | 'dollar';
}

export class AlpacasBroker extends Alpacas.AlpacaClient implements Broker<Alpacas.PlaceOrder, Alpacas.PlaceOrder, Alpacas.Order> {
    logger: Logger;
    private _dataSource: TwelveDataDataSource; //Explictly this datasource, not the IDataSource interface
    commandClient: CommandClient;

    constructor(options: AlpacasBrokerOptions) {
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
                return `\n**Buying Power**: $${data.buying_power}
                        \n**Today P&L Dollars**: $${data.equity - data.last_equity}
                        \n**Portfolio Value**: $${data.portfolio_value}
                        \n**Day Trades Made**: ${data.daytrade_count}
                        `
            }),
            usage: `account`
        });

        this.commandClient.registerCommandHandler({
            command: 'positions',
            description: 'Show the current positions the account is in.',
            registrar: this.constructor.name,
            handler: () => this._getPositionsCommand(),
            usage: `positions`
        });

        this.commandClient.registerCommandHandler({
            command: 'sell',
            description: 'Sell a given number of shares in a given ticker',
            registrar: this.constructor.name,
            usage: `sell <qty or * to sell all> <ticker>`,
            handler: (input?: string) => {
                const [qty, symbol] = input!.split(" ");

                if (!(qty && symbol)) {
                    return Promise.resolve(`Please see !help for usage`);
                }

                return this.getPositionQty(symbol)
                .then((shareQty: number) => {
                    //SELL
                    return this.placeOrder({
                        symbol,
                        qty: qty === '*' ? shareQty : parseInt(qty),
                        side: 'sell',
                        time_in_force: 'day',
                        type: 'market'
                    })
                })
                .then(() => {
                    return Promise.resolve(`Placed a SELL order for **${symbol}**`);
                })
                .catch(err => {
                    return Promise.resolve(`An error occurred: **${err.message}**`);
                })
            }
        });

        this.commandClient.registerCommandHandler({
            command: 'stop-loss',
            description: 'Create a stop loss for position',
            registrar: this.constructor.name,
            usage: `stop-loss <stop price> <ticker>`,
            handler: (input?: string) => {
                const [price, symbol] = input!.split(" ");
                if (!(price && symbol)) {
                    return Promise.resolve(`Please see !help for usage`);
                }

                return this.getPositionQty(symbol)
                .then((shareQty: number) => {
                    return this.placeOrder({
                        type: 'stop',
                        side: 'sell',
                        symbol,
                        qty: shareQty,
                        time_in_force: 'gtc',
                        stop_price: parseInt(price)
                    });
                })
                .then(() => {
                    return `Placed a STOP LOSS for **$${symbol}** at **$${parseInt(price)}**`;
                })
                .catch(err => {
                    return `An error has occurred: **${err.message}**`;
                })
            }
        })

    }

    //TODO: Add in the functionality to get data for a ticker, buy, and sell. A broker may also need a way to keep it's equity value???
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
        return Promise.all([ this.getBuyingPower(), this.getPriceByTicker(ticker) ])
        .then(([ buyingPower, currPrice ]: [number, number]) => {
            this.logger.log(LogLevel.INFO, `Buying Power: ${buyingPower} -- Account Percent: ${accountPercent} -- Curr Price: ${currPrice} -- Position Size: ${positionSize}`);
            return new Decimal(buyingPower)
            .mul(accountPercent)
            .div(new Decimal(currPrice).mul(positionSize))
            .toNumber()
            // return new Decimal( new Decimal(buyingPower * accountPercent).toNumber() / new Decimal(currPrice * positionSize).toNumber()).toNumber();
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

    getAccountValue(): Promise<number> {
        return this.getAccount()
        .then(data => data.last_equity);
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
                    let pos = `**$${position.symbol}**\n
                    **Total P&L Percentage**: ${position.unrealized_pl * 100 / (position.qty * position.avg_entry_price)}%
                    **Unrealized P&L**: $${position.unrealized_pl}
                    **Intraday P&L Percentage**: ${position.unrealized_intraday_plpc * 100}%
                    **Intraday P&L Dollars**: $${position.unrealized_intraday_pl}
                    **Average Price**: $${position.avg_entry_price}
                    **Current Price**: $${position.current_price}
                    **Share Count**: ${position.qty}
                    **Total Position Size**: $${position.qty * position.avg_entry_price}
                    **Total Position Value**: $${position.qty * position.current_price}
                    `;
                    str = str.concat(`${pos}\n\n`);
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

export interface BrokerRegistryOptions {
    brokers: Broker<any, any, any>[];
    logger: Logger;
}

export class BrokerRegistry implements Broker<any, any, any> {
    private readonly brokers: Broker<any, any, any>[];
    logger: Logger;
    _dataProvider: TwelveDataDataSource;

    constructor(options: BrokerRegistryOptions) {
        this.brokers = options.brokers;
        this.logger = options.logger;
        this._dataProvider = new TwelveDataDataSource({
            logger: this.logger
        });
    }

    initialize(): Promise<void> {
        return Promise.all(this.brokers.map(broker => broker.initialize()))
        .then(() => { });
    }

    buy(): Promise<void> {
        return Promise.resolve();
    }

    sell(): Promise<void> {
        return Promise.resolve();
    }

    isMarketTime(): Promise<boolean> {
        return isMarketOpen();
    }

    getPriceByTicker(ticker: string): Promise<number> {
        return this._dataProvider.getTickerByPrice(ticker);
    }

    getAccountValue(): Promise<number> {
        throw new NotSupported(`${this.constructor.name}#getAccountValue() is not supported.
        Cannot return a value since multiple accounts are present.`);
    }

    getBuyingPower(): Promise<number> {
        throw new NotSupported(`${this.constructor.name}#getBuyingPower() is not supported.
        Cannot return a value since multiple accounts are present.`);
    }

    close(): Promise<void> {
        return Promise.all(this.brokers.map(broker => broker.close()))
        .then(() => { });
    }
}

export interface PhonyBrokerOptions {
    logger: Logger;
    tickers?: { [key: string]: number } //To be used as a map for when calling getBuyingPower()
}

export class PhonyBroker implements Broker<string, string, string> {
    tickers: { [key: string]: number };
    logger: Logger;
    
    constructor(options: PhonyBrokerOptions) {
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
        return Promise.resolve(9e12);
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

    getAccountValue(): Promise<number> {
        return Promise.resolve(1e10);
    }

    sell(something: string): Promise<string> {
        return Promise.resolve("");
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}