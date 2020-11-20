// import { StockService } from '../lib/stock-bot';
// import { AlpacasExchange } from '../lib/exchange';
// import * as winston from 'winston';
// import * as path from 'path';
// import color from 'chalk';
// import { YahooGainersDataSource } from '../lib/data-source';
// import * as joi from 'joi';

const joi = require('joi');
const { YahooGainersDataSource } = require('../lib/data-source');
const path = require('path');
const winston = require('winston');
const { AlpacasExchange } = require('../lib/exchange');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            dirname: process.env['STOCK_LOG_DIR'] || path.join(__dirname, '..', 'logs'),
            filename: `${new Date().toISOString()}-${process.env['CONFIG_FILE'] || "LOCAL"}.log`
        })
    ],
    level: "info",
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
    scrapeUrl: 'https://finance.yahoo.com/gainers',
    validationSchema: StockTickerSchema
}

const datasource = new YahooGainersDataSource(datasourceOptions);

const exchange = new AlpacasExchange({
    logger, 
    keyId: (process.env['ALPACAS_API_KEY'] || ""),
    secretKey: (process.env['ALPACAS_SECRET_KEY'] || ""),
    acceptableGain: {
        unit: 1,
        type: 'percent'
    },
    acceptableLoss: {
        unit: 2,
        type: 'percent'
    },
    testing: true
});

const serviceOptions = {
    concurrency: 1,
    logger,
    workerOptions: {
        tickTime: 1000
    },
    datasource,
    exchange,
    googleSheets: {
        id: 'ID',
        authPath: '/home/keys/google-sheets-key.json'
    },
    purchaseOptions: {
        takeProfitPercentage: .015,
        stopLimitPercentage: .05,
        maxShareCount: 100,
        maxSharePrice: 20.00, //TODO: While we aren't using Alpaca to do the trading, let's simply make it this so we can get more tickers to look at manually on Robinhood
        prevStockPriceOptions: {
            unit: 1,
            measurement: "hour"
        }
    }
};

module.exports = serviceOptions;