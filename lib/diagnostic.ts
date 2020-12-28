import { ICloseable, IInitializable, LogLevel, Logger } from "./base";
import * as discord from 'discord.js';
import { createLogger } from "winston";


interface DiagnosticLogOptions {
    level: LogLevel;
    title: string;
    message: string;
    additionalData?: {
        [key: string]: string;
    }
}

export interface IDiagnostic extends IInitializable, ICloseable {
    alert(options: DiagnosticLogOptions): Promise<void>;
}

export interface DiscordDiagnosticSystemOptions {
    logger: Logger;
    guildId: string;
    channelName: string;
    token: string;
    client: discord.Client;
}

/*
    TODO: We should add some command integration to check on CPU / Memory usage, tickers processed per minute, etc.
*/

export class DiscordDiagnosticSystem implements IDiagnostic {
    private client: discord.Client;
    private readonly guildId: string;
    private readonly channelName: string;
    private token: string;
    private logger: Logger;

    constructor(options: DiscordDiagnosticSystemOptions) {
        this.client = options.client;
        this.logger = options.logger;
        this.token = options.token;
        this.guildId = options.guildId;
        this.channelName = options.channelName;
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);

        //System Commands
        this.client.on('message', this._messageHandler);
    }

    initialize(): Promise<void> {
        return this.client.login(this.token)
        .then(() => {
            this.logger.log(LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    alert(options: DiagnosticLogOptions): Promise<void> {
        const { level, message, title, additionalData } = options;

        const embed: discord.MessageEmbed = new discord.MessageEmbed()
        .setTitle(title)
        .setDescription(message)
        .setTimestamp();

        if (additionalData) {
            for (let key in additionalData) {
                embed.addField(key, additionalData[key]);
            }
        }

        return this.client.guilds.fetch(this.guildId, undefined, true)
        .then(guild => guild.channels)
        .then(channels => channels.cache.find(c => c.name === this.channelName)!)
        .then(channel => channel as discord.TextChannel)
        .then(channel => {
            //Set Color
            switch(level) {
                case LogLevel.ERROR:
                    embed.setColor('#f00000'); //Red
                    break;
                case LogLevel.INFO:
                    embed.setColor('#00eb04'); //Green
                    break;
                case LogLevel.WARN:
                    embed.setColor('#ffbf00'); //Orange
                    break;
                default:
                    embed.setColor('#4400ff'); //Burple
                    break;
            }
            return channel.send(embed);
        })
        .then(() => {
            this.logger.log(LogLevel.INFO, `${this.constructor.name}#alert():SUCCESS`);
        });
    }

    private _messageHandler = (msg: discord.Message): void => {
        console.log(`Got Message, ${msg.content}`)
        const COMMAND_PREFIX = '~';
        const isCommand = !!msg.content.startsWith(COMMAND_PREFIX);
        const command = msg.content.substring(1);

        if (!isCommand) {
            return;
        }
        
        switch(command) {
            case "clearChannel":
                const channel: discord.TextChannel = msg.channel as discord.TextChannel;

                this._deleteMessages(channel)
                .catch(err => {
                    console.error(err);
                });

                break;
            
            case "help":
                msg.reply(`
                Supported Commands:\n
                **clearChannel** - _Clear all messages in the channel_
                `)
                break;

            default:
                msg.reply(`${command} is not a command, try ${COMMAND_PREFIX}help for details.`);
                break;
        }
    }

    private _deleteMessages = (channel: discord.TextChannel): Promise<any> => {
        return channel.bulkDelete(99)
        .then(() => {
            let msgsCount = channel.messages.cache.size;
            if (msgsCount > 0) {
                return this._deleteMessages(channel);
            }
        });
    }


    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.client.destroy()
                return resolve();
            } catch (e) {
                return reject(e);
            }
        });
    }
}

export class PhonyDiagnostic implements IDiagnostic {
    constructor() {

    }

    initialize(): Promise<void> {
        return Promise.resolve();
    }

    alert(options: DiagnosticLogOptions): Promise<void> {
        return Promise.resolve();
    }

    close(): Promise<void> {
        return Promise.resolve();
    }
}