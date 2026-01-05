import { HttpServerResponse } from '@effect/platform';
import { Cause, Data, Effect } from 'effect';
import { ResvgServiceLive } from '../core/resvg.ts';
import { getHtmlFilePath } from './http.ts';
import { formattedLog } from './log.ts';

/**
 * Parses and validates a GitHub repository string.
 *
 * @param repo - Repository string in format: owner/repo
 * @returns Parsed repository object with owner and repo, or null if invalid
 *
 * @example
 * ```ts
 * parseRepository('facebook/react') // => { owner: 'facebook', repo: 'react' }
 * parseRepository('invalid') // => null
 * ```
 */
export function parseRepository(repo: string): { owner: string; repo: string } | null {
	const parts = repo.split('/');
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return null;
	}
	return { owner: parts[0], repo: parts[1] };
}

/**
 * Represents an error specific to star history URL generation.
 *
 * This error extends from `Data.TaggedError` with the tag `'utils/StarHistoryError'`
 * and includes a `cause` property to provide additional context about the underlying issue.
 *
 * @example
 * ```typescript
 * throw new StarHistoryError({ cause: originalError });
 * ```
 *
 * @property cause - The underlying cause of the error, can be any value.
 */
export class StarHistoryError extends Data.TaggedError('utils/StarHistoryError')<{
	cause: unknown;
}> {}

/**
 * Generates the star history SVG URL for a given GitHub repository.
 *
 * @param pathParts - An array containing the path parts, where the owner is at index 2 and the repo at index 3.
 * @returns An Effect that yields the star history SVG URL or fails with a StarHistoryError.
 *
 * @example
 * ```ts
 * const urlEffect = getStarHistorySvgUrl(['api', 'star-history', 'facebook', 'react']);
 * // urlEffect yields: 'https://api.star-history.com/svg?repos=facebook/react&type=Date'
 * ```
 */
export const getStarHistorySvgUrl = Effect.fn('utils/getStarHistorySvgUrl')((repository: string) =>
	Effect.try({
		try: () => `https://api.star-history.com/svg?repos=${repository}&type=Date`,
		catch: (cause) => new StarHistoryError({ cause }),
	})
);

/**
 * Renders the given SVG string to PNG bytes using the Resvg service.
 *
 * @param svgString - The SVG content as a string.
 * @returns An Effect that yields the PNG bytes.
 */
export const handleSvgRender = Effect.fn(function* (svgString: string) {
	const { renderToPng } = yield* ResvgServiceLive;
	return yield* renderToPng(svgString, {
		fitTo: { mode: 'width', value: 1200 },
		background: '#ffffff',
		font: {
			fontFiles: [getHtmlFilePath('xkcd-script.ttf')],
			loadSystemFonts: true,
		},
	});
});

/**
 * Handles errors that occur during the generation of the star history URL.
 *
 * @param err - The cause of the error.
 * @returns An Effect that fails with an HTTP response containing the error message.
 */
export const HandleUrlGenerationError = (err: Cause.Cause<StarHistoryError>) =>
	Effect.fail(
		HttpServerResponse.text(`Error generating star history URL: ${Cause.pretty(err)}`, {
			status: 400,
		})
	);

/**
 * Logs the SVG URL being fetched for star history.
 *
 * @param svgUrl - The SVG URL to be logged.
 * @returns An Effect that logs the SVG URL.
 */
export const logSvgUrl = Effect.fn(function* (svgUrl: string) {
	return yield* Effect.logDebug(formattedLog('Http', `Fetching star history SVG from: ${svgUrl}`));
});

/**
 * Logs the size of the provided PNG buffer.
 *
 * @param pngBuffer - The PNG buffer whose size is to be logged.
 * @returns An Effect that logs the size of the PNG buffer.
 */
export const logBufferSize = Effect.fn(function* (pngBuffer: Buffer<ArrayBufferLike>) {
	return yield* Effect.logDebug(
		formattedLog('Http', `Converted SVG to PNG, size: ${pngBuffer.length} bytes`)
	);
});

/**
 * Converts a Buffer to a Uint8Array.
 *
 * @param buffer - The Buffer to convert.
 * @returns An Effect that yields the converted Uint8Array or fails with a StarHistoryError.
 */
export const convertBufferToUint8Array = (buffer: Buffer<ArrayBufferLike>) =>
	Effect.try({
		try: () => new Uint8Array(Buffer.from(buffer)),
		catch: (cause) => new StarHistoryError({ cause }),
	});

/**
 * Creates an HTTP response for a PNG image with appropriate headers.
 *
 * @param pngUint8Array - The PNG image data as a Uint8Array.
 * @returns An HTTP response containing the PNG image with content type and cache control headers.
 */
export const createHTTPResponseForPng = (pngUint8Array: Uint8Array) =>
	HttpServerResponse.uint8Array(pngUint8Array, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=86400', // Cache for 1 day
		},
	});
