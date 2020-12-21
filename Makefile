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