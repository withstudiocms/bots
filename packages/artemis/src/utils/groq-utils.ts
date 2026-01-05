import { Effect, pipe } from 'effect';
import { GroqAiHelpers } from '../core/groq.ts';
import type { DiscordMessage } from './github.ts';
import { firstParagraph, removePeriod, removeQuotes } from './string.ts';

/**
 * Cleans the generated title by extracting the first paragraph, removing quotes and trailing periods.
 *
 * @param _ - The raw title string.
 * @returns The cleaned title string.
 */
const cleanTitle = (_: string) => pipe(firstParagraph(_), removeQuotes, removePeriod);

/**
 * Generates a concise title summarizing the provided prompt using Groq AI.
 *
 * @param prompt - The input text to summarize into a title.
 * @returns An Effect that yields the generated title.
 */
export const generateTitle = (prompt: string) =>
	Effect.gen(function* () {
		const { makeCompletion } = yield* GroqAiHelpers;

		const systemPrompt = `You are a helpful assistant for the StudioCMS Discord community.

Create a short title summarizing the message that is less than 50 characters. Do not include markdown in the title.`;

		const completion = yield* makeCompletion(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: prompt },
			],
			{
				temperature: 0.25,
			}
		);

		const title = cleanTitle(completion.choices[0]?.message?.content ?? 'Unknown Title');

		return title;
	});

/**
 * Creates a summary of Discord messages in a given channel using Groq AI.
 *
 * @param messages - An array of DiscordMessage objects to summarize.
 * @param channelName - The name of the Discord channel.
 * @returns An Effect that yields the generated summary.
 */
export const createGroqSummary = (messages: DiscordMessage[], channelName: string) =>
	Effect.gen(function* () {
		const { makeCompletion } = yield* GroqAiHelpers;

		const systemPrompt = `You are a helpful assistant that summarizes Discord threads into concise titles and summaries for Github issues.
    
    In the summary, include some key takeaways or important points discussed in the thread.
    
    The title of this conversation is: "${channelName}"`;

		const userMessages = messages
			.map((msg) => `@${msg.author.username}: ${msg.content}`)
			.join('\n\n');

		const userPrompt = `Here are the messages from the Discord thread:\n\n${userMessages}\n\nPlease provide a concise summary of the above conversation for a GitHub issue.`;

		const completion = yield* makeCompletion([
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userPrompt },
		]);

		const summary = completion.choices[0]?.message?.content ?? 'No summary available.';

		return summary;
	});
