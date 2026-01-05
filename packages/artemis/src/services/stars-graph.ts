import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Cause, Effect, Layer, Option, pipe } from 'effect';
import { getStarHistoryEmbed } from '../static/embeds.ts';
import { httpPublicDomain } from '../static/env.ts';
import { formattedLog } from '../utils/log.ts';
import { parseRepository } from '../utils/star-history.ts';

class InvalidRepositoryFormatError {
	readonly _tag = 'InvalidRepositoryFormatError';
}

/**
 * Initializes and registers the "/stars-graph" interaction command.
 *
 * This Effect:
 * - Resolves the InteractionsRegistry
 * - Builds a global "stars-graph" interaction that:
 *   - Accepts a repository parameter (format: owner/repo)
 *   - Fetches the star history chart from star-history.com API
 *   - Converts it to PNG
 *   - Responds with the chart attached as a file
 * - Handles errors gracefully with user-friendly messages
 * - Registers the built interaction in the registry
 *
 * @returns An Effect that, when executed, registers the "stars-graph" interaction.
 */
const make = Effect.gen(function* () {
	const registry = yield* InteractionsRegistry;

	const starsGraphCommand = Ix.global(
		{
			name: 'stars-graph',
			description: 'Generate a star history graph for a GitHub repository',
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'repository',
					description: 'Repository in format: owner/repo (e.g., facebook/react)',
					required: true,
				},
				{
					type: Discord.ApplicationCommandOptionType.BOOLEAN,
					name: 'public',
					description:
						'Whether to make the response public or visible only to you (default: false)',
					required: false,
				},
			],
		},
		Effect.fn('StarsGraphCommand')((ix) =>
			pipe(
				ix.optionValue('repository'),
				Effect.succeed,
				Effect.tap((repository) =>
					Effect.logDebug(
						formattedLog('StarsGraph', `Command received for repository: ${repository}`)
					)
				),
				Effect.map(parseRepository),
				Effect.flatMap((parsed) =>
					parsed ? Effect.succeed(parsed) : Effect.fail(new InvalidRepositoryFormatError())
				),
				Effect.tap(() =>
					Effect.logDebug(
						formattedLog(
							'StarsGraph',
							`Starting star history generation for ${ix.optionValue('repository')}`
						)
					)
				),
				Effect.flatMap((parsed) =>
					httpPublicDomain.pipe(
						Effect.map(
							(val) =>
								`https://${val}/api/star-history/${parsed.owner}/${parsed.repo}?=t=${Date.now()}`
						)
					)
				),
				Effect.tap((svgUrl) =>
					Effect.logDebug(formattedLog('StarsGraph', `Constructed SVG URL: ${svgUrl}`))
				),
				Effect.map((svgUrl) => {
					const repository = ix.optionValue('repository');
					const isPublic = Option.getOrUndefined(ix.optionValueOptional('public')) ?? false;
					const embed = getStarHistoryEmbed(repository, svgUrl);
					return Ix.response({
						type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
						data: {
							embeds: [embed],
							flags: isPublic ? undefined : Discord.MessageFlags.Ephemeral,
						},
					});
				}),
				Effect.catchTag('InvalidRepositoryFormatError', () =>
					Effect.succeed(
						Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content:
									'❌ Invalid repository format. Please use the format: owner/repo (e.g., facebook/react).',
								flags: Discord.MessageFlags.Ephemeral,
							},
						})
					)
				),
				Effect.catchAllCause((cause) =>
					Effect.succeed(
						Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: `❌ An error occurred while generating the star history graph:\n\n\`\`\`\n${Cause.pretty(cause)}\n\`\`\``,
								flags: Discord.MessageFlags.Ephemeral,
							},
						})
					)
				)
			)
		)
	);

	const ix = Ix.builder.add(starsGraphCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('StarsGraph', 'Interactions registered and running.')),
	]);
});

/**
 * Live layer for the Stars Graph service.
 */
export const StarsGraphLive = Layer.scopedDiscard(make);
