import { Data, Effect, Redacted } from 'effect';
import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsBase } from 'groq-sdk/resources/chat/completions.mjs';
import { groqApiKey } from '../static/env.ts';

/**
 * Represents a message in a Groq chat completion request.
 *
 * @property role - The role of the message sender, which can be 'system', 'user', or 'assistant'.
 * @property content - The textual content of the message.
 */
type GroqMessage = {
	role: 'system' | 'user' | 'assistant';
	content: string;
};

/** Singleton instance of the Groq SDK. */
let groqInstance: Groq | undefined;

/**
 * Retrieves a singleton instance of the Groq SDK, initializing it with the API key if not already created.
 *
 * @returns An Effect that yields the Groq instance.
 */
const getGroqInstance = () =>
	Effect.gen(function* () {
		const apiKey = yield* groqApiKey;
		if (!groqInstance) {
			groqInstance = new Groq({ apiKey: Redacted.value(apiKey) });
		}
		return groqInstance;
	});

/**
 * Represents an error specific to Groq AI operations within the application.
 *
 * @extends Data.TaggedError
 * @template { cause: unknown }
 *
 * @property {unknown} cause - The underlying cause of the Groq AI error.
 */
export class GroqAiError extends Data.TaggedError('GroqAiError')<{
	readonly cause: unknown;
}> {}

/**
 * Wraps a promise-returning function in an Effect, converting any thrown errors into GroqAiError instances.
 *
 * @template T - The type of the value yielded by the promise.
 * @param _try - A function that returns a Promise of type T.
 * @returns An Effect that yields the result of the promise or fails with a GroqAiError.
 */
const tryCatch = <T>(_try: () => Promise<T>) =>
	Effect.tryPromise({
		try: _try,
		catch: (error) => new GroqAiError({ cause: error }),
	});

/**
 * Service class providing helper methods for interacting with the Groq AI API.
 *
 * @remarks
 * This service is registered under the tag `'app/GroqAiHelpers'` and is intended to be used
 * within an Effect system. It provides a method to create chat completions using the Groq API.
 *
 * @example
 * ```typescript
 * const { makeCompletion } = use(GroqAiHelpers);
 * const result = await makeCompletion('model-name', [
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 *
 * @public
 */
export class GroqAiHelpers extends Effect.Service<GroqAiHelpers>()('app/GroqAiHelpers', {
	effect: Effect.gen(function* () {
		const groq = yield* getGroqInstance();

		/** Creates a chat completion using the Groq API. */
		const makeCompletion = (
			messages: GroqMessage[],
			options?: Pick<
				Partial<ChatCompletionCreateParamsBase>,
				'temperature' | 'max_completion_tokens' | 'model'
			>
		) =>
			tryCatch(() =>
				groq.chat.completions.create({
					messages,
					model: options?.model ?? 'compound-beta',
					temperature: options?.temperature ?? 1,
					max_completion_tokens: options?.max_completion_tokens ?? 1024,
					top_p: 1,
					stream: false,
					stop: null,
				})
			);

		return { makeCompletion } as const;
	}),
}) {}
