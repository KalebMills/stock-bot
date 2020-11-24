import { StockService, StockServiceWorker, IStockServiceOptions, ITickerChange } from '../lib/stock-bot';
import winston from 'winston';
import { Logger } from '../lib/base';
import * as assert from 'assert';
import BPromise from 'bluebird';
import { AlpacasExchange } from '../lib/exchange';
import * as joi from 'joi';
import * as D from '../lib/data-source';
import * as N from '../lib/notification';

const logger: Logger = winston.createLogger({ transports: [ new winston.transports.Console() ] });

const baseOptions: D.IDataSourceOptions = {
    logger,
    scrapeUrl: '',
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
    },
    testing: true
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
    googleSheets: {
        id: '1gCdnOWYckCDZh5VTn3FaOasB4h3XXyBneg-gu6yT5Ag',
        authPath: '/home/keys/google-sheets-key.json'
    },
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
let worker: StockServiceWorker;


describe('#StockService', () => {
    it('Can create a StockService instance', () => {
        service = new StockService(serviceOptions);
        assert.strictEqual(service instanceof StockService, true, 'service is not StockService');
    });
});


describe('#StockWorker', () => {
    it('Can create a StockServiceWorker instance', () => {
        worker = new StockServiceWorker({
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
            exceptionHandler: (err: Error) => {},
            postTransaction: (data) => service.postTransaction(data)
        });
        assert.strictEqual(worker instanceof StockServiceWorker, true);
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