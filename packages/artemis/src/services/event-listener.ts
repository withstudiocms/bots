import { DiscordREST } from 'dfx/DiscordREST';
import { and, eq } from 'drizzle-orm';
import { Cause, Effect, Layer } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
import { EventBus } from '../core/event-bus.ts';
import { Github } from '../core/github.ts';
import { formattedLog } from '../utils/log.ts';
import { makePTALEmbed } from '../utils/ptal.ts';

/**
 * Options used to construct a Crowdin reference for a repository.
 *
 * @remarks
 * Provides the repository owner and name required to build a Crowdin project/translation reference.
 *
 * @property owner - The GitHub username or organization that owns the repository.
 * @property name - The repository name.
 */
interface GetCrowdinReferenceOpts {
	owner: string;
	name: string;
}

/**
 * Options required to create a PTAL (Please Take A Look) record.
 *
 * @property channel - Identifier of the channel where the PTAL message was posted (e.g. channel ID or name).
 * @property message - The content or identifier of the PTAL message.
 * @property owner - Repository owner (user or organization) for the related pull request.
 * @property repository - Repository name associated with the PTAL.
 * @property pr - Pull request number that the PTAL refers to.
 * @property guildId - Guild (server) identifier where the event originated (e.g. Discord guild ID).
 */
interface AddPtalRecordOpts {
	channel: string;
	message: string;
	owner: string;
	repository: string;
	pr: number;
	guildId: string;
}

/**
 * Creates an Effect that registers a handler for "crowdin.create" events on the shared EventBus.
 *
 * When executed the Effect obtains the EventBus and subscribes a handler which:
 * - logs the repository owner and name from event.payload.repository.owner and event.payload.repository.name
 * - logs the pull request URL from event.payload.payload.pull_request_url
 *
 * The returned Effect performs the subscription as a side effect; the handler itself executes additional
 * Effects when matching events are received.
 *
 * @returns An Effect which, when run, registers the "crowdin.create" subscription (completes once registration is done).
 */
const make = Effect.gen(function* () {
	const [eventBus, db, rest, github] = yield* Effect.all([
		EventBus,
		DatabaseLive,
		DiscordREST,
		Github,
	]);

	// GitHub API wrappers
	const getPulls = github.wrap((_) => _.pulls.get);
	const getPullReviews = github.wrap((_) => _.pulls.listReviews);

	// Database queries
	const getCrowdinReference = db.makeQuery((ex, { name, owner }: GetCrowdinReferenceOpts) =>
		ex((c) =>
			c
				.select()
				.from(db.schema.crowdinEmbed)
				.where(and(eq(db.schema.crowdinEmbed.repo, name), eq(db.schema.crowdinEmbed.owner, owner)))
		)
	);

	const addPTALRecord = db.makeQuery((ex, params: AddPtalRecordOpts) =>
		ex((c) =>
			c.insert(db.schema.ptalTable).values({
				...params,
				description: 'Crowdin Sync Request',
			})
		)
	);

	// Subscribe to "crowdin.create" events
	const crowdinCreateSubscription = eventBus.subscribe('crowdin.create', ({ payload }) =>
		Effect.gen(function* () {
			yield* Effect.log(
				`Processing crowdin.create event for repository: ${payload.repository.owner}/${payload.repository.name}`
			);

			console.log('Received crowdin.create event with payload:', payload.payload);

			// Extract PR number from payload
			const pullRequestUrl = new URL(payload.payload.pull_request_url);
			const splitPath = pullRequestUrl.pathname.split('/pull/');
			const pull_number = Number.parseInt(splitPath[1], 10);

			// Extract owner and repo name
			const { owner, name: repo } = payload.repository;

			const [crowdinRefs, pr, reviewList] = yield* Effect.all([
				getCrowdinReference(payload.repository),
				getPulls({ owner, repo, pull_number }),
				getPullReviews({ owner, repo, pull_number }),
			]);

			for (const ref of crowdinRefs) {
				const ptal = yield* makePTALEmbed({
					pr,
					guildId: ref.guildId,
					pullRequestUrl,
					reviewList,
					description: 'Crowdin Sync Request',
				});

				const newInteraction = ptal.newInteraction;
				const channelId = ref.channelId;

				// Create message in Discord channel
				const messageResponse = yield* rest.createMessage(channelId, newInteraction.data);

				// Insert PTAL record into the database
				yield* addPTALRecord({
					channel: channelId,
					message: messageResponse.id,
					owner,
					repository: repo,
					pr: pull_number,
					guildId: ref.guildId,
				});
			}

			// Log the completion of processing for this event
			yield* Effect.log(
				`Finished processing crowdin.create event for repository: ${payload.repository.owner}/${payload.repository.name}`
			);
		}).pipe(
			Effect.catchAllCause((cause) =>
				Effect.logError(
					formattedLog(
						'EventBus',
						`Error fetching data for Crowdin create event: ${Cause.pretty(cause)}`
					)
				)
			)
		)
	);

	// Subscribe to "test.event" events
	const testEventSubscription = eventBus.subscribe(
		'test.event',
		Effect.fn(({ payload }) => Effect.log(`Received test event with message: ${payload.message}`))
	);

	// Setup the listeners
	yield* Effect.all([
		Effect.forkScoped(crowdinCreateSubscription),
		Effect.forkScoped(testEventSubscription),
		Effect.logDebug(formattedLog('EventBus', 'EventBusListener has been initialized.')),
	]);
});

/**
 * A scoped Layer that provides the "live" EventBus listener implementation.
 *
 * Summary:
 * This exported layer constructs an EventBus listener using the internal `make` factory
 * and registers it with a scoped lifecycle. The listener instance is created when the
 * layer is instantiated within a scope and is automatically discarded (disposed/unsubscribed)
 * when that scope ends.
 *
 * Remarks:
 * - Built with Layer.scopedDiscard(make), so each scope receives its own listener instance.
 * - The instance is not shared across independent scopes and is cleaned up automatically
 *   when the scope finishes, preventing resource leaks from long-lived subscriptions.
 * - Intended for runtime usage where listeners should be bound to a particular lifecycle.
 *
 * Thread-safety:
 * The layer itself is safe to create and pass between threads/tasks, but the listener
 * instance semantics (one-per-scope and discarded on scope end) should be considered when
 * designing concurrent access to the EventBus.
 *
 * See also:
 * - The `make` factory used to construct the listener for implementation details.
 *
 * @public
 */
export const EventBusListenerLive = Layer.scopedDiscard(make);
