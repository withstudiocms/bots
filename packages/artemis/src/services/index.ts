import { Layer } from 'effect';
import { AutoThreadsLive } from './auto-threads.ts';
import { BlueSkyLive } from './bluesky.ts';
import { ContributeLive } from './contribute-embed.ts';
import { CrowdinEmbedLive } from './crowdin-embed.ts';
import { DocsServiceLive } from './docs.ts';
import { EventBusListenerLive } from './event-listener.ts';
import { GatewayEventsLive } from './gateway-events.ts';
import { HTTPServerLive } from './http.ts';
import { IssueFromMessageLive } from './issue-from-message.ts';
import { IssueFromThreadLive } from './issue-from-thread.ts';
import { NoEmbedLive } from './no-embed.ts';
import { PTALService } from './ptal-service.ts';
import { StarsGraphLive } from './stars-graph.ts';

/**
 * A Layer that combines all Artemis services into a single Layer.
 */
export const ArtemisServiceLayer = Layer.mergeAll(
	AutoThreadsLive,
	IssueFromThreadLive,
	NoEmbedLive,
	CrowdinEmbedLive,
	IssueFromMessageLive,
	ContributeLive,
	PTALService,
	StarsGraphLive,
	HTTPServerLive,
	EventBusListenerLive,
	GatewayEventsLive,
	DocsServiceLive,
	BlueSkyLive
);

/**
 * Builds the Artemis live service layer by providing the necessary dependencies.
 *
 * @param deps - The Layer containing all required dependencies for the services.
 * @returns A Layer that combines the Artemis services with the provided dependencies.
 */
export const buildArtemisLiveLayer = <A, R>(deps: Layer.Layer<A, R>) =>
	ArtemisServiceLayer.pipe(Layer.provide(deps));
