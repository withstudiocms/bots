import { HttpLayerRouter, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import type { WebhookEventName } from '@octokit/webhooks-types';
import { Console, Effect } from 'effect';
import { processWebhook } from './processor.ts';
import { verifySignature } from './security.ts';

/**
 * HTTP route handler for receiving GitHub webhook POST requests at `/api/github/webhook`.
 *
 * @remarks
 * - Reads the incoming HTTP request body as text and attempts to parse it as JSON.
 * - Extracts GitHub-specific headers:
 *   - `x-github-event` (event name)
 *   - `x-hub-signature-256` (HMAC SHA-256 signature)
 *   - `x-github-delivery` (delivery ID)
 * - Verifies the request payload signature using `verifySignature`.
 * - Logs receipt of the event via `Console.log`.
 * - Delegates handling of the parsed payload to `processWebhook(event, payload)`.
 * - On success, returns a JSON 200 response: `{ message: 'Webhook processed successfully' }`.
 *
 * Error handling:
 * - All errors arising during parsing, signature verification, or processing are caught.
 * - Errors are logged via `Console.error`.
 * - Returns a JSON error response with:
 *   - `401` if the error message indicates a signature verification failure (message contains "signature"),
 *   - otherwise `500` for other internal errors.
 * - The JSON error body is `{ error: string }` where `string` is either the error message or a generic message.
 *
 * Side effects:
 * - Uses `Console.log` and `Console.error` for observability.
 * - Calls external helpers: `verifySignature` (for authenticity) and `processWebhook` (for business logic).
 *
 * Notes:
 * - The handler expects the request body to be valid JSON. Malformed JSON will result in an error response.
 * - Signature header may be absent; such cases will be treated according to `verifySignature` behavior and may result in a 401.
 *
 * @returns An effectful HTTP response (JSON) indicating success or an error with an appropriate status code.
 */
export const githubWebhookRouteHandler = HttpLayerRouter.route(
	'POST',
	'/api/github/webhook',
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;

		// Get headers
		const event = request.headers['x-github-event'] as WebhookEventName;
		const signature = request.headers['x-hub-signature-256'];
		const deliveryId = request.headers['x-github-delivery'];

		return yield* request.text.pipe(
			Effect.flatMap((bodyText) =>
				Effect.all({
					payload: Effect.succeed(JSON.parse(bodyText)),
					signatureVerified: verifySignature(bodyText, signature),
				})
			),
			Effect.tap(() => Console.log(`Received ${event} event (${deliveryId})`)),
			Effect.flatMap(({ payload }) => processWebhook(event, payload)),
			Effect.flatMap(() =>
				HttpServerResponse.json(
					{ message: 'Webhook processed successfully' },
					{
						status: 200,
					}
				)
			)
		);
	}).pipe(
		Effect.catchAll((error) =>
			Effect.gen(function* () {
				yield* Console.error('Error processing webhook:', error);
				return yield* HttpServerResponse.json(
					{ error: error instanceof Error ? error.message : 'Internal server error' },
					{ status: error instanceof Error && error.message.includes('signature') ? 401 : 500 }
				);
			})
		)
	)
);
