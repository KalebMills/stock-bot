import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import * as discord from 'discord.js';
import * as winston from 'winston';

export interface INotification<T = string> extends IInitializable, ICloseable {
    notify(data: T): Promise<void>;
}


export interface DiscordNotificationOptions {
    guildId: string;
    token: string;
    logger: Logger;
}


/*
    Currently this implementation expects to only work in a single Guild, and does not
    account for use in multiple guilds.
*/
export class DiscordNotification implements INotification {
    private client: discord.Client;
    private readonly token: string;
    private logger: Logger;
    private guildId: string;

    constructor(options: DiscordNotificationOptions) {
        if (options.token) {
            //construct client
            this.token = options.token;
            this.client = new discord.Client({});
        } else {
            throw new Error('Missing token for Discord Client');
        }
        this.logger = options.logger;
        this.guildId = options.guildId;
    }

    initialize(): Promise<void> {
        return this.client.login(this.token)
        .then(() => {
            this.logger.log(LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    notify(message: string): Promise<void> {
        return this.client.guilds.fetch(this.guildId)
        .then(guild => {
            const channel = guild.systemChannel;
            if (channel) {
                return channel.send(message).then(() => {
                    this.logger.log(LogLevel.TRACE, 'Sent message into system channel');
                });
            } else {
                this.logger.log(LogLevel.ERROR, 'No system channel specified');
                throw new Error(`No system channel is specified for the guild ${this.guildId}`);
            }
        });
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.destroy();
            resolve();
        });
    }
}

export class PhonyNotification implements INotification {
    constructor() {

    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    notify(msg: string): Promise<void> {
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}