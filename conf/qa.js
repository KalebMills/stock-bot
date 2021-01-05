const joi = require('joi');
const { PolygonLiveDataSource } = require('../lib/data-source');
const { RedisDataStore, MemoryDataStore } = require('../lib/data-store');
const path = require('path');
const winston = require('winston');
const discord = require('discord.js');
const { PhonyExchange, AlpacasExchange } = require('../lib/exchange');
const { DiscordDiagnosticSystem } = require('../lib/diagnostic');
const { DiscordNotification, FileWriterNotification } = require('../lib/notification');
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

const data = fs.readFileSync(path.join(__dirname, '..', 'resources', 'tickers.txt')).toString().split('\n');

let t = [];

data.forEach((ticker, i) => {
    t.push(ticker);
});

const datasourceOptions = {
    logger,
    //TODO: This needs to be changed to be an abstract method of the DataSource class
    validationSchema: joi.object({}),
    tickers: t
}

const DISCORD_CLIENT = new discord.Client({});

const datasource = new PolygonLiveDataSource(datasourceOptions);

const datastore = new MemoryDataStore({
    logger
});

const diagnostic = new DiscordDiagnosticSystem({
    logger,
    token: (process.env['DISCORD_API_TOKEN'] || ""),
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    channelName: 'service-diagnostics',
    client: DISCORD_CLIENT
});


const exchange = new PhonyExchange({
    logger,
});

// const exchange = new AlpacasExchange({
//     logger,
//     acceptableGain: {
//         type: 'percent',
//         unit: 1
//     },
//     acceptableLoss: {
//         type: 'percent',
//         unit: 1
//     },
//     keyId: process.env['ALPACAS_API_KEY'],
//     secretKey: process.env['ALPACAS_SECRET_KEY']
// });

const notification = new DiscordNotification({
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    logger,
    token: (process.env['DISCORD_API_KEY'] || ""),
    channelName: 'stock-notifications',
    client: DISCORD_CLIENT
});


// TODO: Make a simulation.js config for running historical trade data
// const notification = new FileWriterNotification({
//     logger,
//     filePath: path.join(__dirname, '..', 'logs', 'notifications.txt')
// });

const serviceOptions = {
    concurrency: 10,
    logger,
    datasource,
    datastore,
    diagnostic,
    exchange,
    mainWorker: LiveDataStockWorker,
    notification
};


module.exports = serviceOptions;