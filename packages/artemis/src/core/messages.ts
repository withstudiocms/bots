/** biome-ignore-all lint/style/noNonNullAssertion: acceptable */
import { Discord, DiscordREST } from 'dfx';
import { Chunk, Effect, Option, pipe, Stream } from 'effect';
import { DiscordRestLayer } from './discord-rest.ts';
import { MemberCache } from './member-cache.ts';

/**
 * Cleans up and normalizes Markdown code block formatting in the given content string.
 *
 * - Converts TypeScript code block markers from "```ts" to "```typescript".
 * - Ensures code blocks start on a new line.
 * - Adds extra newlines before code blocks that are not properly separated.
 * - Fixes cases where code blocks are not preceded by a newline.
 *
 * @param content - The Markdown content to clean up.
 * @returns The cleaned and normalized Markdown content.
 */
export const cleanupMarkdown = (content: string) =>
	content
		.replace(/```ts\b/g, '```typescript')
		.replace(/^```/, '\n```')
		.replace(/[^\n]```/gm, '\n\n```')
		.replace(/([^\n])\n```([^\n]*\n[^\n])/gm, '$1\n\n```$2');

/**
 * Service for handling Discord messages, including fetching, cleaning, and mention replacement.
 *
 * @remarks
 * This service depends on `MemberCache.Default` and `DiscordRestLayer`.
 * It provides utilities to:
 * - Fetch messages from a channel, handling pagination and filtering for regular messages.
 * - Clean up message content by removing or formatting markdown.
 * - Replace user mentions in message content with formatted display names.
 *
 * @example
 * ```typescript
 * const messages = yield* Messages.regularForChannel(channelId);
 * const cleanedMessages = yield* Messages.cleanForChannel(channel);
 * const contentWithMentions = yield* Messages.replaceMentions(guildId, content);
 * ```
 *
 * @service
 * @module app/Messages
 */
export class Messages extends Effect.Service<Messages>()('app/Messages', {
	dependencies: [MemberCache.Default, DiscordRestLayer],
	effect: Effect.gen(function* () {
		const rest = yield* DiscordREST;
		const members = yield* MemberCache;

		/**
		 * Replaces user mention tags in a Discord message content string with formatted display names.
		 *
		 * This effectful function scans the provided `content` for user mention patterns (`<@userId>`),
		 * attempts to resolve each mentioned user from the guild's member list, and replaces each mention
		 * with a bolded display name (using the member's nickname if available, otherwise their username).
		 *
		 * @param guildId - The Discord guild (server) ID where the message originated.
		 * @param content - The message content potentially containing user mentions.
		 * @returns An effect that yields the content string with all valid user mentions replaced by their display names.
		 */
		const replaceMentions = Effect.fnUntraced(function* (
			guildId: Discord.Snowflake,
			content: string
		) {
			const mentions = yield* Effect.forEach(
				content.matchAll(/<@(\d+)>/g),
				([, userId]) => Effect.option(members.get(guildId, userId as Discord.Snowflake)),
				{ concurrency: 'unbounded' }
			);

			return mentions.reduce(
				(content, member) =>
					Option.match(member, {
						onNone: () => content,
						onSome: (member) =>
							content.replace(
								new RegExp(`<@${member.user!.id}>`, 'g'),
								`**@${member.nick ?? member.user!.username}**`
							),
					}),
				content
			);
		});

		/**
		 * Creates a stream of regular messages for a given Discord channel.
		 *
		 * This function paginates through all messages in the specified channel, fetching them in chunks of 100.
		 * It filters out messages to only include normal messages, such as replies and default messages.
		 * If a message is a thread starter, it fetches the referenced message instead.
		 *
		 * @param channelId - The ID of the Discord channel to fetch messages from.
		 * @returns A stream of filtered Discord messages for the specified channel.
		 */
		const regularForChannel = (channelId: string) =>
			pipe(
				Stream.paginateChunkEffect(Option.none<Discord.Snowflake>(), (before) =>
					pipe(
						rest.listMessages(channelId, {
							limit: 100,
							before: Option.getOrUndefined(before)!,
						}),
						Effect.map((messages) =>
							messages.length < 100
								? ([
										Chunk.unsafeFromArray(messages),
										Option.none<Option.Option<Discord.Snowflake>>(),
									] as const)
								: ([
										Chunk.unsafeFromArray(messages),
										Option.some(Option.some(messages[messages.length - 1].id)),
									] as const)
						)
					)
				),
				// only include normal messages
				Stream.flatMap(
					(msg) => {
						if (msg.type === Discord.MessageType.THREAD_STARTER_MESSAGE) {
							return rest.getMessage(
								msg.message_reference!.channel_id!,
								msg.message_reference!.message_id!
							);
						}
						if (
							msg.content !== '' &&
							(msg.type === Discord.MessageType.REPLY || msg.type === Discord.MessageType.DEFAULT)
						) {
							return Stream.succeed(msg);
						}

						return Stream.empty;
					},
					{ concurrency: 'unbounded' }
				)
			);

		/**
		 * Processes and cleans up messages for a given Discord channel or thread.
		 *
		 * This function takes a Discord channel or thread response and returns a stream pipeline that:
		 * 1. Retrieves regular messages for the specified channel.
		 * 2. Cleans up the markdown formatting in each message's content.
		 * 3. Replaces user mentions in the message content with their appropriate representations, using the channel's guild ID.
		 * 4. Maintains message structure while updating the content.
		 *
		 * @param channel - The Discord channel or thread response object to process messages for.
		 * @returns A stream pipeline that emits cleaned and processed message responses for the specified channel.
		 */
		const cleanForChannel = (channel: Discord.ThreadResponse | Discord.GuildChannelResponse) =>
			pipe(
				regularForChannel(channel.id),
				Stream.map((msg) => ({
					...msg,
					content: cleanupMarkdown(msg.content),
				})),
				Stream.mapEffect(
					(msg) =>
						Effect.map(
							replaceMentions(channel.guild_id, msg.content),
							(content): Discord.MessageResponse => ({
								...msg,
								content,
							})
						),
					{ concurrency: 'unbounded' }
				)
			);

		const convertAiCompletionInput = (botId: string) => (message: Discord.MessageResponse) => {
			const isBot = message.author?.id === botId;

			if (isBot) {
				return { role: 'assistant' as const, content: message.content };
			}

			return { role: 'user' as const, content: message.content };
		};

		const getMessageReplyHistory = (
			channelId: string,
			latestMessage: Discord.MessageResponse,
			botId: string
		) =>
			Effect.gen(function* () {
				const history: Discord.MessageResponse[] = [];
				let currentMessage: Discord.MessageResponse | undefined = latestMessage;

				while (currentMessage?.message_reference?.message_id) {
					const referencedMessage = (yield* rest
						.getMessage(channelId, currentMessage.message_reference.message_id)
						.pipe(Effect.catchAll(() => Effect.succeed(undefined)))) as
						| Discord.MessageResponse
						| undefined;
					if (!referencedMessage) {
						break;
					}
					history.push(referencedMessage);
					currentMessage = referencedMessage;
				}

				return history.reverse().map(convertAiCompletionInput(botId));
			});

		return {
			regularForChannel,
			cleanForChannel,
			replaceMentions,
			getMessageReplyHistory,
		} as const;
	}),
}) {}
