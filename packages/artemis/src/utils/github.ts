import type { Discord } from 'dfx/index';
import { Effect } from 'effect';
import { createGroqSummary } from './groq-utils.ts';
import { truncate } from './string.ts';

/**
 * Represents a message sent on Discord.
 *
 * @property author - An object containing information about the message author.
 * @property author.username - The username of the message author.
 * @property content - The content of the message.
 * @property timestamp - The optional timestamp indicating when the message was sent.
 */
export interface DiscordMessage {
	author: {
		username: string;
	};
	content: string;
	timestamp?: Date;
}

/**
 * Options for generating a summary.
 *
 * @property includeTimestamps - Whether to include timestamps in the summary.
 * @property includeParticipants - Whether to include participants in the summary.
 * @property title - An optional title for the summary.
 */
interface SummaryOptions {
	includeParticipants?: boolean;
	title?: string;
}

export const createGitHubSummary = Effect.fn(function* (
	messages: DiscordMessage[],
	channel: Discord.ThreadResponse,
	options: SummaryOptions = {}
) {
	const { includeParticipants = true, title = 'Discord Discussion Summary' } = options;

	if (messages.length === 0) {
		return '## No messages to summarize';
	}

	const groqSummary = yield* createGroqSummary(messages, channel.name);

	let markdown = `## ${title}\n\n`;

	// Add participants list
	if (includeParticipants) {
		const participants = [...new Set(messages.map((msg) => msg.author.username))];
		markdown += `**Participants:** ${participants.map((p) => `@${p}`).join(', ')}\n\n`;
	}

	markdown += '---\n\n';

	markdown += '## Summary\n\n';
	markdown += truncate(groqSummary, 4000); // Truncate to avoid exceeding GitHub limits

	markdown += '\n\n---\n\n';
	markdown += `_Extracted from Discord conversation: https://discord.com/channels/${channel.guild_id}/${channel.id}_\n`;

	return markdown;
});

/**
 * Parses raw Discord bot output into message objects
 * @param rawOutput - Raw text in format "@username: message"
 * @returns Array of DiscordMessage objects
 */
export function parseDiscordBotOutput(rawOutput: string): DiscordMessage[] {
	const lines = rawOutput.trim().split('\n');
	const messages: DiscordMessage[] = [];
	let currentMessage: DiscordMessage | null = null;

	for (const line of lines) {
		// Match format: @username: message
		const match = line.match(/^@([^:]+):\s*(.*)$/);

		if (match) {
			// Save previous message if exists
			if (currentMessage) {
				messages.push(currentMessage);
			}

			// Start new message
			currentMessage = {
				author: {
					username: match[1].trim(),
				},
				content: match[2].trim(),
			};
		} else if (currentMessage && line.trim()) {
			// Continue multi-line message
			currentMessage.content += `\n${line.trim()}`;
		}
	}

	// Don't forget the last message
	if (currentMessage) {
		messages.push(currentMessage);
	}

	return messages;
}
