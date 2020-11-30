"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeferredPromise = void 0;
exports.createDeferredPromise = (pendingPromise) => {
    //@ts-ignore
    let deferredPromise = {};
    let p = new Promise((resolve, reject) => {
        deferredPromise.reject = () => {
            deferredPromise.cancellable();
            reject();
        };
        deferredPromise.resolve = () => {
            deferredPromise.cancellable();
            resolve();
        };
        pendingPromise
            .then(() => resolve())
            .catch(err => reject(err));
    });
    deferredPromise.promise = p;
    return deferredPromise;
};
