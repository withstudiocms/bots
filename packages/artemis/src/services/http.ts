import { createServer } from 'node:http';
import { HttpLayerRouter, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Duration, Effect, Schema } from 'effect';
import * as Layer from 'effect/Layer';
import CacheService from '../core/effect-cache.ts';
import { httpHost, httpPort } from '../static/env.ts';
import { eFetch } from '../utils/fetchClient.ts';
import { checkHTTPResponse, getHtmlFilePath, handleError, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';
import {
	convertBufferToUint8Array,
	createHTTPResponseForPng,
	getStarHistorySvgUrl,
	HandleUrlGenerationError,
	handleSvgRender,
	logBufferSize,
	logSvgUrl,
} from '../utils/star-history.ts';
import { githubWebhookRouteHandler } from './github-webhooks/http-handler.ts';

/**
 * Predefined static file routes for serving specific files from the
 * `packages/artemis/html` directory.
 *
 * Each route maps a URL path to a corresponding file name.
 */
const staticFileRoutes = [
	{ file: 'index.html' },
	{ file: 'logo.png' },
	{ file: 'xkcd-script.ttf' },
	{ file: 'studiocms.png' },
];

/**
 * Handles the "/api/star-history/:owner/:repo" route to generate and return
 * a star history PNG image for the specified GitHub repository.
 *
 * This route:
 * - Parses the owner and repo from the URL path.
 * - Generates the star history SVG URL using `getStarHistorySvgUrl`.
 * - Fetches the SVG from star-history.com.
 * - Converts the SVG to PNG using the Resvg service.
 * - Returns the PNG image in the HTTP response.
 *
 * Error handling is included to manage invalid input and fetch/render failures.
 */
const starHistoryRouteHandler = HttpLayerRouter.route(
	'GET',
	'/api/star-history/:owner/:repo',
	HttpLayerRouter.schemaPathParams(
		Schema.Struct({
			owner: Schema.String,
			repo: Schema.String,
		})
	).pipe(
		Effect.flatMap(({ owner, repo }) =>
			CacheService.pipe(
				Effect.flatMap(({ memoize }) =>
					memoize(
						`star-history-png:${owner}/${repo}`,
						getStarHistorySvgUrl(`${owner}/${repo}`).pipe(
							// Handle errors during URL generation
							Effect.catchAllCause(HandleUrlGenerationError),
							// Log the star history request
							Effect.tap(
								Effect.logDebug(formattedLog('Http', `Star history request for: ${owner}/${repo}`))
							),
							// Log the generated SVG URL
							Effect.tap(logSvgUrl),
							// Fetch the SVG content
							Effect.flatMap(eFetch),
							// Handle errors during HTTP fetch
							Effect.catchAllCause(handleError('Error fetching star history SVG')),
							// Check HTTP response status and extract text (SVG content)
							Effect.flatMap(checkHTTPResponse),
							// Render SVG to PNG
							Effect.flatMap(handleSvgRender),
							// Handle errors during SVG rendering
							Effect.catchAllCause(handleError('Error rendering SVG to PNG')),
							// Log the size of the generated PNG
							Effect.tap(logBufferSize),
							// convert to Uint8Array for response
							Effect.flatMap(convertBufferToUint8Array),
							// Create HTTP response
							Effect.map(createHTTPResponseForPng)
						),
						{
							ttl: Duration.hours(1), // Cache for 1 hour
							tags: ['star-history'],
						}
					)
				)
			)
		),
		Effect.catchAllCause(handleError('Star History Route Error'))
	)
);

/**
 * Generates route handlers for serving predefined static files.
 *
 * Each static file route is created based on the `staticFileRoutes` array,
 * mapping URL paths to their corresponding files in the `/prod/artemis/html/` directory.
 */
const staticFileRouteHandlers = staticFileRoutes.flatMap(({ file }) => {
	const paths = file === 'index.html' ? (['/', `/${file}`] as const) : ([`/${file}`] as const);
	return paths.map((path) =>
		HttpLayerRouter.route('GET', path, HttpServerResponse.file(getHtmlFilePath(file)))
	);
});

/**
 * Collection of all HTTP routes for the Artemis server.
 *
 * This includes static file serving, health checks, and API endpoints
 * such as the star history image generation.
 */
const routes = HttpLayerRouter.addAll([
	// Health Check Route
	HttpLayerRouter.route('*', '/api/health', HttpServerResponse.text('OK')),

	// Star History API Route
	starHistoryRouteHandler,

	// GitHub Webhook Route
	githubWebhookRouteHandler,

	// Static File Routes
	...staticFileRouteHandlers,

	// Catch-all route for undefined endpoints
	HttpLayerRouter.route('*', '*', HttpServerResponse.text('Not Found', { status: 404 })),
]);

/**
 * Effect Layer that provides and starts the HTTP server for Artemis.
 *
 * This layer sets up the HTTP server with routing, logging, and configuration
 * based on environment variables. It launches the server in a scoped manner,
 * ensuring proper resource management.
 */
const make = Effect.all({
	port: httpPort,
	host: httpHost,
}).pipe(
	Effect.tap(() => Effect.logDebug(formattedLog('Http', 'Configuring server...'))),
	Effect.flatMap((config) =>
		Effect.succeed({
			router: HttpLayerRouter.serve(routes, {
				disableListenLog: true,
				disableLogger: true,
			}).pipe(withLogAddress),
			server: NodeHttpServer.layer(createServer, config),
		})
	),
	Effect.map(({ router, server }) => Layer.provide(router, server)),
	Effect.map(Layer.launch),
	Effect.flatMap((server) => Effect.forkScoped(server)),
	Effect.flatMap(() => Effect.void)
);

/**
 * Layer that provides the live HTTP server for Artemis.
 *
 * This layer is scoped and ensures that the HTTP server is properly started
 * and stopped within the application's lifecycle.
 */
export const HTTPServerLive = Layer.scopedDiscard(make);
