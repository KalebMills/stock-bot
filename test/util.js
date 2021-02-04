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
const util_1 = require("../lib/util");
const confidence_score_1 = require("../lib/confidence-score");
const assert = __importStar(require("assert"));
describe('#createDeferredPromise', () => {
    it('Can defer a Promise properly', () => {
        let deferred = util_1.createDeferredPromise();
        let timer = setTimeout(() => deferred.reject(), 1000);
        deferred.cancellable = timer.unref;
        return deferred.promise
            .then(() => assert.fail('Promise should not resolve successfully.'))
            .catch(() => assert.ok(true));
    });
});
describe('#getConfidenceScore', () => {
    it('Can give me the expected score of 10 fake indicators', () => {
        let confidence = new confidence_score_1.ConfidenceScore('FAKE');
        const expectedScore = 45.45;
        const indicators = {};
        for (let i = 1; i <= 10; i++) {
            let value = i;
            indicators[i] = {
                score: Promise.resolve(value),
                process: Promise.resolve().then(() => {
                    if (value % 2) {
                        return true;
                    }
                    else {
                        return false;
                    }
                })
            };
        }
        return confidence.getConfidenceScore(indicators)
            .then(confidenceScore => {
            assert.deepStrictEqual(confidenceScore, expectedScore);
        });
    });
});
