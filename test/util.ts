import * as util from '../lib/util';
import * as assert from 'assert';

describe('#createDeferredPromise', () => {
    it('Can defer a Promise properly', () => {
        let deferred = util.createDeferredPromise();
        let timer = setTimeout(() => deferred.reject(), 1000);
        deferred.cancellable = timer.unref;

        return deferred.promise
        .then(() => assert.fail('Promise should not resolve successfully.'))
        .catch(() => assert.ok(true));
    });
});