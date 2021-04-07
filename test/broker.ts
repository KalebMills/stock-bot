import * as winston from 'winston';
import { PhonyBroker } from '../lib/broker';
import * as chai from 'chai';



describe('#PhonyBroker', () => {
    let broker: PhonyBroker;

    it('Can construct a PhonyBroker', () => {
        broker = new PhonyBroker({
            logger: winston.createLogger({
                transports: [ new winston.transports.Console() ],
            }),
            tickers: {
                'TEST': 100
            }
        });

        chai.assert.instanceOf(broker, PhonyBroker);
    });

    it('Can initialize PhonyBroker', () => {
        return broker.initialize();
    });

    it('Can getBuyingPower from PhonyBroker', () => {
        return broker.getBuyingPower()
        .then(buyingPower => {
            chai.assert.equal(buyingPower, 99999999999999999999);
        });
    });

    it('Can getPriceByTicker', () => {
        return broker.getPriceByTicker('TEST')
        .then(price => chai.assert.equal(price, broker.tickers['TEST']));
    });

    it('Can check if isMarketTime', () => {
        return broker.isMarketTime()
        .then(isMarketTime => chai.assert.equal(isMarketTime, true));
    });

    it('Can buy', () => {
        return broker.buy('something');
    });

    it('Can sell', () => {
        return broker.sell('something');
    });

    it('Can close', () => {
        return broker.close();
    });
});