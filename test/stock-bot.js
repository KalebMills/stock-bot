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
const stock_bot_1 = require("../lib/stock-bot");
const workers_1 = require("../lib/workers");
const winston_1 = __importDefault(require("winston"));
const base_1 = require("../lib/base");
const assert = __importStar(require("assert"));
const exchange_1 = require("../lib/exchange");
const joi = __importStar(require("joi"));
const D = __importStar(require("../lib/data-source"));
const N = __importStar(require("../lib/notification"));
const data_store_1 = require("../lib/data-store");
const diagnostic_1 = require("../lib/diagnostic");
const metrics_1 = require("../lib/metrics");
const logger = winston_1.default.createLogger({ transports: [new winston_1.default.transports.Console()] });
const baseOptions = {
    logger,
    validationSchema: joi.object({
        ticker: joi.string().required(),
        price: joi.number().required()
    })
};
class FakeDatasource extends D.DataSource {
    constructor(options) {
        super(options);
    }
    scrapeDatasource() {
        return Promise.resolve([]);
    }
}
const datasource = new FakeDatasource(baseOptions);
const diagnostic = new diagnostic_1.PhonyDiagnostic();
const metric = new metrics_1.PhonyMetricProvider({ logger });
const dataStore = new data_store_1.PhonyDataStore({
    logger,
    metric
});
// TODO: Check if alpacas has a flag for a paper account, should assert that the key provided is for a paper account before running tests
const exchange = new exchange_1.PhonyExchange({
    logger
});
const notification = new N.PhonyNotification({
    logger
});
const serviceOptions = {
    concurrency: 0,
    logger,
    //@ts-ignore
    workerOptions: {},
    datasource,
    //@ts-ignore Right now it expects an instanceof AlpacasExchange
    exchange,
    notification,
    diagnostic,
    //@ts-ignore
    mainWorker: workers_1.TopGainerNotificationStockWorker,
    purchaseOptions: {
        takeProfitPercentage: .05,
        stopLimitPercentage: .07,
        maxShareCount: 1,
        maxSharePrice: 15.00,
        prevStockPriceOptions: {
            unit: 5,
            measurement: "hours"
        }
    }
};
let service;
let worker;
describe('#StockService', () => {
    it('Can create a StockService instance', () => {
        service = new stock_bot_1.StockService(serviceOptions);
        service.isClosed = true; //Blocks preProcess from recursively running
        assert.strictEqual(service instanceof stock_bot_1.StockService, true, 'service is not StockService');
    });
    //Need to find a better way to test this
    // it('Can initialize the StockService', () => service.initialize());
    it('Can filter out timedout tickers properly', () => {
        // service.datasource.timeoutTicker('APPL', 60000);
        service.datasource.timeoutTicker('MSFT', 60000);
        let TICKER = 'MSFT';
        service.fetchWork = function () {
            //The first time this is called, it will output MSFT as the ticker, all the next times, it will be APPL since TICKER variable is only reassigned once
            return Promise.resolve([{
                    ticker: TICKER,
                    price: 10000000,
                    percentChange: {
                        percentChange: 4,
                        persuasion: 'up'
                    }
                }])
                .then((data) => {
                TICKER = 'APPL';
                return data;
            });
        };
        service.isClosed = false;
        service.logger.log(base_1.LogLevel.INFO, `service.process() called below me`);
        return service.fetchWork() //Fill this.processables
            .then(() => service.preProcess()) //Make sure the work passes through the filter logic
            .then(work => {
            //Assert we only recieve APPL, and that the MSFT piece of work was filtered out of the array
            assert.deepStrictEqual(service['processables'].length === 0, true, 'service.processables.length is not 0');
            assert.deepStrictEqual(work.ticker === 'APPL', true, 'The received ticker is not APPL');
            return service.close();
        })
            .then(() => {
            Object.keys(service.datasource.timedOutTickers).forEach(key => {
                service.datasource.timedOutTickers.delete(key);
            });
        })
            .then(() => {
            service.isClosed = false;
        })
            .then(() => service.preProcess())
            .then(work => {
            assert.deepStrictEqual(work.ticker === 'APPL', true);
            return service.close();
        });
    }).timeout(10000);
    it('Can close the StockService', () => {
        return service.close();
    });
});
describe('#StockWorker', () => {
    it('Can create a StockServiceWorker instance', () => {
        worker = new workers_1.TopGainerNotificationStockWorker({
            //@ts-ignore //UNUSED
            _preProcessor: () => { },
            id: 'TEST',
            logger,
            purchaseOptions: {
                maxShareCount: 1,
                maxSharePrice: 1.00,
                takeProfitPercentage: .1,
                stopLimitPercentage: .1,
                prevStockPriceOptions: {
                    measurement: 'hour',
                    unit: 1
                }
            },
            dataStore,
            notification,
            //@ts-ignore Expects instanceof AlpacasExchange
            exchange,
            dataSource: datasource,
            exceptionHandler: (err) => { }
        });
        assert.strictEqual(worker instanceof workers_1.TopGainerNotificationStockWorker, true);
    });
    it('getChangePercent() can accurately return a percentage of change, as well as the persuasion', () => {
        // prevPrice, currentPrice, expected change%, change persuasion
        let fakeData = [
            [50, 75, .5, "up"],
            [56.23, 52.43, .068, "down"],
            [.95, .66, .305, "down"],
            [.34, 1.44, 3.235, "up"]
        ];
        fakeData.forEach((set) => {
            let val = worker.getChangePercent(set[0], set[1]);
            assert.strictEqual(val.percentChange === set[2], true);
            assert.strictEqual(val.persuasion === set[3], true);
        });
    });
});
