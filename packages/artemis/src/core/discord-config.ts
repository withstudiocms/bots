import { DiscordConfig, Intents } from 'dfx';
import { Config } from 'effect';
import { discordBotToken } from '../static/env.ts';

/**
 * Provides a configuration layer for the Discord bot integration.
 *
 * This configuration sets up the Discord bot token and specifies the gateway intents
 * required for the bot's operation. The token is securely loaded from the environment
 * variable `DISCORD_BOT_TOKEN` using a redacted configuration loader.
 *
 * The gateway configuration enables the following intents:
 * - `GuildMessages`: Access to guild message events.
 * - `MessageContent`: Access to the content of messages.
 * - `Guilds`: Access to basic guild information.
 * - `GuildMembers`: Access to guild member events.
 * - `GuildMessageReactions`: Access to message reaction events.
 * - `GuildModeration`: Access to moderation events in guilds.
 *
 * @remarks
 * This layer should be included in the application's configuration stack to enable
 * Discord bot functionality with the specified permissions.
 */
export const DiscordConfigLayer = DiscordConfig.layerConfig({
	token: discordBotToken,
	gateway: {
		intents: Config.succeed(
			Intents.fromList([
				'GuildMessages',
				'MessageContent',
				'Guilds',
				'GuildMembers',
				'GuildMessageReactions',
				'GuildModeration',
			])
		),
	},
});
