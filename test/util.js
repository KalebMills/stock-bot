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
const util = __importStar(require("../lib/util"));
const assert = __importStar(require("assert"));
describe('#createDeferredPromise', () => {
    it('Can defer a Promise properly', () => {
        let t;
        let delayedPromise = new Promise((resolve, reject) => {
            t = setTimeout(() => reject(), 1000);
        });
        let deferredPromise = util.createDeferredPromise(delayedPromise);
        deferredPromise.cancellable = () => {
            t.unref();
        };
        return deferredPromise.promise
            .then(() => assert.fail('Promise should not resolve successfully.'))
            .catch(() => assert.ok(true));
    });
});
