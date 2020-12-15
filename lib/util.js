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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscordClientSingleton = exports.runCmd = exports.inCI = exports.createDeferredPromise = void 0;
const cp = __importStar(require("child_process"));
const discord = __importStar(require("discord.js"));
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
/**
 * Used to know when the tests are being ran by Github Actions: https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables
*/
exports.inCI = () => !!process.env['GITHUB_ACTIONS'];
exports.runCmd = (cmd) => {
    return new Promise((resolve, reject) => {
        cp.exec(cmd, (err, stdout, stderr) => {
            if (err || stderr) {
                reject({ err, stderr });
            }
            else {
                resolve();
            }
        });
    });
};
const client = new discord.Client({});
exports.getDiscordClientSingleton = () => {
    return client;
};
