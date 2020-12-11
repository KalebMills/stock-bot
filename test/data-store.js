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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const data_store_1 = require("../lib/data-store");
const util_1 = require("../lib/util");
const chai = __importStar(require("chai"));
const exceptions_1 = require("../lib/exceptions");
const uuid = __importStar(require("uuid"));
const winston_1 = __importDefault(require("winston"));
const CONSTRUCT_DOCKER_REDIS = () => util_1.runCmd('docker run -d --name TEST_REDIS_DB -p 6379:6379 redis:alpine');
const DESTORY_DOCKER_REDIS = () => util_1.runCmd('docker rm -f TEST_REDIS_DB');
const logger = winston_1.default.createLogger({
    transports: [new winston_1.default.transports.Console()]
});
describe('#MemoryDataStore', () => {
    const TEST_KEY = 'TEST_KEY';
    const TEST_DATA = [{
            'test': 'data'
        }];
    let store;
    it('Can construct MemoryDataStore', () => {
        store = new data_store_1.MemoryDataStore({
            logger
        });
        chai.assert.instanceOf(store, data_store_1.MemoryDataStore);
    });
    it('Can initialize MemoryDataStore', () => {
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
            if (!exceptions_1.isErrorType(err, exceptions_1.NotFoundError.name)) {
                throw err;
            }
        });
    });
    it('Can close MemoryDataStore', () => {
        return store.close();
    });
});
describe('#RedisDataStore', () => {
    let store;
    const TEST_KEY = uuid.v4();
    const TEST_DATA = [{
            'TEST': 'DATA'
        }];
    if (!util_1.inCI()) {
        before(() => CONSTRUCT_DOCKER_REDIS());
        after(() => DESTORY_DOCKER_REDIS());
    }
    // Keeps is test suite from running in the test pipeline
    beforeEach(function () {
        if (util_1.inCI()) {
            this.skip();
        }
    });
    it('Can construct RedisDataStore', () => {
        store = new data_store_1.RedisDataStore({
            host: 'localhost',
            logger: winston_1.default.createLogger({
                transports: [new winston_1.default.transports.Console()]
            })
        });
        chai.assert.instanceOf(store, data_store_1.RedisDataStore);
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
            .catch((err) => {
            if (!exceptions_1.isErrorType(err, exceptions_1.NotFoundError.name)) {
                throw err;
            }
            else {
                //We expect to not find a key
                chai.assert.ok(true);
            }
        });
    });
    it('Can close RedisDataStore', () => {
        return store.close();
    });
});
