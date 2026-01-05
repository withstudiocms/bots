import { Context, Effect, Fiber, Layer, Queue, Scope } from 'effect';

type Repository = {
	owner: string;
	name: string;
};

/**
 * Define the available application events with their payloads.
 */
type AvailableAppEvents = {
	// this example is left here for reference with the examples below
	// 'user.created': { userId: string; name: string };
	'crowdin.create': { repository: Repository; payload: { pull_request_url: string } };
	'test.event': { message: string };
};

/**
 * Discriminated union type of application events derived from `AvailableAppEvents`.
 *
 * For each key `K` in `AvailableAppEvents`, this type produces an object
 * shaped `{ type: K; payload: AvailableAppEvents[K] }` and unions all such
 * objects into a single `AppEvents` type.
 *
 * The `type` field serves as the discriminant, so narrowing on `event.type`
 * (e.g. in a `switch` statement) will correctly narrow the corresponding
 * `payload` type to `AvailableAppEvents[K]`.
 *
 * Notes:
 * - This type automatically stays in sync with changes to `AvailableAppEvents`.
 * - Useful for strongly-typed event handlers, reducers, and message dispatchers.
 *
 * @example
 * const handle = (event: AppEvents) => {
 *   switch (event.type) {
 *     case "someEventKey":
 *       // event.payload is inferred as AvailableAppEvents["someEventKey"]
 *       break;
 *   }
 * };
 */
export type AppEvents = {
	[K in keyof AvailableAppEvents]: { type: K; payload: AvailableAppEvents[K] };
}[keyof AvailableAppEvents];

/**
 * A strongly-typed asynchronous event bus for publishing and subscribing to application events.
 *
 * The EventBus exposes two primary effectful operations:
 * - publish: emit a concrete AppEvents union member as an effect.
 * - subscribe: register a handler for a specific event type; the handler receives the correctly-typed
 *   variant of AppEvents and returns an effect to be executed when an event of that type is delivered.
 *
 * Both operations return an Effect.Effect<void>, representing an effectful (and potentially asynchronous)
 * registration or delivery operation rather than performing work immediately.
 *
 * @remarks
 * - publish accepts an event of type AppEvents and wraps the emission in an effect. The generic parameter
 *   on publish restricts the event argument to a particular variant of the AppEvents union.
 * - subscribe is keyed by an event type literal (one of AppEvents['type']). The handler argument is typed
 *   using Extract<AppEvents, { type: E }>, ensuring the handler receives the precise payload shape for that type.
 * - The returned Effect from subscribe represents the act of registering the handler; the handler itself
 *   returns an Effect that will be executed whenever a matching event is published.
 * - Implementations may choose how to manage handler lifecycle, ordering, concurrency, error handling, and
 *   unsubscription; callers should consult the concrete implementation for semantics such as deduplication,
 *   delivery guarantees, and backpressure.
 *
 * @example
 * // Publish an event (conceptual)
 * // await effectRuntime.run(eventBus.publish({ type: 'user.created', id: 'u1', ... }));
 *
 * // Subscribe to events (conceptual)
 * // const register = eventBus.subscribe('user.created', event => Effect.succeed(handle(event)));
 * // await effectRuntime.run(register);
 */
export interface EventBus {
	readonly publish: <E extends AppEvents>(event: E) => Effect.Effect<void>;
	readonly subscribe: <E extends AppEvents['type']>(
		eventType: E,
		handler: (event: Extract<AppEvents, { type: E }>) => Effect.Effect<void>
	) => Effect.Effect<void>;
}

/**
 * Tag used to identify and retrieve the application-wide event bus from the Context.
 *
 * This constant is a GenericTag that associates the runtime identifier "EventBus"
 * with the EventBus implementation type inside the application's dependency/context container.
 * It enables type-safe registration and resolution of the shared event-bus instance.
 *
 * Remarks:
 * - Register a concrete event-bus implementation against this tag in the Context so it can be resolved elsewhere.
 * - Resolve or inject the tagged value when a component needs to publish or subscribe to application events.
 * - Because this is a GenericTag, the container preserves the declared EventBus type for callers.
 *
 * Example:
 * // Registering an instance (pseudo-code)
 * // context.register(EventBus, new InMemoryEventBus());
 *
 * // Resolving an instance (pseudo-code)
 * // const bus = context.get(EventBus);
 *
 * @public
 * @readonly
 */
export const EventBus = Context.GenericTag<EventBus>('EventBus');

