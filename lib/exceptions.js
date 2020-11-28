"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidData = exports.UnrecoverableWorkerError = exports.UnprocessableTicker = void 0;
class UnprocessableTicker extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.UnprocessableTicker = UnprocessableTicker;
class UnrecoverableWorkerError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.UnrecoverableWorkerError = UnrecoverableWorkerError;
class InvalidData extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, InvalidData.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.InvalidData = InvalidData;
