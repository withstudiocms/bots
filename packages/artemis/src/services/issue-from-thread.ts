/** biome-ignore-all lint/style/noNonNullAssertion: There should be no question these exist */
import { DiscordREST } from 'dfx/DiscordREST';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix, Perms } from 'dfx/index';
import { and, eq } from 'drizzle-orm';
import { Cause, Chunk, Data, Effect, FiberMap, Layer, Stream } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordApplication } from '../core/discord-rest.ts';
import { Github } from '../core/github.ts';
import { GroqAiHelpers } from '../core/groq.ts';
import { Messages } from '../core/messages.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { createGitHubSummary, parseDiscordBotOutput } from '../utils/github.ts';
import { formattedLog } from '../utils/log.ts';

// biome-ignore lint/complexity/noBannedTypes: acceptable
export class NotInThreadError extends Data.TaggedError('NotInThreadError')<{}> {}

/**
 * Represents a single GitHub repository from the `githubRepos` array.
 *
 * This type is a union of all possible values contained in the `githubRepos` array.
 * It is useful for ensuring that variables or parameters are restricted to valid repository names or objects as defined in `githubRepos`.
 */
type GithubRepo = {
	label: string;
	owner: string;
	repo: string;
};

/**
 * Represents the possible types of issues that can be created or tracked.
 *
 * - `'Bug'`: Indicates a defect or problem in the system.
 * - `'Feature'`: Represents a new feature request or enhancement.
 * - `'Task'`: Denotes a general task or work item.
 */
type PossibleIssueTypes = 'Bug' | 'Feature' | 'Task';

function makeResponse(
	choices: {
		id: number;
		label: string;
		owner: string;
		repo: string;
		guildId: string;
	}[]
) {
	return Ix.response({
		type: Discord.InteractionCallbackTypes.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
		data: {
			choices: choices.slice(0, 25).map((repo) => ({
				name: repo.label,
				value: repo.label,
			})),
		},
	});
}

/**
 * Initializes the Artemis Issue Service, integrating Discord and GitHub to allow users
 * to create GitHub issues directly from Discord threads via a slash command.
 *
 * This service registers the `/issue` command, which collects messages from the current
 * Discord thread, formats them, and creates a corresponding issue in a selected GitHub repository.
 * It provides feedback to users on success or failure, and manages command concurrency using a fiber map.
 *
 * Dependencies:
 * - Discord REST API
 * - Channel and message caches
 * - Interactions registry
 * - GitHub API integration
 * - Fiber map for concurrency control
 *
 * Features:
 * - Collects and formats thread messages for GitHub issue body
 * - Supports multiple repositories and issue types
 * - Handles errors gracefully with user feedback
 * - Annotates logs and spans for observability
 *
 * @returns An Effect that registers the issue command and its handlers with the interactions registry.
 */
