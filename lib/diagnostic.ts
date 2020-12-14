import { ICloseable, IInitializable, LogLevel, Logger } from "./base";
import * as discord from 'discord.js';
import { DiscordNotification } from "./notification";
import { createLogger } from "winston";
import { create } from "domain";


interface DiagnosticLogOptions {
    level: LogLevel;
    message: string;
}

export interface IDiagnostic extends IInitializable, ICloseable {
    alert(options: DiagnosticLogOptions): Promise<void>;
}

export interface DiscordDiagnosticSystemOptions {
    token: string;
    logger: Logger;
    guildId: string;
    channelId: string;
}

/*
    Larger TODO: We should add some command integration to check on CPU / Memory usage, tickers processed per minute, etc.
*/

export class DiscordDiagnosticSystem implements IDiagnostic {
    private client: discord.Client;
    private readonly token: string;
    private readonly guildId: string;
    private readonly channelId: string;
    private logger: Logger;

    constructor(options: DiscordDiagnosticSystemOptions) {
        if (options.token) {
            this.token = options.token;
            this.client = new discord.Client({});
        } else {
            throw new Error('Missing token for Discord Client');
        }
        this.logger = options.logger;
        this.guildId = options.guildId;
        this.channelId = options.channelId;
        this.logger.log(LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }

    initialize(): Promise<void> {
        return this.client.login(this.token)
        .then(() => {
            this.logger.log(LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }

    alert(options: DiagnosticLogOptions): Promise<void> {
        const g = this.client.guilds.cache.get(this.guildId);

        return this.client.guilds.fetch(this.guildId, undefined, true)
        .then(guild => guild.channels)
        .then(channels => channels.cache.find(c => c.name === this.channelId)!)
        .then(channel => channel as discord.TextChannel)
        .then(channel => {
            //TODO make this embed, then logic the colors below..
            const msg = ''
        })
        .then(() => {})
        // console.log(c);

        console.log(`Channels = ${JSON.stringify(this.client.channels.cache.keys())}`)
        // if (!!channel && !!(channel.type === 'text')) {
        //     let c: discord.TextChannel = channel as discord.TextChannel;
        //     return c.send('TEST').then(() => {})
        // } else {
        //     console.log(`!!channel = ${!!channel} ---- type = ${channel?.type}`)
        // }

        return Promise.resolve();
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


let d = new DiscordDiagnosticSystem({
    logger: createLogger(),
    token: 'NzgwNTMwMzk1MTA3OTUwNjEy.X7wbkw.e5dm1DZXrVR4V02xNMVAfzAeZ5k',
    guildId: '779466034192056350',
    channelId: 'service-diagnostics'
});

d.initialize()
.then(() => {
    return d.alert({
        level: LogLevel.INFO,
        message: 'TEST'
    })
})
.finally(() => d.close())