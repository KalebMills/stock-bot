#TODO: Add targets for building SQLite db, and migrating the schema


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
	CONFIG_FILE=$(CONFIG_FILE) ALPACAS_SECRET_KEY=$(ALPACAS_SECRET_KEY) ALPACAS_API_KEY=$(ALPACAS_API_KEY) DISCORD_API_KEY=$(DISCORD_API_KEY) DISCORD_GUILD_ID=$(DISCORD_GUILD_ID) pm2 start bin/stock-bot.js --name stock-bot