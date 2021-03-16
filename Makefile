SERVICE_NAME ?= stock-bot

.PHONY: tsc-only
tsc-only: 
	./node_modules/.bin/tsc --project ./tsconfig.json

.PHONY: test-only
test-only: 
	npx ./node_modules/.bin/mocha test

.PHONY: newest-tickers
newest-tickers:
	node bin/fetch-latest-tickers.js



#Service Management Commands
.PHONY: start-bot
start-bot:
	CONFIG_FILE=$(CONFIG_FILE) ALPACAS_SECRET_KEY=$(ALPACAS_SECRET_KEY) \
	TWELVE_DATA_API_KEY=$(TWELVE_DATA_API_KEY) \
	ALPACAS_API_KEY=$(ALPACAS_API_KEY) \
	DISCORD_API_KEY=$(DISCORD_API_KEY) \
	TWITTER_API_KEY=$(TWITTER_API_KEY) \
	TWITTER_API_SECRET=$(TWITTER_API_SECRET) \
	TWITTER_ACCESS_TOKEN=$(TWITTER_ACCESS_TOKEN) \
	TWITTER_ACCESS_SECRET=$(TWITTER_ACCESS_SECRET) \
	DISCORD_GUILD_ID=$(DISCORD_GUILD_ID) \
	pm2 start bin/stock-bot.js --name $(SERVICE_NAME)

.PHONY: stop-bot
stop-bot:
	pm2 delete $(SERVICE_NAME)

.PHONY: restart-bot
restart-bot:
	pm2 restart $(SERVICE_NAME)