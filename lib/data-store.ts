import redis from 'ioredis';
import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import { NotFoundError } from './exceptions';

//TODO: Perhaps find a more robust way to truly type this rather than using `any`
type DataStoreObject = { [key: string]: DataStoreObject | any };

export interface IDataStore<TInput = DataStoreObject, TOutput = DataStoreObject> extends IInitializable, ICloseable {
    save(key: string, data: TInput): Promise<TOutput>;
    get(keys: string): Promise<TOutput>;
    delete(keys: string): Promise<void>;
}


export interface RedisDataStoreOptions {
    port?: number;
    host: string;
    options?: redis.RedisOptions;
    logger: Logger;
}

export class RedisDataStore implements IDataStore {
    private client: redis.Redis;
    private logger: Logger;
    private readonly port: number;
    
    constructor(public options: RedisDataStoreOptions) {
        this.port = options.port || 6379;
        this.client = new redis(this.port, options.host, options.options || { lazyConnect: true });
        this.logger = options.logger;
    }

    initialize(): Promise<void> {
        return this.client.connect()
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
            this.logger.log(LogLevel.INFO, `Connected to Redis on ${this.options.host}:${this.port}`);
        });
    }

    save(key: string, data: DataStoreObject): Promise<DataStoreObject> {
        return this.client.hmset(key, data)
        .then(() => {
            this.logger.log(LogLevel.TRACE, `${key} was saved in Redis`);
            return data;
        });
    } 

    get(data: string): Promise<DataStoreObject> {//Single ID
        return new Promise<DataStoreObject>((resolve, reject) => {
            this.client.hgetall(data, (err: Error | null, data: DataStoreObject) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            })
        });
    }

    // need to type this, and require an id property to be present, since that's the only real way we can delete a key in Redis
    delete(key: string): Promise<void> {
        return this.client.del(key)
        .then(() => {
            this.logger.log(LogLevel.TRACE, `${this.constructor.name}#delete(${key}):SUCCESS`);
        });
    }

    close(): Promise<void> {
        try {
            this.client.disconnect();
            return Promise.resolve();
        } catch (e) {
            throw e;
        }
    }
}

export class MemoryDataStore implements IDataStore {
    private store: DataStoreObject;

    constructor() {
        this.store = {};
    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    save(key: string, data: DataStoreObject): Promise<DataStoreObject> {
        this.store[key] = data;
        return Promise.resolve(data);
    }

    get(key: string): Promise<DataStoreObject> {
        if (this._has(key)) {
            return Promise.resolve(this.store[key]);
        } else {
            throw new NotFoundError(`${key} not found`);
        }
    }
    
    delete(key: string): Promise<void> {
        delete this.store[key];
        return Promise.resolve();
    }

    _has(key: string): boolean {
        return !!this.store.hasOwnProperty(key);
    }


    close(): Promise<void> {
        this.store = {};
        return Promise.resolve();
    }
}

export class PhonyDataStore extends MemoryDataStore implements IDataStore {};