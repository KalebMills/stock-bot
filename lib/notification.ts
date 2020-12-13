import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import * as discord from 'discord.js';
import * as winston from 'winston';

export interface NotificationOptions {
    ticker: string;
    message: string;
    additionaData?: { [key: string]: string | number }
    price?: number;
    volume?: number;
}

export interface INotification<T = NotificationOptions> extends IInitializable, ICloseable {
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
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }

    initialize(): Promise<void> {
        return this.client.login(this.token)
        .then(() => {
            this.logger.log(LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    notify(message: NotificationOptions): Promise<void> {
        return this.client.guilds.fetch(this.guildId, undefined, true)
        .then(guild => {
            const channel = guild.systemChannel;
            if (channel) {

                const embed = new discord.MessageEmbed()
                .setColor('#8030ff')
                .setTitle(message.ticker)
                .setDescription(`**${message.message}**`)
                .setTimestamp()
                .setFooter('StockBot', 'https://icon2.cleanpng.com/20180402/xww/kisspng-chart-graph-of-a-function-infographic-information-stock-market-5ac2c6f186ff53.663225121522714353553.jpg');

                if (message.price) {
                    embed.addField('Price', `$${message.price}`, true);
                }

                if (message.volume) {
                    embed.addField('Volume', message.volume, true);
                }

                if (message.additionaData) {
                    Object.keys(message.additionaData).forEach(key => {
                        embed.addField(key, message.additionaData![key]);
                    });
                }

                return channel.send(embed).then(() => {
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

    notify(msg: NotificationOptions): Promise<void> {
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}