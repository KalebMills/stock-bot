import { MemoryDataStore, RedisDataStore } from '../lib/data-store';
import { inCI, runCmd } from '../lib/util';
import * as chai from 'chai';
import { DefaultError, isErrorType, NotFoundError } from '../lib/exceptions';
import * as uuid from 'uuid';
import winston from 'winston';

const CONSTRUCT_DOCKER_REDIS = () => runCmd('docker run -d --name TEST_REDIS_DB -p 6379:6379 redis:alpine');
const DESTORY_DOCKER_REDIS = () => runCmd('docker rm -f TEST_REDIS_DB');



describe('#MemoryDataStore', () => {
    const TEST_KEY = 'TEST_KEY';
    const TEST_DATA = {
        'test': 'data'
    };
    let store: MemoryDataStore;
    
    it('Can construct MemoryDataStore', () => {
        store = new MemoryDataStore();
        chai.assert.instanceOf(store, MemoryDataStore);
    });

    it('Can initialize MemoryDataStore', () =>{
        return store.initialize();
    });

    it('Can save data in MemoryDataStore', () => {
        const data = {
            'test': 'data'
        };

        return store.save(TEST_KEY, TEST_DATA);
    });

    it('Can get data from MemoryDataStore', () => {
        return store.get(TEST_KEY)
        .then(data => {
            chai.assert.deepEqual(data, TEST_DATA);
        });
    });

    it('Can delete data in MemoryDataStore', () => {
        return store.delete(TEST_KEY)
        .then(() => store.get(TEST_KEY))
        .catch(err => {
            if (!isErrorType(err, NotFoundError.name)) {
                throw err;
            }
        });
    });

    it('Can close MemoryDataStore', () => {
        return store.close();
    });
});

describe('#RedisDataStore', () => {
    let store: RedisDataStore;
    const TEST_KEY: string = uuid.v4();
    const TEST_DATA = {
        'TEST': 'DATA'
    };

    if (!inCI()) {
        before(() => CONSTRUCT_DOCKER_REDIS());
        after(() => DESTORY_DOCKER_REDIS());
    }

    // Keeps is test suite from running in the test pipeline
    beforeEach(function () {
        if (inCI()) {
            this.skip();
        } 
    });

    it('Can construct RedisDataStore', () => {
        store = new RedisDataStore({
            host: 'localhost',
            logger: winston.createLogger({
                transports: [ new winston.transports.Console() ]
            })
        });

        chai.assert.instanceOf(store, RedisDataStore);
    });

    it('Can initialize RedisDataStore', () => {
        return store.initialize();
    });

    it('Can save data to RedisDataStore', () => {
        return store.save(TEST_KEY, TEST_DATA)
        .then(data => {
            chai.assert.deepEqual(data, TEST_DATA);
        });
    });

    it('Can get data from RedisDataStore', () => {
        return store.get(TEST_KEY)
        .then(data => {
            chai.assert.deepEqual(data, TEST_DATA);
        });
    });

    it('Can delete from RedisDataStore', () => {
        return store.delete(TEST_KEY)
        .catch((err: DefaultError) => {
            if (!isErrorType(err, NotFoundError.name)) {
                throw err;
            } else {
                //We expect to not find a key
                chai.assert.ok(true);
            }
        })
    });
    
    it('Can close RedisDataStore', () => {
        return store.close();
    });
});