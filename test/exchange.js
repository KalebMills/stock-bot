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
Object.defineProperty(exports, "__esModule", { value: true });
const winston = __importStar(require("winston"));
const exchange_1 = require("../lib/exchange");
const chai = __importStar(require("chai"));
describe('#PhonyExchange', () => {
    let exchange;
    it('Can construct a PhonyExchange', () => {
        exchange = new exchange_1.PhonyExchange({
            logger: winston.createLogger({
                transports: [new winston.transports.Console()],
            }),
            tickers: {
                'TEST': 100
            }
        });
        chai.assert.instanceOf(exchange, exchange_1.PhonyExchange);
    });
    it('Can initialize PhonyExchange', () => {
        return exchange.initialize();
    });
    it('Can getBuyingPower from PhonyExchange', () => {
        return exchange.getBuyingPower()
            .then(buyingPower => {
            chai.assert.equal(buyingPower, 99999999999999999999);
        });
    });
    it('Can getPriceByTicker', () => {
        return exchange.getPriceByTicker('TEST')
            .then(price => chai.assert.equal(price, exchange.tickers['TEST']));
    });
    it('Can check if isMarketTime', () => {
        return exchange.isMarketTime()
            .then(isMarketTime => chai.assert.equal(isMarketTime, true));
    });
    it('Can buy', () => {
        return exchange.buy('something');
    });
    it('Can sell', () => {
        return exchange.sell('something');
    });
    it('Can close', () => {
        return exchange.close();
    });
});
