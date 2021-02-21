import * as D from '../lib/data-source';
import { ITickerChange } from '../lib/stock-bot';
import * as winston from 'winston';
import * as joi from 'joi'
import * as assert from 'assert';
import * as chai from 'chai';

const logger =  winston.createLogger({
    transports: [ new winston.transports.Console() ],
    level: "silly"
});


let fakeDataSourceInstance: D.IDataSource;

describe('#DataSource abstract class', () => {
    class FakeDatasource extends D.DataSource<ITickerChange> {
        constructor(options: D.IDataSourceOptions) {
            super(options);
        }

        scrapeDatasource(): Promise<ITickerChange[]> {
            return Promise.resolve([]);
        }
    }

    it('Can create a base DataSource class', () => {
        const baseOptions: D.IDataSourceOptions = {
            logger,
            validationSchema: joi.object({
                ticker: joi.string().required(),
                price: joi.number().required()
            })
        }
        fakeDataSourceInstance = new FakeDatasource(baseOptions);

        chai.assert.instanceOf(fakeDataSourceInstance, D.DataSource);
    });

    it('Can time out a ticker', () => {
        fakeDataSourceInstance.timeoutTicker('AAAL', 1);
        assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 1);

        const deferred = fakeDataSourceInstance.timedOutTickers.get("AAAL");
        
        return deferred!.promise
        .then(() => {
            assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 0);
        });
    });

    it('Can close a datasource successfully', () => {
        for (let i = 1; i <= 10; i++) {
            fakeDataSourceInstance.timeoutTicker(((Math.random() * Math.random()) * 12).toString(), 10);
        }

        return fakeDataSourceInstance.close()
        .then(() => assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 0))
    });
});

describe('#TwitterDataSource', () => {
    let twitterDataSource: D.TwitterDataSource;

    it('Can construct an instance of TwitterDataSource', () => {
        twitterDataSource = new D.TwitterDataSource({
            logger,
            tickerList: ['AAPL', 'GOOG', 'TSLA'],
            twitterAccounts: [{
                id: 'TEST_ID',
                type: D.TwitterAccountType.FAST_POSITION
            }],
            isMock: true,
            twitterKey: '',
            twitterSecret: '',
            twitterAccessSecret: '',
            twitterAccessToken: '',
            validationSchema: joi.object({})
        });

        chai.assert.instanceOf(twitterDataSource, D.TwitterDataSource);
    });

    //NOTE: This test has to wait until the model is completed

    // it('Can properly screen a tweet', async () => {
    //     const TWEET1: D.IncomingTweet = {
    //         id: 1,
    //         text: `$TSLA\n
    //         This is going to be a hot stock because Elon is just a Chad.`,
    //         timestamp_ms: new Date().getTime().toString(),
    //         user: {
    //             id: 1,
    //             screen_name: 'TEST'
    //         }
    //     };
        
    //     //TODO: This is a dumb case and it's usage should be removed from the code
    //     const TWEET2: D.IncomingTweet = {
    //         id: 2,
    //         text: `$AAPL
    //         This is gonna be a fantastic stock becuase Tim Cook wears his gray hair like the best I've ever seen.`,
    //         timestamp_ms: new Date().getTime().toString(),
    //         user: {
    //             id: 2,
    //             screen_name: 'TEST'
    //         }
    //     };

    //     let output1: D.SocialMediaOutput = await twitterDataSource._processTweet(TWEET1)! as D.SocialMediaOutput;
    //     let output2: D.SocialMediaOutput = await twitterDataSource._processTweet(TWEET2)! as D.SocialMediaOutput;

    //     chai.assert.equal(output1.ticker, 'TSLA');
    //     chai.assert.equal(output2.ticker, 'AAPL');
    // });
});