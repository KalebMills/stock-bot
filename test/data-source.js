"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const D = __importStar(require("../lib/data-source"));
const winston = __importStar(require("winston"));
const joi = __importStar(require("joi"));
const assert = __importStar(require("assert"));
const chai = __importStar(require("chai"));
const logger = winston.createLogger({
    transports: [
        new winston.transports.Console()
    ],
    level: "silly"
});
let fakeDataSourceInstance;
describe('#DataSource abstract class', () => {
    class FakeDatasource extends D.DataSource {
        constructor(options) {
            super(options);
        }
        scrapeDatasource() {
            return Promise.resolve([]);
        }
    }
    it('Can create a base DataSource class', () => {
        const baseOptions = {
            logger,
            validationSchema: joi.object({
                ticker: joi.string().required(),
                price: joi.number().required()
            })
        };
        fakeDataSourceInstance = new FakeDatasource(baseOptions);
        chai.assert.instanceOf(fakeDataSourceInstance, D.DataSource);
    });
    it('Can time out a ticker', () => {
        fakeDataSourceInstance.timeoutTicker('AAAL', 1);
        assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 1);
        const deferred = fakeDataSourceInstance.timedOutTickers.get("AAAL");
        return deferred.promise
            .then(() => {
            assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 0);
        });
    });
    it('Can close a datasource successfully', () => {
        for (let i = 1; i <= 10; i++) {
            fakeDataSourceInstance.timeoutTicker(((Math.random() * Math.random()) * 12).toString(), 10);
        }
        return fakeDataSourceInstance.close()
            .then(() => assert.strictEqual(fakeDataSourceInstance.timedOutTickers.size, 0));
    });
});
