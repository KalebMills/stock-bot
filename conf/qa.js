const joi = require('joi');
const { PolygonLiveDataSource } = require('../lib/data-source');
const { RedisDataStore, MemoryDataStore } = require('../lib/data-store');
const path = require('path');
const winston = require('winston');
const discord = require('discord.js');
const { PhonyExchange, AlpacasExchange } = require('../lib/exchange');
const { DiscordDiagnosticSystem } = require('../lib/diagnostic');
const { DiscordNotification } = require('../lib/notification');
const { LiveDataStockWorker } = require('../lib/workers');
const { PrometheusMetricRegistry, PrometheusMetricProvider, SUPPORTED_PROMETHEUS_METRIC_TYPES } = require('../lib/metrics');
const fs = require('fs');

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            dirname: process.env['STOCK_LOG_DIR'] || path.join(__dirname, '..', 'logs'),
            filename: `${new Date().toISOString()}-${process.env['CONFIG_FILE'] || "LOCAL"}.log`,
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple(),
                winston.format.timestamp()
            )
        })
    ],
    level: "info",
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.timestamp()
    )
});

const data = fs.readFileSync(path.join(__dirname, '..', 'resources', 'tickers.txt')).toString().split('\n');

let t = [];

data.forEach((ticker, i) => {
    if (ticker.length <= 4 && !(t.includes('-'))) {
        t.push(ticker);
    }
});

const datasourceOptions = {
    logger,
    //TODO: This needs to be changed to be an abstract method of the DataSource class
    validationSchema: joi.object({}),
    subscribeTicker: t
}

const DISCORD_CLIENT = new discord.Client({});

const datasource = new PolygonLiveDataSource(datasourceOptions);

// const datastore = new RedisDataStore({
//     host: 'localhost',
//     port: 6379,
//     logger
// });

const datastore = new MemoryDataStore({ logger });

const diagnostic = new DiscordDiagnosticSystem({
    logger,
    token: (process.env['DISCORD_API_TOKEN'] || ""),
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    channelName: 'service-diagnostics',
    client: DISCORD_CLIENT
});


// const exchange = new PhonyExchange({
//     logger,
// });

const exchange = new AlpacasExchange({
    acceptableGain: {
        type: 'percent',
        unit: 1
    },
    acceptableLoss: {
        type: 'percent',
        unit: 1
    },
    logger,
    keyId: process.env['ALPACAS_API_KEY'],
    secretKey: process.env['ALPACAS_SECRET_KEY']
})

const notification = new DiscordNotification({
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    logger,
    token: (process.env['DISCORD_API_KEY'] || ""),
    channelName: 'stock-notifications',
    client: DISCORD_CLIENT
});

const prometheus_registry = new PrometheusMetricRegistry({
    logger,
    defaultLabels: [],
    metrics: [
        {
            name: 'processablesByteSize',
            metric_name: 'processables_byte_size',
            description: 'Metric to track the size of the processables array',
            type: SUPPORTED_PROMETHEUS_METRIC_TYPES.HISTOGRAM.toString(),
            labels: []
        },
        {
            name: 'tickerProcessTime',
            metric_name: 'ticker_process_time',
            description: 'Time taken to process a single ticker',
            type: SUPPORTED_PROMETHEUS_METRIC_TYPES.HISTOGRAM.toString(),
            labels: []
        }
    ]
});

const prometheus_metric_provider = new PrometheusMetricProvider({
    logger,
    port: 9090,
    registry: prometheus_registry
});


const serviceOptions = {
    concurrency: 10,
    logger,
    datasource,
    datastore,
    diagnostic,
    exchange,
    mainWorker: LiveDataStockWorker,
    notification,
    metric: prometheus_metric_provider
};


module.exports = serviceOptions;