import { PrometheusCounterMetric, PrometheusGaugeMetric, PrometheusMetricProvider, PrometheusMetricRegistry, PrometheusMetricService, SUPPORTED_PROMETHEUS_METRIC_TYPES } from '../lib/metrics';
import { createLogger } from '../lib/util';
import * as chai from 'chai';
import axios from 'axios';
import * as prom from 'prom-client';

const logger = createLogger({});

describe('#PrometheusMetricRegistry', () => {
    let registry: PrometheusMetricRegistry;

    it('Can construct a PrometheusMetricRegistry', () => {
        registry = new PrometheusMetricRegistry({
            logger,
            defaultLabels: [],
            metrics: [{
                name: 'testMetric',
                metric_name: 'test_metric',
                description: 'Test Metric',
                type: SUPPORTED_PROMETHEUS_METRIC_TYPES.COUNTER,
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
            } else {
                chai.assert.instanceOf(metric, PrometheusCounterMetric);
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
                type: SUPPORTED_PROMETHEUS_METRIC_TYPES.GAUGE,
                buckets: [],
                labels: []
            });

            let metric = registry.getMetric('testMetric2');

            chai.assert.instanceOf(metric, PrometheusGaugeMetric);
        });

        it('Can close registry', () => {
            return registry.close();
        });
    });
})

describe('#PrometheusMetricService', () => {
    let service: PrometheusMetricService;
    let registry: PrometheusMetricRegistry = new PrometheusMetricRegistry({
        logger,
        defaultLabels: [],
        metrics: []
    });

    it('Can construct', () => {
        service = new PrometheusMetricService({
            logger,
            port: 10000,
            registry
        });
    });

    it('Can initialize', () => {
        return service.initialize();
    });

    it('Can verify via health endpoint', () => {
        return axios.get(`http://localhost:10000/health`, {})
        .then(data => {
            chai.assert.equal(data.data.status, 'OK');
        });
    });

    it('Can close service', () => {
        return service.close();
    });
});

describe('#PrometheusMetricProvider', () => {
    let registry: PrometheusMetricRegistry = new PrometheusMetricRegistry({
        logger,
        defaultLabels: [],
        metrics: [{
            name: 'testMetric',
            description: 'Test Metric',
            metric_name: 'test_metric',
            type: SUPPORTED_PROMETHEUS_METRIC_TYPES.COUNTER,
            buckets: [],
            labels: []
        }]
    });
    let provider: PrometheusMetricProvider;

    it ('Can construct provider instance', () => {
        provider = new PrometheusMetricProvider({
            logger,
            port: 10000,
            registry
        });

        chai.assert.instanceOf(provider, PrometheusMetricProvider);
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

        return axios.get<string>(`http://localhost:10000/metrics`)
        .then(data => {
            chai.assert.equal(data.data.includes('test_metric 1000'), true);
        })
    });

    it('Can close provider', () => {
        return provider.close();
    })
});