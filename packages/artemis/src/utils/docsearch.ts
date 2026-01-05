import type { SearchResponse } from '@algolia/client-search';
import { Discord, Ix } from 'dfx/index';
import {
	type APIChatInputApplicationCommandInteractionData,
	ApplicationCommandOptionType,
} from 'dfx/types';
import { Data } from 'effect';
import { decode } from 'html-entities';
import type { categories, SearchHit } from '../core/algolia.ts';
import { getBrandedEmbedBase } from '../static/embeds.ts';
import type { DiscordEmbedBuilder } from './embed-builder.ts';

/**
 * Generates a display name for a given search hit from Algolia.
 *
 * @param hit - The search hit object containing hierarchy and anchor information.
 * @returns A formatted string representing the name of the hit, including hierarchy levels and anchor if present.
 */
export const generateNameFromHit = (hit: SearchHit): string => {
	return decode(
		reduce(
			`${hit.hierarchy.lvl0}: ${hit.hierarchy.lvl1}${hit.hierarchy.lvl2 ? ` - ${hit.hierarchy.lvl2}` : ''} ${
				hit.hierarchy.lvl2 && hit.anchor ? `#${hit.anchor}` : ''
			}`,
			100,
			'...'
		)
	);
};

/**
 * Reduces a string to a specified limit, optionally appending a delimiter if truncated.
 *
 * @param string - The input string to be reduced.
 * @param limit - The maximum length of the resulting string.
 * @param delimiter - An optional string to append if the input string is truncated.
 * @returns The reduced string, with the delimiter appended if truncation occurred.
 */
export const reduce = (string: string, limit: number, delimiter: string | null): string => {
	if (string.length > limit) {
		return (
			string.substring(0, limit - (delimiter ? delimiter.length : 0)) + (delimiter ? delimiter : '')
		);
	}

	return string;
};

/**
 * Retrieves the value of a string option from interaction command data.
 *
 * @param data - The interaction command data containing options.
 * @param name - The name of the option to retrieve.
 * @returns The string value of the specified option, or undefined if not found.
 */
export function getStringOption(
	data: APIChatInputApplicationCommandInteractionData | undefined,
	name: string
) {
	if (!data?.options) return undefined;

	const option = data.options.find((option) => {
		return option.name === name && option.type === ApplicationCommandOptionType.STRING;
	});

	if (!option) return undefined;

	if (!('value' in option)) return undefined;

	return option?.value as string | undefined;
}

/**
 * Error indicating that a search query is too short.
 */
export class QueryTooShort extends Data.TaggedError('QueryTooShort')<{
	readonly actual: number;
	readonly min: number;
}> {}

/**
 * Cleans search hits by adjusting their URLs to remove unnecessary hash fragments.
 *
 * @param reply - The search response containing hits to be cleaned.
 * @returns An array of cleaned search hits with adjusted URLs.
 */
export function cleanReply(reply: SearchResponse<SearchHit>) {
	return reply.hits.map((hit) => {
		const url = new URL(hit.url);
		if (url.hash === '#overview') url.hash = '';

		return {
			...hit,
			url: url.href,
		};
	});
}

/**
 * Organizes search hits into categories based on their top-level hierarchy.
 *
 * @param items - An array of cleaned search hits.
 * @returns An object mapping category names to arrays of search hits belonging to those categories.
 */
export function makeCategories(items: ReturnType<typeof cleanReply>): categories {
	const categories: categories = {};

	items.forEach((item) => {
		if (!categories[item.hierarchy.lvl0]) {
			categories[item.hierarchy.lvl0] = [];
		}
		categories[item.hierarchy.lvl0].push(item);
	});

	// exclude tutorials
	delete categories.Tutorials;

	return categories;
}

/**
 * Filters and formats search results into Discord embeds.
 *
 * @param query - The original search query string.
 * @returns A function that takes categorized search results and returns an array of Discord embed objects.
 */
export const filterSearchResults = (query: string) => (categories: categories) => {
	const embeds: DiscordEmbedBuilder[] = [];

	embeds.push(getBrandedEmbedBase().setTitle(`Results for "${query}"`));

	for (const category in categories) {
		const embed = getBrandedEmbedBase().setTitle(decode(category));

		let body = '';

		const items: { [heading: string]: SearchHit[] } = {};

		for (let i = 0; i < categories[category].length && i < 5; i++) {
			const item = categories[category][i];
			if (!item._snippetResult) continue;

			if (!items[item.hierarchy.lvl1]) {
				items[item.hierarchy.lvl1] = [];
			}

			items[item.hierarchy.lvl1].push(item);
		}

		for (const subjectName in items) {
			const subject = items[subjectName];

			for (let i = 0; i < subject.length; i++) {
				const item = subject[i];

				let hierarchy = '';

				for (let i = 1; i < 7; i++) {
					if (item.hierarchy[`lvl${i}`]) {
						let string = i !== 1 ? ' > ' : '';

						string += item.hierarchy[`lvl${i}`];

						hierarchy += string;
					} else {
						break;
					}
				}

				let result = '';

				if (item._snippetResult) {
					if (item.type === 'content') {
						result = item._snippetResult.content.value;
					} else {
						result = item._snippetResult.hierarchy[item.type].value;
					}

					body += decode(`[🔗](${item.url}) **${hierarchy}**\n`);
					body += decode(`[${result.substring(0, 66)}](${item.url})\n`);
				}
			}
		}

		embed.setDescription(body);

		embeds.push(embed);
	}

	if (embeds.length === 1) {
		embeds[0].setTitle(`No results found for "${query}"`);
	}

	return embeds.slice(0, 10).map((embed) => embed.build());
};

/**
 * Builds an initial response indicating that a documentation search is in progress.
 *
 * @param hidden - A boolean indicating whether the response should be ephemeral (hidden).
 * @returns An InteractionResponse object representing the initial search response.
 */
export function buildInitialResponse(hidden: boolean) {
	return Ix.response({
		type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			embeds: [getBrandedEmbedBase().setTitle('🔍 Searching the documentation...').build()],
			flags: hidden ? Discord.MessageFlags.Ephemeral : undefined,
		},
	});
}

/**
 * Generates autocomplete choices from search hits.
 *
 * @param reply - The search response containing hits for autocomplete.
 * @returns An array of objects representing autocomplete choices with name and value properties.
 */
export function generateAutocompleteNames(reply: SearchResponse<SearchHit>) {
	return reply.hits.map((hit) => ({
		name: generateNameFromHit(hit),
		value: `auto-${hit.objectID}`,
	}));
}

/**
 * Filters autocomplete hits based on the user's query.
 *
 * @param query - The user's input query string.
 * @returns A function that takes an array of autocomplete hits and returns a filtered array.
 */
export const filterAutocompleteHits =
	(query: string) =>
	(
		hits: {
			name: string;
			value: string;
		}[]
	) => {
		if (query.trim() !== '') {
			hits.unshift({
				name: `"${query}"`,
				value: `user-${query}`,
			});
		}
		return hits.slice(0, 25);
	};

/**
 * Builds an autocomplete response for Discord interactions.
 *
 * @param choices - An array of autocomplete choice objects with name and value properties.
 * @returns An InteractionResponse object representing the autocomplete results.
 */
export const buildAutocompleteResponse = (choices: { name: string; value: string }[]) =>
	Ix.response({
		type: Discord.InteractionCallbackTypes.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
		data: {
			choices,
		},
	});
