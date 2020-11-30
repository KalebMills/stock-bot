"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.constructUrl = exports.createDeferredPromise = void 0;
const url_1 = require("url");
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
exports.constructUrl = (base, path) => {
    let apiKey = process.env['ALPACAS_API_KEY'] || "";
    let url = new url_1.URL(path, base);
    url.searchParams.append("apiKey", apiKey);
    return url.toString();
};
