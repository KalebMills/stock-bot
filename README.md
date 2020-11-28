# StockBot

## Purpose

This project was started as a proof of concept to demonstrate the ability to take data, and make an educated decision on single stocks to purchase and sell. Since it's inception, this project has moved to be more than the proof of concept it once was. Now, this service is meant to be an "algo", or a bot set to trade single stocks based on data from the stock market, news articles, and other things that can cause the market, or single stocks to go up or down in share price. Allowing the owner of this bot to continuously make money without direct intervention.


## Structure

This project uses the Dependency Injection pattern. For this particular service, we rely on our "Service" and "Worker" structure. Since this is a Node project, the Worker acts as a virtual thread, allowing this service to provide more work to the Node call stack than a normal single process service would. 

The following are the main important abstractions for this service:

| Interface | Purpose |
| --------- | ------- |
| IService  | This interface serves as the base on any StockBot implementation, providing the basic functions to manage a service, like starting and stopping it. |
| IWorker   | The `IWorker` interface serves as the "operational" part of the service. Meaning this is the class that will do all of the work for this service, so it contains several methods for cleaning / processing data before trying to act upon it, and start and stop methods. |
| Exchange | The Exchange interface it an abstraction of any class that allows a user to buy or sell something. In our use case, we mainly care about abstracting API's that allow us to buy and sell stock. |
| IDataSource | The `IDataSource` interface gives us the ability to abstract any API that gives us stock data, this information is then passed to the `IWorker` to make decisions on buying and selling. This comes with the ability to sideline tickers, in the case it's already been returned, or there is some issue with trading that ticket. |

## Usage

This bot is meant to be ran as a service, as it will continually gather work on it's own during trading hours. This service is not meant to have any human intervention as it trades. Human intervention could potentially cause an issue with the service, resulting in a stock potentially not being sold, causing the user to incurr losses.

## Dev

Shipped with this project is a `Makefile`, which comes will the needed commands to run the service, compile changes, run tests, etc. 

The flow of getting a feature or bug fix merged in is Github Issue -> PR -> Test -> Merge

### Environment Variables to run the service

| Name | Value | Required | Notes |
| ---- | ----- | -------- | ----- |
| `ALPACAS_API_KEY` | string | true | API Key supplied in your Alpacas UI |
| `ALPACAS_SECRET_KEY` | string | true | Secret Key supplied in your Alpacas UI |
| `DATA_SOURCE` | string | true | Source to use for top gainers/losers [Polygon, Yahoo] |
| `CONFIG_FILE` | string | false | This points to a file in the `conf` folder, it is simply the file name, i.e `dev` |
| `STOCK_LOG_DIR` | string | false | This is the directory to which the service should write logs to |
| `DISCORD_API_KEY` | string | false | The token used for the `DiscordNotification` class |
