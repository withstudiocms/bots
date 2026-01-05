import { type AppBskyEmbedImages, AppBskyFeedDefs } from '@atproto/api';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, DiscordREST, Ix } from 'dfx/index';
import { and, eq } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { BSkyAPIClient } from '../core/bsky.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { BlueSkyPollSchedule } from '../static/schedules.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Helper function to create an error embed message.
 */
const makeErrorEmbed = (title: string, description: string) =>
	new DiscordEmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(0xff0000)
		.setTimestamp(new Date())
		.build();

/**
 * Helper function to create a success embed message.
 */
const makeSuccessEmbed = (title: string, description: string) =>
	new DiscordEmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(0x00ff00)
		.setTimestamp(new Date())
		.build();

/**
 * Base embed template for BlueSky posts.
 */
const makeBlueskyEmbedBase = () => new DiscordEmbedBuilder().setColor(0x1da1f2);

/**
 * Error Response
 */
const ErrorResponse = (title: string, description: string) =>
	Ix.response({
		type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			embeds: [makeErrorEmbed(title, description)],
			flags: Discord.MessageFlags.Ephemeral,
		},
	});

/**
 * Success Response
 */
const SuccessResponse = (title: string, description: string) =>
	Ix.response({
		type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			embeds: [makeSuccessEmbed(title, description)],
			flags: Discord.MessageFlags.Ephemeral,
		},
	});

/**
 * Convert number to boolean
 */
function numberToBoolean(num: number): boolean {
	return num !== 0;
}

/**
 * Make Autocomplete Response
 */
function makeAutocompleteResponse(
	choices: {
		name: string;
		value: string;
	}[]
) {
	return Ix.response({
		type: Discord.InteractionCallbackTypes.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
		data: {
			choices: choices.slice(0, 25), // Discord allows max 25 choices
		},
	});
}

/**
 * Build chunked response for listing tracked BlueSky accounts
 */
const buildChunkedResponse = (formattedAccountList: string[]) => {
	const embeds: Discord.RichEmbed[] = [];
	const chunkSize = 10; // Number of accounts per embed
	for (let i = 0; i < formattedAccountList.length; i += chunkSize) {
		const chunk = formattedAccountList.slice(i, i + chunkSize);
		const embed = makeSuccessEmbed(
			`Tracked BlueSky Accounts (Part ${Math.floor(i / chunkSize) + 1})`,
			chunk.join('\n')
		);
		embeds.push(embed);
	}

	if (embeds.length === 0) {
		embeds.push(
			makeSuccessEmbed(
				'No Tracked BlueSky Accounts',
				'There are currently no BlueSky accounts being tracked in this server.'
			)
		);
	}

	return Ix.response({
		type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			content: embeds.length > 10 ? 'Displaying first 10 tracked accounts.' : undefined,
			embeds: embeds.slice(0, 10), // Discord allows max 10 embeds per message
			flags: Discord.MessageFlags.Ephemeral,
		},
	});
};

// Custom Effect Error Types

/**
 * Error when no tracked accounts are found
 */
class NoTrackedAccounts {
	readonly _tag = 'NoTrackedAccounts';
}

/**
 * Error when fetching BlueSky account details fails
 */
class FetchingError {
	readonly _tag = 'FetchingError';
}

/**
 * Creates and configures the BlueSky service module.
 *
 * This service provides comprehensive BlueSky social network integration for Discord servers, including:
 * - Tracking and monitoring BlueSky accounts for new posts, replies, and reposts
 * - Automatic Discord notifications when tracked accounts post content
 * - Guild-specific configuration management (post channels, ping roles)
 * - Subscription management for different post types (top-level posts, replies, reposts)
 * - Discord slash command interface (`/bluesky`) for managing subscriptions and settings
 * - Autocomplete support for unsubscribe command
 * - Scheduled polling of tracked BlueSky accounts
 *
 * @remarks
 * This effect initializes all necessary dependencies (InteractionsRegistry, DatabaseLive, DiscordREST),
 * sets up Discord interactions, registers commands, and starts a scheduled task to poll BlueSky feeds.
 *
 * The service maintains state across:
 * - `blueSkyConfig` - Guild-level configuration (post channel, ping role)
 * - `blueSkyChannelSubscriptions` - Tracking preferences per account per guild
 * - `blueSkyTrackedAccounts` - Accounts being monitored with last check timestamps
 * - `blueSkyProcessedPosts` - Deduplicated record of posts already sent to Discord
 *
 * @returns An Effect that, when executed, registers the BlueSky service and starts monitoring
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   yield* make;
 * });
 * ```
 */
