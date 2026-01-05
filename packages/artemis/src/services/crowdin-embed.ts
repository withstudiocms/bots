/** biome-ignore-all lint/style/noNonNullAssertion: we know */
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix, Perms } from 'dfx/index';
import { and, eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Initializes and registers the Crowdin embed command service for Artemis.
 *
 * This service provides two subcommands for managing Crowdin embeds in Discord channels:
 * - `set`: Sets up a Crowdin embed for a specified repository in the current channel.
 * - `remove`: Removes an existing Crowdin embed for a specified repository from the current channel.
 *
 * Both subcommands require administrator permissions and validate the presence of the repository owner and name.
 * The service interacts with the database to store and remove embed configurations, and ensures commands are only
 * executed within server channels.
 *
 * @remarks
 * - Registers the command with the interactions registry.
 * - Uses the database and channel cache services for persistence and validation.
 * - Provides ephemeral feedback messages to users based on command execution results.
 *
 * @returns {Effect<void>} An effect that registers the Crowdin embed command with the interactions registry.
 */
const make = Effect.gen(function* () {
	const [registry, db, channels] = yield* Effect.all([
		InteractionsRegistry,
		DatabaseLive,
		ChannelsCache,
	]);

	const crowdinEmbedCommand = Ix.global(
		{
			name: 'crowdin-setup',
			description: 'Set up a Crowdin embed in the current channel for a specified repository',
			default_member_permissions: 0, // Admin only
			options: [
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'set',
					description: 'Set up a Crowdin embed in the current channel',
					options: [
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'owner',
							description: 'The owner of the repository (e.g., withstudiocms)',
							required: true,
						},
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'repo',
							description: 'The name of the repository (e.g., studiocms)',
							required: true,
						},
					],
				},
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'remove',
					description: 'Remove the Crowdin embed from the current channel',
					options: [
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'owner',
							description: 'The owner of the repository (e.g., withstudiocms)',
							required: true,
						},
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'repo',
							description: 'The name of the repository (e.g., studiocms)',
							required: true,
						},
					],
				},
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'list',
					description: 'List all Crowdin embeds in the current channel',
					options: [],
				},
			],
		},
		Effect.fn('crowdinEmbedCommand')(
			function* (ix) {
				const context = yield* Ix.Interaction;
				return yield* ix.subCommands({
					set: Effect.gen(function* () {
						const hasPermission = Perms.has(Discord.Permissions.Administrator);
						const canExecute = hasPermission(context.member!.permissions!);

						if (!canExecute) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'You do not have permission to use this command.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const owner = ix.optionValue('owner');
						const repo = ix.optionValue('repo');

						if (!owner || !repo) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'Both owner and repo must be provided.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const guildId = context.guild_id!;
						const channelId = context.channel!.id!;

						const channel = yield* channels.get(guildId, channelId);

						if (!channel) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'This command can only be used in a server channel.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const existing = yield* db.execute((c) =>
							c
								.select()
								.from(db.schema.crowdinEmbed)
								.where(
									and(
										eq(db.schema.crowdinEmbed.owner, owner),
										eq(db.schema.crowdinEmbed.repo, repo),
										eq(db.schema.crowdinEmbed.channelId, channel.id),
										eq(db.schema.crowdinEmbed.guildId, guildId)
									)
								)
						);

						if (existing.length > 0) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: `A Crowdin embed for repository **${owner}/${repo}** already exists in this channel.`,
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						yield* db.execute((c) =>
							c.insert(db.schema.crowdinEmbed).values({
								owner,
								repo,
								channelId: channel.id,
								guildId,
							})
						);

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `Setting up Crowdin embed for repository **${owner}/${repo}** in this channel...`,
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}),
					remove: Effect.gen(function* () {
						const hasPermission = Perms.has(Discord.Permissions.Administrator);
						const canExecute = hasPermission(context.member!.permissions!);

						if (!canExecute) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'You do not have permission to use this command.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const owner = ix.optionValue('owner');
						const repo = ix.optionValue('repo');

						if (!owner || !repo) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'Both owner and repo must be provided.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const guildId = context.guild_id!;
						const channelId = context.channel!.id!;

						const channel = yield* channels.get(guildId, channelId);

						if (!channel) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'This command can only be used in a server channel.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const existing = yield* db.execute((c) =>
							c
								.select()
								.from(db.schema.crowdinEmbed)
								.where(
									and(
										eq(db.schema.crowdinEmbed.owner, owner),
										eq(db.schema.crowdinEmbed.repo, repo),
										eq(db.schema.crowdinEmbed.channelId, channel.id),
										eq(db.schema.crowdinEmbed.guildId, guildId)
									)
								)
						);

						if (existing.length === 0) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: `No Crowdin embed found for repository **${owner}/${repo}** in this channel.`,
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						yield* db.execute((c) =>
							c
								.delete(db.schema.crowdinEmbed)
								.where(
									and(
										eq(db.schema.crowdinEmbed.owner, owner),
										eq(db.schema.crowdinEmbed.repo, repo),
										eq(db.schema.crowdinEmbed.channelId, channel.id),
										eq(db.schema.crowdinEmbed.guildId, guildId)
									)
								)
						);

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `Removing Crowdin embed for repository **${owner}/${repo}** from this channel...`,
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}),
					list: Effect.gen(function* () {
						const hasPermission = Perms.has(Discord.Permissions.Administrator);
						const canExecute = hasPermission(context.member!.permissions!);

						if (!canExecute) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'You do not have permission to use this command.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const guildId = context.guild_id!;
						const channelId = context.channel!.id!;

						const channel = yield* channels.get(guildId, channelId);

						if (!channel) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'This command can only be used in a server channel.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const embeds = yield* db.execute((c) =>
							c
								.select()
								.from(db.schema.crowdinEmbed)
								.where(
									and(
										eq(db.schema.crowdinEmbed.channelId, channel.id),
										eq(db.schema.crowdinEmbed.guildId, guildId)
									)
								)
						);

						if (embeds.length === 0) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'No Crowdin embeds are set up in this channel.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const embedList = embeds.map((e) => `- **${e.owner}/${e.repo}**`).join('\n');

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `Crowdin embeds in this channel:\n${embedList}`,
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}),
				});
			},
			Effect.annotateLogs('command', 'crowdinEmbedCommand')
		)
	);

	const ix = Ix.builder.add(crowdinEmbedCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('CrowdinEmbed', 'Interactions registered and running.')),
	]);
});

/**
 * Provides a live Crowdin embed service layer with a default channels cache.
 *
 * This layer is created by discarding the scoped resource from `make` and
 * providing the default `ChannelsCache`. It is intended to be used where
 * a live Crowdin embed integration is required within the application.
 *
 * @remarks
 * This layer should be composed with other layers as needed to provide
 * the full set of dependencies for Crowdin embed functionality.
 *
 * @see {@link Layer.scopedDiscard}
 * @see {@link ChannelsCache.Default}
 */
export const CrowdinEmbedLive = Layer.scopedDiscard(make);
