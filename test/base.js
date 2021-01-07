"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const base_1 = require("../lib/base");
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
// const logger: Logger = createLogger({ transports: [ new winston.transports.Console() ] });
// const WORKER_COUNT: number = 10;
// //TODO: This typing is very strange. Fix
// let service: Service<IWorker<string>>;
// let worker: Worker<string>;
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
