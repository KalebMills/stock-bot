import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import * as discord from 'discord.js';
import * as winston from 'winston';
import { getDiscordClientSingleton } from './util';

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
    logger: Logger;
    channelName: string;
    token: string;
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
        this.client = getDiscordClientSingleton()
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

// let n = new DiscordNotification({
//     token: (process.env['DISCORD_API_TOKEN'] || ""),
//     guildId: (process.env['DISCORD_GUILD_ID'] || ""),
//     channelName: 'stock-notifications',
//     logger: winston.createLogger({
//         transports: [ new winston.transports.Console() ]
//     })
// })

// n.initialize()
// .then(() => n.notify({
//     message: 'TEST',
//     ticker: 'TEST',
//     price: 1.,
//     volume: 100000,
//     additionaData: {
//         'TEST': 'DATA'
//     }
// }))
// .finally(() => n.close())