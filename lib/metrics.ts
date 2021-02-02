import { ICloseable, IInitializable, Logger, LogLevel } from "./base";
import express from 'express';
import * as http from 'http';
import * as prom from 'prom-client';
import { InvalidConfigurationError } from './exceptions';
import { createLogger } from "./util";

export enum SUPPORTED_PROMETHEUS_METRIC_TYPES {
    GAUGE = 'gauge',
    COUNTER = 'counter',
    HISTOGRAM = 'histogram'
}

export interface MetricMap { 
    [metricName: string]: {
        value: number,
        labels: { [labelName: string]: string }
    }
}

export interface MetricConfiguration {
    name: string;
    type: SUPPORTED_PROMETHEUS_METRIC_TYPES;
    metric_name: string;
    description: string;
    labels?: string[];
}

export interface MetricProviderOptions {
    logger: Logger
}

export interface IMetricProvider extends IInitializable, ICloseable {
    // new (options: MetricProviderOptions): void
    push(options: MetricMap): void
}

export interface PrometheusMetricProviderOptions extends MetricProviderOptions {
    port: number;
    registry: PrometheusMetricRegistry; //TODO: Create PrometheusRegistry abstraction
}

export interface PrometheusMetricRegistryOptions {
    logger: Logger;
    metrics: MetricConfiguration[];
    defaultLabels: string[];
}

export class PrometheusMetricRegistry implements IInitializable, ICloseable {
    private _metrics: MetricConfiguration[]; //TODO: How can I make this generic?
    private _registeredMetrics: Map<string, PrometheusMetric>; 
    private _registry: prom.Registry;

    constructor (options: PrometheusMetricRegistryOptions) {
        this._metrics = options.metrics;
        this._registry = new prom.Registry();
        this._registeredMetrics = new Map();

        //Register our metrics
        this._metrics.forEach(metricOptions => {
            this.registerMetric(metricOptions);
        });
    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    registerMetric(options: MetricConfiguration): void {
        //TODO: Should add some validation here
        const { type, name } = options;
        const MAP = {
            "gauge": PrometheusGaugeMetric,
            "counter": PrometheusCounterMetric,
            "histogram": PrometheusHistogramMetric
        }

        let metric: PrometheusMetric = new MAP[type](options, this._registry);
        this._registeredMetrics.set(name, metric);
    }

    hasMetric(metricName: string): boolean {
        return this._registeredMetrics.has(metricName);
    }

    getMetric(name: string): PrometheusMetric {
        if (this.hasMetric(name)) {
            return this._registeredMetrics.get(name)!;
        } else {
            throw new InvalidConfigurationError(`${name} has not been registered to ${this.constructor.name}`);
        }
    }

    getPrometheusRegistry(): prom.Registry {
        return this._registry;
    }
    
    close(): Promise<void> {
        return Promise.resolve();
    }
}


//Make MetricService a constructed class internally
export class PrometheusMetricProvider implements IMetricProvider {
    private logger: Logger;
    private port: number;
    private _registry: PrometheusMetricRegistry;
    private _metricService: PrometheusMetricService;

    constructor (options: PrometheusMetricProviderOptions) {
        this.port = options.port;
        this._registry = options.registry;
        this.logger = options.logger;
        this._metricService = new PrometheusMetricService({
            logger: this.logger,
            port: this.port,
            registry: this._registry
        });
    }

    initialize(): Promise<void> {
        return this._metricService.initialize();
    }

    push(options: MetricMap): void {
        Object.keys(options).forEach(metricName => {
            let metric = this._registry.getMetric(metricName);
            let metricOptions = options[metricName];

            if (!metricOptions.hasOwnProperty('labels')) {
                metricOptions.labels = {};
            }
            metric.push(metricOptions);
        });
    }

    close(): Promise<void> {
        return this._metricService.close();
    }

}

export interface PrometheusMetric {
    push(options: {value: number, labels: { [labelName: string]: string }}): void;
}


export class PrometheusCounterMetric implements PrometheusMetric {
    private counter: prom.Counter<string>;
    private labels: string[];

