import { NodeHttpClient, NodeSocket } from '@effect/platform-node';
import { DiscordIxLive } from 'dfx/gateway';
import { Layer } from 'effect';
import { DiscordConfigLayer } from './discord-config.ts';
import { DiscordApplication } from './discord-rest.ts';

/**
 * Composes the Discord gateway layer by sequentially applying several providers:
 * - Merges the Node HTTP client (using Undici) into the layer.
 * - Provides a WebSocket constructor for Node environments.
 * - Injects the Discord configuration layer.
 *
 * This layer is intended to set up all necessary dependencies for interacting with the Discord API
 * via a live gateway connection, abstracting away the underlying HTTP and WebSocket implementations.
 */
const DiscordLayer = DiscordIxLive.pipe(
	Layer.provideMerge(NodeHttpClient.layerUndici),
	Layer.provide(NodeSocket.layerWebSocketConstructor),
	Layer.provide(DiscordConfigLayer)
);

/**
 * Merges the `DiscordLayer` and the default `DiscordApplication` layer into a single `Layer`.
 *
 * This combined layer can be used to provide both the core Discord functionality and the default
 * application configuration in one unified layer for dependency injection or composition.
 *
 * @remarks
 * - `DiscordLayer` provides the core Discord gateway functionality.
 * - `DiscordApplication.Default` supplies the default application layer.
 * - The resulting `DiscordGatewayLayer` can be used wherever both are required.
 *
 * @see DiscordLayer
 * @see DiscordApplication.Default
 */
export const DiscordGatewayLayer = Layer.merge(DiscordLayer, DiscordApplication.Default);
