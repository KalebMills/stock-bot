import BPromise from 'bluebird';
import { inspect } from 'util';
import * as uuid from 'uuid';
import * as winston from 'winston';
import { DefaultError, ServiceClosed } from './exceptions';
import { IMetricProvider } from './metrics';
import { isMarketTime, Timer } from './util';

export type Logger = winston.Logger;

export enum LogLevel {
    TRACE = "silly",
    DEBUG = 'debug',
    INFO = "info",
    WARN = "warn",
    ERROR = "error"
}

export const promiseRetry = <T>(fn: () => Promise<T>, retryInterval: number = 3000 /* ms */, maxRetries: number = 5,  curRetry: number = 1): Promise<T> => {

    return fn().catch((err) => {
        if(curRetry <= maxRetries) {
            let delay = curRetry === 1 ? retryInterval : retryInterval * curRetry;
            return BPromise.delay(delay)
            .then(() => {
                console.info(`promiseRetry - Attempt: ${curRetry} | time delay: ${delay}`)
                return promiseRetry(fn, retryInterval, maxRetries, curRetry + 1);
            })
        } else {
            console.info(`promiseRetry.exaustRetries() - throwing error`);
            throw err;
        }
    })
}

export interface IInitializable {
    initialize(): Promise<void>;
}

export interface ICloseable {
    close(): Promise<void>;
}

export interface IService<IWorker> extends IInitializable, ICloseable {
    makeWorker(options: IWorkerOptions): IWorker;
    exceptionHandler(err: Error): void;
    logger: Logger;
    workers: Map<string, IWorker>;
    isClosed(): boolean;
    isRunning(): boolean;
}

export interface IServiceOptions<T = any> {
    concurrency: number;
    workerOptions: IWorkerOptions<T>;
    logger: Logger;
    metric: IMetricProvider;
}

export interface IWorkerOptions<TInput = any> {
    id: string;
    _preProcessor: () => Promise<TInput>;
    exceptionHandler(err: Error): void;
    logger: Logger;
    metric: IMetricProvider;
}

export interface IWorker<TInput, TOutput = any> extends IInitializable, ICloseable {
    logger: Logger;
    id: string;
    isRunning: boolean;
    isClosed: boolean;
    _preProcessor: () => Promise<TInput>;
    start(): void;
    stop(): void;
    run(): void;
    process(options: TInput): Promise<TOutput>;
    close(): Promise<void>; 
}

export interface StockServiceManagerOptions {
    logger: Logger;
}

export interface ServiceManager {
    monitorService(service: IService<IWorker<any>>): void;
}

export class StockServiceManager implements ServiceManager {
    private logger: Logger;
    isMarketTime: boolean;

    constructor(options: StockServiceManagerOptions) {
        this.logger = options.logger;
        this.isMarketTime = false;

        //NOTE: For testing and changing the values
        // setInterval(() => {
        //     console.log(`Setting isMarketTime to ${!this.isMarketTime}`)
        //     this.isMarketTime = !this.isMarketTime;
        // }, 15000);
    }

    monitorService(service: IService<IWorker<any>>): void {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#monitorService():INVOKED || ${service.constructor.name} is currently in ${this.isMarketTime ? 'Running' : 'Stopped'} stated`);

        isMarketTime()
        .then(isMarketTime => {
            this.isMarketTime = isMarketTime;

            return BPromise.delay(15000)
                .then(() => BPromise.try(() => {
                    if (this.isMarketTime) {
                        if (service.isClosed() || !service.isRunning()) {
                            return service.initialize()
                                .then(() => this.logger.log(LogLevel.INFO, `${this.constructor.name} has started ${service.constructor.name}`))
                                .catch(service.exceptionHandler);
                        }
                    } else {
                        if (!service.isClosed() && service.isRunning()) {
                            return service.close()
                                .catch(service.exceptionHandler);
                        }
                    }
                })).catch(err => {
                    console.error(`${this.constructor.name}#monitorService():ERROR`, inspect(err));
                })
                .finally(() => this.monitorService(service))
        });
    }
}

/*
    We have two options here:

    1. We set the worker to run on a static workers. 

    2. We make `initialize()` an abstract method on the service. With this being abstract, we then could allow the workers to be either static, or dynamic based on work provided via `_preProcess()`

    Notes: For now this is "cosmetic", i.e, this doesn't have a real effect on how we perform work, just the max count of how many "threads" we allow to run. If we maintain a constant # of workers, this will make no 
    difference on how work gets accomplished, or even how much.
*/
export abstract class Service<PInput, POutput> implements IService<IWorker<PInput>> {
    workers: Map<string, IWorker<PInput>>;
    concurrency: number;
    workerOptions: IWorkerOptions<POutput>;
    logger: Logger;
    _isClosed: boolean;
    _isRunning: boolean;
    metric: IMetricProvider;
    constructor(options: IServiceOptions) {
        this.concurrency = options.concurrency;
        this.workers = new Map();
        this.metric = options.metric;
        //@ts-ignore
        this.workerOptions = options.workerOptions; //TODO: fix this type error; makeWorkerOptions should have it's own interface
        this.logger = options.logger;
        this._isClosed = false;
        this._isRunning = false;
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }

