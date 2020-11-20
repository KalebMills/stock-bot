import * as D from '../lib/data-source';
import { ITickerChange } from '../lib/stock-bot';
import * as winston from 'winston';
import * as joi from 'joi'
import * as assert from 'assert';
import * as chai from 'chai';

const logger =  winston.createLogger({
    transports: [
        new winston.transports.Console()
    ],
    level: "silly"
});


let fakeDataSourceInstance: D.IDataSource;

describe('#DataSource abstract class', () => {
    class FakeDatasource extends D.DataSource {
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
            scrapeUrl: '',
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