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
const assert = __importStar(require("assert"));
const exchange_1 = require("../lib/exchange");
const joi = __importStar(require("joi"));
const D = __importStar(require("../lib/data-source"));
const N = __importStar(require("../lib/notification"));
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
// TODO: Check if alpacas has a flag for a paper account, should assert that the key provided is for a paper account before running tests
const exchange = new exchange_1.AlpacasExchange({
    logger,
    keyId: (process.env['ALPACAS_API_KEY'] || ""),
    secretKey: (process.env['ALPACAS_SECRET_KEY'] || ""),
    acceptableGain: {
        unit: 8,
        type: 'percent'
    },
    acceptableLoss: {
        unit: 1,
        type: 'percent'
    }
});
const notification = new N.PhonyNotification();
const serviceOptions = {
    concurrency: 1,
    logger,
    workerOptions: {
        tickTime: 500 //ms
    },
    datasource,
    exchange,
    notification,
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
        assert.strictEqual(service instanceof stock_bot_1.StockService, true, 'service is not StockService');
    });
});
describe('#StockWorker', () => {
    it('Can create a StockServiceWorker instance', () => {
        worker = new workers_1.TopGainerNotificationStockWorker({
            _preProcessor: () => service.preProcess(),
            id: 'TEST',
            logger,
            tickTime: 1000,
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
            notification,
            exchange,
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
