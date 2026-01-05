import { FetchHttpClient } from '@effect/platform';
import { DiscordREST, DiscordRESTMemoryLive } from 'dfx';
import { Effect, Layer } from 'effect';
import { DiscordConfigLayer } from './discord-config.ts';

/**
 * A ZIO Layer that composes the Discord REST memory implementation with its required dependencies.
 *
 * This layer provides the `DiscordRESTMemoryLive` service, injecting both the `FetchHttpClient` and
 * `DiscordConfigLayer` dependencies using `Layer.provide`. Use this layer to access Discord REST functionality
 * with in-memory state and configuration.
 *
 * @remarks
 * - Depends on `FetchHttpClient.layer` for HTTP requests.
 * - Depends on `DiscordConfigLayer` for Discord API configuration.
 *
 * @example
 * ```typescript
 * Effect.provideLayer(DiscordLayer)
 * ```
 */
const DiscordLayer = DiscordRESTMemoryLive.pipe(
	Layer.provide(FetchHttpClient.layer),
	Layer.provide(DiscordConfigLayer)
);

/**
 * DiscordApplication is an Effect service that provides access to the Discord application's metadata
 * by utilizing the DiscordREST service. It retrieves the current application's information and
 * ensures that any errors encountered during the process are not recoverable (using `orDie`).
 *
 * @remarks
 * This service depends on the `DiscordLayer` for its dependencies.
 *
 * @extends Effect.Service
 *
 * @example
 * ```typescript
 * const appInfo = await Effect.runPromise(DiscordApplication);
 * ```
 */
export class DiscordApplication extends Effect.Service<DiscordApplication>()(
	'app/DiscordApplication',
	{
		effect: DiscordREST.pipe(
			Effect.flatMap((_) => _.getMyApplication()),
			Effect.orDie
		),
		dependencies: [DiscordLayer],
	}
) {}

/**
 * Merges the `DiscordLayer` and the default `DiscordApplication` layer into a single REST layer for Discord.
 *
 * This combined layer can be used to interact with Discord's REST API, leveraging both the core Discord functionality
 * and the default application configuration.
 *
 * @remarks
 * - `DiscordLayer` provides the base Discord API integration.
 * - `DiscordApplication.Default` supplies the default application context.
 * - The resulting `DiscordRestLayer` can be injected or composed in other parts of the application.
 *
 * @see DiscordLayer
 * @see DiscordApplication.Default
 */
export const DiscordRestLayer = Layer.merge(DiscordLayer, DiscordApplication.Default);
