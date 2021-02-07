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
            twitterIds: ['TEST'],
            isMock: true,
            twitterKey: '',
            twitterSecret: '',
            validationSchema: joi.object({})
        });

        chai.assert.instanceOf(twitterDataSource, D.TwitterDataSource);
    });

    it('Can properly screen a tweet', () => {
        const TWEET1 = `$TSLA
        This is going to be a hot stock because Elon is just a Chad.
        `;
        const TWEET2 = `AAPL
        This is gonna be a fantastic stock becuase Tim Cook wears his gray hair like the best I've ever seen.
        `;

        let output1 = twitterDataSource._processTweet(TWEET1);
        let output2 = twitterDataSource._processTweet(TWEET2);

        chai.assert.equal(output1, 'TSLA');
        chai.assert.equal(output2, 'AAPL');
    });
});