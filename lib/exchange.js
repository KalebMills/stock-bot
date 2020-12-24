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
class AlpacasExchange extends Alpacas.AlpacaClient {
    constructor(options) {
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
    }
    //TODO: Add in the functionality to get data for a ticker, buy, and sell. An exchange may also need a way to keep it's equity value???
    buy(args) {
        const currStockPrice = 0; //Place holder until we have the ability to fetch that stocks current price
        let takeProfitLimitPrice = currStockPrice + (currStockPrice * .3); //BAD, this should be passed in
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
    isMarketTime() {
        return Promise.resolve(true);
        // return this.getClock()
        // .then(data => data.is_open);
    }
    getBuyingPower() {
        return this.getAccount()
            .then(res => res.daytrading_buying_power);
    }
    getPriceByTicker(ticker) {
        return this.getLastTrade({ symbol: ticker })
            .then((trade) => trade.last.price);
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
