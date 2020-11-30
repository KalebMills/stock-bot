import { URL } from 'url'
export interface IDeferredPromise {
    resolve: Function;
    reject: Function;
    promise: Promise<any>;
    cancellable: Function;
}

export const createDeferredPromise = (pendingPromise: Promise<any>): IDeferredPromise => {
    //@ts-ignore
    let deferredPromise!: IDeferredPromise = {};
    
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
}

export const constructUrl = (base: string, path: string): string => {
    let apiKey = process.env['ALPACAS_API_KEY'] || ""
    let url = new URL(path, base)
    url.searchParams.append("apiKey", apiKey)
    return url.toString();
}