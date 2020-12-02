import * as winston from 'winston';
import { PhonyExchange } from '../lib/exchange';
import * as chai from 'chai';



describe('#PhonyExchange', () => {
    let exchange: PhonyExchange;

    it('Can construct a PhonyExchange', () => {
        exchange = new PhonyExchange({
            logger: winston.createLogger({
                transports: [ new winston.transports.Console() ],
            }),
            tickers: {
                'TEST': 100
            }
        });

        chai.assert.instanceOf(exchange, PhonyExchange);
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
    })

});