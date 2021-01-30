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
exports.Worker = exports.Service = exports.promiseRetry = exports.LogLevel = void 0;
const bluebird_1 = __importDefault(require("bluebird"));
const uuid = __importStar(require("uuid"));
var LogLevel;
(function (LogLevel) {
    LogLevel["TRACE"] = "silly";
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
exports.promiseRetry = (fn, retryInterval = 3000 /* ms */, maxRetries = 5, curRetry = 1) => {
    return fn().catch((err) => {
        if (curRetry <= maxRetries) {
            let delay = curRetry === 1 ? retryInterval : retryInterval * curRetry;
            return bluebird_1.default.delay(delay)
                .then(() => {
                console.info(`promiseRetry - Attempt: ${curRetry} | time delay: ${delay}`);
                return exports.promiseRetry(fn, retryInterval, maxRetries, curRetry + 1);
            });
        }
        else {
            console.info(`promiseRetry.exaustRetries() - throwing error`);
            throw err;
        }
    });
};
/*
    We have two options here:

    1. We set the worker to run on a static workers.

    2. We make `initialize()` an abstract method on the service. With this being abstract, we then could allow the workers to be either static, or dynamic based on work provided via `_preProcess()`

    Notes: For now this is "cosmetic", i.e, this doesn't have a real effect on how we perform work, just the max count of how many "threads" we allow to run. If we maintain a constant # of workers, this will make no
    difference on how work gets accomplished, or even how much.
*/
class Service {
    constructor(options) {
        this.concurrency = options.concurrency;
        this.workers = new Map();
        //@ts-ignore
        this.workerOptions = options.workerOptions; //TODO: fix this type error; makeWorkerOptions should have it's own interface
        this.logger = options.logger;
        this.isClosed = false;
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }
    initialize() {
        return bluebird_1.default.try(() => {
            for (let i = 1; i <= this.concurrency; i++) {
                const workerId = uuid.v4().substr(0, 8);
                const worker = this.makeWorker(Object.assign(Object.assign({}, this.workerOptions), { id: workerId, logger: this.logger, _preProcessor: this.preProcess }));
                this.workers.set(workerId, worker);
                worker.start();
            }
        })
            .then(() => this.logger.log(LogLevel.TRACE, `Started all workers for ${this.constructor.name}#initialize():SUCCESS`))
            .then(() => { });
    }
    close() {
        this.isClosed = true;
        let pendingWork = [];
        this.workers.forEach(worker => {
            let workerClosingProcess = worker.close();
            workerClosingProcess.then(() => {
                this.workers.delete(worker.id);
            });
            pendingWork.push(workerClosingProcess);
        });
        return Promise.all(pendingWork)
            .then(() => this.logger.log(LogLevel.INFO, `${this.constructor.name}#shutdown():SUCCESS`))
            .then(() => { })
            .catch((err) => {
            this.logger.log(LogLevel.ERROR, `${this.constructor.name}#shutdown():ERROR - ${err}`);
            // Swallow error intentionally, allow service to close even with an error;
        });
    }
}
exports.Service = Service;
class Worker {
    constructor(options) {
        this.isRunning = false;
        this.isClosed = false;
        this.id = options.id;
        this.logger = options.logger;
        this._preProcessor = options._preProcessor;
        this._exceptionHandler = options.exceptionHandler;
    }
    initialize() {
        return Promise.resolve()
            .then(() => this.logger.log(LogLevel.TRACE, `Worker ${this.id}#initialize():SUCCESS`))
            .then(() => { });
    }
    start() {
        this.isRunning = true;
        this.logger.log(LogLevel.TRACE, `Worker ${this.id}#start():SUCCESS`);
        this.run();
    }
    stop() {
        this.isRunning = false;
    }
    run() {
        if (this.isRunning && !this._pendingProcess && !this.isClosed) {
            //TODO: this._preProcessor should not be called here, instead this._preProcessor should mostly likely be removed.
            this._pendingProcess = this._preProcessor().then((args) => this.process(args));
            this._pendingProcess
                .then(() => {
                delete this._pendingProcess;
            })
                .catch((err) => {
                delete this._pendingProcess;
                this._exceptionHandler(err);
            })
                //Don't care if it fails, rerun;
                .finally(() => this.run());
        }
    }
    close() {
        //Since we do not manage a process, no need to wait for the process to be complete;
        this.isRunning = false;
        return bluebird_1.default.all([this._pendingProcess])
            .then(() => this.logger.log(LogLevel.INFO, `Worker ${this.id}#close():SUCCESS`))
            .then(() => { });
    }
}
exports.Worker = Worker;