/**
 * Creates an event bus inside an Effect scope.
 *
 * Remarks:
 * - When the returned Effect is executed it:
 *   1. Creates an unbounded internal queue for incoming events.
 *   2. Creates an in-memory listeners map keyed by event.type.
 *   3. Starts a long-running, forked processor fiber that:
 *      - Repeatedly takes events from the queue.
 *      - Looks up all handlers for the event's type.
 *      - Executes all handlers concurrently (unbounded concurrency) and
 *        catches and logs errors from individual handlers so a failing
 *        handler does not stop processing other handlers or subsequent events.
 *   4. Registers a finalizer on the current scope that interrupts the processor
 *      fiber and logs when the processor stops.
 *
 * Behavior and concurrency:
 * - publish enqueues events into the internal queue; enqueuing is performed
 *   as an Effect.
 * - Handlers are executed concurrently without a built-in limit; use external
 *   synchronization if bounded concurrency or ordering is required.
 * - Errors thrown by handlers are caught and logged per-handler; they do not
 *   propagate to or interrupt the processor loop.
 *
 * Lifecycle and resource management:
 * - The processor fiber runs as long as the scope remains open. Closing the
 *   scope will interrupt the processor fiber via the registered finalizer.
 * - subscribe registers handlers in-memory and does not provide an unsubscribe
 *   mechanism; repeated subscriptions will accumulate handlers in the map.
 *
 * Types:
 * - The implementation assumes an application-wide discriminated union type
 *   AppEvents with a string literal 'type' discriminator.
 * - publish accepts any member of AppEvents and returns an Effect that offers
 *   the event to the internal queue.
 * - subscribe is generic over the event type literal and accepts a handler
 *   whose argument is narrowed to the corresponding AppEvents variant; it
 *   returns an Effect that registers the handler.
 *
 * Example (conceptual):
 * const eventBusEffect = makeEventBus;
 * // run effect to obtain bus, then call bus.publish(...) and bus.subscribe(...)
 *
 * @returns An Effect resolving to an object with:
 *   - publish: <E extends AppEvents>(event: E) => Effect.Effect<boolean>
 *     (enqueue the event)
 *   - subscribe: <E extends AppEvents['type']>(
 *       eventType: E,
 *       handler: (event: Extract<AppEvents, { type: E }>) => Effect.Effect<void>
 *     ) => Effect.Effect<void> (register a handler for the event type)
 */
const makeEventBus = Effect.gen(function* () {
	const [queue, listeners, scope] = yield* Effect.all([
		Queue.unbounded<AppEvents>(),
		Effect.sync(() => new Map<string, Array<(event: AppEvents) => Effect.Effect<void>>>()),
		Effect.scope,
	]);

	// Start the event processor fiber
	const processorFiber = yield* Effect.fork(
		Effect.forever(
			Effect.gen(function* () {
				const event = yield* Queue.take(queue);
				const handlers = listeners.get(event.type) || [];

				yield* Effect.all(
					handlers.map((handler) =>
						Effect.catchAll(handler(event), (error) =>
							Effect.logError(`Event handler error for ${event.type}`, error)
						)
					),
					{ concurrency: 'unbounded' }
				);
			})
		)
	);

	// Add cleanup finalizer to interrupt the processor fiber when scope closes
	yield* Scope.addFinalizer(
		scope,
		Fiber.interrupt(processorFiber).pipe(
			Effect.flatMap(() => Effect.log('EventBus processor stopped'))
		)
	);

	return {
		/**
		 * Enqueue an event for processing.
		 */
		publish: <E extends AppEvents>(event: E) => Queue.offer(queue, event),

		/**
		 * Register a handler for a specific event type.
		 */
		subscribe: <E extends AppEvents['type']>(
			eventType: E,
			handler: (event: Extract<AppEvents, { type: E }>) => Effect.Effect<void>
		) =>
			Effect.sync(() => {
				const handlers = listeners.get(eventType) || [];
				handlers.push(handler as (event: AppEvents) => Effect.Effect<void>);
				listeners.set(eventType, handlers);
			}),
	};
});

/**
 * A Layer-scoped live implementation of the EventBus service.
 *
 * @remarks
 * This Layer binding supplies a concrete, runtime EventBus created by the
 * makeEventBus factory. It is intended to be provided into application layers
 * so that components depending on the EventBus interface receive a working,
 * scope-local instance.
 *
 * The binding is scoped according to Layer semantics, so each provided scope
 * gets its own EventBus instance (lifecycle managed by the Layer system).
 *
 * @example
 * // Provide the live EventBus to an application layer
 * const appLayer = Layer.provideSome(baseLayer, EventBusLive);
 *
 * @public
 * @see EventBus
 * @see makeEventBus
 */
export const EventBusLive = Layer.scoped(EventBus, makeEventBus);

// export const setupEmailService = Effect.gen(function* () {
// 	const eventBus = yield* EventBus;

// 	// Subscribe to user created
// 	yield* eventBus.subscribe('user.created', (event) =>
// 		Effect.gen(function* () {
// 			yield* Effect.log(`📧 Sending welcome email to ${event.payload.name}`);
// 			// Simulate sending email
// 			yield* Effect.sleep('100 millis');
// 			yield* Effect.log(`✅ Welcome email sent to ${event.payload.name}`);
// 		})
// 	);

// 	yield* Effect.log('Email service initialized');
// });

// export const createUser = (name: string) =>
// 	Effect.gen(function* () {
// 		const eventBus = yield* EventBus;
// 		const userId = crypto.randomUUID();

// 		// Simulate user creation
// 		yield* Effect.log(`Creating user: ${name}`);

// 		// Publish the event
// 		yield* eventBus.publish({
// 			type: 'user.created',
// 			payload: { userId, name },
// 		});

// 		return userId;
// 	});

// export const moduleExample = Effect.gen(function* () {
// 	// Each module can initialize independently
// 	yield* setupEmailService;

// 	// Do some work
// 	const userId = yield* createUser('Bob');

// 	yield* Effect.sleep('500 millis');
// 	yield* Effect.log(`User created with ID: ${userId}`);
// });
