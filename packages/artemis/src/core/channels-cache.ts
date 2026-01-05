import { Cache } from 'dfx';
import { CachePrelude } from 'dfx/gateway';
import { Duration, Effect } from 'effect';
import { DiscordGatewayLayer } from './discord-gateway.ts';

/**
 * A service class for caching channel data with a memory-based TTL (time-to-live) strategy.
 *
 * @remarks
 * - Utilizes an activity-based TTL of 30 minutes for cache entries.
 * - The cache is scoped to channels and uses an in-memory parent driver.
 * - Depends on the `DiscordGatewayLayer` for its operation.
 *
 * @extends Effect.Service
 */
export class ChannelsCache extends Effect.Service<ChannelsCache>()('app/ChannelsCache', {
	scoped: CachePrelude.channels(
		Cache.memoryTTLParentDriver({
			ttl: Duration.minutes(30),
			strategy: 'activity',
		})
	),
	dependencies: [DiscordGatewayLayer],
}) {}
