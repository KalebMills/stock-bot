import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import * as discord from 'discord.js';
import * as fs from 'fs';

export interface NotificationOptions {
    ticker: string;
    message: string;
    eventTimestamp: number;
    price: number;
    additionaData?: { [key: string]: string | number }
    url?: string;
    volume?: number;
}

export interface INotification<T = NotificationOptions> extends IInitializable, ICloseable {
    notify(data: T): Promise<void>;
}

export interface BaseNotificationOptions {
    logger: Logger;
}


export interface DiscordNotificationOptions extends BaseNotificationOptions {
    guildId: string;
    logger: Logger;
    channelName: string;
    token: string;
    client: discord.Client;
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
    private channelName: string;

    constructor(options: DiscordNotificationOptions) {
        this.client =  options.client;
        this.token = options.token;
        this.logger = options.logger;
        this.guildId = options.guildId;
        this.channelName = options.channelName;
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
        .then(guild => guild.channels)
        .then(channels => channels.cache.find(c => c.name === this.channelName)!)
        .then(channel => channel as discord.TextChannel)
        .then(channel => {
            if (channel) {
                const embed = new discord.MessageEmbed()
                .setColor('#8030ff')
                .setTitle(message.ticker)
                .setDescription(`**${message.message}**`)
                .setTimestamp()
                .setFooter('StockBot', 'https://icon2.cleanpng.com/20180402/xww/kisspng-chart-graph-of-a-function-infographic-information-stock-market-5ac2c6f186ff53.663225121522714353553.jpg');

                if (message.hasOwnProperty('url')) {
                    embed.setURL(message['url']!);
                }

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
                return Promise.reject(new Error(`No system channel is specified for the guild ${this.guildId}`));
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

export interface FileWriterNotificationOptions extends BaseNotificationOptions {
    filePath: string;
}

/**
 * A class to write a notification message to a file, line by line.
 */

export class FileWriterNotification implements INotification {
    private logger: Logger;
    private filePath: string;

    constructor(options: FileWriterNotificationOptions) {
        this.logger = options.logger;
        this.filePath = options.filePath;
    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    notify(options: NotificationOptions): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            fs.appendFile(this.filePath, `${options.eventTimestamp}\n`, (err: NodeJS.ErrnoException | null) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}

export class PhonyNotification implements INotification {
    private logger: Logger;

    constructor(options: BaseNotificationOptions) {
        this.logger = options.logger;
    }

    initialize(): Promise<void> {
        return Promise.resolve()
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        })
    }

    notify(msg: NotificationOptions): Promise<void> {
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}