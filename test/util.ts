import { getConfidenceScore, ConfidenceScoreOptions, createDeferredPromise } from '../lib/util';
import * as assert from 'assert';
import chance from 'chance';

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
        const expectedScore = 45.45;
        const indicators: ConfidenceScoreOptions = {};
        for (let i = 1; i <= 10; i++) {
            let value = i;
            indicators[i] = {
                value,
                process: Promise.resolve().then(() => {
                    if (value % 2) {
                        return true;
                    } else {
                        return false;
                    }
                })
            }
        }

        return getConfidenceScore(indicators)
        .then(confidenceScore => {
            assert.deepStrictEqual(confidenceScore, expectedScore);
        });
    });
});