import * as util from '../lib/util';
import * as assert from 'assert';

describe('#createDeferredPromise', () => {
    it('Can defer a Promise properly', () => {
        let t: NodeJS.Timeout;
        let delayedPromise = new Promise((resolve, reject) => {
            t = setTimeout(() => reject(), 1000);
        });
        
        let deferredPromise = util.createDeferredPromise(delayedPromise);
        deferredPromise.cancellable = () => {
            t.unref();
        }

        return deferredPromise.promise
        .then(() => assert.fail('Promise should not resolve successfully.'))
        .catch(() => assert.ok(true));
    });
});