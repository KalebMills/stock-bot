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
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("../lib/base");
const winston_1 = require("winston");
const winston = __importStar(require("winston"));
class TestService extends base_1.Service {
    constructor(options) {
        super(options);
    }
    preProcess() {
        return Promise.resolve('');
    }
    exceptionHandler(err) {
        return;
    }
    makeWorker(options) {
        return new TestWorker(options);
    }
}
class TestWorker extends base_1.Worker {
    constructor(options) {
        super(options);
    }
    process(incomingData) {
        return Promise.resolve();
    }
}
//Properties the tests need to run
const logger = winston_1.createLogger({ transports: [new winston.transports.Console()] });
const WORKER_COUNT = 10;
//TODO: This typing is very strange. Fix
let service;
let worker;
// describe('#Base Service', () => {
//     it('Can constuct a Service instance', () => {
//         service = new TestService({
//             concurrency: WORKER_COUNT,
//             logger,
//             workerOptions: {
//                 logger,
//                 id: 'TEST',
//                 //@ts-ignore
//                 _preProcessor: () => Promise.resolve(),
//                 exceptionHandler: () => {}
//             }
//         });
//         assert.equal(service instanceof Service, true);
//     });
//     it('Can create multiple workers', () => {
//         return service.initialize()
//         .then(() => {
//             assert.equal(service.workers.size === 10, true);
//         });
//     });
//    //In the future, we would want the Service process to stay running, in the case where workers are dynamic, and are created more as threads vs static running processes
//     it('Can close all workers, and close the process', () => {
//         return service.close()
//         .then(() => {
//             assert.equal(service.workers.size === 0, true);
//         });
//     });
// });
