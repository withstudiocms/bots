import { DiscordGateway } from 'dfx/DiscordGateway';
import { DiscordREST } from 'dfx/DiscordREST';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, type APIUnavailableGuild, PresenceUpdateStatus } from 'dfx/types';
import { eq } from 'drizzle-orm';
import { Cron, Effect, Layer, Schedule } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordApplication } from '../core/discord-rest.ts';
import { nodeEnv, presenceSchedule, presenceTimezone } from '../static/env.ts';
import {
	delayByOneSecond,
	delayByTenSeconds,
	effectSleep2Seconds,
	spacedOnceSecond,
} from '../static/schedules.ts';
import { activityUpdater } from '../utils/activity-updater.ts';
import { handleMessage } from '../utils/groq-reply.ts';
import { formatArrayLog, formattedLog } from '../utils/log.ts';
import { editPTALEmbed } from '../utils/ptal.ts';

/**
 * Creates an effect that schedules a periodic presence update action.
 *
 * This generator function:
 * - Retrieves the Discord gateway instance.
 * - Sets up a cron schedule to trigger every 5 minutes by default.
 * - Defines an action that selects a random presence update and sends it via the gateway.
 * - Schedules the action to run according to the cron schedule, forking it as a scoped effect.
 *
 * @remarks
 * The cron expression `'*\/5 * * * *'` ensures the action runs every 5 minutes by default.
 * The scheduled effect is forked to run in the background within the current scope.
 *
 * @returns An `Effect` that, when run, starts the scheduled presence update process.
 */
