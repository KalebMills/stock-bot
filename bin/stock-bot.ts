import { StockBotOptionsValidationSchema, IStockServiceOptions, StockService } from '../lib/stock-bot';
import color from 'chalk';
import '../lib/util';
import { StockServiceManager } from '../lib/base';
import { createLogger } from '../lib/util';


const CONFIG_FILE_NAME = process.env['CONFIG_FILE'] || 'dev.js';
const CONFIG_FILE_URL = `../conf/${CONFIG_FILE_NAME}`;
const config: IStockServiceOptions = require(CONFIG_FILE_URL);


const { error } = StockBotOptionsValidationSchema.validate(config);

console.log(color.greenBright(`Loading from config ${CONFIG_FILE_NAME}.js`));

if (error) {
    console.error(color.red(`An error occurred when loading StockService configuration: ${error}`))
} else {
    const service = new StockService(config);
    service.initialize()
    .then(() => console.log(color.green('StockService#initialize():SUCCESS')))
    .catch(err => {
        console.log(color.red(`An unhandled error occurred, ${err}`));
        return service.close();
    });

    //TODO: Make the market time hook here, this way it can easily be controlled by starting and stopping the entire service. No need for the internals of the service to handle this.
    // let serviceManager = new StockServiceManager({
    //     logger: createLogger({})
    // });

    // serviceManager.monitorService(service);
}

//Catches unhandled Promise errors
// process.on('unhandledRejection', () => {
    
// })
