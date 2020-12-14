import { LiveDataStockWorker, QuoteEvent } from '../lib/workers';
import { AlpacasExchange } from '../lib/exchange';
import { NotificationOptions, PhonyNotification } from '../lib/notification';
import { PhonyDataSource } from '../lib/data-source';
import { PhonyDataStore } from '../lib/data-store';
import * as util from '../lib/util';
import * as joi from 'joi';
import * as chai from 'chai';
import { Quote } from '@master-chief/alpaca/types/entities';

let logger = util.createLogger({});

let exchange = new AlpacasExchange({
    logger,
    acceptableGain: {
        type: 'percent',
        unit: 3
    },
    acceptableLoss: {
        type: 'percent',
        unit: 2
    },
    keyId: (process.env['ALPACAS_API_KEY'] || ""),
    secretKey: (process.env['ALPACAS_SECRET_KEY'] || "")
})
let notification = new PhonyNotification({ logger });
let datastore = new PhonyDataStore({ logger });
let datasource = new PhonyDataSource({
    logger,
    validationSchema: joi.object()
});

describe('#LiveDataStockWorker', () => {

    const QUOTE_EVENT: QuoteEvent = {
        "ev": "Q",              // Event Type
        "sym": "MSFT",          // Symbol Ticker
        "bx": 4,                // Bix Exchange ID
        "bp": 114.125,          // Bid Price
        "bs": 100,              // Bid Size
        "ax": 7,                // Ask Exchange ID
        "ap": 114.128,          // Ask Price
        "as": 160,              // Ask Size
        "c": 0,                 // Quote Condition
        "t": 1536036818784      // Quote Timestamp ( Unix MS )
    }

    before(() => {
        return Promise.all([ exchange.initialize(), notification.initialize(), datastore.initialize(), datasource.initialize() ]);
    });

    after(() => {
        return Promise.all([ exchange.close(), notification.close(), datastore.close(), datasource.close() ])
    })

    let worker: LiveDataStockWorker;
    it('Can construct an instance of LiveDataStockWorker', () => {
        worker = new LiveDataStockWorker({
            dataStore: datastore,
            exchange,
            logger,
            id: 'TEST',
            notification,
            tickTime: 0,
            purchaseOptions: {
                maxShareCount: 1,
                maxSharePrice: 1,
                prevStockPriceOptions: {
                    measurement: 'minute',
                    unit: 1
                },
                stopLimitPercentage: .2,
                takeProfitPercentage: 2
            },
            exceptionHandler: (err) => {},
            _preProcessor: () => Promise.resolve(QUOTE_EVENT),
            dataSource: datasource
        });

        chai.assert.instanceOf(worker, LiveDataStockWorker);
    });

    it('Can intiialize', () => {
        return worker.initialize();
    });

    it('Can process a QuoteEvent', () => {

        //This first one should skip processing and just write the event to the datastore
        return worker.process(QUOTE_EVENT)
        .then(() => {
            //increase value that would trigger the notification;
            notification.notify = (msg: NotificationOptions) => {
                return datastore.save('PURCHASE_MSFT', { buy: true })
                .then(() => Promise.resolve());
            }
            const NEW_QUOTE_EVENT: QuoteEvent = { ...QUOTE_EVENT };
            NEW_QUOTE_EVENT.ap = 1000;
            NEW_QUOTE_EVENT.t = QUOTE_EVENT.t + 180;

            return worker.process(NEW_QUOTE_EVENT)
            .then(() => datastore.get('PURCHASE_MSFT'))
            .then((data) => {
                if (!(data.length > 0)) {
                    chai.assert.fail('There was no purchase flag for MSFT');
                }
            });
        });
    });


    it('Can close', () => {
        return worker.close()
        .then(() => Promise.all([ exchange.close(), notification.close(), datastore.close(), datasource.close() ]))
    });
});