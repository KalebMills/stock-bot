"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhonyMetricProvider = exports.MetricProviderRegistry = exports.PrometheusMetricService = exports.isRegisteredLabels = exports.PrometheusHistogramMetric = exports.PrometheusGaugeMetric = exports.PrometheusCounterMetric = exports.PrometheusMetricProvider = exports.PrometheusMetricRegistry = exports.SUPPORTED_PROMETHEUS_METRIC_TYPES = void 0;
const base_1 = require("./base");
const express_1 = __importDefault(require("express"));
const prom = __importStar(require("prom-client"));
const exceptions_1 = require("./exceptions");
var SUPPORTED_PROMETHEUS_METRIC_TYPES;
(function (SUPPORTED_PROMETHEUS_METRIC_TYPES) {
    SUPPORTED_PROMETHEUS_METRIC_TYPES["GAUGE"] = "gauge";
    SUPPORTED_PROMETHEUS_METRIC_TYPES["COUNTER"] = "counter";
    SUPPORTED_PROMETHEUS_METRIC_TYPES["HISTOGRAM"] = "histogram";
})(SUPPORTED_PROMETHEUS_METRIC_TYPES = exports.SUPPORTED_PROMETHEUS_METRIC_TYPES || (exports.SUPPORTED_PROMETHEUS_METRIC_TYPES = {}));
class PrometheusMetricRegistry {
    constructor(options) {
        this._metrics = options.metrics;
        this._registry = new prom.Registry();
        this._registeredMetrics = new Map();
        //Register our metrics
        this._metrics.forEach(metricOptions => {
            this.registerMetric(metricOptions);
        });
    }
    initialize() {
        return Promise.resolve();
    }
    registerMetric(options) {
        //TODO: Should add some validation here
        const { type, name } = options;
        const MAP = {
            "gauge": PrometheusGaugeMetric,
            "counter": PrometheusCounterMetric,
            "histogram": PrometheusHistogramMetric
        };
        let metric = new MAP[type](options, this._registry);
        this._registeredMetrics.set(name, metric);
    }
    hasMetric(metricName) {
        return this._registeredMetrics.has(metricName);
    }
    getMetric(name) {
        if (this.hasMetric(name)) {
            return this._registeredMetrics.get(name);
        }
        else {
            throw new exceptions_1.InvalidConfigurationError(`${name} has not been registered to ${this.constructor.name}`);
        }
    }
    getPrometheusRegistry() {
        return this._registry;
    }
    close() {
        return Promise.resolve();
    }
}
exports.PrometheusMetricRegistry = PrometheusMetricRegistry;
//Make MetricService a constructed class internally
class PrometheusMetricProvider {
    constructor(options) {
        this.port = options.port;
        this._registry = options.registry;
        this.logger = options.logger;
        this._metricService = new PrometheusMetricService({
            logger: this.logger,
            port: this.port,
            registry: this._registry
        });
    }
    initialize() {
        return this._metricService.initialize();
    }
    push(options) {
        Object.keys(options).forEach(metricName => {
            let metric = this._registry.getMetric(metricName);
            let metricOptions = options[metricName];
            if (!metricOptions.hasOwnProperty('labels')) {
                metricOptions.labels = {};
            }
            metric.push(metricOptions);
        });
    }
    close() {
        return this._metricService.close();
    }
}
exports.PrometheusMetricProvider = PrometheusMetricProvider;
class PrometheusCounterMetric {
    constructor(options, registry) {
        this.labels = options.labels || [];
        this.counter = new prom.Counter({
            name: options.metric_name,
            help: options.description,
            labelNames: options.labels || [],
            registers: [registry]
        });
    }
    push(options = { labels: {}, value: 1 }) {
        const { value, labels } = options;
        if (exports.isRegisteredLabels(labels, this.labels)) {
            this.counter.labels(...Object.keys(this.labels)).inc(value);
        }
        else {
            this.counter.inc(value);
        }
    }
}
exports.PrometheusCounterMetric = PrometheusCounterMetric;
class PrometheusGaugeMetric {
    constructor(options, registry) {
        this.labels = options.labels || [];
        this.gauge = new prom.Gauge({
            name: options.metric_name,
            help: options.description,
            labelNames: options.labels || [],
            registers: [registry]
        });
    }
    push(options) {
        const { value, labels } = options;
        if (value) {
            if (labels && exports.isRegisteredLabels(labels, this.labels)) {
                this.gauge.labels(...Object.values(labels)).inc(value);
            }
            else {
                this.gauge.inc(value);
            }
        }
        else {
            if (labels) {
                this.gauge.labels(...Object.values(labels)).dec(value);
            }
            else {
                this.gauge.dec(value);
            }
        }
    }
}
exports.PrometheusGaugeMetric = PrometheusGaugeMetric;
class PrometheusHistogramMetric {
    constructor(options, registry) {
        this.labels = options.labels || [];
        this.histogram = new prom.Histogram({
            name: options.metric_name,
            help: options.description,
            registers: [registry],
            labelNames: options.labels || []
        });
    }
    push(options) {
        const { value, labels } = options;
        if (labels && exports.isRegisteredLabels(labels, this.labels)) {
            this.histogram.labels(...this.labels).observe(value);
        }
        else {
            this.histogram.observe(value);
        }
    }
}
exports.PrometheusHistogramMetric = PrometheusHistogramMetric;
exports.isRegisteredLabels = (incomingLabels, registeredNames) => {
    let incomingNames = Object.keys(incomingLabels);
    let allRegistered = true;
    incomingNames.forEach(label => {
        if (!(registeredNames.includes(label))) {
            allRegistered = false;
        }
    });
    return allRegistered;
};
class PrometheusMetricService {
    constructor(options) {
        this.logger = options.logger;
        this.port = options.port;
        this.app = express_1.default();
        this.registry = options.registry;
        this.app.get('/metrics', (req, res, next) => {
            return this.registry.getPrometheusRegistry().metrics()
                .then(data => res.status(200).json(data));
        });
    }
    initialize() {
        return this._startServer()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `Start ${this.constructor.name}#server on port ${this.port}`);
        });
    }
    _startServer() {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                resolve();
            });
        });
    }
    _stopServer() {
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    }
    close() {
        return this._stopServer();
    }
}
exports.PrometheusMetricService = PrometheusMetricService;
class MetricProviderRegistry {
    constructor(options) {
        this.logger = options.logger;
        this.providers = options.providers;
    }
    initialize() {
        return Promise.resolve();
    }
    push(options) {
        this.providers.forEach(provider => {
            provider.push(options);
        });
    }
    close() {
        return Promise.resolve();
    }
}
exports.MetricProviderRegistry = MetricProviderRegistry;
class PhonyMetricProvider {
    constructor(options) {
        this.logger = options.logger;
    }
    initialize() {
        return Promise.resolve();
    }
    push(options) {
        return;
    }
    close() {
        return Promise.resolve();
    }
}
exports.PhonyMetricProvider = PhonyMetricProvider;
