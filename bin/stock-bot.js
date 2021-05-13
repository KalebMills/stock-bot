"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stock_bot_1 = require("../lib/stock-bot");
const chalk_1 = __importDefault(require("chalk"));
require("../lib/util");
const CONFIG_FILE_NAME = process.env['CONFIG_FILE'] || 'dev.js';
const CONFIG_FILE_URL = `../conf/${CONFIG_FILE_NAME}`;
const config = require(CONFIG_FILE_URL);
const { error } = stock_bot_1.StockBotOptionsValidationSchema.validate(config);
console.log(chalk_1.default.greenBright(`Loading from config ${CONFIG_FILE_NAME}.js`));
if (error) {
    console.error(chalk_1.default.red(`An error occurred when loading StockService configuration: ${error}`));
}
else {
    const service = new stock_bot_1.StockService(config);
    service.initialize()
        .then(() => console.log(chalk_1.default.green('StockService#initialize():SUCCESS')))
        .catch(err => {
        console.log(chalk_1.default.red(`An unhandled error occurred, ${err}`));
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
