import type { Discord } from 'dfx';
import { DiscordREST } from 'dfx';
import { Cache, Data, Duration, Effect } from 'effect';
import { DiscordRestLayer } from './discord-rest.ts';

/**
 * Represents a request to retrieve a member from a guild.
 *
 * @remarks
 * This class is a tagged data structure used for caching or fetching a member
 * by their user ID within a specific guild.
 *
 * @property guildId - The unique identifier of the guild.
 * @property userId - The unique identifier of the user (member) within the guild.
 */
export class GetMember extends Data.TaggedClass('GetMember')<{
	readonly guildId: Discord.Snowflake;
	readonly userId: Discord.Snowflake;
}> {}

/**
 * A service for caching Discord guild members using an effectful cache.
 *
 * @remarks
 * - The cache has a capacity of 1000 entries and a time-to-live of 1 day.
 * - When a member is not found in the cache, it fetches the member from the Discord REST API.
 *
 * @example
 * ```typescript
 * const member = yield* MemberCache.get(guildId, userId);
 * ```
 *
 * @service
 * @category Discord
 */
export class MemberCache extends Effect.Service<MemberCache>()('discord/MemberCache', {
	dependencies: [DiscordRestLayer],
	effect: Effect.gen(function* () {
		const rest = yield* DiscordREST;

		const cache = yield* Cache.make({
			capacity: 1000,
			timeToLive: Duration.days(1),
			lookup: ({ guildId, userId }: GetMember) => rest.getGuildMember(guildId, userId),
		});

		return {
			get: (guildId: Discord.Snowflake, userId: Discord.Snowflake) =>
				cache
					.get(new GetMember({ guildId, userId }))
					.pipe(Effect.withSpan('MemberCache.get', { attributes: { userId } })),
		} as const;
	}),
}) {}
