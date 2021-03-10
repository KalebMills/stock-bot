"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isErrorType = exports.RequestError = exports.InsufficentFundsError = exports.InvalidConfigurationError = exports.InvalidDataError = exports.NotFoundError = exports.UnrecoverableWorkerError = exports.UnprocessableEvent = exports.ServiceClosed = exports.UnprocessableTicker = exports.DefaultError = void 0;
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
class ServiceClosed extends DefaultError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, ServiceClosed.prototype);
        this.message = message || 'ServiceClosed';
        this.name = this.constructor.name;
    }
}
exports.ServiceClosed = ServiceClosed;
class UnprocessableEvent extends DefaultError {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableEvent.prototype);
        this.message = message || 'UnprocessableEvent';
        this.name = this.constructor.name;
    }
}
exports.UnprocessableEvent = UnprocessableEvent;
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
class InvalidConfigurationError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, InvalidConfigurationError.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.InvalidConfigurationError = InvalidConfigurationError;
class InsufficentFundsError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, InsufficentFundsError.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.InsufficentFundsError = InsufficentFundsError;
/**
 * When an axios GET request fails.
 */
class RequestError extends Error {
    constructor(message) {
        super(message);
        Object.setPrototypeOf(this, RequestError.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}
exports.RequestError = RequestError;
exports.isErrorType = (err, expected) => err.name === expected;
