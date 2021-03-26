import { StockService, IStockServiceOptions, ITickerChange } from '../lib/stock-bot';
import { TopGainerNotificationStockWorker } from '../lib/workers';
import winston from 'winston';
import { Logger, LogLevel } from '../lib/base';
import * as assert from 'assert';
import BPromise from 'bluebird';
import { AlpacasExchange, PhonyExchange } from '../lib/exchange';
import * as joi from 'joi';
import * as D from '../lib/data-source';
import * as N from '../lib/notification';
import { PhonyDataStore } from '../lib/data-store';
import { PhonyDiagnostic } from '../lib/diagnostic';
import { PhonyMetricProvider } from '../lib/metrics';

const logger: Logger = winston.createLogger({ transports: [ new winston.transports.Console() ] });

const baseOptions: D.IDataSourceOptions = {
    logger,
    validationSchema: joi.object({
        ticker: joi.string().required(),
        price: joi.number().required()
    }),
    commandClient: new N.PhonyCommandClient()
}

class FakeDatasource extends D.DataSource<ITickerChange> {
    constructor(options: D.IDataSourceOptions) {
        super(options);
    }

    scrapeDatasource(): Promise<ITickerChange[]> {
        return Promise.resolve([]);
    }
}

const datasource = new FakeDatasource(baseOptions);
const diagnostic = new PhonyDiagnostic();
const metric = new PhonyMetricProvider({ logger });

const dataStore = new PhonyDataStore({
    logger,
    metric
});

// TODO: Check if alpacas has a flag for a paper account, should assert that the key provided is for a paper account before running tests
const exchange = new PhonyExchange({
    logger
});

const notification = new N.PhonyNotification({
    logger
});

const serviceOptions: IStockServiceOptions = {
    concurrency: 0,
    logger,
    //@ts-ignore
    workerOptions: {},
    datasource,
    //@ts-ignore Right now it expects an instanceof AlpacasExchange
    exchange,
    notification,
    metric,
    diagnostic,
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
    },
    accountPercent: 0.01,
    commandClient: new N.PhonyCommandClient()
}
let service: StockService;
let worker: TopGainerNotificationStockWorker;


describe('#StockService', () => {
    it('Can create a StockService instance', () => {
        service = new StockService(serviceOptions);
        service.isClosed = true; //Blocks preProcess from recursively running
        assert.strictEqual(service instanceof StockService, true, 'service is not StockService');
    });

    //Need to find a better way to test this
    // it('Can initialize the StockService', () => service.initialize());

    it('Can filter out timedout tickers properly', () => {
        // service.datasource.timeoutTicker('APPL', 60000);
        service.datasource.timeoutTicker('MSFT', 60000);
        let TICKER: string = 'MSFT';

        service.fetchWork = function() {

            //The first time this is called, it will output MSFT as the ticker, all the next times, it will be APPL since TICKER variable is only reassigned once
            return Promise.resolve<ITickerChange[]>([{
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
            })
        }

        service.isClosed = false;
        service.logger.log(LogLevel.INFO, `service.process() called below me`)
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
            return service.close()
        });
    }).timeout(10000);

    it('Can close the StockService', () => {
        return service.close();
    });
});


describe('#StockWorker', () => {
    it('Can create a StockServiceWorker instance', () => {
        worker = new TopGainerNotificationStockWorker({
            //@ts-ignore //UNUSED
            _preProcessor: () => {},
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