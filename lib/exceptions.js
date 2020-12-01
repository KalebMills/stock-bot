"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isErrorType = exports.InvalidDataError = exports.NotFoundError = exports.UnrecoverableWorkerError = exports.UnprocessableTicker = exports.DefaultError = void 0;
class DefaultError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, DefaultError.prototype);
        this.message = message || 'DefaultError';
        this.name = this.constructor.name;
    }
}
exports.DefaultError = DefaultError;
class UnprocessableTicker extends DefaultError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || 'UnprocessableTicker';
        this.name = this.constructor.name;
    }
}
exports.UnprocessableTicker = UnprocessableTicker;
class UnrecoverableWorkerError extends DefaultError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || 'UnrecoverableWorkerError';
        this.name = this.constructor.name;
    }
}
exports.UnrecoverableWorkerError = UnrecoverableWorkerError;
class NotFoundError extends DefaultError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, NotFoundError.prototype);
        this.message = message || 'NotFoundError';
        this.name = this.constructor.name;
    }
}
exports.NotFoundError = NotFoundError;
class InvalidDataError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, InvalidDataError.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.InvalidDataError = InvalidDataError;
exports.isErrorType = (err, expected) => err.name === expected;
