"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const stock_bot_1 = require("../lib/stock-bot");
const chalk_1 = __importDefault(require("chalk"));
const CONFIG_FILE_NAME = process.env['CONFIG_FILE'] || 'dev.js';
const CONFIG_FILE_URL = `../conf/${CONFIG_FILE_NAME}`;
const config = require(CONFIG_FILE_URL);
const { error, errors } = stock_bot_1.StockBotOptionsValidationSchema.validate(config);
if (error || errors) {
    console.error(chalk_1.default.red(`An error occurred when loading StockService configuration: ${error} -- ${errors}`));
}
else {
    const service = new stock_bot_1.StockService(config);
    service.initialize()
        .then(() => console.log(chalk_1.default.green('StockService#initialize():SUCCESS')))
        .catch(err => {
        console.log(chalk_1.default.red(`An unhandled error occurred, ${err}`));
        return service.close();
    });
}
