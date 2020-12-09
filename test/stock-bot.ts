import { StockService, IStockServiceOptions, ITickerChange } from '../lib/stock-bot';
import { TopGainerNotificationStockWorker } from '../lib/workers';
import winston from 'winston';
import { Logger } from '../lib/base';
import * as assert from 'assert';
import BPromise from 'bluebird';
import { AlpacasExchange } from '../lib/exchange';
import * as joi from 'joi';
import * as D from '../lib/data-source';
import * as N from '../lib/notification';
import { PhonyDataStore } from '../lib/data-store';

const logger: Logger = winston.createLogger({ transports: [ new winston.transports.Console() ] });

const baseOptions: D.IDataSourceOptions = {
    logger,
    validationSchema: joi.object({
        ticker: joi.string().required(),
        price: joi.number().required()
    })
}

class FakeDatasource extends D.DataSource {
    constructor(options: D.IDataSourceOptions) {
        super(options);
    }

    scrapeDatasource(): Promise<ITickerChange[]> {
        return Promise.resolve([]);
    }
}

const datasource = new FakeDatasource(baseOptions);

const dataStore = new PhonyDataStore();

// TODO: Check if alpacas has a flag for a paper account, should assert that the key provided is for a paper account before running tests
const exchange = new AlpacasExchange({
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

const serviceOptions: IStockServiceOptions = {
    concurrency: 1,
    logger,
    workerOptions: {
        tickTime: 500 //ms
    },
    datasource,
    exchange,
    notification,
    //@ts-ignore
    mainWorker: TopGainerNotificationStockWorker,
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
}
let service: StockService;
let worker: TopGainerNotificationStockWorker;


describe('#StockService', () => {
    it('Can create a StockService instance', () => {
        service = new StockService(serviceOptions);
        assert.strictEqual(service instanceof StockService, true, 'service is not StockService');
    });
});


describe('#StockWorker', () => {
    it('Can create a StockServiceWorker instance', () => {
        worker = new TopGainerNotificationStockWorker({
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
            dataStore,
            notification,
            exchange,
            exceptionHandler: (err: Error) => {}
        });
        assert.strictEqual(worker instanceof TopGainerNotificationStockWorker, true);
    });

    it('getChangePercent() can accurately return a percentage of change, as well as the persuasion', () => {
                    // prevPrice, currentPrice, expected change%, change persuasion
        let fakeData: [number, number, number, "up" | "down"][] = [
            [50, 75, .5, "up"],
            [56.23, 52.43, .068, "down"],
            [.95, .66, .305, "down"],
            [.34, 1.44, 3.235, "up"]
        ];

        fakeData.forEach((set) => {
            let val = worker.getChangePercent(set[0], set[1]);
            assert.strictEqual(val.percentChange === set[2] , true);
            assert.strictEqual(val.persuasion === set[3], true);
        })
    })
});