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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const D = __importStar(require("../lib/data-source"));
const winston = __importStar(require("winston"));
const joi = __importStar(require("joi"));
const assert = __importStar(require("assert"));
const chai = __importStar(require("chai"));
const notification_1 = require("../lib/notification");
const logger = winston.createLogger({
    transports: [new winston.transports.Console()],
    level: "silly"
});
let fakeDataSourceInstance;
describe('#DataSource abstract class', () => {
    class FakeDatasource extends D.DataSource {
        constructor(options) {
            super(options);
        }
        scrapeDatasource() {
            return Promise.resolve([]);
        }
    }
    it('Can create a base DataSource class', () => {
        const baseOptions = {
            logger,
            validationSchema: joi.object({
                ticker: joi.string().required(),
                price: joi.number().required()
            }),
            commandClient: new notification_1.PhonyCommandClient()
        };
        fakeDataSourceInstance = new FakeDatasource(baseOptions);
        chai.assert.instanceOf(fakeDataSourceInstance, D.DataSource);
    });
    it('Can time out a ticker', () => {
        fakeDataSourceInstance.timeoutTicker('AAAL', 1);
        assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 1);
        const deferred = fakeDataSourceInstance.timedOutTickers.get("AAAL");
        return deferred.promise
            .then(() => {
            assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 0);
        });
    });
    it('Can close a datasource successfully', () => {
        for (let i = 1; i <= 10; i++) {
            fakeDataSourceInstance.timeoutTicker(((Math.random() * Math.random()) * 12).toString(), 10);
        }
        return fakeDataSourceInstance.close()
            .then(() => assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 0));
    });
});
describe('#TwitterDataSource', () => {
    let twitterDataSource;
    it('Can construct an instance of TwitterDataSource', () => {
        twitterDataSource = new D.TwitterDataSource({
            logger,
            tickerList: ['AAPL', 'GOOG', 'TSLA'],
            commandClient: new notification_1.PhonyCommandClient(),
            twitterAccounts: [{
                    id: 'TEST_ID',
                    name: 'TEST_ACCOUNT',
                    type: D.TwitterAccountType.FAST_POSITION
                }],
            isMock: true,
            twitterKey: '',
            twitterSecret: '',
            twitterAccessSecret: '',
            twitterAccessToken: '',
            validationSchema: joi.object({}),
            scrapeProcessDelay: 1000 //1 second
        });
        chai.assert.instanceOf(twitterDataSource, D.TwitterDataSource);
    });
    it('Can properly get the latest tweets in a list', () => __awaiter(void 0, void 0, void 0, function* () {
        const input1 = [
            {
                accountId: 'TEST1',
                tweets: [{
                        "id": "1366852154900705283",
                        "text": "$WMT sell 130 3/19 puts @ $2.53 - this is naked. meaning if trades below this can be put to you. Stock is so oversold and beatup, i'm ok with that.",
                        "urls": []
                    },
                    {
                        "id": "1366823916468113409",
                        "text": "$ACB BUY - 1/2 position; also long $VFF 1/2 position for our pot play- I thought I alerted this earlier but cant find it. $10 stop $15 to $17.50 tgt range.",
                        "urls": []
                    },
                    {
                        "id": "1366819751423541258",
                        "text": "$FUV BUY buying back the 1/2 I sold earlier above $21 - $18.79",
                        "urls": []
                    },
                    {
                        "id": "1366802143601176576",
                        "text": "$PINS BUY 3/12 82 calls - Lotto Size - they are at an advertising event and they were talking it up @ the Morgan Stanley confence https://t.co/Jeuahi9miL",
                        "urls": []
                    },
                    {
                        "id": "1366794726058393606",
                        "text": "$PTON SELL 185 CALLS for  4/16 @ . These are +85% and will look to add them back if this can lift into the next month. good call from a subscriber. sold @ .62",
                        "urls": []
                    },
                    {
                        "id": "1366793717479333894",
                        "text": "$WWR BUY 1/2 position @ 6.44 - stop suggested 5.50",
                        "urls": []
                    }]
            }
        ];
        const output1 = yield twitterDataSource._getLatestTweetsFromEachAccount(input1);
        const output2 = yield twitterDataSource._getLatestTweetsFromEachAccount(input1);
        const input2 = JSON.parse(JSON.stringify(input1));
        //Add new tweet to list, acting as a new tweet coming in
        const newTweet = {
            id: 'TEST',
            text: 'TEST',
            urls: []
        };
        input2[0].tweets.unshift(newTweet);
        const output3 = yield twitterDataSource._getLatestTweetsFromEachAccount(input2);
        chai.expect(output1[0].tweets[0]).deep.equal(input1[0].tweets[0], 'assertion1 is not equal');
        chai.expect(output2.length).equal(0, 'assertion2 is not equal');
        chai.expect(output3[0].tweets[0]).deep.equal(newTweet, 'assertion3 is not equal');
    }));
    it('Does not overwrite prevIds of other accounts in list', () => __awaiter(void 0, void 0, void 0, function* () {
        const input1 = [
            {
                accountId: 'TEST1',
                tweets: [{
                        "id": "1366852154900705283",
                        "text": "$WMT sell 130 3/19 puts @ $2.53 - this is naked. meaning if trades below this can be put to you. Stock is so oversold and beatup, i'm ok with that.",
                        "urls": []
                    },
                    {
                        "id": "1366823916468113409",
                        "text": "$ACB BUY - 1/2 position; also long $VFF 1/2 position for our pot play- I thought I alerted this earlier but cant find it. $10 stop $15 to $17.50 tgt range.",
                        "urls": []
                    }]
            }, {
                accountId: 'TEST2',
                tweets: [{
                        "id": "1366794726058393606",
                        "text": "$PTON SELL 185 CALLS for  4/16 @ . These are +85% and will look to add them back if this can lift into the next month. good call from a subscriber. sold @ .62",
                        "urls": []
                    },
                    {
                        "id": "1366793717479333894",
                        "text": "$WWR BUY 1/2 position @ 6.44 - stop suggested 5.50",
                        "urls": []
                    }]
            }
        ];
        let output1 = yield twitterDataSource._getLatestTweetsFromEachAccount(input1);
        //Output is not used, but we run the function again to check out the `prevIds` property on the class is changed in the last assertion
        let output2 = yield twitterDataSource._getLatestTweetsFromEachAccount(input1);
        chai.expect(output1[0].tweets[0]).deep.equal(input1[0].tweets[0]);
        chai.expect(output1[1].tweets[0]).deep.equal(input1[1].tweets[0]);
        chai.expect(twitterDataSource['prevIds']).deep.equal(["TEST", input1[0].tweets[0].id, input1[1].tweets[0].id]);
    }));
});
