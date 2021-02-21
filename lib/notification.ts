import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import * as discord from 'discord.js';
import joi from 'joi';
import { InvalidConfigurationError } from './exceptions';

export interface NotificationOptions {
    ticker: string;
    message: string;
    additionaData?: { [key: string]: string | number }
    price?: number;
    volume?: number;
    socialMediaMessage?: boolean;
}

export interface INotification<T = NotificationOptions> extends IInitializable, ICloseable {
    notify(data: T): Promise<void>;
}

export interface BaseNotificationOptions {
    logger: Logger;
}

export interface DiscordChannels {
    socialMediaChannel: string;
    notificationChannel: string;
}

export interface DiscordNotificationOptions extends BaseNotificationOptions {
    guildId: string;
    logger: Logger;
    channels: DiscordChannels;
    token: string;
    client: discord.Client;
}

const DiscordOptionsSchema: joi.Schema = joi.object({
    guildId: joi.string().required(),
    channels: joi.object({
        socialMediaChannel: joi.string().required(),
        notificationChannel: joi.string().required()
    }).required(),
    token: joi.string().required(),
    client: joi.object({}).required(),
    logger: joi.object({}).required()
}).required();

/*
    Currently this implementation expects to only work in a single Guild, and does not
    account for use in multiple guilds.
*/
export class DiscordNotification implements INotification {
    private client: discord.Client;
    private readonly token: string;
    private logger: Logger;
    private guildId: string;
    private channels: DiscordChannels;

    constructor(options: DiscordNotificationOptions) {
        let valid: joi.ValidationResult = DiscordOptionsSchema.validate(options);

        if (!valid) {
            throw new InvalidConfigurationError('Invalid configuration for DiscordNotification class');
        }

        this.client =  options.client;
        this.token = options.token;
        this.logger = options.logger;
        this.guildId = options.guildId;
        this.channels = options.channels;
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }

    initialize(): Promise<void> {
        return this.client.login(this.token)
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    notify(message: NotificationOptions): Promise<void> {
        return this.client.guilds.fetch(this.guildId, undefined, true)
        .then(guild => guild.channels)
        .then(channels => channels.cache.find(c => c.name === this._selectChannel(message))!)
        .then(channel => channel as discord.TextChannel)
        .then(channel => {
            // console.log(channel);
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
                return Promise.reject(new Error(`No system channel is specified for the guild ${this.guildId}`));
            }
        });
    }

    private _selectChannel(message: NotificationOptions): string {
        return message.socialMediaMessage ? this.channels['socialMediaChannel'] : this.channels['notificationChannel'];
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.client.destroy();
            resolve();
        });
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