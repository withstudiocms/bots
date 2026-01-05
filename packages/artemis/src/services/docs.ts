import type { SearchIndex } from 'algoliasearch';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, DiscordREST, Ix } from 'dfx/index';
import { Effect, FiberMap, Layer, Option } from 'effect';
import { decode } from 'html-entities';
import { AlgoliaSearchAPI, type SearchHit } from '../core/algolia.ts';
import { DiscordApplication } from '../core/discord-rest.ts';
import { getBrandedEmbedBase } from '../static/embeds.ts';
import {
	buildAutocompleteResponse,
	buildInitialResponse,
	cleanReply,
	filterAutocompleteHits,
	filterSearchResults,
	generateAutocompleteNames,
	generateNameFromHit,
	getStringOption,
	makeCategories,
} from '../utils/docsearch.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Creates and configures the documentation search service for Discord interactions.
 *
 * This service provides:
 * - A `/docs` slash command for searching documentation via Algolia
 * - Autocomplete functionality for documentation search queries
 * - Multi-language support for documentation (English, Spanish, French, German, Chinese, Korean)
 * - Formatted embed responses with search results organized by category
 *
 * @remarks
 * The service depends on:
 * - `InteractionsRegistry` - For registering Discord interactions
 * - `AlgoliaSearchAPI` - For searching documentation content
 * - `DiscordREST` - For sending Discord API requests
 * - `DiscordApplication` - For Discord application context
 * - `FiberMap` - For managing concurrent operations
 *
 * Command options:
 * - `query` (required) - The search query with autocomplete support
 * - `hidden` (optional) - Whether the response is ephemeral (default: true)
 * - `language` (optional) - The documentation language (default: 'en')
 *
 * @returns An Effect that registers the documentation search interactions and logs initialization
 *
 * @example
 * ```typescript
 * const service = yield* make;
 * ```
 */