const make = Effect.gen(function* () {
	const [rest, channels, messages, registry, github, fiberMap, application, db] = yield* Effect.all(
		[
			DiscordREST,
			ChannelsCache,
			Messages,
			InteractionsRegistry,
			Github,
			FiberMap.make<Discord.Snowflake>(),
			DiscordApplication,
			DatabaseLive,
		]
	);

	/**
	 * Creates a new GitHub issue using the wrapped GitHub API client.
	 *
	 * @remarks
	 * This function is a wrapper around the GitHub API's `issues.create` method,
	 * allowing for the creation of issues in a specified repository.
	 *
	 * @param params - The parameters required to create a GitHub issue, such as
	 *   repository owner, repository name, issue title, and body.
	 * @returns A promise that resolves with the response from the GitHub API,
	 *   containing details of the created issue.
	 *
	 * @example
	 * ```typescript
	 * await createGithubIssue({
	 *   owner: 'octocat',
	 *   repo: 'Hello-World',
	 *   title: 'Found a bug',
	 *   body: 'I\'m having a problem with this.'
	 * });
	 * ```
	 */
	const createGithubIssue = github.wrap((_) => _.issues.create);

	/**
	 * Creates a new GitHub issue based on the messages from a Discord thread channel.
	 *
	 * @param channel - The Discord thread channel containing the conversation to be summarized into an issue.
	 * @param repo - The GitHub repository where the issue will be created.
	 * @param type - The type of the issue to be created.
	 * @param title - An optional title for the issue; if not provided, the Discord channel name will be used.
	 * @yields The result of the GitHub issue creation operation.
	 * @returns The created GitHub issue object.
	 */
	const createIssue = Effect.fn('issue.createIssue')(function* (
		channel: Discord.ThreadResponse,
		repo: GithubRepo,
		type: PossibleIssueTypes,
		title: string | undefined
	) {
		const channelName = channel.name;
		const chunk = yield* Stream.runCollect(messages.cleanForChannel(channel));
		const body = chunk.pipe(
			Chunk.reverse,
			Chunk.map((msg) => `@${msg.author.username}: ${msg.content}`),
			Chunk.join('\n')
		);

		const issueBodyRaw = parseDiscordBotOutput(body);
		const issueBody = yield* createGitHubSummary(issueBodyRaw, channel).pipe(
			Effect.provide(GroqAiHelpers.Default)
		);

		return yield* createGithubIssue({
			owner: repo.owner,
			repo: repo.repo,
			title: title ? `From Discord: ${title}` : `From Discord: ${channelName}`,
			body: issueBody,
			labels: ['from: discord', 'triage'],
			type: type,
		});
	});

	/**
	 * Handles the creation of a GitHub issue from a Discord thread and updates the original webhook message
	 * to notify users about the new issue. If issue creation fails, it displays an error message and deletes it after a delay.
	 *
	 * @param context - The Discord API interaction context.
	 * @param channel - The Discord thread response where the issue is being created from.
	 * @param repo - The GitHub repository information where the issue will be created.
	 * @param type - The type of issue to create.
	 * @param title - The optional title for the new issue.
	 * @returns An Effect pipeline that creates the issue, updates the Discord message, and handles errors.
	 */
	const followup = (
		context: Discord.APIInteraction,
		channel: Discord.ThreadResponse,
		repo: GithubRepo,
		type: PossibleIssueTypes,
		title: string | undefined
	) =>
		createIssue(channel, repo, type, title).pipe(
			Effect.tap((issue) =>
				rest.updateOriginalWebhookMessage(application.id, context.token, {
					payload: {
						embeds: [
							new DiscordEmbedBuilder()
								.setTitle('✅ New Issue Created')
								.setDescription(
									'This thread is now being tracked in a GitHub issue. Please continue the discussion there using the link below.'
								)
								.setColor(5763719)
								.addFields([
									{ name: 'Repository', value: `${repo.owner}/${repo.repo}`, inline: true },
									{ name: 'Issue Number', value: `#${issue.number}`, inline: true },
								])
								.build(),
						],
						components: [
							{
								type: Discord.MessageComponentTypes.ACTION_ROW,
								components: [
									{
										type: Discord.MessageComponentTypes.BUTTON,
										style: Discord.ButtonStyleTypes.LINK,
										emoji: { name: 'github', id: '1329780197385441340' },
										label: 'View Issue',
										url: issue.html_url,
									},
								],
							},
						],
					},
				})
			),
			Effect.tapErrorCause(Effect.logError),
			Effect.catchAllCause((cause) =>
				rest
					.updateOriginalWebhookMessage(application.id, context.token, {
						payload: {
							content: `❌ Failed to create issue:\n\n\`\`\`\n${Cause.pretty(cause)}\n\`\`\``,
						},
					})
					.pipe(
						Effect.zipLeft(Effect.sleep('1 minutes')),
						Effect.zipRight(rest.deleteOriginalWebhookMessage(application.id, context.token, {}))
					)
			),
			Effect.withSpan('issue.followup')
		);

	/**
	 * Registers the global 'issue' command for creating GitHub issues from Discord threads.
	 *
	 * This command allows users to select a repository, specify the type of issue (Bug, Feature, Task),
	 * and optionally provide a title for the issue. It validates that the command is invoked within a thread,
	 * then triggers the issue creation workflow and responds with a deferred message.
	 *
	 * @remarks
	 * - The repository choices are dynamically generated from the `githubRepos` array.
	 * - The command is only valid within public or private thread channels.
	 * - The command execution is annotated for tracing and logging purposes.
	 *
	 * @see githubRepos
	 * @see followup
	 * @see NotInThreadError
	 */
	const issueCommand = Ix.global(
		{
			name: 'issue-from-thread',
			description: 'Create a GitHub issue from this thread',
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'repository',
					description: 'The repository to create the issue in',
					required: true,
					autocomplete: true,
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'type',
					description: 'The type of issue to create',
					required: true,
					choices: [
						{ name: 'Bug', value: 'Bug' },
						{ name: 'Feature', value: 'Feature' },
						{ name: 'Task', value: 'Task' },
					],
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'title',
					description: 'The title of the issue (optional)',
					required: false,
				},
			],
		},
		Effect.fn('issue.command')(
			function* (ix) {
				const context = yield* Ix.Interaction;
				const repoOption = ix.optionValue('repository');
				const type = ix.optionValue('type') as PossibleIssueTypes;
				const title = ix.optionValueOrElse('title', () => undefined);
				const repositoryAllowList = yield* db.execute((c) =>
					c.select().from(db.schema.repos).where(eq(db.schema.repos.guildId, context.guild_id!))
				);
				const repo = repositoryAllowList.find((r) => r.label === repoOption);

				if (!repo) {
					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							content: `Invalid repository selected. Please choose a valid repository from the allow list.${repositoryAllowList.map((r) => `\n- ${r.label}`).join('')}`,
							flags: Discord.MessageFlags.Ephemeral,
						},
					});
				}

				yield* Effect.annotateCurrentSpan({ repo: repo.label });

				const channel = yield* channels.get(context.guild_id!, context.channel!.id!);
				if (
					channel.type !== Discord.ChannelTypes.PUBLIC_THREAD &&
					channel.type !== Discord.ChannelTypes.PRIVATE_THREAD
				) {
					return yield* new NotInThreadError();
				}

				yield* followup(context, channel, repo, type, title).pipe(
					Effect.annotateLogs('repo', repo.label),
					Effect.annotateLogs('thread', channel.id),
					FiberMap.run(fiberMap, context.id)
				);

				return Ix.response({
					type: Discord.InteractionCallbackTypes.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
				});
			},
			Effect.annotateLogs('command', 'issue')
		)
	);

	const issueSettingsCommand = Ix.global(
		{
			name: 'issue-settings',
			description: 'Manage issue command settings',
			default_member_permissions: 0,
			options: [
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'add-repo',
					description: 'Add a repository to the issue command allow list',
					options: [
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'repository',
							description: 'The repository to add (format: repo)',
							required: true,
						},
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'owner',
							description: 'The owner of the repository (format: owner)',
							required: true,
						},
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'label',
							description: 'The label to identify the repository (format: /label)',
							required: true,
						},
					],
				},
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'remove-repo',
					description: 'Remove a repository from the issue command allow list',
					options: [
						{
							type: Discord.ApplicationCommandOptionType.STRING,
							name: 'repository-label',
							description: 'The repository to remove',
							required: true,
							autocomplete: true,
						},
					],
				},
				{
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					name: 'list-repos',
					description: 'List all repositories in the issue command allow list',
					options: [],
				},
			],
		},
		Effect.fn('issue.addRepositoryCommand')(
			function* (ix) {
				const context = yield* Ix.Interaction;
				return yield* ix.subCommands({
					'add-repo': Effect.gen(function* () {
						const repoName = ix.optionValue('repository');
						const ownerName = ix.optionValue('owner');
						const label = ix.optionValue('label');

						const hasPermission = Perms.has(Discord.Permissions.Administrator);
						const canExecute = hasPermission(context.member!.permissions!);

						if (!canExecute) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'You do not have permission to use this command.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						// Basic validation
						if (!repoName || !ownerName || !label) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'All fields are required.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						// Check if the repository already exists in the allow list
						const existingRepo = yield* db.execute((c) =>
							c
								.select()
								.from(db.schema.repos)
								.where(
									and(eq(db.schema.repos.owner, ownerName), eq(db.schema.repos.repo, repoName))
								)
						);

						if (existingRepo.length > 0) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'This repository is already in the allow list.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						// Insert the new repository into the database
						yield* db.execute((c) =>
							c
								.insert(db.schema.repos)
								.values({ owner: ownerName, repo: repoName, label, guildId: context.guild_id! })
						);

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `Repository ${ownerName}/${repoName} added to the allow list with label ${label}.`,
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}),
					'remove-repo': Effect.gen(function* () {
						const label = ix.optionValue('repository-label');

						const hasPermission = Perms.has(Discord.Permissions.Administrator);
						const canExecute = hasPermission(context.member!.permissions!);

						if (!canExecute) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'You do not have permission to use this command.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						// Check if the repository exists in the allow list
						const existingRepo = yield* db.execute((c) =>
							c
								.select()
								.from(db.schema.repos)
								.where(
									and(
										eq(db.schema.repos.label, label),
										eq(db.schema.repos.guildId, context.guild_id!)
									)
								)
						);

						if (existingRepo.length === 0) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'This repository is not in the allow list.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						// Delete the repository from the database
						yield* db.execute((c) =>
							c
								.delete(db.schema.repos)
								.where(
									and(
										eq(db.schema.repos.label, label),
										eq(db.schema.repos.guildId, context.guild_id!)
									)
								)
						);

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `Repository with label ${label} removed from the allow list.`,
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}),
					'list-repos': Effect.gen(function* () {
						const hasPermission = Perms.has(Discord.Permissions.Administrator);
						const canExecute = hasPermission(context.member!.permissions!);

						if (!canExecute) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'You do not have permission to use this command.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const repositories = yield* db.execute((c) =>
							c.select().from(db.schema.repos).where(eq(db.schema.repos.guildId, context.guild_id!))
						);

						if (repositories.length === 0) {
							return Ix.response({
								type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
								data: {
									content: 'No repositories in the allow list.',
									flags: Discord.MessageFlags.Ephemeral,
								},
							});
						}

						const repoList = repositories
							.map((repo) => `- ${repo.label}: ${repo.owner}/${repo.repo}`)
							.join('\n');

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `**Allowed Repositories:**\n${repoList}`,
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}),
				});
			},
			Effect.annotateLogs('command', 'add-issue-repo')
		)
	);

	const autoCompleteHandler = Effect.gen(function* () {
		const context = yield* Ix.Interaction;
		const query = String(yield* Ix.focusedOptionValue);

		yield* Effect.logDebug(`Issue command autocomplete triggered with query: ${query}`);

		const repositoryAllowList = yield* db.execute((c) =>
			c.select().from(db.schema.repos).where(eq(db.schema.repos.guildId, context.guild_id!))
		);

		yield* Effect.logDebug(
			`Repository allow list retrieved: ${JSON.stringify(repositoryAllowList)}`
		);

		if (query.length === 0) {
			yield* Effect.logDebug('No query provided, returning full allow list');
			return makeResponse(repositoryAllowList);
		}

		const filtered = repositoryAllowList.filter((repo) =>
			repo.label.toLowerCase().includes(query.toLowerCase())
		);

		yield* Effect.logDebug(`Filtered repositories: ${JSON.stringify(filtered)}`);

		return makeResponse(filtered);
	});

	const issueAutocomplete = Ix.autocomplete(
		Ix.option('issue-from-thread', 'repository'),
		autoCompleteHandler
	);

	const issueSettingsAutocomplete = Ix.autocomplete(
		Ix.option('issue-settings', 'repository-label'),
		autoCompleteHandler
	);

	/**
	 * Builds an Ix command handler with error handling for thread-specific commands.
	 *
	 * - Adds the `issueCommand` to the builder.
	 * - Responds with an ephemeral message if the command is not used within a thread (`NotInThreadError`).
	 * - Logs any other errors encountered during execution.
	 *
	 * @remarks
	 * This handler ensures that certain commands are only executable within Discord threads,
	 * providing user feedback when misused and robust error logging for diagnostics.
	 */
	const ix = Ix.builder
		.add(issueCommand)
		.add(issueAutocomplete)
		.add(issueSettingsCommand)
		.add(issueSettingsAutocomplete)
		.catchTagRespond('NotInThreadError', () =>
			Effect.succeed(
				Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'This command can only be used in a thread',
						flags: Discord.MessageFlags.Ephemeral,
					},
				})
			)
		)
		.catchAllCause(Effect.logError);

	// Register the command handler with the interactions registry
	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('IssueFromThread', 'Interactions registered and running.')),
	]);
});

/**
 * Provides a live `Issue` service layer by composing the `make` function with
 * scoped resource management and injecting the default `ChannelsCache` and `Messages` dependencies.
 *
 * This layer can be used to access the live implementation of the `Issue` service
 * throughout the application.
 *
 * @remarks
 * - Uses `Layer.scopedDiscard` to manage resource lifecycle.
 * - Dependencies are provided via `Layer.provide`.
 *
 * @see ChannelsCache.Default
 * @see Messages.Default
 */
export const IssueFromThreadLive = Layer.scopedDiscard(make);
