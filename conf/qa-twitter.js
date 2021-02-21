const joi = require('joi');
const { TwitterDataSource, TwitterAccountType } = require('../lib/data-source');
const { RedisDataStore, MemoryDataStore } = require('../lib/data-store');
const path = require('path');
const winston = require('winston');
const discord = require('discord.js');
const { PhonyExchange, AlpacasExchange } = require('../lib/exchange');
const { DiscordDiagnosticSystem, PhonyDiagnostic } = require('../lib/diagnostic');
const { DiscordNotification } = require('../lib/notification');
const { SocialMediaWorker } = require('../lib/workers');
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

const prometheus_registry = new PrometheusMetricRegistry({
    logger,
    defaultLabels: [],
    metrics: [{
        name: 'tickerProcessTime',
        metric_name: 'ticker_process_time',
        description: 'Time taken to process a single ticker',
        type: SUPPORTED_PROMETHEUS_METRIC_TYPES.HISTOGRAM,
        labels: []
    }, {
        name: 'processablesByteSize',
        metric_name: 'processables_byte_size',
        description: 'Metric to track the size of the processables array',
        type: SUPPORTED_PROMETHEUS_METRIC_TYPES.GAUGE,
        labels: []
    }, {
        name: 'processedTickers',
        metric_name: 'processed_ticker_count',
        description: 'A metric to track the number of tickers processed',
        type: SUPPORTED_PROMETHEUS_METRIC_TYPES.COUNTER,
        labels: []
    }, {
        name: 'processingErrors',
        metric_name: 'processing_error_count',
        description: 'A metric to track the number of errors occurring during processing',
        type: SUPPORTED_PROMETHEUS_METRIC_TYPES.COUNTER,
        labels: ['errorType']
    }, {
        name: 'memoryStoreKeys',
        metric_name: 'memory_store_keys_count',
        description: 'A metric to track the number of keys in the memory store',
        type: SUPPORTED_PROMETHEUS_METRIC_TYPES.GAUGE,
        labels: []
    }, {
        name: 'memoryStoreSize', 
        metric_name: 'memory_store_byte_size',
        description: 'A metric to track the byte size of the memory datastore',
        type: SUPPORTED_PROMETHEUS_METRIC_TYPES.GAUGE,
        labels: []
    }]
});

const prometheus_metric_provider = new PrometheusMetricProvider({
    logger,
    port: 9091,
    registry: prometheus_registry
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

const datasource = new TwitterDataSource({
    logger,
    tickerList: t,
    validationSchema: joi.object({}),
    twitterAccounts: [{
        id: '1054561163843751936', //@ripster47
        type: TwitterAccountType.FAST_POSITION
    }],
    twitterKey: (process.env['TWITTER_API_KEY']),
    twitterSecret: (process.env['TWITTER_API_SECRET']),
    twitterAccessSecret: (process.env['TWITTER_ACCESS_SECRET']),
    twitterAccessToken: (process.env['TWITTER_ACCESS_TOKEN'])
});

// const datastore = new RedisDataStore({
//     host: 'localhost',
//     port: 6379,
//     logger
// });

const datastore = new MemoryDataStore({ logger, metric: prometheus_metric_provider });

const diagnostic = new DiscordDiagnosticSystem({
    logger,
    token: (process.env['DISCORD_API_TOKEN'] || ""),
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    channelName: 'service-diagnostics',
    client: DISCORD_CLIENT
});

// const diagnostic = new PhonyDiagnostic({
    
// });


const exchange = new PhonyExchange({
    logger,
});

// const exchange = new AlpacasExchange({
//     acceptableGain: {
//         type: 'percent',
//         unit: 1
//     },
//     acceptableLoss: {
//         type: 'percent',
//         unit: 1
//     },
//     logger,
//     keyId: process.env['ALPACAS_API_KEY'],
//     secretKey: process.env['ALPACAS_SECRET_KEY']
// })

const notification = new DiscordNotification({
    guildId: (process.env['DISCORD_GUILD_ID'] || ""),
    logger,
    token: (process.env['DISCORD_API_KEY'] || ""),
    channels: {
        "notificationChannel": "stock-notifications",
        "socialMediaChannel": "twitter"
    },
    client: DISCORD_CLIENT
});

const serviceOptions = {
    concurrency: 10,
    logger,
    datasource,
    datastore,
    diagnostic,
    exchange,
    mainWorker: SocialMediaWorker,
    notification,
    metric: prometheus_metric_provider
};


module.exports = serviceOptions;