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
const workers_1 = require("../lib/workers");
const exchange_1 = require("../lib/exchange");
const notification_1 = require("../lib/notification");
const data_source_1 = require("../lib/data-source");
const metrics_1 = require("../lib/metrics");
const data_store_1 = require("../lib/data-store");
const util = __importStar(require("../lib/util"));
const joi = __importStar(require("joi"));
const chai = __importStar(require("chai"));
let logger = util.createLogger({});
let metric = new metrics_1.PhonyMetricProvider({ logger });
let exchange = new exchange_1.AlpacasExchange({
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
});
let notification = new notification_1.PhonyNotification({ logger });
let datastore = new data_store_1.PhonyDataStore({ logger, metric });
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
const TRADE_EVENT = {
    "ticker": 'MSFT',
    "ev": "T",
    "sym": "MSFT",
    "x": 4,
    "i": "12345",
    "z": 3,
    "p": 114.125,
    "s": 100,
    "c": [0, 12],
    "t": 1536036818784 // Trade Timestamp ( Unix MS )
};
//@ts-ignore annoying typing error for some reason
let datasource = new data_source_1.PhonyDataSource({
    logger,
    returnData: TRADE_EVENT,
    validationSchema: joi.object(),
});
describe('#LiveDataStockWorker', () => {
    before(() => {
        return Promise.all([exchange.initialize(), notification.initialize(), datastore.initialize(), datasource.initialize()]);
    });
    after(() => {
        return Promise.all([exchange.close(), notification.close(), datastore.close(), datasource.close()]);
    });
    let worker;
    it('Can construct an instance of LiveDataStockWorker', () => {
        worker = new workers_1.LiveDataStockWorker({
            dataStore: datastore,
            exchange,
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
            exceptionHandler: (err) => { },
            _preProcessor: () => Promise.resolve(TRADE_EVENT),
            dataSource: datasource,
            metric
        });
        chai.assert.instanceOf(worker, workers_1.LiveDataStockWorker);
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
        let currentTrade = {
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
        };
        let previousTrade = {
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
        };
        let output = worker._getChangePercentPerMinute(currentTrade, previousTrade);
        chai.assert.equal(Number(output.toFixed(5)), 0.0032);
    });
    it('Can close', () => {
        return worker.close()
            .then(() => Promise.all([exchange.close(), notification.close(), datastore.close(), datasource.close()]));
    });
});
