
export class UnprocessableTicker extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}

export class UnrecoverableWorkerError extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, UnprocessableTicker.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}

export class InvalidData extends Error {
    constructor(message?: string) {
        super(message);
        Object.setPrototypeOf(this, InvalidData.prototype);
        this.message = message || '';
        this.name = this.constructor.name;
    }
}