    constructor(options: MetricConfiguration, registry: prom.Registry) {
        this.labels = options.labels || [];
        this.counter = new prom.Counter({
            name: options.metric_name,
            help: options.description,
            labelNames: options.labels || [],
            registers: [registry]
        });
    } 

    push(options: {value: number, labels: { [labelName: string]: string }} = { labels: {}, value: 1 }): void {
        const { value, labels } = options;
        if (isRegisteredLabels(labels, this.labels)) {
            this.counter.labels(...Object.keys(this.labels)).inc(value);
        } else {
            this.counter.inc(value);
        }
    }
}

export class PrometheusGaugeMetric implements PrometheusMetric {
    private gauge: prom.Gauge<string>;
    private labels: string[];

    constructor (options: MetricConfiguration, registry: prom.Registry) {
        this.labels = options.labels || [];
        this.gauge = new prom.Gauge({
            name: options.metric_name,
            help: options.description,
            labelNames: options.labels || [],
            registers: [registry]
        });
    }

    push(options: {value: number, labels: { [labelName: string]: string }}): void {
        const { value, labels } = options;
        if (value) {
            if (labels && isRegisteredLabels(labels, this.labels)) {
                this.gauge.labels(...Object.values(labels)).inc(value);
            } else {
                this.gauge.inc(value);
            }
        } else {
            if (labels) {
                this.gauge.labels(...Object.values(labels)).dec(value);
            } else {
                this.gauge.dec(value);
            }
        }
    }
}

export class PrometheusHistogramMetric implements PrometheusMetric {
    private histogram: prom.Histogram<string>;
    private labels: string[];

    constructor (options: MetricConfiguration, registry: prom.Registry) {
        this.labels = options.labels || [];
        this.histogram = new prom.Histogram({
            name: options.metric_name,
            help: options.description,
            registers: [registry],
            labelNames: options.labels || []
        });
    }

    push(options: {value: number, labels: { [labelName: string]: string }}): void {
        const { value, labels } = options;

        if (labels && isRegisteredLabels(labels, this.labels)) {
            this.histogram.labels(...this.labels).observe(value);
        } else {
            this.histogram.observe(value);
        }
    }
}

export const isRegisteredLabels = (incomingLabels: {[key: string]: string}, registeredNames: string[]): boolean => {
    let incomingNames = Object.keys(incomingLabels);
    let allRegistered = true;

    incomingNames.forEach(label => {
        if (!(registeredNames.includes(label))) {
            allRegistered = false;
        }
    });

    return allRegistered;
}

export class PrometheusMetricService {
    private logger: Logger;
    private port: number;
    private app: express.Application;
    private server!: http.Server;
    private registry: PrometheusMetricRegistry;
    
    constructor (options: PrometheusMetricProviderOptions) {
        this.logger = options.logger;
        this.port = options.port;
        this.app = express();
        this.registry = options.registry;

        this.app.get('/metrics', (req, res, next) => {
            return this.registry.getPrometheusRegistry().metrics()
            .then(data => res.status(200).json(data));
        });
    }

    initialize(): Promise<void> {
        return this._startServer()
        .then(() => {
            this.logger.log(LogLevel.INFO, `Start ${this.constructor.name}#server on port ${this.port}`);
        });
    }

    _startServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = this.app.listen(this.port, () => {
                resolve();
            });
        });
    }

    _stopServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    close(): Promise<void> {
        return this._stopServer();
    }
}

export interface MetricProviderRegistryOptions extends MetricProviderOptions {
    providers: IMetricProvider[];
}

export class MetricProviderRegistry implements IMetricProvider {
    private providers: IMetricProvider[];
    private logger: Logger;
    
    constructor (options: MetricProviderRegistryOptions) {
        this.logger = options.logger;
        this.providers = options.providers;
    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    push(options: MetricMap): void {
        this.providers.forEach(provider => {
            provider.push(options);
        });
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}


export class PhonyMetricProvider implements IMetricProvider {
    private logger: Logger;

    constructor (options: MetricProviderOptions) {
        this.logger = options.logger;
    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    push(options: MetricMap): void {
        return;
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}