const make = Effect.gen(function* () {
	const [registry, database, rest] = yield* Effect.all([
		InteractionsRegistry,
		DatabaseLive,
		DiscordREST,
	]);

	// Initialize BlueSky API Client
	const BSky = new BSkyAPIClient();

	/**
	 * Creates a Discord embed message for a BlueSky post.
	 */
	const makeBlueskyEmbed = (
		feedItem: AppBskyFeedDefs.FeedViewPost,
		postType: 'top_level' | 'reply' | 'repost'
	) => {
		const postText = BSky.processPostText(feedItem.post);
		const postLink = BSky.getBlueskyPostLink(feedItem.post);

		const embed = makeBlueskyEmbedBase()
			.setTimestamp(new Date(feedItem.post.indexedAt))
			.setDescription(`${postText}\n\n[Open on bksy.app](${postLink})`);

		if (
			feedItem.post.embed?.$type === 'app.bsky.embed.images#view' &&
			(feedItem.post.embed as AppBskyEmbedImages.View).images
		) {
			embed.setImage((feedItem.post.embed as AppBskyEmbedImages.View).images[0].fullsize);
		}
		switch (postType) {
			case 'top_level':
				embed
					.setAuthor({
						name: feedItem.post.author.displayName || feedItem.post.author.handle,
						icon_url: feedItem.post.author.avatar,
						url: `https://bsky.app/profile/${feedItem.post.author.did}`,
					})
					.setFooter('Post');
				break;
			case 'reply':
				embed
					.setAuthor({
						name: feedItem.post.author.displayName || feedItem.post.author.handle,
						icon_url: feedItem.post.author.avatar,
						url: `https://bsky.app/profile/${feedItem.post.author.did}`,
					})
					.setFooter('Reply');
				break;
			case 'repost': {
				if (AppBskyFeedDefs.isReasonRepost(feedItem.reason)) {
					let title = '### ';
					title += `${
						feedItem.post.author.displayName
							? `${feedItem.post.author.displayName} (@${feedItem.post.author.handle})`
							: `@${feedItem.post.author.handle}`
					}`;
					title += '\n';
					embed
						.setAuthor({
							name: feedItem.reason?.by.displayName || feedItem.reason?.by.handle,
							icon_url: feedItem.reason?.by.avatar,
							url: `https://bsky.app/profile/${feedItem.reason?.by.did}`,
						})
						.setDescription(`${title}${postText}\n\n[Open on bksy.app](${postLink})`)
						.setFooter('Repost');
				} else {
					throw new Error('Attempted to send a repost message without valid repost reason.');
				}
				break;
			}
			default:
				break;
		}

		return embed.build();
	};

	/**
	 * Initializes the BlueSky configuration for a guild.
	 */
	const initConfig = (guildId: string) =>
		database.execute((db) =>
			db.insert(database.schema.blueSkyConfig).values({
				guild: guildId,
				ping_role_id: '',
				ping_role_enabled: 0,
				post_channel_id: '',
			})
		);

	/**
	 * Retrieves the BlueSky configuration for a guild.
	 */
	const getGuildConfig = (guildId: string) =>
		database.execute((db) =>
			db
				.select()
				.from(database.schema.blueSkyConfig)
				.where(eq(database.schema.blueSkyConfig.guild, guildId))
				.get()
		);

	/**
	 * Sets the ping role and its enabled status for BlueSky notifications in a guild.
	 */
	const setPingRole = (guildId: string, roleId: string | null, enable: boolean | null) =>
		Effect.gen(function* () {
			const currentConfig = yield* getGuildConfig(guildId);

			if (!roleId && enable === null) {
				// Nothing to update
				console.log('No changes provided for ping role settings.');
				return false;
			}

			if (!currentConfig) {
				// No existing config, create new one
				yield* initConfig(guildId);
			}

			const updatedRoleId = roleId !== null ? roleId : currentConfig?.ping_role_id || '';
			const updatedEnable =
				enable !== null ? (enable ? 1 : 0) : currentConfig ? currentConfig.ping_role_enabled : 0;

			// Update existing config
			yield* database.execute((db) =>
				db
					.update(database.schema.blueSkyConfig)
					.set({
						ping_role_id: updatedRoleId,
						ping_role_enabled: updatedEnable,
					})
					.where(eq(database.schema.blueSkyConfig.guild, guildId))
			);

			return true;
		});

	/**
	 * Sets the post channel for BlueSky notifications in a guild.
	 */
	const setPostChannel = (guildId: string, channelId: string) =>
		Effect.gen(function* () {
			const currentConfig = yield* getGuildConfig(guildId);

			if (!currentConfig) {
				// No existing config, create new one
				yield* initConfig(guildId);
			}

			// Update existing config
			yield* database.execute((db) =>
				db
					.update(database.schema.blueSkyConfig)
					.set({
						post_channel_id: channelId,
					})
					.where(eq(database.schema.blueSkyConfig.guild, guildId))
			);

			return true;
		});

	/**
	 * Retrieves all BlueSky account subscriptions for a guild.
	 */
	const getTrackedAccountSubscriptions = (guildId: string) =>
		database.execute((db) =>
			db
				.select()
				.from(database.schema.blueSkyChannelSubscriptions)
				.where(eq(database.schema.blueSkyChannelSubscriptions.guild, guildId))
				.all()
		);

	/**
	 * Creates a new BlueSky account subscription for a guild.
	 */
	const createNewTrackedAccountSubscription = (
		guildId: string,
		did: string,
		opts: {
			track_top_level: boolean;
			track_replies: boolean;
			track_reposts: boolean;
		}
	) =>
		database
			.execute((db) =>
				db
					.insert(database.schema.blueSkyChannelSubscriptions)
					.values({
						guild: guildId,
						did,
						track_top_level: opts.track_top_level ? 1 : 0,
						track_replies: opts.track_replies ? 1 : 0,
						track_reposts: opts.track_reposts ? 1 : 0,
					})
					.onConflictDoUpdate({
						target: database.schema.blueSkyChannelSubscriptions.did,
						set: {
							track_top_level: opts.track_top_level ? 1 : 0,
							track_replies: opts.track_replies ? 1 : 0,
							track_reposts: opts.track_reposts ? 1 : 0,
						},
					})
			)
			.pipe(
				Effect.flatMap(() =>
					database.execute((db) =>
						db
							.insert(database.schema.blueSkyTrackedAccounts)
							.values({
								did,
								guild: guildId,
								last_checked_at: new Date().toISOString(),
								date_added: new Date().toISOString(),
							})
							.onConflictDoUpdate({
								target: database.schema.blueSkyTrackedAccounts.did,
								set: {
									guild: guildId,
								},
							})
					)
				)
			);

	/**
	 * Clears a BlueSky account subscription for a guild.
	 */
	const clearTrackingAccountSubscription = (guildId: string, did: string) =>
		database
			.execute((db) =>
				db
					.delete(database.schema.blueSkyChannelSubscriptions)
					.where(
						and(
							eq(database.schema.blueSkyChannelSubscriptions.guild, guildId),
							eq(database.schema.blueSkyChannelSubscriptions.did, did)
						)
					)
			)
			.pipe(
				Effect.flatMap(() =>
					database.execute((db) =>
						db
							.delete(database.schema.blueSkyTrackedAccounts)
							.where(
								and(
									eq(database.schema.blueSkyTrackedAccounts.guild, guildId),
									eq(database.schema.blueSkyTrackedAccounts.did, did)
								)
							)
					)
				)
			);

	/**
	 * Updates the last checked timestamp for a tracked BlueSky account in a guild.
	 */
	const updateLastChecked = (guildId: string, did: string, date: Date) =>
		database.execute((db) =>
			db
				.update(database.schema.blueSkyTrackedAccounts)
				.set({ last_checked_at: date.toISOString() })
				.where(
					and(
						eq(database.schema.blueSkyTrackedAccounts.guild, guildId),
						eq(database.schema.blueSkyTrackedAccounts.did, did)
					)
				)
		);

	/**
	 * Retrieves all tracked BlueSky accounts across all guilds.
	 */
	const getTrackedAccounts = () =>
		database
			.execute((db) => db.select().from(database.schema.blueSkyTrackedAccounts).all())
			.pipe(
				Effect.map((records) =>
					records.map(({ did, guild, date_added }) => ({
						did,
						guild,
						dateAdded: new Date(date_added),
					}))
				)
			);

	/**
	 * Sends a Discord message for a BlueSky feed item.
	 */
	const sendDiscordMessage = (
		feedItem: AppBskyFeedDefs.FeedViewPost,
		postType: 'top_level' | 'reply' | 'repost',
		guildId: string
	) =>
		Effect.gen(function* () {
			const config = yield* getGuildConfig(guildId);

			if (!config || !config.post_channel_id) {
				return;
			}
			const channel = yield* rest.getChannel(config.post_channel_id);

			if (!channel.id) {
				return;
			}
			if (!channel) {
				throw new Error('Channel not found');
			}

			// Check if channel is a text channel
			if (
				channel.type !== Discord.ChannelTypes.GUILD_TEXT &&
				channel.type !== Discord.ChannelTypes.GUILD_ANNOUNCEMENT
			) {
				throw new Error('Configured channel is not a text channel');
			}

			const embed = makeBlueskyEmbed(feedItem, postType);
			yield* rest.createMessage(channel.id, {
				embeds: [embed],
			});
		});

	/**
	 * Processes a BlueSky feed item and sends a notification if it hasn't been processed before.
	 */
	const processAndNotifyPost = (guild: string, feedItem: AppBskyFeedDefs.FeedViewPost) =>
		Effect.gen(function* () {
			let actor: string;
			let postType: 'top_level' | 'reply' | 'repost';
			if (AppBskyFeedDefs.isReasonRepost(feedItem.reason)) {
				actor = feedItem.reason.by.did;
				postType = 'repost';
			} else {
				actor = feedItem.post.author.did;
				postType = feedItem.reply ? 'reply' : 'top_level';
			}

			const dbResp = yield* database.execute((db) =>
				db
					.select()
					.from(database.schema.blueSkyProcessedPosts)
					.where(eq(database.schema.blueSkyProcessedPosts.post_uri, feedItem.post.uri))
			);

			if (dbResp.length === 0) {
				yield* database.execute((db) =>
					db.insert(database.schema.blueSkyProcessedPosts).values({
						post_uri: feedItem.post.uri,
						did: actor,
						post_type: postType,
						processed_at: new Date().toISOString(),
						guild,
					})
				);

				yield* sendDiscordMessage(feedItem, postType, guild);
			}

			yield* Effect.logDebug(
				formattedLog('BlueSky', `Processed post ${feedItem.post.uri} for guild ${guild}`)
			);
		});

	/**
	 * Registers the /bluesky command with Discord.
	 *
	 * This command allows management of BlueSky subscriptions and settings.
	 *
	 * @remarks
	 * The command includes sub-commands for listing tracked accounts, subscribing/unsubscribing to accounts,
	 * and configuring guild settings such as post channels and ping roles.
	 */
	const blueskyCommand = Ix.global(
		{
			name: 'bluesky',
			description: 'Allow management of BlueSky subscriptions and settings',
			default_member_permissions: 0,
			options: [
				{
					name: 'list',
					description: 'List BlueSky accounts tracked in this server',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					options: [],
				},
				{
					name: 'subscribe',
					description: 'Subscribe a channel to a BlueSky account',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					options: [
						{
							name: 'account',
							description: 'The DID or account of the BlueSky account to track',
							type: Discord.ApplicationCommandOptionType.STRING,
							required: true,
						},
						{
							name: 'top_level',
							description: 'Track top-level posts',
							type: Discord.ApplicationCommandOptionType.BOOLEAN,
							required: true,
						},
						{
							name: 'replies',
							description: 'Track replies',
							type: Discord.ApplicationCommandOptionType.BOOLEAN,
							required: true,
						},
						{
							name: 'reposts',
							description: 'Track reposts',
							type: Discord.ApplicationCommandOptionType.BOOLEAN,
							required: true,
						},
					],
				},
				{
					name: 'unsubscribe',
					description: 'Unsubscribe a channel from a BlueSky account',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					options: [
						{
							name: 'account',
							description: 'The DID or account of the BlueSky account to stop tracking',
							type: Discord.ApplicationCommandOptionType.STRING,
							required: true,
							autocomplete: true,
						},
					],
				},
				{
					name: 'settings',
					description: 'View or modify BlueSky tracking settings',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND_GROUP,
					options: [
						{
							name: 'post_channel',
							description: 'The channel to post BlueSky updates in',
							type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
							options: [
								{
									name: 'channel',
									description: 'The channel to post updates in',
									type: Discord.ApplicationCommandOptionType.CHANNEL,
									required: true,
								},
							],
						},
						{
							name: 'ping_role',
							description: 'The role to ping for BlueSky updates',
							type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
							options: [
								{
									name: 'role',
									description: 'The role to ping',
									type: Discord.ApplicationCommandOptionType.ROLE,
									required: false,
								},
								{
									name: 'enable',
									description: 'Whether to enable or disable pinging this role',
									type: Discord.ApplicationCommandOptionType.BOOLEAN,
									required: false,
								},
							],
						},
						{
							name: 'view',
							description: 'View current BlueSky tracking settings',
							type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
							options: [],
						},
					],
				},
			],
		},
		Effect.fn(function* (ix) {
			// Check if the guild has a BlueSky configuration
			const context = yield* Ix.Interaction;

			// Helper to ensure guild ID is present
			const requiresGuildId = <A, E, R>(then: (guildId: string) => Effect.Effect<A, E, R>) =>
				Effect.gen(function* () {
					// get guild ID
					const guildId = context.guild_id;
					// Ensure this command is used within a guild
					if (!guildId)
						return ErrorResponse(
							'Guild Only Command',
							'This command can only be used within a server.'
						);
					return yield* then(guildId);
				});

			// Helper to ensure BlueSky configuration exists
			const requiresConfig = <E, R>(
				then: (
					config: typeof database.schema.blueSkyConfig.$inferSelect
				) => Effect.Effect<Discord.CreateInteractionResponseRequest, E, R>
			) =>
				Effect.orElse(
					requiresGuildId((guildId) =>
						Effect.gen(function* () {
							const currentConfig = yield* getGuildConfig(guildId);
							if (!currentConfig) return yield* Effect.fail(false);
							return currentConfig;
						})
					),
					() =>
						Effect.succeed(
							ErrorResponse(
								'No BlueSky Configuration Found',
								'Please set up BlueSky tracking settings using the /bluesky settings command.'
							)
						)
				).pipe(
					Effect.flatMap((result) => {
						if (typeof result === 'object' && result !== null && 'guild' in result) {
							return then(result);
						}
						return Effect.succeed(result) as Effect.Effect<
							Discord.CreateInteractionResponseRequest,
							E,
							R
						>;
					})
				);

			// Handle sub-commands
			return yield* ix.subCommands({
				// ======================
				// main sub-commands
				// ======================
				list: requiresConfig(({ guild }) =>
					getTrackedAccountSubscriptions(guild).pipe(
						Effect.flatMap((accounts) =>
							accounts.length === 0
								? Effect.fail(new NoTrackedAccounts())
								: Effect.succeed(accounts)
						),
						Effect.flatMap((accounts) =>
							Effect.tryPromise({
								try: () =>
									Promise.all(
										accounts.map(async (acc) => {
											const did = acc.did;
											const profile = await BSky.getBlueskyAccount(did);
											const handle = profile ? profile.handle : 'unknown';
											return `- @${handle} (${did}) [top-level: ${numberToBoolean(acc.track_top_level)}, replies: ${numberToBoolean(acc.track_replies)}, reposts: ${numberToBoolean(acc.track_reposts)}]`;
										})
									),
								catch: () => new FetchingError(),
							})
						),
						Effect.map(buildChunkedResponse),
						Effect.catchTag('NoTrackedAccounts', () =>
							Effect.succeed(
								SuccessResponse(
									'No Tracked BlueSky Accounts',
									'There are currently no BlueSky accounts being tracked in this server.'
								)
							)
						),
						Effect.catchTag('FetchingError', () =>
							Effect.succeed(
								ErrorResponse(
									'Error Fetching Accounts',
									'There was an error fetching the BlueSky account details. Please try again later.'
								)
							)
						)
					)
				),
				subscribe: requiresConfig(({ guild }) =>
					Effect.gen(function* () {
						const accountOption = ix.optionValue('account');
						const topLevelOption = ix.optionValue('top_level');
						const repliesOption = ix.optionValue('replies');
						const repostsOption = ix.optionValue('reposts');

						// Get BlueSky account details
						const blueskyAccount = yield* BSky.wrap(({ getBlueskyAccount }) =>
							getBlueskyAccount(accountOption)
						).pipe(Effect.catchAll(() => Effect.succeed(null)));

						if (!blueskyAccount) {
							return ErrorResponse(
								'Account Not Found',
								'The specified BlueSky account could not be found. Please check the DID or handle and try again.'
							);
						}

						// Create new tracked account subscription
						yield* createNewTrackedAccountSubscription(guild, blueskyAccount.did, {
							track_top_level: topLevelOption,
							track_replies: repliesOption,
							track_reposts: repostsOption,
						});

						return SuccessResponse(
							'Subscription Created',
							`Now tracking @${blueskyAccount.handle} (${blueskyAccount.did}) with options: [top-level: ${topLevelOption}, replies: ${repliesOption}, reposts: ${repostsOption}]`
						);
					})
				),
				unsubscribe: requiresConfig(({ guild }) =>
					Effect.gen(function* () {
						const accountOption = ix.optionValue('account');

						const blueskyAccount = yield* BSky.wrap(({ getBlueskyAccount }) =>
							getBlueskyAccount(accountOption)
						).pipe(Effect.catchAll(() => Effect.succeed(null)));

						if (!blueskyAccount) {
							return ErrorResponse(
								'Account Not Found',
								'The specified BlueSky account could not be found. Please check the DID or handle and try again.'
							);
						}

						// Clear tracking account subscription
						yield* clearTrackingAccountSubscription(guild, blueskyAccount.did);

						return SuccessResponse(
							'Unsubscribed',
							`Stopped tracking @${blueskyAccount.handle} (${blueskyAccount.did}).`
						);
					})
				),

				// ======================
				// settings sub-commands
				// ======================
				post_channel: requiresGuildId((guildId) =>
					Effect.gen(function* () {
						const channelOption = ix.optionValueOptional('channel');

						const channelId = Option.getOrNull(channelOption);

						// Validate channel ID
						if (!channelId) {
							return ErrorResponse('Invalid Channel', 'The provided channel is not valid.');
						}

						const updated = yield* setPostChannel(guildId, channelId);

						if (!updated) {
							return ErrorResponse(
								'No Changes Made',
								'The post channel was already set to the specified channel.'
							);
						}

						return SuccessResponse(
							'Post Channel Updated',
							`BlueSky updates will now be posted in <#${channelId}>.`
						);
					})
				),
				ping_role: requiresGuildId((guildId) =>
					Effect.gen(function* () {
						const roleOption = ix.optionValueOptional('role');
						const enableOption = ix.optionValueOptional('enable');

						const roleId = Option.getOrNull(roleOption);
						const enable = Option.getOrNull(enableOption);

						const updated = yield* setPingRole(guildId, roleId, enable);
						if (!updated) {
							return ErrorResponse(
								'No Changes Made',
								'No changes were made to the ping role settings.'
							);
						}

						return SuccessResponse(
							'Ping Role Updated',
							'BlueSky ping role settings have been updated.'
						);
					})
				),
				view: requiresConfig((config) =>
					Effect.try({
						try: () => {
							const postChannelMention = `<#${config.post_channel_id}>`;
							const pingRoleMention = config.ping_role_id ? `<@&${config.ping_role_id}>` : 'None';
							const pingRoleEnabled = numberToBoolean(config.ping_role_enabled) ? 'Yes' : 'No';

							return SuccessResponse(
								'Current BlueSky Settings',
								`- **Post Channel:** ${postChannelMention}\n- **Ping Role:** ${pingRoleMention}\n- **Ping Enabled:** ${pingRoleEnabled}`
							);
						},
						catch: () =>
							ErrorResponse(
								'Error Retrieving Settings',
								'There was an error retrieving the BlueSky settings. Please try again later.'
							),
					})
				),
			});
		})
	);

	/**
	 * Autocomplete handler for the unsubscribe command.
	 *
	 * Provides a list of currently tracked BlueSky accounts for easy selection.
	 */
	const unsubscribeAutocomplete = Ix.autocomplete(
		Ix.option('bluesky', 'unsubscribe'),
		Effect.gen(function* () {
			const [context, queryRaw] = yield* Effect.all([Ix.Interaction, Ix.focusedOptionValue]);

			// biome-ignore lint/style/noNonNullAssertion: allowed here
			const guildId = context.guild_id!;
			const query = String(queryRaw);

			const helpfulChoices = yield* getTrackedAccountSubscriptions(guildId).pipe(
				Effect.flatMap(
					Effect.forEach(({ did }) =>
						Effect.gen(function* () {
							const display = yield* BSky.wrap(({ getBlueskyAccount }) => getBlueskyAccount(did));
							const handle = display ? display.handle : 'unknown';
							return {
								name: `@${handle} (${did})`,
								value: did,
							};
						})
					)
				),
				Effect.catchTag('BlueSkyAPIError', () => Effect.succeed([]))
			);

			if (query.length > 0) {
				const filtered = helpfulChoices.filter((choice) =>
					choice.name.toLowerCase().includes(query.toLowerCase())
				);
				return makeAutocompleteResponse(filtered);
			}

			return makeAutocompleteResponse(helpfulChoices);
		})
	);

	/**
	 * Polls all tracked BlueSky accounts for new posts and processes them.
	 */
	const pollBlueskyPosts = () =>
		Effect.gen(function* () {
			const accounts = yield* getTrackedAccounts();

			yield* Effect.log(
				formattedLog(
					'BlueSky',
					`Polling ${accounts.length} tracked BlueSky accounts for new posts.`
				)
			);

			for (const { did, guild, dateAdded } of accounts) {
				const { data } = yield* BSky.wrap(({ getAuthorFeed }) =>
					getAuthorFeed({
						actor: did,
						limit: 5,
						filter: 'posts_no_replies',
					})
				);

				if (data.feed.length > 0) {
					const firstPost = data.feed[0].post;
					const indexedAt = new Date(firstPost.indexedAt);

					yield* updateLastChecked(guild, did, indexedAt);

					for (const feedItem of data.feed) {
						const currentPostIndexedAt = new Date(feedItem.post.indexedAt);

						// Only process posts that are newer than the 'date_added' timestamp
						// This prevents notifying about old posts when first adding an account
						if (currentPostIndexedAt.getTime() <= dateAdded.getTime()) {
							continue;
						}

						// Process and notify about the post
						yield* processAndNotifyPost(guild, feedItem);
					}
				}
			}

			yield* Effect.log(formattedLog('BlueSky', 'Completed polling BlueSky accounts.'));
		});

	/**
	 * Combines the BlueSky command and autocomplete into a single interaction handler.
	 */
	const ix = Ix.builder
		.add(blueskyCommand)
		.add(unsubscribeAutocomplete)
		.catchAllCause(Effect.logError);

	/**
	 * Scheduled polling of BlueSky posts.
	 *
	 * This effect runs periodically to check for new posts from tracked BlueSky accounts
	 * and sends notifications to Discord channels as configured.
	 */
	const scheduledBlueskyPoll = pollBlueskyPosts().pipe(Effect.catchAllCause(Effect.logError));

	// Register the interaction and start the scheduled polling
	yield* Effect.all([
		registry.register(ix),
		Effect.schedule(scheduledBlueskyPoll, BlueSkyPollSchedule).pipe(Effect.forkScoped),
		Effect.logDebug(formattedLog('BlueSky', 'Interactions registered and running.')),
	]);
});

/**
 * A scoped layer that provides the BlueSky live service.
 *
 * This layer automatically manages the lifecycle of the BlueSky service,
 * ensuring proper cleanup when the scope is closed by discarding the service.
 *
 * @remarks
 * The layer uses `Layer.scopedDiscard` to create a scoped resource that will
 * be automatically cleaned up when the layer's scope ends.
 *
 * @see {@link make} - The factory function used to create the BlueSky service instance
 */
export const BlueSkyLive = Layer.scopedDiscard(make);
