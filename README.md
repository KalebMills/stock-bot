### Rules for Trading

1. A stock must have increased by 5% over the last 20 minutes
2. The only stocks that can be traded will be specified in a file that is reloaded every "tick" (i.e everytime this "script" will run)
3. A stock can never be sold for less than the price it was bought for
4. A stock should be sold once it has  1. Bypassed 15% increase, but has dropped past that (i.e a stock increased 35%, but today has lost 22% of that gain from yesterday). 2. We have passed 50% gains.


### Code Format

We should create a Service, and a Service can be given a Worker. A worker is what will have the functionality to perform trades, when it's .process() method is called. .process() will be called after the run() method on the service is called, which will be called when a service is started. 

Service
    workers: List<Worker>
    isRunning: Boolean #whether or not the service is processing
    isClosed: boolean
    concurrency: number;

    initialize()
    shutdown()

Worker
    db: GoogleSpreadsheet
    isRunning: boolean
    isClosed: boolean
    start()
    stop()
    run()
    process()
    close()


Basic use of an Exchange should be Buy, Sell, and getting ticker info. 

Exchange
    getByTicker(ticker: string, historyLength: MomentDate);
    buy(ticker: string, shares: number);



### Logging and Trade storing design

NOTE: If it turns out that Alpacas can provide this time series information, a database will not be needed

For logging, for now we want to write to a file all of our logs. Winston is our logger, which handles multiple transports. We may want to add additional functionality to this, in the case where we may want to text out urgent notifications.

I want a comprehensive understanding of the trades being made by the bot, at all times. For this, I believe using the google-sheets API is best.



### Dependencies to run this Service
`alpacas`
`google-sheets-api`


### Secrets required to run this
alpacas secret & api key

### ENV VARIABLES

STOCK_LOG_DIR - The directly where log files should be written to.
ALPACAS_SECRET_KEY - API credentials
ALPACAS_API_KEY - API Credentials

## Notes while in development

For the Alpacas exchange, it seems stop limits and such are part of this API. From this perspective, it is more than likely Alpacas will not require the ability to sell a stock, because it has the ability to set limits for when to sell a stock, whether that be for a loss or gain. In this case out .sell method on that exchange can just return a resolved promise, then allow Alpacas to handle the rest of the trading from there.


We should most likely consider a `promptStopSell` method for our exchange. Because with this functionality, we could allow more workers to be free, thus getting more good buys, versus being tied up with a pending sale. Stop limit order is also very handy because we immediately determine at what price a stock will be sold at (whether that be high or low), which also gives us a way to predetermine how much loss and gain we are willing to take.

After looking at Alpacas, it seems the most fit way of placing an order is a Bracket Order. We can place an order to buy, and then a stop order for that buy, and a take profit order for that buy.

This would allow us in one smooth motion to remove complexity from the bot, and give us a way to truly know when we have capital to allow another bot to attempt an order.

## Current Status

We have now completed the steps for fetching tickers, and passing it to the worker. We now need to work on the worker to get the tickers history data, and decide if the stock should be purchased. We also need to use that price data point to filter out stocks who's stock price is higher than what we are willing to pay per share

## POST Live Status

We should look into `https://blueshift.quantinsti.com/`. This supposedly has a bunch of templated algos based on years of data.

## Milestones

[X] Return top N stock gainers

[X] Recursively call function to get latest data to give to workers

[X] Able to calculate a change between a history and current stock price

[X] Validate data that is scraped from Yahoo

[X] Fix fetching history price function 
    i.e - We need to fix how we fetch tickers. It needs to verify it's during trading time

[X] Integrate Google Sheets API into the StockService

[X] Create a more rigid way of getting current (valid) stock data.
    [X] What we are looking for here is data validation, 
    [X] as well as relevant data. 
    [X] Meaning, we want the stocks with the highest change rate over N minutes. This way, we can see what is actually trending, vs looking at trends over a fixed amount of time, like highest change on the day.

    Currently we are blocked by a technical limitation of not being able to get data by the rate of change over N time. We have to do that calculation on the top gainers that we scrape.

[X] Create functionality for limit the $ amount of stocks purchased, or the share count

[X] Create algorithm for purchasing a "good stock"
    [X] Create basic hard limits on how we want to trade

[X] Introduce usage of the exchange in the StockBot

[X] Create functionality to check buying power before attempting to purchase a stock
    [X] Add `getBuyPower` functionality to the `Exchange` interface

[] Create webhook functionality that will text me when a market order is fulfilled, and have it give a summary of the trade

[] Update README with what environment variables are expected

[] Add Makefile commands for managing this Node process with PM2

[X] Create functionality for configuration just like spc ivr

[] First test day