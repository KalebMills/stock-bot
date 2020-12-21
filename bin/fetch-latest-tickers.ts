import { AlpacaClient } from '@master-chief/alpaca';
import * as path from 'path';
import * as fs from 'fs';
import color from 'chalk';

const TICKER_PATH = path.join(__dirname, '..', 'resources', 'tickers.txt');

const client = new AlpacaClient({
    rate_limit: true,
    credentials: {
        secret: (process.env['ALPACAS_SECRET_KEY'] || ""),
        key: (process.env['ALPACAS_API_KEY'] || "")
    }
});

const assets = client.getAssets({ status: 'active' })
.then(data => {
    return data.filter((asset) => 
        asset.tradable &&
        asset.symbol.length < 5 &&
        !asset.symbol.match(/(\.+)|(\-+)/),
    );
});

assets
.then(data => {
    const tickers = data.map(asset => asset.symbol).join('\n');

    return new Promise<void>((resolve, reject) => {
        fs.writeFile(TICKER_PATH, tickers.toString(), (err) => {
            if (err) {
                console.log(color.red(`Failed to fetch newest tickers: ${JSON.stringify(err)}`));
                reject(err);
            } else {
                console.log(color.green(`Successfully fetched newest tickers`));
                resolve();
            }
        });
    })
})
.catch(err => {
    console.log(color.red(`OUTTER CATCH: Failed to fetch newest tickers: ${JSON.stringify(err)}`));
});
