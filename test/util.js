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
        const expectedScore = 45.45;
        const indicators = {};
        for (let i = 1; i <= 10; i++) {
            let value = i;
            indicators[i] = {
                value,
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
        return util_1.getConfidenceScore(indicators)
            .then(confidenceScore => {
            assert.deepStrictEqual(confidenceScore, expectedScore);
        });
    });
});
describe('#extractTweetSignals', () => {
    it('Can extract tickers and buy/sell signals from tweets', () => {
        const tweets = [
            {
                'message': '$PXD SELL @ 164.50 tgt achieved - new combo 13 buy and above covid gaps. energy seems to be getting extended.',
                'signals': [
                    { ticker: 'PXD', action: util_1.ActionSignal.SELL, sizing: 1 }
                ]
            },
            {
                'message': 'SELL $FANG @ $84 (down to 25% of position) \nSELL $SLB @ $29 (down to 25% of position) \nSELL $EOG @ $73 (Flat)',
                'signals': [
                    { ticker: 'FANG', action: util_1.ActionSignal.SELL, sizing: 1 },
                    { ticker: 'SLB', action: util_1.ActionSignal.SELL, sizing: 1 },
                    { ticker: 'EOG', action: util_1.ActionSignal.SELL, sizing: 1 }
                ]
            },
            {
                'message': '$CRSR $ACTC STOPPED OUT',
                'signals': [
                    { ticker: 'CRSR', action: util_1.ActionSignal.SELL, sizing: 1 },
                    { ticker: 'ACTC', action: util_1.ActionSignal.SELL, sizing: 1 }
                ]
            },
            {
                'message': '$PLTR SOLD 24.55 - up from where I bought the new lot just want to de-risk',
                'signals': [
                    { ticker: 'PLTR', action: util_1.ActionSignal.SELL, sizing: 1 }
                ]
            },
            {
                'message': '$SAVE BUY - adding back some of what I sold near $39 - @ 36.37. This is in my LT account. can use 33 as stop, but I do not use stops in my LT account. tgt $40-45',
                'signals': [
                    { ticker: 'SAVE', action: util_1.ActionSignal.BUY, sizing: 1 }
                ]
            }
        ];
        for (let tweet of tweets) {
            let signals = util_1.extractTweetSignals(tweet.message);
            assert.deepStrictEqual(signals, tweet.signals);
        }
    });
    it('Returns empty signals for tweets with blacklisted words', () => {
        const tweets = [
            "$SPY SOLD 380 puts 2/16",
            "$SNAP LOTTO SIZE - BUY 65 calls 2/26 - trade into their analyst day tmrw. only buy what you are comfortable losing. I may add if weakens into end of day.",
            "$SPY BUY PUT HEDGE  370 3/19 - small just insurance",
            "$AMAT CLOSING CALL SPREAD - 3/19 110 vs 115 3/19 - 85% trade",
        ];
        const emptySignal = [{
                ticker: "",
                action: util_1.ActionSignal.UNKNOWN,
                sizing: 0
            }];
        for (let tweet of tweets) {
            let signals = util_1.extractTweetSignals(tweet);
            assert.deepStrictEqual(signals, emptySignal);
        }
    });
});
