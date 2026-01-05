import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { contributing } from '../static/embeds.ts';
import { httpPublicDomain } from '../static/env.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Initializes and registers the "contribute" interaction command.
 *
 * This Effect:
 * - Resolves the InteractionsRegistry and the public bot domain.
 * - Builds a global "contribute" interaction that responds with a CHANNEL_MESSAGE_WITH_SOURCE
 *   containing an embed produced by `contributing(botDomain)`.
 * - Adds the command to the global interaction builder and attaches error logging to the add operation.
 * - Registers the built interaction in the registry and logs a debug message once registration is complete.
 *
 * Notes:
 * - Errors that occur while adding the command to the builder are caught and logged via `catchAllCause`.
 * - Registration failures from `registry.register` will be emitted as Effect failures.
 *
 * @returns An Effect that, when executed, registers the "contribute" interaction and performs related logging.
 */
const make = Effect.gen(function* () {
	const [registry, botDomain] = yield* Effect.all([InteractionsRegistry, httpPublicDomain]);

	const contributeCommand = Ix.global(
		{
			name: 'contribute',
			description: 'Creates a contributing guide for the current channel',
		},
		Effect.succeed(
			Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					embeds: [contributing(botDomain)],
				},
			})
		)
	);

	const ix = Ix.builder.add(contributeCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('Contribute', 'Interactions registered and running.')),
	]);
});

/**
 * Live, scoped layer for the Contribute embed service.
 *
 * This layer is created by applying Layer.scopedDiscard to the service
 * constructor (`make`), producing a provider that:
 * - instantiates a fresh service instance for each scope, and
 * - automatically discards (cleans up) that instance when the scope ends.
 *
 * Use this layer to provide the production/live implementation of the
 * Contribute embed functionality to an application or a request-local scope.
 *
 * Remarks:
 * - The `make` function is responsible for constructing the service and for
 *   any resource allocation that must be released when the layer is discarded.
 * - Because the layer is scoped, consumers that require stable, shared state
 *   across scopes should obtain the service within the same scope.
 *
 * Example:
 * // Provide the live Contribute implementation to a program or scope.
 * // program.provideLayer(ContributeLive)
 *
 * @public
 * @constant
 */
export const ContributeLive = Layer.scopedDiscard(make);
