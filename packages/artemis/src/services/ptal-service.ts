import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, DiscordREST, Ix, Perms } from 'dfx/index';
import { eq } from 'drizzle-orm';
import { Cause, Effect, FiberMap, Layer } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordApplication } from '../core/discord-rest.ts';
import { Github } from '../core/github.ts';
import { getBrandedEmbedBase } from '../static/embeds.ts';
import { ptalEnabled } from '../static/env.ts';
import { PTALRefreshSchedule } from '../static/schedules.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { formattedLog } from '../utils/log.ts';
import { editPTALEmbed, makePTALEmbed } from '../utils/ptal.ts';

/**
 * Initializes and registers the PTAL (Please Take A Look) service.
 *
 * This generator-based Effect builds and returns an Effect that, when executed,
 * will:
 * - Acquire required dependencies from the environment:
 *   - `ptalEnabled` flag, `InteractionsRegistry`, `DiscordREST`, `DatabaseLive`,
 *     `DiscordGateway`, `Github` client, `DiscordApplication`, and a `FiberMap`.
 * - Short-circuit and log a message if the PTAL service is disabled via config.
 * - Register two slash commands with the interactions system:
 *   - `ptal-settings` (admin-only):
 *     - Subcommands:
 *       - `set-ping-role` — validates role, persists `ptal_announcement_role` to the
 *         guild record in the DB and acknowledges with an ephemeral embed.
 *       - `view-settings` — reads the guild record and shows current PTAL settings.
 *   - `ptal` (requires `ModerateMembers` permission):
 *     - Accepts a GitHub PR URL and a description.
 *     - Validates the URL format and parses owner/repo/PR number.
 *     - Calls the GitHub API to fetch the pull request and its reviews.
 *     - Builds and posts a PTAL embed via webhook, persists a record to the `ptalTable`,
 *       and uses a `FiberMap` to track the running operation.
 *     - On errors, logs the cause, attempts to update the original webhook message
 *       with a formatted error, waits one minute, and deletes the message.
 * - On Discord `READY` dispatch, queries the DB for existing PTAL entries and
 *   refreshes/edits their embeds if the channels still exist.
 * - Registers all interactions in the given `InteractionsRegistry`, forks the
 *   READY-check as a background fiber, and logs service initialization.
 *
 * Side effects:
 * - Reads/writes to the configured database (guilds and `ptalTable`).
 * - Performs REST operations against Discord (guilds, roles, channels, webhook messages).
 * - Calls the GitHub API to fetch PRs and review lists.
 * - Spawns background fibers to keep PTAL messages up-to-date.
 * - Emits structured logs and spans for observability.
 *
 * Error handling:
 * - Most errors are caught and logged; interaction handlers return ephemeral
 *   error responses to users when appropriate.
 * - The follow-up posting flow attempts a best-effort user-facing error message
 *   and schedules deletion after a short delay when failures occur.
 *
 * Concurrency & lifecycle:
 * - The returned Effect will register interactions and fork a scoped fiber to
 *   process READY-time checks; it is intended to be run in the application's
 *   supervisor/scope so that background work is properly managed.
 *
 * @returns An Effect that initializes and registers the PTAL service when executed.
 */
