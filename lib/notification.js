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
exports.PhonyNotification = exports.DiscordNotification = void 0;
const base_1 = require("./base");
const discord = __importStar(require("discord.js"));
/*
    Currently this implementation expects to only work in a single Guild, and does not
    account for use in multiple guilds.
*/
class DiscordNotification {
    constructor(options) {
        if (options.token) {
            //construct client
            this.token = options.token;
            this.client = new discord.Client({});
        }
        else {
            throw new Error('Missing token for Discord Client');
        }
        this.logger = options.logger;
        this.guildId = options.guildId;
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }
    initialize() {
        return this.client.login(this.token)
            .then(() => {
            this.logger.log(base_1.LogLevel.TRACE, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    notify(message) {
        return this.client.guilds.fetch(this.guildId, undefined, true)
            .then(guild => {
            const channel = guild.systemChannel;
            console.log(`channel: ${channel}`);
            if (channel) {
                return channel.send(`
                \`${message.message}\` \nAdditional Information: \`\`\`json\n${JSON.stringify(message.additionaData)}\`\`\``).then(() => {
                    this.logger.log(base_1.LogLevel.TRACE, 'Sent message into system channel');
                });
            }
            else {
                this.logger.log(base_1.LogLevel.ERROR, 'No system channel specified');
                throw new Error(`No system channel is specified for the guild ${this.guildId}`);
            }
        });
    }
    close() {
        return new Promise((resolve, reject) => {
            this.client.destroy();
            resolve();
        });
    }
}
exports.DiscordNotification = DiscordNotification;
class PhonyNotification {
    constructor(options) {
        this.logger = options.logger;
    }
    initialize() {
        return Promise.resolve()
            .then(() => {
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    notify(msg) {
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
}
exports.PhonyNotification = PhonyNotification;
