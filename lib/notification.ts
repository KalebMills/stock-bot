import { IInitializable, ICloseable, Logger, LogLevel } from './base';
import * as discord from 'discord.js';
import joi from 'joi';
import { DefaultError, InvalidConfigurationError } from './exceptions';
import { EventEmitter } from 'events';
import { inspect } from 'util';
import color from 'randomcolor';

export interface NotificationOptions {
    ticker: string;
    message: string;
    additionaData?: { [key: string]: string | number }
    price?: number;
    volume?: number;
    socialMediaMessage?: boolean;
    urls?: string[];
    color?: string;
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

/*
    Wouldn't be a bad idea to move this to a separate file, but since notifications and commands are so intertwined, it's fine for now.
*/
export type CommandHandler = (input?: string) => Promise<string>;

export interface CommandContainer {
    handler: CommandHandler;
    description: string;
    registrar: string; //Who registered the command
    command: string;
    usage: string;
}

export interface CommandClient extends IInitializable, ICloseable {
    registerCommandHandler(options: CommandContainer): void;
}

export class PhonyCommandClient implements CommandClient {
    constructor() {

    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    registerCommandHandler(handler: CommandContainer): void {
        return;
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
    
}

/*
    TODO: As a matter of good design, the DiscordClient should be a separate entity from another abstract class
    we should turn this into, like DiscordCommandClient, which has the DiscordClient as a dependency, to honor the SRP principle.
    For simplicity though, this is fine for now.
*/
export class DiscordClient extends EventEmitter implements CommandClient {
    private readonly token: string;
    private logger: Logger;
    private commandHandlers: { [command: string]: CommandContainer };
    private _client!: discord.Client;
    private readonly commandPrefix: string;

    constructor(options: DiscordClientOptions) {
        super();
        this.token = options.token;
        this.logger = options.logger;
        this.commandHandlers = {};
        this.commandPrefix = options.commandPrefix;
    
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
        this.registerCommandHandler({
            command: 'help',
            description: 'Help command to list all available commands.',
            handler: () => {
                    let cmds = Object.keys(this.commandHandlers).map(key => {
                        const { command, description, registrar, usage } = this.commandHandlers[key];

                        return `**${command}**: ${description}\n**Usage**: **${this.commandPrefix}${usage}**\nRegistered By: **${registrar}**`
                    })
                    cmds.unshift('\n');

                    return Promise.resolve(cmds.join('\n\n'));
                
            },
            registrar: this.constructor.name,
            usage: `help`
        });
    }

    initialize(): Promise<void> {
        this._client = new discord.Client();

        return this._client.login(this.token)
        .then(() => {
            this._client.on('message', this._handleIncomingMessage);

            this.logger.log(LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    registerCommandHandler(options: CommandContainer): void {
        const { command, handler, description, registrar, usage } = options;
        if (!this.commandHandlers.hasOwnProperty(command)) {
            let data = {
                commandRegisteredBy: registrar,
                command,
                commandDescription: description
            }
            this.logger.log(LogLevel.INFO, inspect(data));

            this.commandHandlers[command] = {
                handler,
                command,
                registrar,
                description,
                usage
            }

            if (description) {
                this.commandHandlers[command].description = description;
            }
        } else {
            throw new DefaultError(`${command} already has a handler registered for it.`);
        }
    }

    private _handleIncomingMessage = (message: discord.Message): void => {
        console.log(`Incoming Message: ${message.content}`)
        let isCommand = message.content.trim().startsWith(this.commandPrefix);

        console.log(`is command: ${isCommand} -- prefix = ${this.commandPrefix}`);

        if (isCommand) {
            let command: string = message.content.split(" ")[0].substring(1);
            let content: string = message.content.split(" ").slice(1).join(" ") || "";

            console.log(JSON.stringify(Object.keys(this.commandHandlers)));

            if (this.commandHandlers.hasOwnProperty(command)) {
                console.log(`Command has handler == true`)
                let handler = this.commandHandlers[command].handler;
                handler(content)
                .then((data: string) => {
                    if (data.length > 2040) {
                        let firstData = data.slice(0, 2040);
                        let next = (data.slice(2040, data.length));

                        let embed = new discord.MessageEmbed();

                        embed.setDescription(firstData);
                        embed.setColor(color());

                        return message.reply(embed)
                        .then(() => {
                            //Bad, should have a sendMessage function that can be called recursively
                            embed.setDescription(next);
                            return message.reply(embed);
                        });
                    }

                    let embed = new discord.MessageEmbed();

                    embed.setDescription(data);
                    embed.setColor(color());

                    return message.reply(embed);
                })
                .catch(this.errorHandler)
            } else {
                message.reply(`${command} is not a command, please see !help for assistance`)
                .catch(this.errorHandler);
            }
        } else {
            return;
        }
    }

    getClient(): discord.Client {
        return this._client;
    }

    errorHandler = (err: any) => {
        this.logger.log(LogLevel.ERROR, `${this.constructor.name}#errorHandler -- ${inspect(err)}`);
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this._client.destroy()
                return resolve();
            } catch (e) {
                return reject(e);
            }
        });
    }

}


export interface DiscordNotificationOptions extends BaseNotificationOptions {
    guildId: string;
    logger: Logger;
    channels: DiscordChannels;
    token: string;
    client: DiscordClient;
}

const DiscordOptionsSchema: joi.Schema = joi.object({
    guildId: joi.string().required(),
    channels: joi.object({
        socialMediaChannel: joi.string().required(),
        notificationChannel: joi.string().required()
    }).required(),
    token: joi.string().required(),
    client: joi.object().instance(DiscordClient).required(),
    logger: joi.object({}).required()
}).required();

/**
 * Wrapper for a Discord Client, which specifically passes messages to a event handler that are commands. Helper funtions for registering commands from other clients
 */

interface DiscordClientOptions {
    token: string;
    logger: Logger;
    commandPrefix: string;
}

/*
    Currently this implementation expects to only work in a single Guild, and does not
    account for use in multiple guilds.
*/
export class DiscordNotification implements INotification {
    private client: DiscordClient;
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
        return Promise.resolve();
    }

    notify(message: NotificationOptions): Promise<void> {
        return this.client.getClient().guilds.fetch(this.guildId, undefined, true)
        .then(guild => guild.channels)
        .then(channels => channels.cache.find(c => c.name === this._selectChannel(message))!)
        .then(channel => channel as discord.TextChannel)
        .then(channel => {
            if (channel) {
                const embed = new discord.MessageEmbed()
                .setColor(message.color || '#8030ff')
                .setTitle(message.ticker)
                .setDescription(message.message)
                .setTimestamp()
                .setFooter('StockBot', 'https://icon2.cleanpng.com/20180402/xww/kisspng-chart-graph-of-a-function-infographic-information-stock-market-5ac2c6f186ff53.663225121522714353553.jpg');

                if (message.urls && message.urls.length > 0) {
                    message.urls.forEach(url => embed.setImage(url));
                }

                if (message.price) {
                    embed.addField('Price', `$${message.price}`, true);
                }

                if (message.volume) {
                    embed.addField('Volume', message.volume, true);
                }

                if (message.additionaData) {
                    Object.keys(message.additionaData).forEach(key => {
                        embed.addField(key, message.additionaData![key], true);
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