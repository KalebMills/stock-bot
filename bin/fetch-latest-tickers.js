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
const alpaca_1 = require("@master-chief/alpaca");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const chalk_1 = __importDefault(require("chalk"));
const TICKER_PATH = path.join(__dirname, '..', 'resources', 'tickers.txt');
const client = new alpaca_1.AlpacaClient({
    rate_limit: true,
    credentials: {
        secret: (process.env['ALPACAS_SECRET_KEY'] || ""),
        key: (process.env['ALPACAS_API_KEY'] || "")
    }
});
const assets = client.getAssets({ status: 'active' })
    .then(data => {
    return data.filter((asset) => asset.tradable &&
        asset.symbol.length < 5 &&
        !asset.symbol.match(/(\.+)|(\-+)/));
});
assets
    .then(data => {
    const tickers = data.map(asset => asset.symbol).join('\n');
    return new Promise((resolve, reject) => {
        fs.writeFile(TICKER_PATH, tickers.toString(), (err) => {
            if (err) {
                console.log(chalk_1.default.red(`Failed to fetch newest tickers: ${JSON.stringify(err)}`));
                reject(err);
            }
            else {
                console.log(chalk_1.default.green(`Successfully fetched newest tickers`));
                resolve();
            }
        });
    });
})
    .catch(err => {
    console.log(chalk_1.default.red(`OUTTER CATCH: Failed to fetch newest tickers: ${JSON.stringify(err)}`));
});
