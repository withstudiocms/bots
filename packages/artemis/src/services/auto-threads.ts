/** biome-ignore-all lint/style/noNonNullAssertion: we know these are present */
import { Discord, DiscordREST, Ix, Perms, UI } from 'dfx';
import { DiscordGateway, InteractionsRegistry } from 'dfx/gateway';
import { Data, Effect, Layer, Schema } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { autoThreadsTopicKeyword } from '../static/env.ts';
import { generateTitle } from '../utils/groq-utils.ts';
import { formattedLog } from '../utils/log.ts';
import * as Str from '../utils/string.ts';

/**
 * Error thrown when a message does not meet the required validation criteria for processing.
 *
 * @remarks
 * This error is tagged with the name `'NotValidMessageError'` and includes a reason for invalidation.
 *
 * @template reason
 * The reason for the message being invalid:
 * - `'non-default'`: The message is not in a default state.
 * - `'from-bot'`: The message was sent by a bot.
 * - `'non-text-channel'`: The message was not sent in a text channel.
 * - `'disabled'`: The feature is disabled.
 *
 * @example
 * ```typescript
 * throw new NotValidMessageError({ reason: 'from-bot' });
 * ```
 */
export class NotValidMessageError extends Data.TaggedError('NotValidMessageError')<{
	readonly reason: 'non-default' | 'from-bot' | 'non-text-channel' | 'disabled';
}> {}

/**
 * Error class representing a permissions violation.
 *
 * Thrown when an action is attempted without sufficient permissions on a given subject.
 *
 * @extends Data.TaggedError<'PermissionsError'>
 * @template T - The error payload containing details about the permission error.
 * @property {string} action - The action that was attempted.
 * @property {string} subject - The subject on which the action was attempted.
 */
export class PermissionsError extends Data.TaggedError('PermissionsError')<{
	readonly action: string;
	readonly subject: string;
}> {}

/**
 * Initializes the Artemis AutoThreads Service.
 *
 * This service automatically creates threads in eligible Discord text channels when a new message is posted,
 * based on a configurable topic keyword. It also registers interaction handlers for editing thread titles and
 * archiving threads, with appropriate permission checks for users and moderators.
 *
 * Features:
 * - Detects eligible channels and messages for auto-thread creation.
 * - Creates threads with truncated titles from the message content.
 * - Adds message components for editing the thread title and archiving the thread.
 * - Handles interaction permissions, allowing only the message author or users with Manage Channels permission to edit/archive.
 * - Registers interaction handlers for editing and archiving threads, including modal dialogs for title editing.
 * - Logs and handles errors gracefully, providing ephemeral feedback for permission errors.
 *
 * Configuration:
 * - Reads the `keyword` from environment variables (default: `[threads]`) to determine eligible channels.
 * - Uses a nested, constant-case config provider under the `autothreads` namespace.
 *
 * @remarks
 * This effect should be run within a managed scope. It registers itself with the interactions registry and
 * forks the message handler effect.
 *
 * @returns {Effect.Effect<void, unknown, Config.Provider>} An effect that sets up the auto-threads service.
 */
