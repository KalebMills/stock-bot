const joi = require('joi');
const { MockEventEmitter, PolygonLiveDataSource } = require('../lib/data-source');
const { MemoryDataStore } = require('../lib/data-store');
const path = require('path');
const fs = require('fs');
const { PhonyDiagnostic } = require('../lib/diagnostic');
const winston = require('winston');
const { PhonyExchange } = require('../lib/exchange');
const { PhonyNotification } = require('../lib/notification');
const { TopGainerNotificationStockWorker, LiveDataStockWorker } = require('../lib/workers');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            dirname: process.env['STOCK_LOG_DIR'] || path.join(__dirname, '..', 'logs'),
            filename: `${new Date().toISOString()}-${process.env['CONFIG_FILE'] || "LOCAL"}.log`
        })
    ],
    level: "silly",
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
    )
});

const StockTickerSchema = joi.object({
    ticker: joi.string().required(),
    price: joi.number().required(),
    percentChange: joi.object({
        percentChange: joi.number().required(),
        persuasion: joi.string().required() //TODO: Make this also validate the only two options
    })
}).required();

const datastore = new MemoryDataStore({
    logger
});

const date = new Date();

date.setDate(30)
date.setFullYear(2020)
date.setMonth(11)


console.log(date.toString())

const emitter = new MockEventEmitter({
    logger,
    ticker: 'IPDN',
    date,
    eventsPerSecond: 20
})

const datasource = new PolygonLiveDataSource({
    logger,
    tickers: [],
    validationSchema: joi.object({}),
    mockEmitter: emitter
})

const exchange = new PhonyExchange({
    logger
});

const notification = new PhonyNotification({
    logger
});

const diagnostic = new PhonyDiagnostic();

const serviceOptions = {
    concurrency: 10,
    logger,
    datasource,
    datastore,
    diagnostic,
    exchange,
    mainWorker: LiveDataStockWorker,
    purchaseOptions: {
        takeProfitPercentage: .015,
        stopLimitPercentage: .05,
        maxShareCount: 20,
        maxSharePrice: 100.00, //TODO: While we aren't using Alpaca to do the trading, let's simply make it this so we can get more tickers to look at manually on Robinhood
        prevStockPriceOptions: {
            unit: 10,
            measurement: "minute"
        }
    },
    notification
};

module.exports = serviceOptions;