import { getConfidenceScore, ConfidenceScoreOptions, createDeferredPromise, extractTweetSignals, TweetSignal, ActionSignal } from '../lib/util';
import * as assert from 'assert';
import chance from 'chance';

describe('#createDeferredPromise', () => {
    it('Can defer a Promise properly', () => {
        let deferred = createDeferredPromise();
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
        const indicators: ConfidenceScoreOptions = {};
        for (let i = 1; i <= 10; i++) {
            let value = i;
            indicators[i] = {
                value,
                process: Promise.resolve().then(() => {
                    if (value % 2) {
                        return true;
                    } else {
                        return false;
                    }
                })
            }
        }

        return getConfidenceScore(indicators)
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
                    {ticker: 'PXD', action: ActionSignal.SELL, sizing: 1}
                ]
            },
            {
                'message': 'SELL $FANG @ $84 (down to 25% of position) \nSELL $SLB @ $29 (down to 25% of position) \nSELL $EOG @ $73 (Flat)', 
                'signals': [
                    {ticker: 'FANG', action: ActionSignal.SELL, sizing: 1},
                    {ticker: 'SLB', action: ActionSignal.SELL, sizing: 1},
                    {ticker: 'EOG', action: ActionSignal.SELL, sizing: 1}
                ]
            },
            {
                'message': '$CRSR $ACTC STOPPED OUT',
                'signals': [
                    {ticker: 'CRSR', action: ActionSignal.SELL, sizing: 1},
                    {ticker: 'ACTC', action: ActionSignal.SELL, sizing: 1}
                ]
            },
            {
                'message': '$PLTR SOLD 24.55 - up from where I bought the new lot just want to de-risk',
                'signals': [
                    {ticker: 'PLTR', action: ActionSignal.SELL, sizing: 1}
                ]
            },
            {
                'message': '$SAVE BUY - adding back some of what I sold near $39 - @ 36.37. This is in my LT account. can use 33 as stop, but I do not use stops in my LT account. tgt $40-45',
                'signals': [
                    {ticker: 'SAVE', action: ActionSignal.BUY, sizing: 1}
                ]
            }
        ]
        for(let tweet of tweets) {
            let signals: TweetSignal[] = extractTweetSignals(tweet.message)
            assert.deepStrictEqual(signals, tweet.signals)
        }
    })
    it('Returns empty signals for tweets with blacklisted words', () => {
        const tweets = [
            "$SPY SOLD 380 puts 2/16",
            "$SNAP LOTTO SIZE - BUY 65 calls 2/26 - trade into their analyst day tmrw. only buy what you are comfortable losing. I may add if weakens into end of day.",
            "$SPY BUY PUT HEDGE  370 3/19 - small just insurance",
            "$AMAT CLOSING CALL SPREAD - 3/19 110 vs 115 3/19 - 85% trade",
        ]
        const emptySignal: TweetSignal[] = [{
            ticker: "",
            action: ActionSignal.UNKNOWN,
            sizing: 0
        }]
        for(let tweet of tweets) {
            let signals: TweetSignal[] = extractTweetSignals(tweet)
            assert.deepStrictEqual(signals, emptySignal)
        }
    })
})