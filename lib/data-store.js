"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhonyDataStore = exports.MemoryDataStore = exports.RedisDataStore = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const base_1 = require("./base");
const exceptions_1 = require("./exceptions");
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
        return this.client.hmset(key, data)
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `${key} was saved in Redis`);
            return data;
        });
    }
    get(data) {
        return new Promise((resolve, reject) => {
            this.client.hgetall(data, (err, data) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(data);
                }
            });
        });
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
            throw e;
        }
    }
}
exports.RedisDataStore = RedisDataStore;
class MemoryDataStore {
    constructor() {
        this.store = {};
    }
    initialize() {
        return Promise.resolve();
    }
    save(key, data) {
        this.store[key] = data;
        return Promise.resolve(data);
    }
    get(key) {
        if (this._has(key)) {
            return Promise.resolve(this.store[key]);
        }
        else {
            throw new exceptions_1.NotFoundError(`${key} not found`);
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