    initialize(): Promise<void> {
        this._isClosed = false;
        this._isRunning = false;

        return BPromise.try(() => {
            for ( let i = 1; i <= this.concurrency; i++ ) {
                const workerId: string = uuid.v4().substr(0, 8);
                const worker = this.makeWorker({
                    ...this.workerOptions,
                    metric: this.metric,
                    id: workerId,
                    logger: this.logger,
                    _preProcessor: this.preProcess
                });
                this.workers.set(workerId, worker);
                worker.start();
            }
        })
        .then(() => this.logger.log(LogLevel.TRACE, `Started all workers for ${this.constructor.name}#initialize():SUCCESS`))
        .then(() => {
            this._isRunning = true;    
        })
    }

    abstract preProcess(): Promise<POutput>;

    abstract makeWorker(options: IWorkerOptions): IWorker<PInput>;

    abstract exceptionHandler(err: Error): void;

    isClosed(): boolean {
        return this._isClosed;
    }

    isRunning(): boolean {
        return this._isRunning;
    }


    close(): Promise<void> {
        this._isClosed = true;

        let pendingWork: Promise<any>[] = [];

        this.workers.forEach(worker => {
            let workerClosingProcess = worker.close();

            workerClosingProcess.then(() => {
                this.workers.delete(worker.id);
            });

            pendingWork.push(workerClosingProcess);
        });

        return Promise.all(pendingWork)
        .then(() => this.logger.log(LogLevel.INFO, `${this.constructor.name}#shutdown():SUCCESS`))
        .then(() => {
            this._isRunning = false;
        })
        .catch((err: DefaultError) => {
            if (err.name != ServiceClosed.name) {
                this.logger.log(LogLevel.ERROR, `${this.constructor.name}#shutdown():ERROR - ${err}`);
            }
            // Swallow error intentionally, allow service to close even with an error;
        });
    }
}

export abstract class Worker<TInput> implements IWorker<TInput> {
    isRunning: boolean;
    isClosed: boolean;
    logger: Logger;
    metric: IMetricProvider;
    id: string;
    _preProcessor: () => Promise<TInput>;
    _exceptionHandler: (err: Error) => void;
    private _pendingProcess?: Promise<any>;

    constructor(options: IWorkerOptions) {
        this.isRunning = false;
        this.isClosed = false;
        this.id = options.id;
        this.metric = options.metric;
        this.logger = options.logger;
        this._preProcessor = options._preProcessor;
        this._exceptionHandler = options.exceptionHandler;
    }

    initialize(): Promise<void> {
        return Promise.resolve()
        .then(() => this.logger.log(LogLevel.TRACE, `Worker ${this.id}#initialize():SUCCESS`))
        .then(() => {})
    }

    start(): void {
        this.isRunning = true;
        this.isClosed = false;
        this.logger.log(LogLevel.TRACE, `Worker ${this.id}#start():SUCCESS`);
        this.run();
    }

    stop(): void {
        this.logger.log(LogLevel.INFO, `Worker ${this.id}#stop():INVOKED`)
        this.isRunning = false;
    }

    run(): void {
        if(this.isRunning && !this._pendingProcess && !this.isClosed) {
            let timer = new Timer();
            timer.start();
            //TODO: this._preProcessor should not be called here, instead this._preProcessor should mostly likely be removed.
            this._pendingProcess = this._preProcessor().then((args) => this.process(args))

            this._pendingProcess
            .then(() => {
                delete this._pendingProcess;
            })
            .catch((err: Error) => {
                delete this._pendingProcess;
                this._exceptionHandler(err);
            })
            //Don't care if it fails, rerun;
            .finally(() => {
                let end = timer.stop();
                this.metric.push({
                    'tickerProcessTime': {
                        value: end,
                        labels: {}
                    }
                });
                this.run()
            });
        } else {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#run():INVOKED - Worker is in a paused or stopped state.`);
        }
    }

    abstract process(options: TInput): Promise<void>;

    close(): Promise<void> {
        this.logger.log(LogLevel.INFO, `Worker ${this.id}#close():INVOKED`)
        //Since we do not manage a process, no need to wait for the process to be complete;
        this.isRunning = false;
        this.isClosed = true;
        return BPromise.all([this._pendingProcess])
            .then(() => this.logger.log(LogLevel.INFO, `Worker ${this.id}#close():SUCCESS`))
            .then(() => {
            
        })
    }
}