"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhonyDataStore = exports.MemoryDataStore = exports.RedisDataStore = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const base_1 = require("./base");
const chalk_1 = __importDefault(require("chalk"));
class RedisDataStore {
    constructor(options) {
        this.options = options;
        this.port = options.port || 6379;
        this.client = new ioredis_1.default(this.port, options.host, options.options || { lazyConnect: true });
        this.logger = options.logger;
    }
    initialize() {
        return this.client.connect()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
            this.logger.log(base_1.LogLevel.INFO, `Connected to Redis on ${this.options.host}:${this.port}`);
        });
    }
    save(key, data) {
        return this.client.hmset(key, data) //This because it satisfies Redis, and this is a Generic Object type
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `${key} was saved in Redis`);
            return data;
        });
    }
    /*
        At MAX, we should have about 7k entries, so SCAN should not be a huge impact
    */
    get(data) {
        //TODO: This should handle a wildcard as the id, i.e TSLA-*, which would fetch us all of the entries in the DB with TSLA-uuid
        if (data.includes('*')) { //Wildcard search
            return new Promise((resolve, reject) => {
                this.client.scan(0, 'match', data)
                    .then((data) => {
                    //data[0] is supposed to be a new cursor, but we don't care about that
                    console.log(data[1]);
                    resolve([]);
                })
                    .catch(reject);
            });
        }
        else {
            return new Promise((resolve, reject) => {
                this.client.hgetall(data, (err, data) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve([data]);
                    }
                });
            });
        }
    }
    // need to type this, and require an id property to be present, since that's the only real way we can delete a key in Redis
    delete(key) {
        return this.client.del(key)
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#delete(${key}):SUCCESS`);
        });
    }
    close() {
        try {
            this.client.disconnect();
            return Promise.resolve();
        }
        catch (e) {
            return Promise.reject(e);
        }
    }
}
exports.RedisDataStore = RedisDataStore;
class MemoryDataStore {
    constructor(options) {
        this._hasWildCard = (key) => {
            return key.includes('*');
        };
        //Only supports '*' as the wildcard
        this._fetchWildCardValues = (key) => {
            const partialKey = key.replace('*', '');
            const options = Object.keys(this.store);
            const matches = options.filter(key => key.includes(partialKey));
            return Promise.resolve(matches.map(key => this.store[key]));
        };
        this.store = {};
        this.logger = options.logger;
    }
    initialize() {
        return Promise.resolve()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, chalk_1.default.green(`${this.constructor.name}#initialize():SUCCESS`));
        });
    }
    save(key, data) {
        try {
            this.store[key] = JSON.stringify(data);
            this.logger.log(base_1.LogLevel.INFO, `${key} was saved into ${this.constructor.name}. Store now has ${Object.keys(this.store).length} entries in it`);
            return Promise.resolve(data);
        }
        catch (e) {
            return Promise.reject(e);
        }
    }
    get(key) {
        this.logger.log(base_1.LogLevel.INFO, `this.store.hasOwnProperty(${key}) == ${this.store.hasOwnProperty(key)}`);
        if (this._has(key) || this._hasWildCard(key)) {
            if (this._hasWildCard(key)) {
                return this._fetchWildCardValues(key);
            }
            else {
                this.logger.log(base_1.LogLevel.INFO, `Found a single key: ${this.store[key]}`);
                return Promise.resolve([JSON.parse(this.store[key])]);
            }
        }
        else {
            return Promise.resolve([]);
        }
    }
    delete(key) {
        delete this.store[key];
        return Promise.resolve();
    }
    _has(key) {
        return this.store.hasOwnProperty(key);
    }
    close() {
        this.store = {};
        return Promise.resolve();
    }
}
exports.MemoryDataStore = MemoryDataStore;
class PhonyDataStore extends MemoryDataStore {
}
exports.PhonyDataStore = PhonyDataStore;
;
