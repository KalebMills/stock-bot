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
exports.PhonyDataStore = exports.MemoryDataStore = exports.RedisDataStore = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const base_1 = require("./base");
const color = __importStar(require("chalk"));
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
        ``;
    }
    save(key, data) {
        return this.client.hmset(key, data)
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
            console.log(`${matches.length} matches`);
            return Promise.resolve(matches.map(key => this.store[key]));
        };
        this.store = {};
        this.logger = options.logger;
    }
    initialize() {
        return Promise.resolve()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, color.green(`${this.constructor.name}#initialize():SUCCESS`));
        });
    }
    save(key, data) {
        this.store[key] = JSON.stringify(data);
        return Promise.resolve(data);
    }
    get(key) {
        //Note, this will only ever return a single value in the array
        if (this._has(key) || this._hasWildCard(key)) {
            if (this._hasWildCard(key)) {
                return this._fetchWildCardValues(key);
            }
            else {
                return Promise.resolve([JSON.parse(this.store[key])]);
            }
        }
        else {
            return Promise.resolve([]);
            // return Promise.reject(new NotFoundError(`${key} not found`));
        }
    }
    delete(key) {
        delete this.store[key];
        return Promise.resolve();
    }
    _has(key) {
        return !!this.store.hasOwnProperty(key);
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
