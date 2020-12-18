const joi = require('joi');
const { PolygonLiveDataSource } = require('../lib/data-source');
const { MemoryDataStore, RedisDataStore } = require('../lib/data-store');
const path = require('path');
const winston = require('winston');
const { AlpacasExchange, PhonyExchange } = require('../lib/exchange');
const { DiscordNotification } = require('../lib/notification');
const { LiveDataStockWorker } = require('../lib/workers');
const fs = require('fs');

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

const data = fs.readFileSync(path.join(__dirname, '..', 'resources', 'tickers.txt')).toString().split('\n');

let t = [];

for (let ticker of data) {
    if (ticker.length < 5 && !ticker.includes('.') && !ticker.includes('-'))  {
        t.push(ticker);
    }
}

const datasourceOptions = {
    logger,
    //TODO: This needs to be changed to be an abstract method of the DataSource class
    validationSchema: joi.object({}),
    subscribeTicker: t
}

const datasource = new PolygonLiveDataSource(datasourceOptions);
// const datastore = new MemoryDataStore({
//     logger
// });

const datastore = new RedisDataStore({
    logger,
    host: 'localhost',
    port: 6379
})

//NOTE: Using this exchange because we only want this to run during market hours

const exchange = new AlpacasExchange({
    logger,
    keyId: (process.env['ALPACAS_API_KEY'] || ""),
    secretKey: (process.env['ALPACAS_SECRET_KEY'] || ""),
    acceptableGain: {
        unit: 3,
        type: 'percent'
    },
    acceptableLoss: {
        unit: 2,
        type: 'percent'
    }
});

const notification = new DiscordNotification({
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    logger,
    token: (process.env['DISCORD_API_KEY'] || "")
});

const serviceOptions = {
    concurrency: 10,
    logger,
    datasource,
    datastore,
    exchange,
    mainWorker: LiveDataStockWorker,
    notification
};

module.exports = serviceOptions;