import type { WebhookEventMap, WebhookEventName } from '@octokit/webhooks-types';
import { Console, Effect, Schema } from 'effect';
import { handleRepositoryDispatch } from './hook-handlers/repository-dispatch.ts';
import { RepositoryDispatchEventSchema } from './schemas.ts';

/**
 * Logs a generic webhook event and its payload for debugging or auditing purposes.
 *
 * This is a fallback handler for events that don't have a dedicated processor.
 * It performs a side-effect (console logging) and does not transform or return data.
 *
 * @param event - The event name or type (for example, "push" or "pull_request").
 * @param payload - The event payload; treated opaquely because its shape depends on the event type.
 * @returns void
 */
const handleGenericEvent = (event: string, payload: unknown) =>
	Console.log(`Received ${event} event:`, payload);

/**
 * Process a GitHub webhook by decoding the provided payload and dispatching it
 * to the appropriate event handler within an Effect context.
 *
 * The function is generic over the event name so the payload parameter is
 * statically typed according to WebhookEventMap[Event].
 *
 * The returned Effect encapsulates any asynchronous work, side effects and
 * potential failures (e.g. decoding errors or handler failures).
 *
 * @template Event - A key of WebhookEventMap representing the webhook event name.
 * @param event - The name of the incoming webhook event.
 * @param payload - The raw payload associated with the event; its static type
 *                  is determined by the Event generic via WebhookEventMap.
 * @returns An Effect that, when executed, performs decoding/handling of the
 *          webhook and yields the handler result or a logging action. The
 *          Effect may fail with decoding or handler errors.
 */
export const processWebhook = Effect.fn(function* <Event extends WebhookEventName>(
	event: Event,
	payload: WebhookEventMap[Event]
) {
	// Dispatch the event to the appropriate handler
	switch (event) {
		case 'repository_dispatch':
			return yield* Schema.decodeUnknown(RepositoryDispatchEventSchema)(payload).pipe(
				Effect.flatMap(handleRepositoryDispatch)
			);

		case 'installation':
			return yield* handleGenericEvent(event, payload);

		default:
			return yield* Console.log(`Unhandled event type: ${event}`);
	}
});
