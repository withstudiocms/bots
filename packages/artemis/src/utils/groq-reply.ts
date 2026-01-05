import { DiscordREST } from 'dfx/DiscordREST';
import { Discord } from 'dfx/index';
import type { GatewayMessageCreateDispatchData } from 'dfx/types';
import { Effect } from 'effect';
import { DiscordApplication } from '../core/discord-rest.ts';
import { GroqAiHelpers } from '../core/groq.ts';
import { Messages } from '../core/messages.ts';
import { formattedLog } from './log.ts';

/**
 * Reference materials for Artemis bot
 */
const BOT_RESOURCES = {
	llmResources: [
		{ label: 'StudioCMS LLMs Index', url: 'https://docs.studiocms.dev/llms.txt' },
		{ label: 'StudioCMS LLMs Context Full', url: 'https://docs.studiocms.dev/llms-full.txt' },
		{ label: 'StudioCMS LLMs Context Small', url: 'https://docs.studiocms.dev/llms-small.txt' },
	],
	quickLinks: [
		{ label: 'Documentation', url: 'https://docs.studiocms.dev' },
		{ label: 'Website', url: 'https://studiocms.dev' },
		{ label: 'GitHub', url: 'https://github.com/withstudiocms/studiocms' },
	],
	quickFacts: [
		'The StudioCMS project is built for Astro with Astro and the community in mind. You can be sure that any of our projects will be focused on improving the ecosystem and giving back to developers.',
		`StudioCMS isn't a closed-off project or organization - it is made up of Astro community members like you! Anyone can make suggestions and contribute in whichever way they like.`,
		'We believe in open source software and the power of community collaboration to create better tools for everyone.',
		'We prioritize performance and developer experience in all our projects, ensuring that our tools are not only powerful but also easy and enjoyable to use.',
	],
	techDetails: [
		'StudioCMS is built with Astro, TypeScript, Kysely and Effect-TS, leveraging modern web technologies for optimal performance and developer experience.',
		'Our architecture follows a modular design, allowing for easy integration and feature expansion through the use of plugins.',
		'We utilize CI/CD pipelines to ensure that all contributions are tested and deployed efficiently, maintaining high code quality across our projects.',
		'StudioCMS is designed with a focus on developer experience, providing intuitive APIs and comprehensive documentation to streamline the development process.',
		'Security is a top priority for us; we implement best practices to protect user data and ensure the integrity of our applications.',
	],
	commonQuestions: [
		{
			question: 'How do I install StudioCMS?',
			answer:
				'You can install StudioCMS by following the instructions in our documentation at https://docs.studiocms.dev/en/start-here/getting-started/ for full instructions or by running `npm create studiocms@latest` in your terminal.',
		},
		{
			question: 'Where can I find the documentation?',
			answer: 'You can find the documentation at https://docs.studiocms.dev.',
		},
		{
			question: 'How can I contribute to StudioCMS?',
			answer: `We welcome contributions! Please check out the following resources to get started:
- 🌱 Good First Issues: [Browse good first issues](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- 🙋 Help Wanted: [Browse help wanted issues](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
- 📚 Getting Started:
  - [Contributing Guide](https://github.com/withstudiocms/studiocms?tab=contributing-ov-file)
  - [Development Setup](https://github.com/withstudiocms/studiocms?tab=readme-ov-file#getting-started-with-our-development-playground)`,
		},
		{
			question: 'How do I report a bug or request a feature?',
			answer:
				'You can report a bug or request a feature by opening an issue on our GitHub repository at https://github.com/withstudiocms/studiocms/issues.',
		},
	],
} as const;

const systemPrompt = (
	username: string
) => `You are a fun, slightly chaotic Discord bot with personality named Artemis. 
You've been created to assist users with StudioCMS-related questions and engage in light-hearted conversation.
You respond with humor, wit, and creativity. Keep responses concise (1-3 sentences usually)
since this is Discord chat. Be playful and engaging, but never mean or offensive.
Occasionally use Discord/internet culture references naturally.
The user's name is ${username}.

# Reference Materials

## LLM Resources:
${BOT_RESOURCES.llmResources.map((link) => `- [${link.label}](${link.url})`).join('\n')}

## Quick Links:
${BOT_RESOURCES.quickLinks.map((link) => `- [${link.label}](${link.url})`).join('\n')}

## Quick Facts:
${BOT_RESOURCES.quickFacts.map((fact, i) => `${i + 1}. ${fact}`).join('\n')}

## Common Questions:
${BOT_RESOURCES.commonQuestions
	.map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer.replace(/\n/g, '\n      ')}`)
	.join('\n')}

## Technical Details:
${BOT_RESOURCES.techDetails.map((detail, i) => `${i + 1}. ${detail}`).join('\n')}

Use these resources to help answer the user's question accurately while keeping your fun personality! Please refer to the LLM resources first for any questions related to docs, features, or troubleshooting.

