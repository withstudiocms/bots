import {
	type AppBskyFeedDefs,
	type AppBskyFeedGetAuthorFeed,
	AppBskyFeedPost,
	type AppBskyRichtextFacet,
	AtpAgent,
	RichText,
} from '@atproto/api';
import type { ProfileViewDetailed } from '@atproto/api/dist/client/types/app/bsky/actor/defs.js';
import { Data, Effect } from 'effect';

/**
 * Custom Error class for BlueSky API errors
 */
export class BlueSkyAPIError extends Data.TaggedError('BlueSkyAPIError')<{
	message: string;
	cause?: unknown;
}> {}

/**
 * Interface defining the BlueSky API client methods
 */
export interface BlueSkyAPI {
	getAgent(): Promise<AtpAgent>;
	processPostText(post: AppBskyFeedDefs.PostView): string;
	getBlueskyPostLink(post: AppBskyFeedDefs.PostView): string;
	getBlueskyAccount(userId: string): Promise<ProfileViewDetailed>;
	getAuthorFeed(
		params?: AppBskyFeedGetAuthorFeed.QueryParams | undefined
	): Promise<AppBskyFeedGetAuthorFeed.Response>;

	wrap<A>(f: (_: Omit<BlueSkyAPI, 'wrap'>) => Promise<A>): Effect.Effect<A, BlueSkyAPIError, never>;
}

let bskyAgent: AtpAgent | null = null;

/**
 * Creates and returns a live AtpAgent for public unauthenticated BlueSky API interactions
 */
async function getLiveAgent(): Promise<AtpAgent> {
	if (bskyAgent) return bskyAgent;

	bskyAgent = new AtpAgent({ service: 'https://api.bsky.app' });
	return bskyAgent;
}

/**
 * Client for interacting with the BlueSky API.
 *
 * Provides methods for authentication, post processing, profile retrieval, and feed management.
 * Implements the BlueSkyAPI interface with additional error handling through Effect.
 *
 * @implements {BlueSkyAPI}
 *
 * @examples
 *
 * **Basic usage**
 *
 * ```typescript
 * const client = new BSkyAPIClient();
 * const profile = await client.getBlueskyAccount('user.bsky.social');
 * ```
 *
 * **Using Effect to wrap API calls:**
 *
 * ```typescript
 * import { Effect } from 'effect';
 *
 * const client = new BSkyAPIClient();
 * const feedEffect = client.wrap(({ getBlueskyAccount }) =>
 * 	getBlueskyAccount('user.bsky.social')
 * );
 * ```
 */
export class BSkyAPIClient implements BlueSkyAPI {
	async getAgent(): Promise<AtpAgent> {
		return await getLiveAgent();
	}

	processPostText(post: AppBskyFeedDefs.PostView): string {
		if (!AppBskyFeedPost.isRecord(post.record)) {
			throw new Error('Post is not record');
		}

		if (!post.record.facets || (post.record.facets as AppBskyRichtextFacet.Main[]).length === 0) {
			return post.record.text as string;
		}

		const rt = new RichText({
			text: post.record.text as string,
			facets: post.record.facets as AppBskyRichtextFacet.Main[],
		});

		let processedText = '';
		for (const segment of rt.segments()) {
			if (segment.isLink()) {
				if (segment.text === segment.link?.uri) {
					processedText += segment.text;
				} else {
					processedText += `[${segment.text}](${segment.link?.uri})`;
				}
			} else if (segment.isMention()) {
				processedText += `[${segment.text}](https://bsky.app/profile/${segment.mention?.did})`;
			} else if (segment.isTag()) {
				processedText += `[${segment.text}](https://bsky.app/hashtag/${segment.tag?.tag})`;
			} else {
				processedText += segment.text;
			}
		}
		return processedText;
	}

	getBlueskyPostLink(post: AppBskyFeedDefs.PostView): string {
		const uriParts = post.uri.split('/');
		const handle = post.author.handle;
		const rKey = uriParts[uriParts.length - 1];

		return `https://bsky.app/profile/${handle}/post/${rKey}`;
	}

	async getBlueskyAccount(userId: string) {
		if (!userId) throw new Error('No DID or handle provided.');

		let localDidOrHandle = userId;

		const didRegex = /^did:plc:[a-z0-9]{24}$/;
		const handleRegex = /^@?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

		if (didRegex.test(localDidOrHandle)) {
		} else if (handleRegex.test(userId)) {
			if (userId.charAt(0) === '@') {
				localDidOrHandle = userId.substring(1);
			} else {
				localDidOrHandle = userId;
			}
		} else {
			throw new Error("String isn't DID or handle");
		}

		const blueskyAgent = await getLiveAgent();

		const { data } = await blueskyAgent.getProfile({
			actor: localDidOrHandle,
		});

		return data;
	}

	async getAuthorFeed(
		params?: AppBskyFeedGetAuthorFeed.QueryParams
	): Promise<AppBskyFeedGetAuthorFeed.Response> {
		const blueskyAgent = await getLiveAgent();
		return await blueskyAgent.getAuthorFeed(params);
	}

	wrap<A>(
		f: (_: Omit<BlueSkyAPI, 'wrap'>) => Promise<A>
	): Effect.Effect<A, BlueSkyAPIError, never> {
		return Effect.tryPromise({
			try: () => f(this),
			catch: (cause) => new BlueSkyAPIError({ message: 'BlueSky API call failed', cause }),
		}).pipe(Effect.tapError(Effect.logError));
	}
}
