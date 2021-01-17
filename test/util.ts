import { createDeferredPromise } from '../lib/util';
import { ConfidenceScore, ConfidenceScoreOptions } from '../lib/confidence-score';
import * as assert from 'assert';

describe('#createDeferredPromise', () => {
    it('Can defer a Promise properly', () => {
        let deferred = createDeferredPromise();
        let timer = setTimeout(() => deferred.reject(), 1000);
        deferred.cancellable = timer.unref;

        return deferred.promise
        .then(() => assert.fail('Promise should not resolve successfully.'))
        .catch(() => assert.ok(true));
    });
});

describe('#getConfidenceScore', () => {
    it('Can give me the expected score of 10 fake indicators', () => {
        let confidence = new ConfidenceScore('FAKE')
        const expectedScore = 45.45;
        const indicators: ConfidenceScoreOptions = {};
        for (let i = 1; i <= 10; i++) {
            let value = i;
            indicators[i] = {
                score: Promise.resolve(value),
                process: Promise.resolve().then(() => {
                    if (value % 2) {
                        return true;
                    } else {
                        return false;
                    }
                })
            }
        }

        return confidence.getConfidenceScore(indicators)
        .then(confidenceScore => {
            assert.deepStrictEqual(confidenceScore, expectedScore);
        });
    });
});