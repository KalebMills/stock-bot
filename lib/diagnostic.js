"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscordDiagnosticSystem = void 0;
const base_1 = require("./base");
const discord = __importStar(require("discord.js"));
const winston_1 = require("winston");
/*
    Larger TODO: We should add some command integration to check on CPU / Memory usage, tickers processed per minute, etc.
*/
class DiscordDiagnosticSystem {
    constructor(options) {
        if (options.token) {
            this.token = options.token;
            this.client = new discord.Client({});
        }
        else {
            throw new Error('Missing token for Discord Client');
        }
        this.logger = options.logger;
        this.guildId = options.guildId;
        this.channelId = options.channelId;
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }
    initialize() {
        return this.client.login(this.token)
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    alert(options) {
        const g = this.client.guilds.cache.get(this.guildId);
        return this.client.guilds.fetch(this.guildId, undefined, true)
            .then(guild => guild.channels)
            .then(channels => channels.cache.find(c => c.name === this.channelId))
            .then(channel => channel)
            .then(channel => channel.send(options.message))
            .then(() => { });
        // console.log(c);
        console.log(`Channels = ${JSON.stringify(this.client.channels.cache.keys())}`);
        // if (!!channel && !!(channel.type === 'text')) {
        //     let c: discord.TextChannel = channel as discord.TextChannel;
        //     return c.send('TEST').then(() => {})
        // } else {
        //     console.log(`!!channel = ${!!channel} ---- type = ${channel?.type}`)
        // }
        return Promise.resolve();
    }
    close() {
        return new Promise((resolve, reject) => {
            try {
                this.client.destroy();
                return resolve();
            }
            catch (e) {
                return reject(e);
            }
        });
    }
}
exports.DiscordDiagnosticSystem = DiscordDiagnosticSystem;
let d = new DiscordDiagnosticSystem({
    logger: winston_1.createLogger(),
    token: 'NzgwNTMwMzk1MTA3OTUwNjEy.X7wbkw.e5dm1DZXrVR4V02xNMVAfzAeZ5k',
    guildId: '779466034192056350',
    channelId: 'service-diagnostics'
});
d.initialize()
    .then(() => {
    return d.alert({
        level: base_1.LogLevel.INFO,
        message: 'TEST'
    });
})
    .finally(() => d.close());