Try to keep your answers relevant to StudioCMS where possible, but feel free to engage in casual conversation as well. While keeping responses under 2000 characters if possible, you can exceed this limit if necessary to provide a complete answer.
`;

const fallbackResponse =
	'*crickets* 🦗\n\n-# There was an Error, if this continues reach out to a server admin!';

/** Footer note to append to messages */
const footerNote = '\n\n-# Artemis is powered by Groq AI. Messages may include mistakes.';

/**
 * Handles an incoming Discord message mention and replies appropriately
 */
export const handleMessage = (message: GatewayMessageCreateDispatchData) =>
	Effect.gen(function* () {
		const [rest, { getMessageReplyHistory }, { id: botId }, { makeCompletion }] = yield* Effect.all(
			[DiscordREST, Messages, DiscordApplication, GroqAiHelpers]
		);

		/** Updates the message with new content, handling length limits */
		const updateMessage = (msgId: string, newContent: string) =>
			Effect.gen(function* () {
				const messages: string[] = [];
				const maxLength = 2000;

				// Split content into chunks based on lines to preserve formatting
				const lines = newContent.split('\n');
				let currentChunk = '';

				for (const line of lines) {
					// If adding the next line exceeds max length, push the current chunk and start a new one
					if (`${currentChunk + line}\n`.length > maxLength) {
						if (currentChunk.length > 0) {
							messages.push(currentChunk.trim());
							currentChunk = '';
						}
					}
					currentChunk += `${line}\n`;
				}

				// Push any remaining content as the last chunk
				if (currentChunk.length > 0) {
					messages.push(currentChunk.trim());
				}

				// Update the original message or send new messages for overflow
				for (let i = 0; i < messages.length; i++) {
					const contentToSend = messages[i];
					// For the first chunk, update the original message
					if (i === 0) {
						yield* rest
							.updateMessage(message.channel_id, msgId, {
								content: contentToSend,
								flags: Discord.MessageFlags.SuppressEmbeds,
							})
							.pipe(
								Effect.catchAll((error) =>
									Effect.logError(
										formattedLog('PingReply', `Failed to update message: ${String(error)}`)
									)
								)
							);
						// For subsequent chunks, send new messages
					} else {
						yield* rest
							.createMessage(message.channel_id, {
								content: contentToSend,
								allowed_mentions: {
									users: [message.author.id],
								},
								message_reference: {
									message_id: message.id,
								},
								flags: Discord.MessageFlags.SuppressEmbeds,
							})
							.pipe(
								Effect.catchAll((error) =>
									Effect.logError(
										formattedLog('PingReply', `Failed to send overflow message: ${String(error)}`)
									)
								)
							);
					}
				}
			});

		// Log the reply action
		yield* Effect.logDebug(
			formattedLog('PingReply', `Replying to mention from ${message.author.id}`)
		);

		const thinkingMessage = yield* rest
			.createMessage(message.channel_id, {
				content: '🤔 Thinking...',
				allowed_mentions: {
					users: [message.author.id],
				},
				message_reference: {
					message_id: message.id,
				},
			})
			.pipe(Effect.flatMap((msg) => Effect.sleep('2 seconds').pipe(Effect.as(msg))));

		// Track rate limiting per user (simple cooldown)
		const userCooldowns = new Map<string, number>();
		const COOLDOWN_MS = 10000; // 10 seconds between requests per user

		/** Checks if a user is on cooldown */
		const isOnCooldown = (userId: string): boolean => {
			const lastUsed = userCooldowns.get(userId);
			if (!lastUsed) return false;
			return Date.now() - lastUsed < COOLDOWN_MS;
		};

		/** Sets the cooldown timestamp for a user */
		const setCooldown = (userId: string) => {
			userCooldowns.set(userId, Date.now());
		};

		// Check cooldown
		if (isOnCooldown(message.author.id)) {
			yield* Effect.logDebug(
				formattedLog('PingReply', `User ${message.author.id} is on cooldown.`)
			);
			yield* updateMessage(
				thinkingMessage.id,
				'⏱️ Please wait a moment before sending another message.'
			);
			return;
		}

		// Extract the actual message content
		let userInput = message.content;
		userInput = message.content.replace(/<@!?\d+>/g, '').trim();

		if (!userInput || userInput.trim().length === 0) {
			yield* updateMessage(thinkingMessage.id, 'Yes? 🤔');
			return;
		}

		yield* Effect.logDebug(formattedLog('PingReply', `User ${message.author.id}: ${userInput}`));

		// Set cooldown
		setCooldown(message.author.id);

		const username = message.author.global_name || message.author.username;

		const replyHistory = yield* getMessageReplyHistory(message.channel_id, message, botId);

		/** Creates a response based on user input */
		yield* makeCompletion([
			{ role: 'system', content: systemPrompt(username) },
			...replyHistory,
			{ role: 'user', content: userInput },
		]).pipe(
			Effect.map(({ choices }) => choices[0]?.message?.content ?? fallbackResponse),
			Effect.catchAll((error) =>
				Effect.logError(
					formattedLog('GroqReply', `Failed to get completion from Groq: ${String(error)}`)
				).pipe(Effect.as(fallbackResponse))
			),
			Effect.map((content) => content + footerNote),
			Effect.tap((response) => Effect.logDebug(formattedLog('PingReply', `Bot: ${response}`))),
			Effect.flatMap((response) => updateMessage(thinkingMessage.id, response))
		);
	});
