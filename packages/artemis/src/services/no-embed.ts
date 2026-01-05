/** biome-ignore-all lint/style/noNonNullAssertion: we know these are present */
import { Discord, DiscordREST } from 'dfx';
import { DiscordGateway } from 'dfx/gateway';
import { Effect, Layer, Schema } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { noEmbedKeyword, noEmbedUrlExclude, noEmbedUrlWhitelist } from '../static/env.ts';
import { spacedOnceSecond } from '../static/schedules.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Initializes the NoEmbed service, which listens for Discord message events and suppresses embeds
 * in messages that meet certain criteria. The service uses configuration values for keyword matching,
 * URL whitelisting, and exclusion, and operates on eligible channels and messages as defined by
 * runtime schemas. It handles both message creation and update events, suppressing embeds when:
 * - The channel topic contains a configured keyword.
 * - The message contains embeds with non-whitelisted URLs and non-gifv types.
 * - The message content includes the embed URL.
 *
 * The service is resilient to errors and retries event handling on failure.
 *
 * @remarks
 * - Configuration is provided via the "NO_EMBED" config namespace.
 * - Uses DiscordGateway, DiscordREST, and ChannelsCache dependencies.
 * - Annotates logs with the "NoEmbed" service name.
 *
 * @returns An Effect that, when run, starts the NoEmbed service and registers event handlers.
 */
const make = Effect.gen(function* () {
	const [topicKeyword, urlWhitelist, urlExclude, gateway, rest, channels] = yield* Effect.all([
		noEmbedKeyword,
		noEmbedUrlWhitelist,
		noEmbedUrlExclude,
		DiscordGateway,
		DiscordREST,
		ChannelsCache,
	]);

	/**
	 * Determines if a given URL is valid based on whitelist and exclude lists.
	 *
	 * A URL is considered valid if it contains any substring from the whitelist
	 * and does not contain any substring from the exclude list.
	 *
	 * @param url - The URL to validate.
	 * @returns `true` if the URL is valid, `false` otherwise.
	 */
	const validUrl = (url: string) =>
		urlWhitelist.some((_) => url.includes(_)) && !urlExclude.some((_) => url.includes(_));

	/**
	 * Retrieves a channel by its ID, resolving to the parent channel if it's a public thread.
	 *
	 * @param guildId - The ID of the guild containing the channel.
	 * @param id - The ID of the channel to retrieve.
	 * @returns An Effect that yields the resolved channel.
	 */
	const getChannel = (guildId: string, id: string) =>
		Effect.flatMap(channels.get(guildId, id), (_) =>
			_.type === Discord.ChannelTypes.PUBLIC_THREAD
				? channels.get(guildId, _.parent_id!)
				: Effect.succeed(_)
		);

	/**
	 * Schema to validate if a channel is eligible based on its topic containing the configured keyword.
	 */
	const EligibleChannel = Schema.Struct({
		topic: Schema.String.pipe(Schema.includes(topicKeyword)),
	})
		.annotations({ identifier: 'EligibleChannel' })
		.pipe(Schema.decodeUnknown);

	/**
	 * Schema to validate if a message is eligible for embed suppression.
	 *
	 * A message is considered eligible if it contains at least one embed with a URL that is not whitelisted,
	 * has a type other than "gifv", and the message content includes the embed URL.
	 */
	const EligibleMessage = Schema.Struct({
		id: Schema.String,
		channel_id: Schema.String,
		flags: Schema.optionalWith(Schema.Number, { default: () => 0 }),
		content: Schema.String,
		embeds: Schema.NonEmptyArray(
			Schema.Struct({
				url: Schema.String.pipe(
					Schema.filter((url) => !validUrl(url), {
						message: () => 'url is whitelisted',
					})
				),
				type: Schema.String.pipe(
					Schema.filter((_) => _ !== 'gifv', {
						message: () => 'embed type is gif',
					})
				),
			}).annotations({ identifier: 'EligibleEmbed' })
		),
	})
		.annotations({ identifier: 'EligibleMessage' })
		.pipe(
			Schema.filter((_) => _.content.includes(_.embeds[0].url), {
				message: () => 'message content does not include embed url',
			}),
			Schema.decodeUnknown
		);

	/**
	 * Handles a Discord MESSAGE_CREATE or MESSAGE_UPDATE event by checking if the message
	 * is in an eligible channel and if the message itself is eligible for embed suppression.
	 * If both conditions are met, it updates the message to suppress embeds.
	 *
	 * @param event - The Discord gateway message event data.
	 * @returns An Effect that performs the embed suppression if applicable.
	 */
	const handleMessage = Effect.fn((event: Discord.GatewayMessageCreateDispatchData) =>
		getChannel(event.guild_id!, event.channel_id).pipe(
			Effect.flatMap(EligibleChannel),
			Effect.flatMap(() =>
				EligibleMessage(
					event.content ? Effect.succeed(event) : rest.getMessage(event.channel_id, event.id)
				)
			),
			Effect.flatMap((message) =>
				rest.updateMessage(message.channel_id, message.id, {
					flags: message.flags | Discord.MessageFlags.SuppressEmbeds,
				})
			),
			Effect.catchTag('ParseError', Effect.logDebug),
			Effect.withSpan('NoEmbed.handleMessage'),
			Effect.catchAllCause(Effect.logDebug)
		)
	);

	const messageCreate = gateway
		.handleDispatch('MESSAGE_CREATE', handleMessage)
		.pipe(Effect.retry(spacedOnceSecond), Effect.forkScoped);

	const messageUpdate = gateway
		.handleDispatch('MESSAGE_UPDATE', handleMessage)
		.pipe(Effect.retry(spacedOnceSecond), Effect.forkScoped);

	// Setup Listeners
	yield* Effect.all([
		Effect.forkScoped(messageCreate),
		Effect.forkScoped(messageUpdate),
		Effect.logDebug(formattedLog('NoEmbed', 'Interactions registered and running.')),
	]);
});

/**
 * Provides a live implementation of the NoEmbed service as a scoped Layer.
 * This Layer is constructed using the `make` function and is configured to use
 * the default `ChannelsCache` for dependency injection.
 *
 * @remarks
 * This Layer should be used when a live, production-ready instance of the NoEmbed
 * service is required, with caching provided by the default ChannelsCache.
 *
 * @see {@link Layer}
 * @see {@link ChannelsCache.Default}
 */
export const NoEmbedLive = Layer.scopedDiscard(make);
