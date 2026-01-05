import type { SearchResponse } from '@algolia/client-search';
import { createFetchRequester } from '@algolia/requester-fetch';
import algoliasearch, { type SearchClient, type SearchIndex } from 'algoliasearch';
import { Data, Effect } from 'effect';
import { algoliaApiKey, algoliaAppId, algoliaIndexName } from '../static/env.ts';

/**
 * Custom error class for handling Algolia search-related errors.
 */
export class AlgoliaSearchError extends Data.TaggedError('AlgoliaSearchError')<{
	cause: unknown;
}> {}

/**
 * Interface defining the Algolia Search API service.
 */
export interface Weight {
	pageRank: number;
	level: number;
	position: number;
}

/**
 * Interface representing a search hit returned by Algolia.
 */
export interface SearchHit {
	readonly objectID: string;
	// biome-ignore lint/complexity/noBannedTypes: Algolia type
	readonly _highlightResult?: {} | undefined;
	// biome-ignore lint/suspicious/noExplicitAny: Algolia type
	readonly _snippetResult?: any | undefined;
	readonly weight: Weight;
	// biome-ignore lint/suspicious/noExplicitAny: Algolia type
	readonly hierarchy: any;
	readonly url: string;
	readonly anchor: string;
	readonly content?: string;
	readonly type: 'content' | `lvl${number}`;
}

/** Type representing categorized search hits. */
export type categories = {
	[category: string]: SearchHit[];
};

/**
 * Service for interacting with the Algolia Search API.
 *
 * This service provides methods for searching and retrieving objects from an Algolia index.
 * It manages the search client and index instances, and provides the following operations:
 *
 * @remarks
 * The service is implemented using Effect.Service and requires the following configuration:
 * - `algoliaAppId`: The Algolia application ID
 * - `algoliaApiKey`: The Algolia API key
 * - `algoliaIndexName`: The name of the Algolia index to search
 *
 * @example
 * ```typescript
 * const api = yield* AlgoliaSearchAPI;
 * const results = yield* api.search("query", { lang: "en" });
 * ```
 *
 * @public
 */
export class AlgoliaSearchAPI extends Effect.Service<AlgoliaSearchAPI>()(
	'artemis/core/algolia/AlgoliaSearchAPI',
	{
		effect: Effect.gen(function* () {
			const [appId, apiKey, indexName] = yield* Effect.all([
				algoliaAppId,
				algoliaApiKey,
				algoliaIndexName,
			]);
			// Storage

			let searchClient: SearchClient;
			let index: SearchIndex;

			// Functions

			/**
			 * Retrieves the Algolia search client.
			 */
			const getSearchClient = Effect.try({
				try: () => {
					if (!searchClient) {
						searchClient = algoliasearch.default(appId, apiKey, {
							requester: createFetchRequester(),
						});
					}
					return searchClient;
				},
				catch: (error) => new AlgoliaSearchError({ cause: error }),
			});

			/**
			 * Retrieves the Algolia index.
			 */
			const getIndex = Effect.gen(function* () {
				if (!index) {
					const client = yield* getSearchClient;
					index = client.initIndex(indexName);
				}
				return index;
			});

			/**
			 * Retrieves an object from the Algolia index by its object ID.
			 *
			 * @param objectID - The ID of the object to retrieve.
			 */
			const getObject = Effect.fn('AlgoliaSearchAPI/getObject')(function* (objectID: string) {
				const index = yield* getIndex;
				return yield* Effect.tryPromise({
					try: async () => {
						const result: SearchHit = await index.getObject<SearchHit>(objectID);
						return result;
					},
					catch: (error) => new AlgoliaSearchError({ cause: error }),
				});
			});

			/**
			 * Searches the Algolia index with the given query and options.
			 *
			 * @param query - The search query string.
			 * @param options - Optional search options, including language filtering.
			 */
			const search = Effect.fn('AlgoliaSearchAPI/search')(function* (
				query: string,
				options?: { lang: string }
			) {
				const index = yield* getIndex;
				return yield* Effect.tryPromise({
					try: async () => {
						const result = await index.search<SearchHit>(query, {
							facetFilters: [[`lang:${options?.lang ?? 'en'}`]],
							highlightPreTag: '**',
							highlightPostTag: '**',
							hitsPerPage: 20,
							snippetEllipsisText: '…',
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
							],
							attributesToSnippet: [
								'hierarchy.lvl1:10',
								'hierarchy.lvl2:10',
								'hierarchy.lvl3:10',
								'hierarchy.lvl4:10',
								'hierarchy.lvl5:10',
								'hierarchy.lvl6:10',
								'content:10',
							],
						});
						return result as SearchResponse<SearchHit>;
					},
					catch: (error) => new AlgoliaSearchError({ cause: error }),
				});
			});

			/**
			 * Performs an autocomplete search on the Algolia index.
			 *
			 * @param query - The search query string.
			 * @param options - Optional search options, including language filtering.
			 */
			const autocompleteSearch = Effect.fn('AlgoliaSearchAPI/autocompleteSearch')(function* (
				query: string,
				options?: { lang: string }
			) {
				const index = yield* getIndex;
				return yield* Effect.tryPromise({
					try: async () => {
						const result = await index.search<SearchHit>(query, {
							facetFilters: [[`lang:${options?.lang ?? 'en'}`]],
							hitsPerPage: 20,
							distinct: true,
						});
						return result as SearchResponse<SearchHit>;
					},
					catch: (error) => new AlgoliaSearchError({ cause: error }),
				});
			});

			return { getIndex, getObject, search, autocompleteSearch } as const;
		}),
	}
) {}
