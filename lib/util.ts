import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

/**
 * Used to know when the tests are being ran by Github Actions: https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables
*/

export const inCI = (): boolean => !!process.env['GITHUB_ACTIONS'];

export const runCmd = (cmd: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, (err, stdout, stderr) => {
            if (err || stderr) {
                reject({ err, stderr });
            } else {
                resolve();
            }
        })
    });
}

export const loadTickersFromFile = (path: string): string[] => {
    let d: string[] = [];
    const data = fs.readFileSync(path, { encoding: 'utf-8' }).toString();
    const split = data.split('\n');

    for (let line of split) {
        d.push(line);
    }

    return d;
}