const make = Effect.gen(function* () {
	const [serviceEnabled, registry, rest, db, github, application, fiberMap] = yield* Effect.all([
		ptalEnabled,
		InteractionsRegistry,
		DiscordREST,
		DatabaseLive,
		Github,
		DiscordApplication,
		FiberMap.make<Discord.Snowflake>(),
	]);

	// If the PTAL service is disabled, log and exit early
	if (!serviceEnabled) {
		yield* Effect.logInfo(
			formattedLog('PTAL', 'PTAL Service is disabled via configuration. Skipping initialization.')
		);
		return;
	}

	// PTAL Settings Command
	const ptalSettingsCommand = Ix.global(
		{
			name: 'ptal-settings',
			description: 'Configure the PTAL service for this server',
			default_member_permissions: 0, // Admin only
			options: [
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'set-ping-role',
					description: 'Set the role to ping for PTAL notifications',
					options: [
						{
							type: Discord.ApplicationCommandOptionType.ROLE,
							name: 'role',
							description: 'The role to ping',
							required: true,
						},
					],
				},
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'view-settings',
					description: 'View the current PTAL settings for this server',
					options: [],
				},
			],
		},
		Effect.fn('PTALSettingsCommand')(function* (ix) {
			const context = yield* Ix.Interaction;
			// biome-ignore lint/style/noNonNullAssertion: we know this is present
			const currentUser = context.member!;
			const currentGuild = yield* rest.getGuild(context.guild_id as string);

			// Set up subcommands
			return yield* ix.subCommands({
				'set-ping-role': Effect.gen(function* () {
					const hasPermission = Perms.has(Discord.Permissions.Administrator);
					const canExecute = hasPermission(currentUser.permissions);

					if (!canExecute) {
						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: 'You do not have permission to use this command.',
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}

					const rawRole = ix.optionValue('role');

					const role = yield* rest.getGuildRole(currentGuild.id, rawRole);

					if (!role) {
						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: 'The specified role does not exist in this server.',
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}

					// Save the role ID to the database for this guild
					yield* db.execute((c) =>
						c
							.update(db.schema.guilds)
							.set({ ptal_announcement_role: role.id })
							.where(eq(db.schema.guilds.id, currentGuild.id))
					);

					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							embeds: [
								new DiscordEmbedBuilder()
									.setTitle('PTAL Settings Updated')
									.setDescription('The PTAL ping role has been updated successfully.')
									.addFields([
										{
											name: 'New Ping Role',
											value: `<@&${role.id}>`,
											inline: true,
										},
									])
									.setColor(0x00ff00) // Green
									.build(),
							],
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}),
				'view-settings': Effect.gen(function* () {
					const hasPermission = Perms.has(Discord.Permissions.Administrator);
					const canExecute = hasPermission(currentUser.permissions);

					if (!canExecute) {
						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: 'You do not have permission to use this command.',
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}

					const guildRecord = yield* db.execute((c) =>
						c.select().from(db.schema.guilds).where(eq(db.schema.guilds.id, currentGuild.id)).get()
					);

					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							embeds: [
								getBrandedEmbedBase()
									.setTitle('PTAL Settings')
									.setDescription(`Current PTAL Settings for ${currentGuild.name}`)
									.addFields([
										{
											name: 'Ping Role',
											value: guildRecord?.ptal_announcement_role
												? `<@&${guildRecord?.ptal_announcement_role}>`
												: 'None',
											inline: true,
										},
									])
									.build(),
							],
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}),
			});
		})
	);

	// Function to handle follow-up message for PTAL command
	const ptalFollowup = (
		context: Discord.APIInteraction,
		newInteraction: Discord.IncomingWebhookUpdateRequestPartial,
		descriptionInput: string,
		owner: string,
		repo: string,
		prNumber: number,
		currentGuildId: string
	) =>
		rest
			.updateOriginalWebhookMessage(application.id, context.token, {
				payload: newInteraction,
			})
			.pipe(
				Effect.tap((res) =>
					db.execute((c) =>
						c.insert(db.schema.ptalTable).values({
							channel: res.channel_id,
							description: descriptionInput,
							message: res.id,
							owner,
							repository: repo,
							pr: prNumber,
							guildId: currentGuildId,
						})
					)
				),
				Effect.tapErrorCause(Effect.logError),
				Effect.catchAllCause((cause) =>
					rest
						.updateOriginalWebhookMessage(application.id, context.token, {
							payload: {
								content: `An error occurred while processing the PTAL command. Please try again later.\n\n\`\`\`\n${Cause.pretty(cause)}\n\`\`\``,
								flags: Discord.MessageFlags.Ephemeral,
							},
						})
						.pipe(
							Effect.zipLeft(Effect.sleep('1 minutes')),
							Effect.zipRight(rest.deleteOriginalWebhookMessage(application.id, context.token, {}))
						)
				),
				Effect.withSpan('PTAL.followup')
			);

	// PTAL command
	const ptalCommand = Ix.global(
		{
			name: 'ptal',
			description: 'Sends a PTAL (Please Take A Look) notification for a pull request',
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'github-url',
					description: 'The URL of the pull request to notify about',
					required: true,
					min_length: 20, // Minimum length for a GitHub PR URL
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'description',
					description: 'The message to send alongside the PTAL announcement',
					required: true,
				},
			],
		},
		Effect.fn('PTALCommand')(
			function* (ix) {
				// Get interaction context
				const context = yield* Ix.Interaction;
				// biome-ignore lint/style/noNonNullAssertion: we know this is present
				const currentGuild = yield* rest.getGuild(context.guild_id!);
				// biome-ignore lint/style/noNonNullAssertion: we know this is present
				const currentChannel = yield* rest.getChannel(context.channel!.id!);

				const requestURLInput = ix.optionValue('github-url');
				const descriptionInput = ix.optionValue('description');

				if (!requestURLInput.startsWith('http')) {
					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content:
								'The provided URL is not valid. Please provide a valid GitHub pull request URL. (must start with http/https)',
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}

				const pullRequestURL = new URL(requestURLInput);

				if (
					pullRequestURL.origin !== 'https://github.com' ||
					!pullRequestURL.pathname.includes('/pull/')
				) {
					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content:
								'The provided URL is not a valid GitHub pull request URL. Please check and try again.',
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}

				const splitPath = pullRequestURL.pathname.split('/pull/');
				const [owner, repo] = splitPath[0].substring(1).split('/');
				const prNumber = Number.parseInt(splitPath[1], 10);

				const getPulls = github.wrap((_) => _.pulls.get);
				const getPullReviews = github.wrap((_) => _.pulls.listReviews);

				const [pullRequest, pullReviews] = yield* Effect.all([
					getPulls({ owner, repo, pull_number: prNumber }),
					getPullReviews({ owner, repo, pull_number: prNumber }),
				]);

				if (!pullRequest) {
					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: 'The specified pull request could not be found.',
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}

				if (!pullReviews) {
					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: 'Could not retrieve reviews for the specified pull request.',
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}

				const { newInteraction } = yield* makePTALEmbed({
					pr: pullRequest,
					description: descriptionInput,
					pullRequestUrl: pullRequestURL,
					reviewList: pullReviews,
					guildId: currentGuild.id,
				});

				yield* ptalFollowup(
					context,
					newInteraction.data,
					descriptionInput,
					owner,
					repo,
					prNumber,
					currentGuild.id
				).pipe(
					Effect.annotateLogs({ 'ptal.pullRequestUrl': pullRequestURL.toString() }),
					Effect.annotateLogs({ 'ptal.guildId': currentGuild.id }),
					Effect.annotateLogs({ 'ptal.channelId': currentChannel.id }),
					FiberMap.run(fiberMap, currentGuild.id)
				);

				return Ix.response({
					type: Discord.InteractionCallbackTypes.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
				});
			},
			Effect.annotateLogs('command', 'ptal')
		)
	);

	// Scheduled PTAL refresh
	const scheduledPTALRefresh = Effect.logInfo(
		formattedLog('PTAL', 'Starting scheduled PTAL refresh...')
	).pipe(
		Effect.flatMap(() =>
			db
				.execute((c) => c.select().from(db.schema.ptalTable))
				.pipe(
					Effect.flatMap((data) =>
						Effect.logDebug(
							formattedLog('PTAL', `Found ${data.length} PTAL entries to refresh.`)
						).pipe(Effect.as(data))
					),
					Effect.flatMap(Effect.forEach(editPTALEmbed))
				)
		),
		Effect.tap(() => Effect.logInfo(formattedLog('PTAL', 'Scheduled PTAL refresh completed.'))),
		Effect.catchAllCause(Effect.logError)
	);

	// Combine and build final interactions/effects for PTAL service
	const ix = Ix.builder.add(ptalSettingsCommand).add(ptalCommand).catchAllCause(Effect.logError);

	// Final step to register the service as initialized
	yield* Effect.all([
		registry.register(ix),
		Effect.schedule(scheduledPTALRefresh, PTALRefreshSchedule).pipe(Effect.forkScoped),
		Effect.logDebug(formattedLog('PTAL', 'PTAL Service has been initialized.')),
	]);
});

/**
 * Scoped PTAL service provider.
 *
 * This exported constant represents a PTAL service instance that is created via the local
 * `make` factory and registered with Layer.scopedDiscard semantics. The instance is scoped
 * to the current Layer and will be automatically discarded when that scope is torn down.
 *
 * @remarks
 * - The concrete instance is produced by the `make` factory in this module.
 * - Because scopedDiscard is used, the lifetime of the service is tied to the Layer scope;
 *   do not assume the instance remains valid outside that scope.
 * - Intended to be resolved from the application's dependency layer/DI system rather than
 *   instantiated directly.
 *
 * @see make
 */
export const PTALService = Layer.scopedDiscard(make);
