import { StockBotOptionsValidationSchema, IStockServiceOptions, StockService } from '../lib/stock-bot';
import color from 'chalk';
import '../lib/util';


const CONFIG_FILE_NAME = process.env['CONFIG_FILE'] || 'dev.js';
const CONFIG_FILE_URL = `../conf/${CONFIG_FILE_NAME}`;
const config: IStockServiceOptions = require(CONFIG_FILE_URL);


const { error, errors } = StockBotOptionsValidationSchema.validate(config);

console.log(color.greenBright(`Loading from config ${CONFIG_FILE_NAME}.js`));

if (error || errors) {
    console.error(color.red(`An error occurred when loading StockService configuration: ${error} -- ${errors}`))
} else {
    const service = new StockService(config);
    service.initialize().then(() => console.log(color.green('StockService#initialize():SUCCESS')));
}

//Catches unhandled Promise errors
// process.on('unhandledRejection', () => {
    
// })