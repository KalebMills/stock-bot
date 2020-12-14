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
exports.PhonyDiagnostic = exports.DiscordDiagnosticSystem = void 0;
const base_1 = require("./base");
const discord = __importStar(require("discord.js"));
/*
    TODO: We should add some command integration to check on CPU / Memory usage, tickers processed per minute, etc.
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
        this.channelName = options.channelName;
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }
    initialize() {
        return this.client.login(this.token)
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    alert(options) {
        const { level, message, title, additionalData } = options;
        const embed = new discord.MessageEmbed()
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
            .then(channels => channels.cache.find(c => c.name === this.channelName))
            .then(channel => channel)
            .then(channel => {
            //Set Color
            switch (level) {
                case base_1.LogLevel.ERROR:
                    embed.setColor('#f00000'); //Red
                    break;
                case base_1.LogLevel.INFO:
                    embed.setColor('#00eb04'); //Green
                    break;
                case base_1.LogLevel.WARN:
                    embed.setColor('#ffbf00'); //Orange
                    break;
                default:
                    embed.setColor('#4400ff'); //Burple
                    break;
            }
            return channel.send(embed);
        })
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#alert():SUCCESS`);
        });
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
class PhonyDiagnostic {
    constructor() {
    }
    initialize() {
        return Promise.resolve();
    }
    alert(options) {
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
}
exports.PhonyDiagnostic = PhonyDiagnostic;