const make = Effect.gen(function* () {
	const [topicKeyword, gateway, rest, channels, registry] = yield* Effect.all([
		autoThreadsTopicKeyword,
		DiscordGateway,
		DiscordREST,
		ChannelsCache,
		InteractionsRegistry,
	]);

	/**
	 * Schema definition for an eligible Discord text channel.
	 *
	 * This schema validates objects representing Discord channels that meet the following criteria:
	 * - `id`: The unique identifier of the channel as a string.
	 * - `topic`: The channel's topic, which must include the specified `topicKeyword`.
	 * - `type`: The channel type, which must be `GUILD_TEXT` (text channel).
	 *
	 * The schema is annotated with the identifier 'EligibleChannel' and is piped through `Schema.decodeUnknown`
	 * to allow decoding of unknown input types.
	 */
	const EligibleChannel = Schema.Struct({
		id: Schema.String,
		topic: Schema.String.pipe(Schema.includes(topicKeyword)),
		type: Schema.Literal(Discord.ChannelTypes.GUILD_TEXT),
	})
		.annotations({ identifier: 'EligibleChannel' })
		.pipe(Schema.decodeUnknown);

	/**
	 * Schema definition for an eligible Discord message.
	 *
	 * This schema validates objects representing Discord messages that are eligible for a specific operation.
	 *
	 * Structure:
	 * - `id`: The unique identifier of the message (string).
	 * - `channel_id`: The unique identifier of the channel where the message was sent (string).
	 * - `type`: The type of the message, restricted to `Discord.MessageType.DEFAULT`.
	 * - `author`: An object containing author information:
	 *   - `bot`: Optional property indicating if the author is a bot. If present, must be `false`.
	 *
	 * The schema is annotated with the identifier 'EligibleMessage' and is piped through `Schema.decodeUnknown`
	 * to allow decoding of unknown input.
	 */
	const EligibleMessage = Schema.Struct({
		id: Schema.String,
		channel_id: Schema.String,
		type: Schema.Literal(Discord.MessageType.DEFAULT),
		author: Schema.Struct({
			bot: Schema.optional(Schema.Literal(false)),
		}),
	})
		.annotations({ identifier: 'EligibleMessage' })
		.pipe(Schema.decodeUnknown);

	/**
	 * Handles the 'MESSAGE_CREATE' dispatch event by:
	 * - Checking if the incoming message and its channel are eligible for thread creation.
	 * - Truncating the message's first line to generate a thread title.
	 * - Creating a new thread from the message with the generated title.
	 * - Sending a message to the new thread containing UI buttons for editing the title or archiving the thread.
	 * - Annotating the current tracing span with the thread title.
	 * - Logging debug information on parse errors and logging all other errors.
	 *
	 * @remarks
	 * This handler is intended to automate thread creation for eligible messages in Discord channels,
	 * providing quick actions for thread management via interactive buttons.
	 */
	const handleMessages = gateway.handleDispatch(
		'MESSAGE_CREATE',
		Effect.fnUntraced(
			function* (event) {
				const [message, channel] = yield* Effect.all([
					// Validate the message against the EligibleMessage schema
					EligibleMessage(event),
					// Retrieve and validate the channel against the EligibleChannel schema
					channels
						.get(event.guild_id!, event.channel_id)
						.pipe(Effect.flatMap(EligibleChannel)),
				]);

				// truncate the title to be 50 characters
				const title = yield* generateTitle(event.content).pipe(
					Effect.map((_) => Str.truncate(_, 50))
				);

				yield* Effect.annotateCurrentSpan({ title });

				const thread = yield* rest.createThreadFromMessage(channel.id, message.id, {
					name: Str.truncate(title, 100),
					auto_archive_duration: 1440,
				});

				yield* rest.createMessage(thread.id, {
					components: UI.grid([
						[
							UI.button({
								custom_id: `edit_${event.author.id}`,
								label: 'Edit title',
							}),
							UI.button({
								custom_id: `archive_${event.author.id}`,
								label: 'Archive',
								style: Discord.ButtonStyleTypes.SECONDARY,
							}),
						],
					]),
				});
			},
			Effect.catchTag('ParseError', Effect.logDebug),
			(effect, event) =>
				Effect.withSpan(effect, 'AutoThreads.handleMessages', {
					attributes: {
						messageId: event.id,
					},
				}),
			Effect.catchAllCause(Effect.logError)
		)
	);

	/**
	 * Indicates whether the current permissions include the ability to manage channels.
	 *
	 * @remarks
	 * This variable checks if the `ManageChannels` permission is present in the current Discord permissions.
	 *
	 * @see {@link Discord.Permissions.ManageChannels}
	 */
	const hasManage = Perms.has(Discord.Permissions.ManageChannels);

	/**
	 * Wraps an Effect to ensure the current user has edit permissions on a thread.
	 *
	 * This function checks if the user invoking the interaction is either the original author
	 * (as determined by the `custom_id` in the message component data) or has the "Manage" permission.
	 * If the user does not have permission, it yields a `PermissionsError` for the "edit" action on a "thread".
	 * Otherwise, it yields the provided Effect.
	 *
	 * @typeParam R - The environment type required by the Effect.
	 * @typeParam E - The error type that the Effect may yield.
	 * @typeParam A - The success type that the Effect yields.
	 * @param self - The Effect to be executed if the user has edit permissions.
	 * @returns An Effect that either yields the result of `self` or a `PermissionsError` if permissions are insufficient.
	 */
	const withEditPermissions = Effect.fnUntraced(function* <R, E, A>(self: Effect.Effect<A, E, R>) {
		const ix = yield* Ix.Interaction;
		const ctx = yield* Ix.MessageComponentData;
		const authorId = ctx.custom_id.split('_')[1];
		const canEdit = authorId === ix.member?.user?.id || hasManage(ix.member!.permissions!);

		if (!canEdit) {
			return yield* new PermissionsError({
				action: 'edit',
				subject: 'thread',
			});
		}

		return yield* self;
	});

	/**
	 * Handles the "edit" interaction for message components whose custom ID starts with 'edit_'.
	 *
	 * This effect pipeline performs the following steps:
	 * 1. Listens for message component interactions with IDs starting with 'edit_'.
	 * 2. Retrieves the corresponding channel using the guild and channel IDs from the interaction.
	 * 3. Responds to the interaction with a modal dialog allowing the user to edit the channel's title.
	 * 4. Ensures the user has the necessary edit permissions before proceeding.
	 * 5. Wraps the entire operation in a tracing span labeled 'AutoThreads.edit'.
	 *
	 * The modal presented to the user contains a single text input pre-filled with the current channel name (if available).
	 */
	const edit = Ix.messageComponent(
		Ix.idStartsWith('edit_'),
		Ix.Interaction.pipe(
			Effect.flatMap((ix) => channels.get(ix.guild_id!, ix.channel!.id)),
			Effect.map((channel) =>
				Ix.response({
					type: Discord.InteractionCallbackTypes.MODAL,
					data: {
						custom_id: 'edit',
						title: 'Edit title',
						components: UI.singleColumn([
							UI.textInput({
								custom_id: 'title',
								label: 'New title',
								max_length: 100,
								value: 'name' in channel ? channel.name! : '',
							}),
						]),
					},
				})
			),
			withEditPermissions,
			Effect.withSpan('AutoThreads.edit')
		)
	);

	/**
	 * Handles the submission of the "edit" modal interaction.
	 *
	 * This effect retrieves the interaction context and the new title value from the modal,
	 * then updates the channel's name using the provided REST API. After updating, it sends
	 * a deferred update message response to Discord to acknowledge the interaction.
	 *
	 * @remarks
	 * The function is wrapped with a tracing span labeled "AutoThreads.editSubmit".
	 *
	 * @returns An effect that processes the modal submission and returns a deferred update message response.
	 */
	const editSubmit = Ix.modalSubmit(
		Ix.id('edit'),
		Effect.gen(function* () {
			const [context, title] = yield* Effect.all([Ix.Interaction, Ix.modalValue('title')]);
			yield* rest.updateChannel(context.channel!.id, { name: title });
			return Ix.response({
				type: Discord.InteractionCallbackTypes.DEFERRED_UPDATE_MESSAGE,
			});
		}).pipe(Effect.withSpan('AutoThreads.editSubmit'))
	);

	/**
	 * Handles the "archive" interaction for message components whose IDs start with 'archive_'.
	 *
	 * This handler performs the following steps:
	 * 1. Listens for interactions with component IDs that start with 'archive_'.
	 * 2. Updates the corresponding channel to set its `archived` property to `true`.
	 * 3. Sends a deferred update message response to the interaction.
	 * 4. Ensures the user has edit permissions before proceeding.
	 * 5. Wraps the entire effect in a tracing span labeled 'AutoThreads.archive'.
	 *
	 * @remarks
	 * This is typically used to allow users to archive threads or channels via a UI component.
	 */
	const archive = Ix.messageComponent(
		Ix.idStartsWith('archive_'),
		Ix.Interaction.pipe(
			Effect.tap((ix) => rest.updateChannel(ix.channel!.id, { archived: true })),
			Effect.as(
				Ix.response({
					type: Discord.InteractionCallbackTypes.DEFERRED_UPDATE_MESSAGE,
				})
			),
			withEditPermissions,
			Effect.withSpan('AutoThreads.archive')
		)
	);

	/**
	 * Builds an Ix handler pipeline by sequentially adding the `archive`, `edit`, and `editSubmit` handlers.
	 * Handles `PermissionsError` by responding with an ephemeral Discord message indicating lack of permission.
	 * Logs all other errors using `Effect.logError`.
	 *
	 * @remarks
	 * This pipeline is intended for Discord interaction handling, providing user feedback for permission issues
	 * and ensuring all errors are logged for debugging purposes.
	 *
	 * @see Discord.InteractionCallbackTypes
	 * @see Discord.MessageFlags
	 */
	const ix = Ix.builder
		.add(archive)
		.add(edit)
		.add(editSubmit)
		.catchTagRespond('PermissionsError', (_) =>
			Effect.succeed(
				Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						flags: Discord.MessageFlags.Ephemeral,
						content: `You don't have permission to ${_.action} this ${_.subject}.`,
					},
				})
			)
		)
		.catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.forkScoped(handleMessages),
		Effect.logDebug(formattedLog('AutoThreads', 'Interactions registered and running.')),
	]);
});

/**
 * Provides a live `Layer` instance for the AutoThreads service,
 * scoped to the current context and configured to use the default `ChannelsCache`.
 *
 * This layer is intended to be used in environments where automatic thread management
 * is required, and it ensures that the necessary dependencies are provided.
 *
 * @remarks
 * - Uses `Layer.scopedDiscard` to manage resource lifecycle.
 * - Injects the default implementation of `ChannelsCache` via `Layer.provide`.
 *
 * @see {@link ChannelsCache.Default}
 * @see {@link Layer}
 */
export const AutoThreadsLive = Layer.scopedDiscard(make);
