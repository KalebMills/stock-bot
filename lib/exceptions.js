"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvalidDataError = exports.UnrecoverableWorkerError = exports.UnprocessableTicker = void 0;
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
class InvalidDataError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, InvalidDataError.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.InvalidDataError = InvalidDataError;
