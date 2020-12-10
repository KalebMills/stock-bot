#TODO: Add targets for building SQLite db, and migrating the schema


.PHONY: tsc-only
tsc-only: 
	./node_modules/.bin/tsc --project ./tsconfig.json

.PHONY: test-only
test-only: 
	npx ./node_modules/.bin/mocha test

.PHONY: setup-poetry-only
setup-poetry-only:
	sudo apt-get install python3-distutils
	sudo apt-get install python3-apt
	curl -sSL https://raw.githubusercontent.com/python-poetry/poetry/master/get-poetry.py | python3 -