const make = Effect.gen(function* () {
	const [registry, algolia, discordRest, discordApp, fiberMap] = yield* Effect.all([
		InteractionsRegistry,
		AlgoliaSearchAPI,
		DiscordREST,
		DiscordApplication,
		FiberMap.make<Discord.Snowflake>(),
	]);

	/**
	 * Updates the original webhook message with new embeds.
	 *
	 * @param id - The Discord application ID.
	 * @param token - The interaction token.
	 * @returns A function that takes an array of Discord.RichEmbed and updates the original message.
	 */
	const updateEmbeds = (id: string, token: string) => (embeds: Discord.RichEmbed[]) => {
		return discordRest.updateOriginalWebhookMessage(id, token, {
			payload: { embeds },
		});
	};

	/**
	 * Returns search results for a specific documentation object.
	 *
	 * @param context - The Discord interaction context.
	 * @param object - The specific search hit object to retrieve results for.
	 * @param index - The Algolia search index to query.
	 * @param opts - Options including visibility and language preferences.
	 * @returns An Effect that updates the original webhook message with the search results embed.
	 */
	const returnObjectResults = (
		context: Discord.APIInteraction,
		object: SearchHit,
		index: SearchIndex,
		opts: {
			hidden: boolean;
			language: string;
		}
	) =>
		Effect.gen(function* () {
			const embed = getBrandedEmbedBase();

			embed.setTitle(decode(generateNameFromHit(object)));

			let description = '';

			const facetFilters: string[][] = [[`lang:${opts.language ?? 'en'}`], ['type:content']];

			let highest = 0;

			for (let i = 0; i <= 6; i++) {
				if (!object.hierarchy[`lvl${i}`]) break;

				highest = i;

				facetFilters.push([`hierarchy.lvl${i}:${decode(object.hierarchy[`lvl${i}`])}`]);
			}

			return yield* Effect.tryPromise({
				try: async () => {
					const result = await index.search<SearchHit>('', {
						facetFilters: facetFilters,
						attributesToRetrieve: [
							'hierarchy.lvl0',
							'hierarchy.lvl1',
							'hierarchy.lvl2',
							'hierarchy.lvl3',
							'hierarchy.lvl4',
							'hierarchy.lvl5',
							'hierarchy.lvl6',
							'content',
							'type',
							'url',
							'weight',
						],
						distinct: false,
					});
					return result.hits.filter((hit) => !hit.hierarchy[`lvl${highest + 1}`]);
				},
				catch: (error) => new Error(`Algolia search error: ${error}`),
			}).pipe(
				Effect.map((hits) => {
					for (let i = 0; i < hits.length; i++) {
						if (object.hierarchy[`lvl${i}`] === '') continue;
						description += `${decode(hits[i].content)}\n`;
					}

					description += `\n[read more](${object.url})`;

					embed.setDescription(description);

					return [embed.build()];
				}),
				Effect.flatMap(updateEmbeds(discordApp.id, context.token))
			);
		});

	/**
	 * Handles follow-up actions for the documentation search command.
	 *
	 * @param query - The search query string.
	 * @param context - The Discord interaction context.
	 * @param opts - Options including visibility and language preferences.
	 * @returns An Effect that processes the search query and updates the interaction response.
	 */
	const followup = (
		query: string,
		context: Discord.APIInteraction,
		opts: { hidden: boolean; language: string }
	) =>
		Effect.gen(function* () {
			// Get the search index
			const index = yield* algolia.getIndex;
			const { hidden, language } = opts;

			// Check if query is an auto-complete request
			if (query.startsWith('auto-')) {
				const reply: SearchHit = yield* algolia.getObject(query.substring(5));
				return yield* returnObjectResults(context, reply, index, { hidden, language });
			}

			if (query.startsWith('user-')) {
				query = query.substring(5);
			}

			return yield* algolia
				.search(query, { lang: language })
				.pipe(
					Effect.map(cleanReply),
					Effect.map(makeCategories),
					Effect.map(filterSearchResults(query)),
					Effect.flatMap(updateEmbeds(discordApp.id, context.token))
				);
		});

	/**
	 * Registers the `/docs` command and its autocomplete functionality.
	 *
	 * The command allows users to search documentation with options for query,
	 * visibility, and language. Autocomplete provides real-time suggestions
	 * based on user input.
	 */
	const docsCommand = Ix.global(
		{
			name: 'docs',
			description: 'Search the docs for a specific query',
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'query',
					description: 'The search query to look up in the documentation',
					autocomplete: true,
					required: true,
				},
				{
					type: Discord.ApplicationCommandOptionType.BOOLEAN,
					name: 'hidden',
					description: 'Whether this should only be shown to you. Defaults to true.',
					required: false,
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'language',
					description: 'The doc language to query',
					required: false,
					choices: [
						{ name: 'English', value: 'en' },
						{ name: 'Spanish', value: 'es' },
						{ name: 'French', value: 'fr' },
						{ name: 'German', value: 'de' },
						{ name: 'Chinese', value: 'zh-cn' },
						{ name: 'Korean', value: 'ko' },
					],
				},
			],
		},
		Effect.fn('DocsCommand')(function* (ix) {
			// Get interaction context
			const context = yield* Ix.Interaction;
			const query = ix.optionValue('query');
			const hiddenOpt = ix.optionValueOptional('hidden');
			const languageOpt = ix.optionValueOptional('language');

			const hiddenGet = Option.getOrUndefined(hiddenOpt);
			const languageGet = Option.getOrUndefined(languageOpt);

			const hidden = hiddenGet !== undefined ? hiddenGet : true;
			const language = languageGet ?? 'en';

			yield* Effect.logDebug(
				`Docs command received with query: ${query}, language: ${language}, hidden: ${hidden}`
			);

			yield* followup(query, context, { hidden, language }).pipe(
				Effect.annotateLogs({ prefix: 'DocsCommand/followup' }),
				FiberMap.run(fiberMap, 'DocsCommand/followup')
			);

			return buildInitialResponse(hidden);
		})
	);

	/**
	 * Autocomplete handler for the `/docs` command.
	 *
	 * Provides real-time search suggestions based on user input,
	 * querying the Algolia index and returning formatted choices.
	 */
	const docsAutocomplete = Ix.autocomplete(
		Ix.option('docs', 'query'),
		Effect.gen(function* () {
			const context = yield* Ix.Interaction;
			const query = String(yield* Ix.focusedOptionValue);
			// biome-ignore lint/suspicious/noExplicitAny: doing well
			const lang = getStringOption(context.data as any, 'language') ?? 'en';

			yield* Effect.annotateCurrentSpan('query', query);

			return yield* algolia
				.autocompleteSearch(query, { lang })
				.pipe(
					Effect.map(generateAutocompleteNames),
					Effect.map(filterAutocompleteHits(query)),
					Effect.map(buildAutocompleteResponse)
				);
		})
	);

	/**
	 * Registers the documentation search interactions and logs initialization
	 */
	const ix = Ix.builder.add(docsCommand).add(docsAutocomplete).catchAllCause(Effect.logError);

	// Register the interactions
	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('DocsService', 'Interactions registered and running.')),
	]);
});

/**
 * Live layer implementation of the DocsService.
 *
 * This layer provides a scoped instance of the DocsService that will be
 * automatically disposed when the scope is closed. The service is created
 * using the `make` function and managed by Effect's Layer system.
 *
 * @remarks
 * The `scopedDiscard` combinator ensures that the service's resources are
 * properly cleaned up when the layer's scope ends, preventing resource leaks.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* (_) {
 *   const docsService = yield* _(DocsService);
 *   // Use the docs service
 * }).pipe(Effect.provide(DocsServiceLive));
 * ```
 */
export const DocsServiceLive = Layer.scopedDiscard(make);
