import { Resvg as ResvgCore, type ResvgRenderOptions } from '@resvg/resvg-js';
import { Data, Effect } from 'effect';

/**
 * Error class representing failures from resvg-based SVG processing or rendering.
 *
 * This class extends a tagged error with the tag "ResvgError" and carries a `cause`
 * property that contains the underlying error or diagnostic information.
 *
 * Use this type to reliably identify resvg-related failures and to inspect or
 * rethrow the original cause for logging, retrying, or user feedback.
 *
 * @public
 * @remarks
 * The `cause` property is typed as `unknown`; callers should narrow it (for example
 * via `instanceof` or type guards) before accessing error-specific properties.
 *
 * @example
 * try {
 *   // invoke resvg rendering code
 * } catch (err) {
 *   if (err instanceof ResvgError) {
 *     console.error('Resvg failed:', err.cause);
 *   }
 *   throw err;
 * }
 */
export class ResvgError extends Data.TaggedError('ResvgError')<{ cause: unknown }> {}

/**
 * Wraps a synchronous computation in an Effect and maps any thrown error to a ResvgError.
 *
 * The provided function is executed lazily when the returned Effect is run. If the function
 * completes successfully, the Effect succeeds with its returned value. If the function throws
 * (or otherwise fails during evaluation), the thrown value is captured and used as the
 * `cause` to construct a new ResvgError; the returned Effect will then fail with that ResvgError.
 *
 * Use this helper to centralize resvg-related error transformation so callers uniformly
 * observe ResvgError failures from potentially-throwing synchronous operations.
 *
 * @typeParam A - The type of the successful result produced by `fn`.
 * @param fn - A synchronous function to be executed inside an Effect.
 * @returns An Effect that yields the result of `fn` on success or fails with a ResvgError
 *          containing the original thrown cause on failure.
 */
const useWithResvgError = <A>(fn: () => A) =>
	Effect.try({
		try: fn,
		catch: (cause) => new ResvgError({ cause }),
	});

/**
 * Effect-based service that provides utilities for creating and rendering SVGs using resvg.
 *
 * This service is implemented as an Effect.Service and exposes two primary effectful helpers:
 * - getResvgCore(svgString, options): constructs a `ResvgCore` instance for the given SVG content.
 * - renderToPng(svgString, options): renders the given SVG content to PNG bytes.
 *
 * Both helpers wrap resvg interactions with the library's error normalization helper (`useWithResvgError`)
 * so that native resvg exceptions are captured and surfaced through the Effect failure channel in a
 * consistent, composable way.
 *
 * @remarks
 * - Use the returned Effects inside your effectful workflows (generators or combinators) rather than
 *   constructing `ResvgCore` or calling resvg APIs directly to ensure consistent error handling.
 * - `getResvgCore` accepts a raw SVG string and an optional partial of `ResvgRenderOptions` to
 *   configure the created `ResvgCore`.
 * - `renderToPng` constructs a `ResvgCore` (via `getResvgCore`) and invokes `resvg.render().asPng()`,
 *   returning PNG bytes (Uint8Array/Buffer) suitable for disk write or network transfer.
 *
 * @example
 * // In an Effect generator context:
 * // const pngBytes = yield* resvgService.effect.renderToPng('<svg>...</svg>', { fitTo: { mode: 'width', value: 800 } });
 *
 * @public
 */
export class ResvgService extends Effect.Service<ResvgService>()('core/ResvgService', {
	effect: Effect.gen(function* () {
		/**
		 * Creates an Effect that constructs a ResvgCore instance from an SVG string.
		 *
		 * The construction is wrapped with the library's error handling via `useWithResvgError`
		 * so that any exceptions thrown during `ResvgCore` creation are captured and exposed
		 * through the Effect's failure channel.
		 *
		 * @param svgString - The SVG content to render. Should be a valid SVG document or fragment.
		 * @param options - Optional partial rendering options to customize `ResvgCore` behavior.
		 *                  Accepts any subset of `ResvgRenderOptions`.
		 * @returns An Effect that, when executed, produces a `ResvgCore` instance configured
		 *          with the provided SVG string and options.
		 * @remarks
		 * Use this Effect in effectful workflows or combinators rather than constructing
		 * `ResvgCore` directly when you want consistent error handling and composition.
		 *
		 * @example
		 * // const effect = getResvgCore('<svg>...</svg>', { fitTo: { mode: 'width', value: 800 } });
		 * // // Combine or run the effect according to your Effect runtime.
		 */
		const getResvgCore = Effect.fn('core/ResvgService.getResvgCore')(
			(svgString: string, options?: Partial<ResvgRenderOptions>) =>
				useWithResvgError(() => new ResvgCore(svgString, options))
		);

		/**
		 * Render an SVG string to a PNG image using resvg.
		 *
		 * This function creates a resvg core instance for the provided SVG markup and
		 * performs rendering inside the library's effect context. Rendering is executed
		 * through `resvg.render().asPng()` and wrapped with `useWithResvgError` to normalize
		 * and surface any native resvg errors.
		 *
		 * @param svgString - The SVG markup to render.
		 * @param options - Optional rendering options forwarded to resvg (Partial<ResvgRenderOptions>),
		 *                  e.g. background, fitTo, font, or other renderer settings.
		 * @returns An Effect that yields the rendered PNG bytes (Uint8Array / Buffer) suitable for
		 *          writing to disk, sending over the network, or further processing.
		 * @throws When resvg initialization or rendering fails; errors are mapped/normalized by
		 *         useWithResvgError.
		 * @example
		 * // In an Effect generator context:
		 * // const pngBytes = yield* renderToPng('<svg>...</svg>', { fitTo: { mode: 'width', value: 800 } });
		 */
		const renderToPng = Effect.fn('core/ResvgService.renderToPng')(function* (
			svgString: string,
			options?: Partial<ResvgRenderOptions>
		) {
			const resvg = yield* getResvgCore(svgString, options);
			return yield* useWithResvgError(() => resvg.render().asPng());
		});

		return { getResvgCore, renderToPng } as const;
	}),
}) {}

/**
 * Live ResvgService layer that supplies the default implementation to the effect environment.
 *
 * This exported value makes the ResvgService available to effects by providing
 * ResvgService.Default into the Effect environment. Use it when you need a ready-to-use,
 * runtime implementation of the ResvgService (for example during application bootstrap).
 *
 * @remarks
 * - Constructed by applying the default implementation to the ResvgService via Effect.provide.
 * - Suitable for production or integration usage where the default behavior is desired.
 *
 * @example
 * // Provide the live service to an effect that requires ResvgService:
 * // Effect.provide(yourEffect, ResvgServiceLive)
 */
export const ResvgServiceLive = ResvgService.pipe(Effect.provide(ResvgService.Default));
