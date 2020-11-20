#TODO: Add targets for building SQLite db, and migrating the schema


.PHONY: tsc-only
tsc-only: 
	./node_modules/.bin/tsc --project ./tsconfig.json