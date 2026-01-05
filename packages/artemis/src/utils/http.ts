import { type HttpServer, HttpServerResponse } from '@effect/platform';
import { Cause, Context, Effect, Layer } from 'effect';
import { formatArrayLog } from './log.ts';

/**
 * Formats an `HttpServer.Address` object into a string representation.
 *
 * - For `UnixAddress`, returns a string in the format: `unix://<path>`.
 * - For `TcpAddress`, returns a string in the format: `http://<hostname>:<port>`.
 *
 * @param address - The address object to format, which can be either a Unix or TCP address.
 * @returns The formatted address string.
 *
 * @internal - This utility is intended for internal use to facilitate logging of server addresses
 *            when setting up HTTP servers within an application. (Taken from Effect Platform)
 */
export const formatAddress = (address: HttpServer.Address): string => {
	switch (address._tag) {
		case 'UnixAddress':
			return `unix://${address.path}`;
		case 'TcpAddress':
			return `http://${address.hostname}:${address.port}`;
	}
};

/**
 * A generic tag for the `HttpServer` instance, used for dependency injection within the Effect platform.
 *
 * This tag allows components to access the `HttpServer` instance from the context.
 *
 * @see {@link HttpServer.HttpServer}
 * @remarks
 * Use this tag to retrieve or provide the HTTP server in effectful computations.
 *
 * @internal - This utility is intended for internal use to facilitate logging of server addresses
 *            when setting up HTTP servers within an application. (Taken from Effect Platform)
 */
export const serverTag = Context.GenericTag<HttpServer.HttpServer>('@effect/platform/HttpServer');

/**
 * Returns an effect that applies the provided effectful function to the formatted address
 * of the current HTTP server.
 *
 * @template A The success type of the effect.
 * @template E The error type of the effect.
 * @template R The environment required by the effect.
 * @param effect A function that takes a formatted address string and returns an Effect.
 * @returns An Effect that requires an HttpServer in its environment (in addition to R),
 * and produces the result of the provided effect.
 *
 * @internal - This utility is intended for internal use to facilitate logging of server addresses
 *            when setting up HTTP servers within an application. (Taken from Effect Platform)
 */
export const addressFormattedWith = <A, E, R>(
	effect: (address: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, HttpServer.HttpServer | R> =>
	Effect.flatMap(serverTag, (server) => effect(formatAddress(server.address)));

/**
 * Logs the server address and additional startup information when the HTTP server starts.
 *
 * This effect formats and logs an array of messages including:
 * - A "Server started" message
 * - The server's listening address
 * - A message indicating that the server is listening for GitHub webhooks
 *
 * @remarks
 * This effect requires an `HttpServer.HttpServer` environment and does not fail.
 *
 * @see addressFormattedWith
 * @see formatArrayLog
 *
 * @internal - This utility is intended for internal use to facilitate logging of server addresses
 *            when setting up HTTP servers within an application. (Taken from Effect Platform)
 */
export const logAddress: Effect.Effect<void, never, HttpServer.HttpServer> = addressFormattedWith(
	(_) => Effect.all(formatArrayLog('Http', [`HTTP Server Listening on ${_}`]))
);

/**
 * Enhances a given Layer by discarding the effect of `logAddress` and merging it with the provided layer.
 *
 * @template A - The input environment type required by the layer.
 * @template E - The error type that the layer may produce.
 * @template R - The output environment type provided by the layer.
 * @param layer - The Layer to be enhanced with address logging.
 * @returns A new Layer that provides both the original layer's environment and the effect of logging the address,
 *          with the output environment extended to include `HttpServer.HttpServer` if not already present in `A`.
 *
 * @internal - This utility is intended for internal use to facilitate logging of server addresses
 *            when setting up HTTP servers within an application. (Taken from Effect Platform)
 */
export const withLogAddress = <A, E, R>(
	layer: Layer.Layer<A, E, R>
): Layer.Layer<A, E, R | Exclude<HttpServer.HttpServer, A>> =>
	Layer.effectDiscard(logAddress).pipe(Layer.provideMerge(layer));

/**
 * Generates the file path for an HTML file located in the `/prod/artemis/html/` directory.
 *
 * @param fileName - The name of the HTML file.
 * @returns The full path to the HTML file as a string.
 */
export const getHtmlFilePath = (fileName: string): string => {
	return `/prod/artemis/html/${fileName}`;
};

/**
 * Handles errors during HTTP fetch and rendering processes.
 *
 * @param prefix - A string prefix to identify the error context.
 * @param err - The cause of the error.
 * @returns An Effect that fails with an HTTP response containing the error message.
 */
export const handleError = (prefix: string) => (err: Cause.Cause<unknown>) =>
	Effect.fail(
		HttpServerResponse.text(`${prefix}: ${Cause.pretty(err)}`, {
			status: 500,
		})
	);

/**
 * Checks the HTTP response status and returns the response text if successful.
 * Fails with an HTTP response if the status is not 200.
 *
 * @param response - The HTTP client response to check.
 * @returns An Effect that yields the response text or fails with an HTTP response.
 */
export const checkHTTPResponse = Effect.fn(function* (response: Response) {
	if (response.status !== 200) {
		return yield* Effect.fail(
			HttpServerResponse.text('Failed to fetch star history', {
				status: response.status,
			})
		);
	}
	return yield* Effect.tryPromise(() => response.text());
});
