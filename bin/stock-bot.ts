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
    let serviceManager = new StockServiceManager({
        logger: createLogger({})
    });

    serviceManager.monitorService(service);
}

//Catches unhandled Promise errors
// process.on('unhandledRejection', () => {
    
// })
