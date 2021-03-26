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
exports.PhonyExchange = exports.AlpacasExchange = void 0;
//@ts-ignore
const Alpacas = __importStar(require("@master-chief/alpaca"));
const bluebird_1 = __importDefault(require("bluebird"));
const base_1 = require("./base");
const chalk_1 = __importDefault(require("chalk"));
const data_source_1 = require("./data-source");
const decimal_js_1 = require("decimal.js");
class AlpacasExchange extends Alpacas.AlpacaClient {
    constructor(options) {
        super({
            credentials: {
                key: options.keyId,
                secret: options.secretKey
            },
            rate_limit: true
        });
        this._getPositionsCommand = () => {
            return this.getPositions()
                .then(positions => {
                console.log(JSON.stringify(positions));
                let str = '\n';
                if (positions.length) {
                    positions.forEach(position => {
                        let pos = `**$${position.symbol}**\n**Unrealized P&L**: ${position.unrealized_pl}\n**Average Price**: ${position.avg_entry_price}\n**Share Count**: ${position.qty}\n**Total Position Size**: ${position.qty * position.avg_entry_price}\n`;
                        str = str.concat(`${pos}\n\n`);
                    });
                }
                else {
                    str = '**There are currently no positions.**';
                }
                console.log(`str = ${str}`);
                return str;
            });
        };
        this._dataSource = new data_source_1.TwelveDataDataSource({
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
                        `;
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
            handler: (input) => {
                const [qty, symbol] = input.split(" ");
                if (!(qty && symbol)) {
                    return Promise.resolve(`Please see !help for usage`);
                }
                return this.getPositionQty(symbol)
                    .then((shareQty) => {
                    //SELL
                    return this.placeOrder({
                        symbol,
                        qty: qty === '*' ? shareQty : parseInt(qty),
                        side: 'sell',
                        time_in_force: 'day',
                        type: 'market'
                    });
                })
                    .then(() => {
                    return Promise.resolve(`Placed a SELL order for **${symbol}**`);
                })
                    .catch(err => {
                    return Promise.resolve(`An error occurred: **${err.message}**`);
                });
            }
        });
        this.commandClient.registerCommandHandler({
            command: 'stop-loss',
            description: 'Create a stop loss for position',
            registrar: this.constructor.name,
            usage: `stop-loss <stop price> <ticker>`,
            handler: (input) => {
                const [price, symbol] = input.split(" ");
                if (!(price && symbol)) {
                    return Promise.resolve(`Please see !help for usage`);
                }
                return this.getPositionQty(symbol)
                    .then((shareQty) => {
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
                });
            }
        });
    }
    //TODO: Add in the functionality to get data for a ticker, buy, and sell. An exchange may also need a way to keep it's equity value???
    buy(args) {
        return this.placeOrder({
            symbol: args.symbol,
            qty: args.qty,
            side: 'buy',
            time_in_force: 'day',
            type: 'market',
            order_class: 'bracket',
            stop_loss: {
                stop_price: args.stop_loss.stop_price,
                limit_price: args.stop_loss.limit_price
            },
            take_profit: {
                limit_price: args.take_profit.limit_price
            }
        });
    }
    //This is a manual sell function, while 
    sell(args) {
        return this.placeOrder({
            symbol: args.symbol,
            qty: args.qty,
            side: 'sell',
            type: 'market',
            time_in_force: 'day'
        });
    }
    // Assumes fractional shares are available
    sizePosition(ticker, accountPercent = 0.1, positionSize) {
        return Promise.all([this.getBuyingPower(), this.getPriceByTicker(ticker)])
            .then(([buyingPower, currPrice]) => {
            this.logger.log(base_1.LogLevel.INFO, `Buying Power: ${buyingPower} -- Account Percent: ${accountPercent} -- Curr Price: ${currPrice} -- Position Size: ${positionSize}`);
            return new decimal_js_1.Decimal(buyingPower)
                .mul(accountPercent)
                .div(new decimal_js_1.Decimal(currPrice).mul(positionSize))
                .toNumber();
            // return new Decimal( new Decimal(buyingPower * accountPercent).toNumber() / new Decimal(currPrice * positionSize).toNumber()).toNumber();
        });
    }
    getPositionQty(ticker) {
        return this.getPositions()
            .then((positions) => {
            var _a;
            let position = positions.find(pos => pos.symbol === ticker);
            return (_a = position === null || position === void 0 ? void 0 : position.qty) !== null && _a !== void 0 ? _a : 0;
        });
    }
    isMarketTime() {
        return this.getClock()
            .then(data => data.is_open);
    }
    getBuyingPower() {
        return this.getAccount()
            .then(res => res.buying_power);
    }
    getPriceByTicker(ticker) {
        return this._dataSource.getTickerByPrice(ticker);
        // return this.getTrades({
        //     symbol: ticker,
        //     start: new Date(),
        //     end: new Date()
        // })
        // .then(data => {
        //     return data.trades[0].p;
        // })
    }
    initialize() {
        return Promise.resolve()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, chalk_1.default.green(`${this.constructor.name}#initialize():SUCCESS`));
        });
    }
    close() {
        //This used to close the client.. We may need to track this internally now since the client itself doesn't provide this
        return bluebird_1.default.all([Promise.resolve()])
            .then(() => this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#close():SUCCESS`))
            .then(() => { });
    }
}
exports.AlpacasExchange = AlpacasExchange;
class PhonyExchange {
    constructor(options) {
        this.logger = options.logger;
        this.tickers = options.tickers || {};
    }
    initialize() {
        return Promise.resolve()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#intiialize():SUCCESS`);
        });
    }
    buy(something) {
        return Promise.resolve("");
    }
    getBuyingPower() {
        return Promise.resolve(99999999999999999999);
    }
    getPriceByTicker(ticker) {
        if (this.tickers.hasOwnProperty(ticker)) {
            return Promise.resolve(this.tickers[ticker]);
        }
        else {
            return Promise.resolve(200);
        }
    }
    isMarketTime() {
        return Promise.resolve(true);
    }
    sell(something) {
        return Promise.resolve("");
    }
    close() {
        return Promise.resolve();
    }
}
exports.PhonyExchange = PhonyExchange;