const make = Effect.gen(function* () {
	const [gateway, cronConfig, cronTZ, env, db, rest, app] = yield* Effect.all([
		DiscordGateway,
		presenceSchedule,
		presenceTimezone,
		nodeEnv,
		DatabaseLive,
		DiscordREST,
		DiscordApplication,
	]);

	// =======================================================
	// Utility functions
	// =======================================================

	// Convert the Cron into a Schedule
	const schedule = Schedule.cron(Cron.unsafeParse(cronConfig, cronTZ));

	// Handler to update a single PTAL message
	const handlePTALUpdate = Effect.fn(function* (ptal: typeof db.schema.ptalTable.$inferSelect) {
		// Fetch the channel and edit the PTAL embed with a delay
		const channel = yield* effectSleep2Seconds.pipe(() => rest.getChannel(ptal.channel));

		// If the channel does not exist, continue to the next message
		if (!channel) return;

		// Edit the PTAL embed with a delay to respect rate limits
		yield* effectSleep2Seconds.pipe(() => editPTALEmbed(ptal));
	});

	// Function to handle guild updates in the database
	const handleGuildUpdate = (
		guildList: {
			id: string;
			ptal_announcement_role: string | null;
		}[],
		currentGuild: APIUnavailableGuild
	) =>
		Effect.gen(function* () {
			// Check if the guild already exists in the database
			const exists = guildList.find((g) => g.id === currentGuild.id);

			// If the guild does not exist, add it to the database and log the action
			if (!exists) {
				yield* Effect.all([
					db.execute((c) => c.insert(db.schema.guilds).values({ id: currentGuild.id })),
					Effect.logInfo(formattedLog('Database', `Added new guild to DB: ${currentGuild.id}`)),
				]);
			}
		});

	// =======================================================
	// PTAL Updater
	// =======================================================

	/**
	 * Updates all PTAL messages in the database by editing their embeds.
	 *
	 * This effect:
	 * - Fetches all PTAL messages from the database.
	 * - Iterates through each message, fetching the corresponding channel and editing the PTAL embed.
	 * - Introduces a 2-second delay between processing each message to avoid rate limits.
	 * - Logs a completion message once all PTAL messages have been updated.
	 *
	 * @remarks
	 * This effect is triggered upon receiving the 'READY' event to ensure all PTAL messages are up to date.
	 */
	const updatePTALs = db
		.execute((c) => c.select().from(db.schema.ptalTable))
		.pipe(
			Effect.flatMap(Effect.forEach(handlePTALUpdate)),
			// Log completion of PTAL messages update
			Effect.tap(() => Effect.logInfo(formattedLog('PTAL', 'PTAL messages have been updated.'))),
			Effect.catchAllCause(Effect.logError)
		);

	// =======================================================
	// Discord Ready Event
	// =======================================================

	/**
	 * Handles the 'READY' event from the Discord gateway.
	 *
	 * When the bot receives the 'READY' event, this handler logs relevant information,
	 */
	const ready = gateway
		.handleDispatch('READY', (readyData) =>
			Effect.gen(function* () {
				const [dbConnected] = yield* Effect.all([
					Effect.gen(function* () {
						yield* Effect.all([
							db.execute((c) => c.$client.execute('SELECT CURRENT_TIMESTAMP')),
							Effect.logInfo(formattedLog('Database', 'Successfully connected to the database.')),
						]);
						return true;
					}).pipe(
						Effect.catchAll((err) =>
							Effect.logError(
								formattedLog('Database', `Failed to connect to the database: ${err.message}`)
							).pipe(Effect.as(false))
						)
					),
					gateway.send(
						SendEvent.presenceUpdate({
							status: PresenceUpdateStatus.Online,
							since: Date.now(),
							afk: false,
							activities: [
								{
									type: ActivityType.Custom,
									name: 'Booting up...',
									state: 'Booting up...',
								},
							],
						})
					),
					...formatArrayLog('Discord', [
						`Environment: ${env}`,
						`User: ${readyData.user.username}`,
						`ID: ${readyData.user.id}`,
						`Guilds: ${readyData.guilds.length}`,
						`Invite URL: https://discord.com/oauth2/authorize?client_id=${readyData.user.id}`,
					]),
					Effect.logInfo(formattedLog('Discord', 'Initialized bot configuration.')),
				]);

				if (dbConnected) {
					yield* db
						.execute((c) => c.select().from(db.schema.guilds))
						.pipe(
							Effect.flatMap((guildList) =>
								Effect.forEach(readyData.guilds, (currentGuild) =>
									handleGuildUpdate(guildList, currentGuild)
								)
							)
						);

					// Update ptal messages after ensuring guilds are synced
					yield* Effect.forkScoped(Effect.schedule(updatePTALs, delayByOneSecond));
				}
			})
		)
		.pipe(Effect.retry(spacedOnceSecond));

	// =======================================================
	// Guild Watcher Events
	// =======================================================

	/**
	 * Handles the 'GUILD_CREATE' event from the gateway.
	 *
	 * When a new guild is created, this handler checks if the guild already exists in the database.
	 * If the guild does not exist, it inserts a new entry for the guild and logs the action.
	 * The operation is retried on failure with a 1-second interval between attempts.
	 *
	 * @remarks
	 * - Utilizes the Effect system for managing side effects and retries.
	 * - Ensures the database remains synchronized with the gateway's guild state.
	 */
	const guildCreate = gateway
		.handleDispatch('GUILD_CREATE', (guild) =>
			Effect.gen(function* () {
				// Get all guilds from the database
				const exists = yield* db.execute((c) =>
					c.select().from(db.schema.guilds).where(eq(db.schema.guilds.id, guild.id)).get()
				);

				// If the guild does not exist, add it to the database and log the action
				if (!exists) {
					yield* Effect.all([
						db.execute((c) => c.insert(db.schema.guilds).values({ id: guild.id })),
						Effect.logInfo(formattedLog('Database', `Added new guild to DB: ${guild.id}`)),
					]);
				}
			})
		)
		.pipe(Effect.retry(spacedOnceSecond));

	/**
	 * Handles the 'GUILD_DELETE' event from the gateway.
	 *
	 * When a guild is deleted, this handler removes the corresponding guild entry from the database,
	 * logs the removal, and retries the operation every second if an error occurs.
	 *
	 * @remarks
	 * - Uses an effectful approach to handle asynchronous operations and error logging.
	 * - Retries the deletion operation on failure, with a 1-second interval between attempts.
	 *
	 * @see Effect
	 * @see db.makeQuery
	 * @see Schedule.spaced
	 */
	const guildDelete = gateway
		.handleDispatch('GUILD_DELETE', (guild) =>
			Effect.gen(function* () {
				// Get all guilds from the database
				const exists = yield* db.execute((c) =>
					c.select().from(db.schema.guilds).where(eq(db.schema.guilds.id, guild.id)).get()
				);

				// If the guild exists, remove it from the database and log the action
				if (!exists) return;
				yield* Effect.all([
					db.execute((c) => c.delete(db.schema.guilds).where(eq(db.schema.guilds.id, guild.id))),
					Effect.logInfo(formattedLog('Database', `Removed guild from DB: ${guild.id}`)),
				]);
			}).pipe(Effect.catchAllCause(Effect.logError))
		)
		.pipe(Effect.retry(spacedOnceSecond));

	// =======================================================
	// Ping Reply Handler
	// =======================================================

	const handlePing = gateway
		.handleDispatch('MESSAGE_CREATE', (message) =>
			Effect.gen(function* () {
				// Ignore messages from bots
				if (message.author.bot) return;

				// Ignore messages without mentions
				if (!message.mentions || message.mentions.length === 0) return;

				// Ignore messages that do not mention the bot
				if (!message.mentions.some(({ id }) => id === app.id)) return;

				// Log the mention
				yield* Effect.logDebug(
					formattedLog(
						'PingReply',
						`Received mention from ${message.author.id} in channel ${message.channel_id}. Processing...`
					)
				);

				// Handle the message in a forked scope
				yield* handleMessage(message);
			})
		)
		.pipe(Effect.retry(spacedOnceSecond));

	// =======================================================
	// Initialize and run all handlers
	// =======================================================

	const activityUpdaterLive = activityUpdater(gateway);

	yield* Effect.all([
		// Discord Ready event handler
		Effect.forkScoped(ready),
		Effect.logDebug(formattedLog('Discord', 'Interactions registered and running.')),

		// Activity updater scheduled effects
		Effect.schedule(activityUpdaterLive, delayByTenSeconds).pipe(Effect.forkScoped),
		Effect.schedule(activityUpdaterLive, schedule).pipe(Effect.forkScoped),
		Effect.logDebug(formattedLog('Presence', 'Interactions registered and running.')),

		// Guild Watcher Events
		Effect.forkScoped(guildCreate),
		Effect.forkScoped(guildDelete),
		Effect.logDebug(formattedLog('GuildWatcher', 'Interactions registered and running.')),

		// Handle Ping Replies
		Effect.forkScoped(handlePing),
		Effect.logDebug(formattedLog('PingReply', 'Interactions registered and running.')),
	]);
});

export const GatewayEventsLive = Layer.scopedDiscard(make);
