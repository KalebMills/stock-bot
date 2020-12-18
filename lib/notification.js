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
        this.client = options.client;
        this.token = options.token;
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
    notify(message) {
        return this.client.guilds.fetch(this.guildId, undefined, true)
            .then(guild => guild.channels)
            .then(channels => channels.cache.find(c => c.name === this.channelName))
            .then(channel => channel)
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
                        embed.addField(key, message.additionaData[key]);
                    });
                }
                return channel.send(embed).then(() => {
                    this.logger.log(base_1.LogLevel.TRACE, 'Sent message into system channel');
                });
            }
            else {
                this.logger.log(base_1.LogLevel.ERROR, 'No system channel specified');
                return Promise.reject(new Error(`No system channel is specified for the guild ${this.guildId}`));
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
    constructor() {
    }
    initialize() {
        return Promise.resolve();
    }
    notify(msg) {
        return Promise.resolve();
    }
    close() {
        return Promise.resolve();
    }
}
exports.PhonyNotification = PhonyNotification;
