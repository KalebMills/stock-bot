
export class DefaultError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, DefaultError.prototype);
        this.message = message || 'DefaultError';
        this.name = this.constructor.name;
    }
}

export class UnprocessableTicker extends DefaultError {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || 'UnprocessableTicker';
        this.name = this.constructor.name;
    }
}

export class UnrecoverableWorkerError extends DefaultError {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || 'UnrecoverableWorkerError';
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends DefaultError {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, NotFoundError.prototype);
        this.message = message || 'NotFoundError';
        this.name = this.constructor.name;
    }
}

export const isErrorType = (err: DefaultError, expected: string): boolean => err.name === expected;