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
const data_store_1 = require("../lib/data-store");
const util = __importStar(require("../lib/util"));
const joi = __importStar(require("joi"));
const chai = __importStar(require("chai"));
let logger = util.createLogger({});
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
let datastore = new data_store_1.PhonyDataStore({ logger });
let datasource = new data_source_1.PhonyDataSource({
    logger,
    validationSchema: joi.object()
});
describe('#LiveDataStockWorker', () => {
    const QUOTE_EVENT = {
        "ev": "Q",
        "sym": "MSFT",
        "bx": 4,
        "bp": 114.125,
        "bs": 100,
        "ax": 7,
        "ap": 114.128,
        "as": 160,
        "c": 0,
        "t": 1536036818784 // Quote Timestamp ( Unix MS )
    };
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
            exceptionHandler: (err) => { },
            _preProcessor: () => Promise.resolve(QUOTE_EVENT),
            dataSource: datasource
        });
        chai.assert.instanceOf(worker, workers_1.LiveDataStockWorker);
    });
    it('Can intiialize', () => {
        return worker.initialize();
    });
    it('Can process a QuoteEvent', () => {
        //This first one should skip processing and just write the event to the datastore
        return worker.process(QUOTE_EVENT)
            .then(() => {
            //increase value that would trigger the notification;
            notification.notify = (msg) => {
                return datastore.save('PURCHASE_MSFT', { buy: true })
                    .then(() => Promise.resolve());
            };
            const NEW_QUOTE_EVENT = Object.assign({}, QUOTE_EVENT);
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
            .then(() => Promise.all([exchange.close(), notification.close(), datastore.close(), datasource.close()]));
    });
});
