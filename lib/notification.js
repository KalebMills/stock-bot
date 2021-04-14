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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhonyNotification = exports.DiscordNotification = exports.DiscordClient = exports.PhonyCommandClient = void 0;
const base_1 = require("./base");
const discord = __importStar(require("discord.js"));
const joi_1 = __importDefault(require("joi"));
const exceptions_1 = require("./exceptions");
const events_1 = require("events");
const util_1 = require("util");
const randomcolor_1 = __importDefault(require("randomcolor"));
class PhonyCommandClient {
    constructor() {
    }
    initialize() {
        return Promise.resolve();
    }
    registerCommandHandler(handler) {
        return;
    }
    close() {
        return Promise.resolve();
    }
}
exports.PhonyCommandClient = PhonyCommandClient;
/*
    TODO: As a matter of good design, the DiscordClient should be a separate entity from another abstract class
    we should turn this into, like DiscordCommandClient, which has the DiscordClient as a dependency, to honor the SRP principle.
    For simplicity though, this is fine for now.
*/
class DiscordClient extends events_1.EventEmitter {
    constructor(options) {
        super();
        this._handleIncomingMessage = (message) => {
            let isCommand = message.content.trim().startsWith(this.commandPrefix);
            if (isCommand) {
                let command = message.content.split(" ")[0].substring(1);
                let content = message.content.split(" ").slice(1).join(" ") || "";
                if (this.commandHandlers.hasOwnProperty(command)) {
                    let handler = this.commandHandlers[command].handler;
                    handler(content)
                        .then((data) => this.sendMessage(data, message))
                        .catch(this.errorHandler);
                }
                else {
                    message.reply(`${command} is not a command, please see !help for assistance`)
                        .catch(this.errorHandler);
                }
            }
            else {
                return;
            }
        };
        this.sendMessage = (body, message) => {
            let embed = new discord.MessageEmbed();
            if (body.length > 2040) {
                let firstData = body.slice(0, 2040);
                //Usually bad, but we intentionally do this.
                body = (body.slice(2040, body.length));
                embed.setDescription(firstData);
                embed.setColor(randomcolor_1.default());
                return message.reply(embed)
                    .then(() => this.sendMessage(body, message));
            }
            embed.setDescription(body);
            embed.setColor(randomcolor_1.default());
            return message.reply(embed)
                .then(() => { });
        };
        this.errorHandler = (err) => {
            this.logger.log(base_1.LogLevel.ERROR, `${this.constructor.name}#errorHandler -- ${util_1.inspect(err)}`);
        };
        this.token = options.token;
        this.logger = options.logger;
        this.commandHandlers = {};
        this.commandPrefix = options.commandPrefix;
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
        this.registerCommandHandler({
            command: 'help',
            description: 'Help command to list all available commands.',
            handler: () => {
                let cmds = Object.keys(this.commandHandlers).map(key => {
                    const { command, description, registrar, usage } = this.commandHandlers[key];
                    return `**${command}**: ${description}\n**Usage**: **${this.commandPrefix}${usage}**\nRegistered By: **${registrar}**`;
                });
                cmds.unshift('\n');
                return Promise.resolve(cmds.join('\n\n'));
            },
            registrar: this.constructor.name,
            usage: `help`
        });
    }
    initialize() {
        this._client = new discord.Client();
        return this._client.login(this.token)
            .then(() => {
            this._client.on('message', this._handleIncomingMessage);
            this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#initialize():SUCCESS`);
        });
    }
    registerCommandHandler(options) {
        const { command, handler, description, registrar, usage } = options;
        if (!this.commandHandlers.hasOwnProperty(command)) {
            let data = {
                commandRegisteredBy: registrar,
                command,
                commandDescription: description
            };
            this.logger.log(base_1.LogLevel.INFO, util_1.inspect(data));
            this.commandHandlers[command] = {
                handler,
                command,
                registrar,
                description,
                usage
            };
            if (description) {
                this.commandHandlers[command].description = description;
            }
        }
        else {
            throw new exceptions_1.DefaultError(`${command} already has a handler registered for it.`);
        }
    }
    getClient() {
        return this._client;
    }
    close() {
        return new Promise((resolve, reject) => {
            try {
                this._client.destroy();
                return resolve();
            }
            catch (e) {
                return reject(e);
            }
        });
    }
}
exports.DiscordClient = DiscordClient;
const DiscordOptionsSchema = joi_1.default.object({
    guildId: joi_1.default.string().required(),
    channels: joi_1.default.object({
        socialMediaChannel: joi_1.default.string().required(),
        notificationChannel: joi_1.default.string().required()
    }).required(),
    token: joi_1.default.string().required(),
    client: joi_1.default.object().instance(DiscordClient).required(),
    logger: joi_1.default.object({}).required()
}).required();
/*
    Currently this implementation expects to only work in a single Guild, and does not
    account for use in multiple guilds.
*/
class DiscordNotification {
    constructor(options) {
        let valid = DiscordOptionsSchema.validate(options);
        if (!valid) {
            throw new exceptions_1.InvalidConfigurationError('Invalid configuration for DiscordNotification class');
        }
        this.client = options.client;
        this.token = options.token;
        this.logger = options.logger;
        this.guildId = options.guildId;
        this.channels = options.channels;
        this.logger.log(base_1.LogLevel.INFO, `${this.constructor.name}#constructor():INVOKED`);
    }
    initialize() {
        return Promise.resolve();
    }
    notify(message) {
        return this.client.getClient().guilds.fetch(this.guildId, undefined, true)
            .then(guild => guild.channels)
            .then(channels => channels.cache.find(c => c.name === this._selectChannel(message)))
            .then(channel => channel)
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
                        embed.addField(key, message.additionaData[key], true);
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
    _selectChannel(message) {
        return message.socialMediaMessage ? this.channels['socialMediaChannel'] : this.channels['notificationChannel'];
    }
    close() {
        return Promise.resolve();
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
