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
	ALPACAS_API_KEY=$(ALPACAS_API_KEY) DISCORD_API_KEY=$(DISCORD_API_KEY) \
	DISCORD_GUILD_ID=$(DISCORD_GUILD_ID) \
	UV_THREADPOOL_SIZE=128 \
	pm2 start bin/stock-bot.js --name $(SERVICE_NAME) --max-memory-restart 1024M

.PHONY: stop-bot
stop-bot:
	pm2 delete $(SERVICE_NAME)

.PHONY: restart-bot
restart-bot:
	pm2 restart $(SERVICE_NAME)


# Service Dependency Commands

.PHONY: start=redis
start-redis:
	docker run --name=stock_bot_redis -d -p 6379:6379 redis:alpine

.PHONY: stop-redis
stop-redis:
	docker rm -f stock_bot_redis

.PHONY: restart-redis
restart-redis: stop-redis start-redis