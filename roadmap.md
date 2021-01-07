# StockBot Roadmap 

## Current State (as of 12/27/2020)

### DataSource

Across our `DataSource` implementations, we have the ability to fetch the top gainers and losers on the day. Also, we have a `LiveDataSource` implementation that gets live price updates.

### Workers

Across our `Workers` implementations, we have the ability to notify based on price change parameters, as well as automate purchases of securities. Our current abilities allow for such strategies as scalping, or day trading.



## Desired State

### DataSource

**Comments**: There are 2 main faults with our `DataSource` implementations. First is our golden goose (`PolygonLiveDataSource`) falls short as it pertains to the amount of information we gather. Meaning, the only true data we now get from this `DataSource` is the current price of the security. This keeps us from being able to look at things live such as volume, short trade volume, etc. The other is that the current users of this bot (Kaleb, Swaraj) are currently bound by the FTC Pattern Day Trading Rule. So though we can get live data and process it live, it is most often the case that we cannot act on it programmatically because we are bound by the number of day trades we can make.

**Desired**: What is desired is a balance. We need more data to better vet securities that can be purchased and held overnight and still get a gain. The balance comes between how often we can get new data, and how up to date that data is. The ideal balance is a `DataSource` that can give us raw data like volume of the day, average volume, vwap, etc while being to query it often (while managing 6-8k tickers, OR having an API that does sorting for us). 



### Workers

**Comments**: Currently our `Workers` are bound by the PDT rule. This is our main stumbling block, but should be looked at as a technical limitation of our system, since we will _always_ have to work around it until we have the ability to have 25k in the brokerage account. Our current `Worker(s)` have no understanding of a limit of trades, and does not have the concept of positions that are held. The workers essentially operate in the service in a `Event -> Notify / Purchase or Don't`. We need this to take into account more than just ticker information, while maintaining speed of processing.

**Desired**: We need our `Worker(s)` implementation to be able to be aware of the number of day trades that have been made that day, or be aware of the concept of trades done in a week. The ideal situation is that this bot should be able to automatically place trades with stop orders, so the buying and selling of securities can be completely automated. To do this, the `Exchange` should have the ability to provide the information about current positions and number of day trades that can be analyzed by the `Worker(s)`. Then the `Worker(s)` need to find a way to make trades based around that data.

Also, we want our `Worker(s)` to have an abstract grading system. The point being that any worker should be able to have a way to properly grade incoming information on a security, but provide some basic interface of grading. i.e `confidenceScore`, who's values are only able to be `1-10`, with each value indicating either high risk, or low reward. This way, the workers can have a generic standard on grading security indicators, which are also human readable at a glance. The ideal implementation for this is an `abstract` method that every worker uses, since each implementation will be unique to the worker, and the incoming data.