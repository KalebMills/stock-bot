import { LiveDataStockWorker, QuoteEvent, TradeEvent } from '../lib/workers';
import { AlpacasBroker } from '../lib/broker';
import { NotificationOptions, PhonyCommandClient, PhonyNotification } from '../lib/notification';
import { DataSource, PhonyDataSource } from '../lib/data-source';
import { PhonyMetricProvider } from '../lib/metrics';
import { PhonyDataStore } from '../lib/data-store';
import * as util from '../lib/util';
import * as joi from 'joi';
import * as chai from 'chai';

let logger = util.createLogger({});

let metric = new PhonyMetricProvider({ logger });

let broker = new AlpacasBroker({
    logger,
    keyId: (process.env['ALPACAS_API_KEY'] || ""),
    secretKey: (process.env['ALPACAS_SECRET_KEY'] || ""),
    commandClient: new PhonyCommandClient()
})
let notification = new PhonyNotification({ logger });
let datastore = new PhonyDataStore({ logger, metric });

// const QUOTE_EVENT: QuoteEvent = {
//         "ev": "Q",              // Event Type
//         "sym": "MSFT",          // Symbol Ticker
//         "bx": 4,                // Bix Exchange ID
//         "bp": 114.125,          // Bid Price
//         "bs": 100,              // Bid Size
//         "ax": 7,                // Ask Exchange ID
//         "ap": 114.128,          // Ask Price
//         "as": 160,              // Ask Size
//         "c": 0,                 // Quote Condition
//         "t": 1536036818784      // Quote Timestamp ( Unix MS )
//     }

const TRADE_EVENT: TradeEvent = {
    "ticker": 'MSFT',
    "ev": "T",              // Event Type
    "sym": "MSFT",          // Symbol Ticker
    "x": 4,                 // Exchange ID
    "i": "12345",           // Trade ID
    "z": 3,                 // Tape ( 1=A 2=B 3=C)
    "p": 114.125,           // Price
    "s": 100,               // Trade Size
    "c": [0, 12],           // Trade Conditions
    "t": 1536036818784      // Trade Timestamp ( Unix MS )
}

//@ts-ignore annoying typing error for some reason
let datasource: PhonyDataSource<TradeEvent> = new PhonyDataSource<TradeEvent>({
    logger,
    returnData: TRADE_EVENT,
    validationSchema: joi.object(),
});

describe('#LiveDataStockWorker', () => {

    before(() => {
        return Promise.all([ broker.initialize(), notification.initialize(), datastore.initialize(), datasource.initialize() ]);
    });

    after(() => {
        return Promise.all([ broker.close(), notification.close(), datastore.close(), datasource.close() ])
    })

    let worker: LiveDataStockWorker;
    it('Can construct an instance of LiveDataStockWorker', () => {
        worker = new LiveDataStockWorker({
            dataStore: datastore,
            broker,
            logger,
            id: 'TEST',
            notification,
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
            _preProcessor: () => Promise.resolve(TRADE_EVENT),
            dataSource: datasource,
            metric,
            accountPercent: .1
        });

        chai.assert.instanceOf(worker, LiveDataStockWorker);
    });

    it('Can intiialize', () => {
        return worker.initialize();
    });


    // TODO: Need to find a way for this test to work with the historic data required by the indicators
    // it('Can process a Trade Event', () => {
    //     //@ts-ignore
    //     worker.exchange.placeOrder = () => Promise.resolve();

    //     //increase value that would trigger the notification;
    //     worker.notification.notify = (msg: NotificationOptions) => {
    //         return datastore.save('PURCHASE_MSFT', { buy: true })
    //         .then(() => Promise.resolve());
    //     }

    //     //This first one should skip processing and just write the event to the datastore
    //     return worker.process(TRADE_EVENT)
    //     .then(() => {
    //         const NEW_TRADE_EVENT: TradeEvent = { ...TRADE_EVENT };
    //         NEW_TRADE_EVENT.p = 1000;
    //         NEW_TRADE_EVENT.t = TRADE_EVENT.t + 1800;

    //         return worker.process(NEW_TRADE_EVENT)
    //         .then(() => datastore.get('PURCHASE_MSFT'))
    //         .then((data) => {
    //             if (!(data.length > 0)) {
    //                 chai.assert.fail('There was no purchase flag for MSFT');
    //             }
    //         });
    //     });
    // });

    it('Can properly calculate _getChangePercentPerMinute', () => {
        let currentTrade: TradeEvent = {
            p: 104.14,
            c: [],
            ev: '',
            i: '',
            s: 0,
            sym: 'TEST',
            t: new Date().getTime(),
            ticker: 'TEST',
            x: 0,
            z: 0
        }

        let previousTrade: TradeEvent = {
            p: 104.13,
            c: [],
            ev: '',
            i: '',
            s: 0,
            sym: 'TEST',
            t: new Date().getTime() - (180 * 1000),
            ticker: 'TEST',
            x: 0,
            z: 0
        }

        let output = worker._getChangePercentPerMinute(currentTrade, previousTrade);

        chai.assert.equal(Number(output.toFixed(5)), 0.0032);
    });


    it('Can close', () => {
        return worker.close()
        .then(() => Promise.all([ broker.close(), notification.close(), datastore.close(), datasource.close() ]))
    });
});