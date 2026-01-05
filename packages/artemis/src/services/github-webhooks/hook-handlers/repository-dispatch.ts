import { Effect, Schema } from 'effect';
import { type AppEvents, EventBus } from '../../../core/event-bus.ts';
import { type RepositoryDispatchEventSchema, RepositorySchema } from '../schemas.ts';

/**
 * Schema for validating Crowdin-triggered repository_dispatch webhook payloads.
 *
 * Expected shape:
 * - repository.owner: string — repository owner/login
 * - repository.name: string — repository name
 * - payload.pull_request_url: string — URL of the pull request created by Crowdin
 *
 * All fields are required and must be strings. Use this schema to validate incoming
 * repository_dispatch events from Crowdin before further processing, ensuring the
 * handler has the repository identifiers and a pull request URL to act upon.
 *
 * Example:
 * {
 *   repository: { owner: "org-or-user", name: "repo-name" },
 *   payload: { pull_request_url: "https://github.com/org-or-user/repo-name/pull/123" }
 * }
 *
 * @internal Used by GitHub webhook handlers to route and validate Crowdin events.
 */
const CrowdinExpectedPayloadSchema = Schema.Struct({
	repository: Schema.Struct({
		owner: Schema.String,
		name: Schema.String,
	}),
	payload: Schema.Struct({
		pull_request_url: Schema.String,
	}),
});

/**
 * Schema for validating and transforming incoming GitHub "repository_dispatch" payloads
 * that are intended to trigger Crowdin-related workflows.
 *
 * Remarks:
 * - Validates the incoming shape produced by GitHub repository_dispatch webhooks:
 *   - Expects a `repository` object (as defined by `RepositorySchema`) and a `clientPayload`
 *     object containing a `pull_request_url` string.
 * - Transforms the validated input into the internal Crowdin-shaped payload
 *   (`CrowdinExpectedPayloadSchema`) via a `Schema.transform`:
 *   - decode: maps `repository.owner.login` -> `repository.owner` (string) and
 *     `repository.name` -> `repository.name`, and maps `clientPayload.pull_request_url`
 *     -> `payload.pull_request_url`.
 *   - encode: performs the inverse mapping (reconstructs the original GitHub-like shape).
 * - `strict: false` is set on the transform so unknown/extra properties on the incoming
 *   object are allowed to pass through (they are not rejected), but required fields
 *   must still be present for successful validation.
 *
 * Usage:
 * - Use this schema to decode incoming webhook payloads into the normalized internal
 *   shape before processing Crowdin logic, and to encode internal payloads back to the
 *   outgoing GitHub-like shape when necessary.
 *
 * Errors:
 * - Validation will fail if required fields are missing or have incorrect types
 *   (e.g., missing `clientPayload.pull_request_url` or non-string values).
 *
 * See also:
 * - RepositorySchema (expected structure of the incoming repository object)
 * - CrowdinExpectedPayloadSchema (target internal payload shape after transform)
 */
const incomingCrowdinPayloadSchema = Schema.Struct({
	repository: RepositorySchema,
	client_payload: Schema.Struct({
		pull_request_url: Schema.String,
	}),
}).pipe(
	Schema.transform(CrowdinExpectedPayloadSchema, {
		decode: (input) => ({
			repository: {
				owner: input.repository.owner.login,
				name: input.repository.name,
			},
			payload: {
				pull_request_url: input.client_payload.pull_request_url,
			},
		}),
		encode: (input) => input,
		strict: false,
	})
);

/**
 * Handle a GitHub repository dispatch webhook event.
 *
 * Processes a `RepositoryDispatchEvent` payload and performs side effects such as
 * publishing specific events to the internal event bus based on the action and
 * client payload. The implementation is an Effect generator that yields logging
 * and event publishing effects; run the returned Effect in your effect runtime
 * to execute the side effects.
 *
 * @param payload - The repository dispatch event payload. Expected type: `Schema.Schema.Type<typeof RepositoryDispatchEventSchema>`.
 * @returns An Effect that, when executed, will perform the logging and event publishing for the repository dispatch event.
 *
 * @example
 * // Example usage (pseudo):
 * // const effect = handleRepositoryDispatch(payload);
 * // effectRuntime.run(effect);
 *
 * @remarks
 * - If `payload.action === 'crowdin.create'`, extracts the `pull_request_url`
 *   from `payload.client_payload` and publishes a `crowdin.create` event to
 *   the event bus with repository info and the pull request URL.
 * - Logs a message if the `pull_request_url` is missing or invalid.
 */
export const handleRepositoryDispatch = Effect.fn(function* (
	payload: Schema.Schema.Type<typeof RepositoryDispatchEventSchema>
) {
	const sendEvent = yield* EventBus;

	/**
	 * Creates and publishes a 'crowdin.create' event to the event bus.
	 *
	 * @param payload - The payload for the 'crowdin.create' event.
	 * @returns An Effect that publishes the event when executed.
	 */
	const createCrowdinEvent = Effect.fn(
		(payload: Extract<AppEvents, { type: 'crowdin.create' }>['payload']) =>
			sendEvent.publish({
				type: 'crowdin.create',
				payload,
			})
	);

	switch (payload.action) {
		case 'crowdin.create': {
			yield* Schema.decodeUnknown(incomingCrowdinPayloadSchema)(payload).pipe(
				Effect.flatMap(createCrowdinEvent)
			);
			break;
		}
		default:
			break;
	}
});
