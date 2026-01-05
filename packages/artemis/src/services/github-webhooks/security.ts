import crypto from 'node:crypto';
import { Effect, Redacted } from 'effect';
import { githubWebhookSecret } from '../../static/env.ts';

/**
 * Verify that a request body matches the provided HMAC SHA-256 signature header.
 *
 * Computes an HMAC SHA-256 digest of the provided `body` using the `WEBHOOK_SECRET`
 * and compares it to the supplied `signature`. The signature is expected to be in
 * the form "sha256=<hex>".
 *
 * Behavior:
 * - If `signature` is undefined, the returned Effect fails with Error('No signature provided').
 * - If the computed digest does not exactly equal the provided signature, the returned Effect fails with Error('Invalid signature').
 * - If the signature matches, the returned Effect succeeds with the boolean value `true`.
 *
 * Notes:
 * - The comparison is a direct equality check (not constant-time); consider using a constant-time comparison to mitigate timing attacks.
 * - `WEBHOOK_SECRET` must be defined in the surrounding scope and should be kept secret.
 *
 * @param body - The raw request body to compute the HMAC over.
 * @param signature - The signature header value (expected "sha256=<hex>") or undefined.
 * @returns An Effect that fails with an Error on missing or invalid signature, or succeeds with `true` when the signature is valid.
 */
export const verifySignature = Effect.fn(function* (body: string, signature: string | undefined) {
	if (!signature) {
		return yield* Effect.fail(new Error('No signature provided'));
	}

	const webhookSecret = yield* githubWebhookSecret;

	const hmac = crypto.createHmac('sha256', Redacted.value(webhookSecret));
	const digest = `sha256=${hmac.update(body).digest('hex')}`;

	if (signature !== digest) {
		return yield* Effect.fail(new Error('Invalid signature'));
	}

	return true;
});
