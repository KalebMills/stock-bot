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
const metrics_1 = require("../lib/metrics");
const util_1 = require("../lib/util");
const chai = __importStar(require("chai"));
const axios_1 = __importDefault(require("axios"));
const prom = __importStar(require("prom-client"));
const logger = util_1.createLogger({});
describe('#PrometheusMetricRegistry', () => {
    let registry;
    it('Can construct a PrometheusMetricRegistry', () => {
        registry = new metrics_1.PrometheusMetricRegistry({
            logger,
            defaultLabels: [],
            metrics: [{
                    name: 'testMetric',
                    metric_name: 'test_metric',
                    description: 'Test Metric',
                    type: metrics_1.SUPPORTED_PROMETHEUS_METRIC_TYPES.COUNTER,
                    buckets: [],
                    labels: []
                }]
        });
        it('Can initialize a registry', () => {
            return registry.initialize();
        });
        it('Can verify a metric exists', () => {
            let hasMetric = registry.hasMetric('testMetric');
            chai.assert.equal(hasMetric, true);
        });
        it('Can get a metric', () => {
            let metric = registry.getMetric('testMetric');
            if (!metric) {
                chai.assert.fail();
            }
            else {
                chai.assert.instanceOf(metric, metrics_1.PrometheusCounterMetric);
            }
        });
        it('Can get a real Prometheus Registry', () => {
            let promRegistry = registry.getPrometheusRegistry();
            chai.assert.instanceOf(promRegistry, prom.Registry);
        });
        it('Can register a metric to the Registry', () => {
            registry.registerMetric({
                name: 'testMetric2',
                metric_name: 'test_metric2',
                description: 'Test Metric 2',
                type: metrics_1.SUPPORTED_PROMETHEUS_METRIC_TYPES.GAUGE,
                buckets: [],
                labels: []
            });
            let metric = registry.getMetric('testMetric2');
            chai.assert.instanceOf(metric, metrics_1.PrometheusGaugeMetric);
        });
        it('Can close registry', () => {
            return registry.close();
        });
    });
});
describe('#PrometheusMetricService', () => {
    let service;
    let registry = new metrics_1.PrometheusMetricRegistry({
        logger,
        defaultLabels: [],
        metrics: []
    });
    it('Can construct', () => {
        service = new metrics_1.PrometheusMetricService({
            logger,
            port: 10000,
            registry
        });
    });
    it('Can initialize', () => {
        return service.initialize();
    });
    it('Can verify via health endpoint', () => {
        return axios_1.default.get(`http://localhost:10000/health`, {})
            .then(data => {
            chai.assert.equal(data.data.status, 'OK');
        });
    });
    it('Can close service', () => {
        return service.close();
    });
});
describe('#PrometheusMetricProvider', () => {
    let registry = new metrics_1.PrometheusMetricRegistry({
        logger,
        defaultLabels: [],
        metrics: [{
                name: 'testMetric',
                description: 'Test Metric',
                metric_name: 'test_metric',
                type: metrics_1.SUPPORTED_PROMETHEUS_METRIC_TYPES.COUNTER,
                buckets: [],
                labels: []
            }]
    });
    let provider;
    it('Can construct provider instance', () => {
        provider = new metrics_1.PrometheusMetricProvider({
            logger,
            port: 10000,
            registry
        });
        chai.assert.instanceOf(provider, metrics_1.PrometheusMetricProvider);
    });
    it('Can initialize provider', () => {
        return provider.initialize();
    });
    it('Can push metrics', () => {
        for (let i = 1; i <= 1000; i++) {
            provider.push({
                'testMetric': {
                    value: 1,
                    labels: {}
                }
            });
        }
        return axios_1.default.get(`http://localhost:10000/metrics`)
            .then(data => {
            console.log(data.data);
            chai.assert.equal(data.data.includes('test_metric 1000'), true);
        });
    });
    it('Can close provider', () => {
        return provider.close();
    });
});
