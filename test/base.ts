import { Service, Worker, IServiceOptions, IWorkerOptions, IWorker } from '../lib/base';
import { Logger } from '../lib/base';
import { createLogger } from '../lib/util';
import * as assert from 'assert';
import * as winston from 'winston';

class TestService extends Service<string, string> {
    constructor(options: IServiceOptions) {
        super(options);
    }

    preProcess(): Promise<string> {
        return Promise.resolve('');
    }

    exceptionHandler(err: Error): void {
        return;
    }

    makeWorker(options: IWorkerOptions): IWorker<string, void> {
        return new TestWorker(options);
    }
}

class TestWorker extends Worker<string> {
    constructor(options: IWorkerOptions) {
        super(options);
    }

    process(incomingData: string): Promise<void> {
        return Promise.resolve();
    }
}

//Properties the tests need to run
const logger: Logger = createLogger({ transports: [ new winston.transports.Console() ] });

let service: Service<string, string> = new TestService({
    concurrency: 10,
    logger,
    workerOptions: {
        logger,
        id: 'TEST',
        //@ts-ignore
        _preProcessor: () => Promise.resolve(),
        exceptionHandler: () => {}
    }
});


// describe('#Base Service', () => {
//     it('Can constuct a Service instance', () => {
//         service = new TestService({
//             concurrency: 10,
//             logger,
//             workerOptions: {
//                 logger,
//                 id: 'TEST',
//                 //@ts-ignore
//                 _preProcessor: () => Promise.resolve(),
//                 exceptionHandler: () => {}
//             }
//         });

//         assert.deepStrictEqual(service instanceof Service, true);
//     });

//     it('Can create multiple workers', () => {
//         // service['concurrency'] = 10;
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