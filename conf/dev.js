const joi = require('joi');
const { YahooGainersDataSource, PolygonGainersLosersDataSource } = require('../lib/data-source');
const path = require('path');
const winston = require('winston');
const { PhonyExchange } = require('../lib/exchange');
const { PhonyNotification } = require('../lib/notification');
const { TopGainerNotificationStockWorker } = require('../lib/workers');

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

const datasourceOptions = {
    logger,
    validationSchema: StockTickerSchema
}

const datasource = new PolygonGainersLosersDataSource(datasourceOptions);

const exchange = new PhonyExchange({
    logger
});

const notification = new PhonyNotification();

const serviceOptions = {
    concurrency: 1,
    logger,
    workerOptions: {
        tickTime: 1000
    },
    datasource,
    exchange,
    mainWorker: TopGainerNotificationStockWorker,
    purchaseOptions: {
        takeProfitPercentage: .015,
        stopLimitPercentage: .05,
        maxShareCount: 100,
        maxSharePrice: 20.00, //TODO: While we aren't using Alpaca to do the trading, let's simply make it this so we can get more tickers to look at manually on Robinhood
        prevStockPriceOptions: {
            unit: 1,
            measurement: "hour"
        }
    },
    notification
};

module.exports = serviceOptions;