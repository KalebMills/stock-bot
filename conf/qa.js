const joi = require('joi');
const { PolygonLiveDataSource } = require('../lib/data-source');
const { RedisDataStore } = require('../lib/data-store');
const path = require('path');
const winston = require('winston');
const discord = require('discord.js');
const { PhonyExchange } = require('../lib/exchange');
const { DiscordDiagnosticSystem } = require('../lib/diagnostic');
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

const data = fs.readFileSync(path.join(__dirname, '..', 'resources', 'tickers.txt')).toString().split('\n');

let t = [];

for (let ticker of data) {
    t.push(ticker);
}

const datasourceOptions = {
    logger,
    //TODO: This needs to be changed to be an abstract method of the DataSource class
    validationSchema: joi.object({}),
    subscribeTicker: t
}

const DISCORD_CLIENT = new discord.Client({});

const datasource = new PolygonLiveDataSource(datasourceOptions);

const datastore = new RedisDataStore({
    host: 'localhost',
    port: 6379,
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

const notification = new DiscordNotification({
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    logger,
    token: (process.env['DISCORD_API_KEY'] || ""),
    channelName: 'stock-notifications',
    client: DISCORD_CLIENT
});


const serviceOptions = {
    concurrency: 1,
    logger,
    datasource,
    datastore,
    diagnostic,
    exchange,
    mainWorker: LiveDataStockWorker,
    notification
};


module.exports = serviceOptions;