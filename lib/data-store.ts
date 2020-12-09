import redis from 'ioredis';
import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import { NotFoundError } from './exceptions';

//TODO: Perhaps find a more robust way to truly type this rather than using `any`
export type BaseDataStoreObject = { [key: string]: BaseDataStoreObject | any };

export interface DataStoreObject<T = any> {
    [key: string]: BaseDataStoreObject | T | any;
}


export interface IDataStore<TInput = DataStoreObject, TOutput = DataStoreObject> extends IInitializable, ICloseable {
    save(key: string, data: TInput): Promise<TOutput>;
    get(keys: string): Promise<TOutput[]>;
    delete(keys: string): Promise<void>;
}


export interface RedisDataStoreOptions {
    port?: number;
    host: string;
    options?: redis.RedisOptions;
    logger: Logger;
}

export class RedisDataStore<TInput, TOutput> implements IDataStore<TInput, TOutput> {
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

    /*
        At MAX, we should have about 7k entries, so SCAN should not be a huge impact 
    */
    get(data: string): Promise<TOutput[]> {//Single ID
        //TODO: This should handle a wildcard as the id, i.e TSLA-*, which would fetch us all of the entries in the DB with TSLA-uuid
        if (data.includes('*')) { //Wildcard search
            return new Promise<TOutput[]>((resolve, reject) => {
                this.client.scan(0, 'match', data)
                .then((data: [string, string[]]) => {
                    //data[0] is supposed to be a new cursor, but we don't care about that
                    console.log(data[1])
                    resolve([]);
                })
                .catch(reject);
            });
        } else {
            return new Promise<TOutput[]>((resolve, reject) => {
                this.client.hgetall(data, (err: Error | null, data: DataStoreObject) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve([data as TOutput]);
                    }
                })
            });
        }
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

    get(key: string): Promise<DataStoreObject[]> {
        //Note, this will only ever return a single value in the array
        if (this._has(key) || this._hasWildCard(key)) {
            if (this._hasWildCard(key)) {
                return this._fetchWildCardValues(key);
            } else {
                return Promise.resolve([this.store[key]]);
            }
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

    _hasWildCard = (key: string) => {
        return key.includes('*');
    }

    //Only supports '*' as the wildcard
    _fetchWildCardValues = (key: string): Promise<DataStoreObject[]> => {
        const partialKey = key.replace('*', '');
        const options = Object.keys(this.store);
        const matches = options.filter(key => key.includes(partialKey));
        console.log(`${matches.length} matches`)

        return Promise.resolve(matches.map(key => this.store[key]));
    }


    close(): Promise<void> {
        this.store = {};
        return Promise.resolve();
    }
}

export class PhonyDataStore extends MemoryDataStore implements IDataStore {};