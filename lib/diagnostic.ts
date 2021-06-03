import { ICloseable, IInitializable, LogLevel, Logger } from "./base";
import * as discord from 'discord.js';
import { createLogger } from "winston";
import { DiscordClient } from "./notification";


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
    client: DiscordClient;
}

/*
    TODO: We should add some command integration to check on CPU / Memory usage, tickers processed per minute, etc.
*/

export class DiscordDiagnosticSystem implements IDiagnostic {
    private client: DiscordClient;
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
    }

    initialize(): Promise<void> {
        return Promise.resolve();
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

        return this.client.getClient().guilds.fetch(this.guildId, undefined, true)
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


    close(): Promise<void> {
        this.logger.log(LogLevel.INFO, `${this.constructor.name}:close():SUCCESS`);
        return Promise.resolve();
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