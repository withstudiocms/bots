/** biome-ignore-all lint/suspicious/noExplicitAny: Working with a dynamic api */
import type { Api } from '@octokit/plugin-rest-endpoint-methods';
import type { OctokitResponse } from '@octokit/types';
import { Chunk, Data, Effect, Option, Redacted, Stream } from 'effect';
import { App, type Octokit } from 'octokit';
import {
	githubAppId,
	githubInstallationId,
	githubPrivateKey,
	githubWebhookSecret,
} from '../static/env.ts';

/**
 * Represents an error specific to GitHub operations within the application.
 *
 * @extends Data.TaggedError
 * @template { cause: unknown }
 *
 * @property {unknown} cause - The underlying cause of the GitHub error.
 */
export class GithubError extends Data.TaggedError('GithubError')<{
	readonly cause: unknown;
}> {}

let app: App | undefined;
let octokit: Octokit | undefined;

/**
 * Initializes and returns an authenticated Octokit instance and App for a GitHub App installation.
 *
 * If the Octokit instance or App has not been created yet, this function will instantiate them
 * using the provided configuration. Subsequent calls will reuse the existing instances.
 *
 * @param config - The configuration object for the GitHub App.
 * @param config.appId - The GitHub App's identifier.
 * @param config.privateKey - The private key for the GitHub App, in PEM format.
 * @param config.installationId - The installation ID for the GitHub App.
 * @param config.webhookSecret - The webhook secret for the GitHub App.
 * @returns An object containing the authenticated `octokit` instance and the `app` instance.
 */
async function getOctoApp(config: {
	appId: string;
	privateKey: string;
	installationId: string;
	webhookSecret: string;
}) {
	if (!octokit || !app) {
		app = new App({
			appId: config.appId,
			privateKey: config.privateKey,
			webhooks: {
				secret: config.webhookSecret,
			},
		});

		octokit = await app.getInstallationOctokit(Number.parseInt(config.installationId, 10));
	}

	return { octokit, app };
}

/**
 * Provides a Github service integrated with Effect for dependency injection and effectful operations.
 *
 * This service initializes a Github App using configuration values (APP_ID, INSTALLATION_ID, PRIVATE_KEY, WEBHOOK_SECRET)
 * and exposes utility methods for interacting with the Github REST API and webhooks in a type-safe, effectful manner.
 *
 * @remarks
 * - Uses `Effect.gen` to sequence configuration and initialization.
 * - Wraps Octokit REST API and webhooks for use in an Effect system.
 * - Provides helpers for effectful requests, wrapping API methods, and paginated streaming.
 * - Handles errors by wrapping them in a `GithubError`.
 *
 * @example
 * ```typescript
 * const github = await Github;
 * const user = await github.wrap(rest => rest.users.getByUsername)({ username: "octocat" });
 * ```
 *
 * @property request
 *   Runs an effectful Github REST API request, capturing errors as `GithubError`.
 * @property wrap
 *   Wraps a REST API method for effectful invocation, returning only the `.data` property.
 * @property stream
 *   Streams paginated Github REST API responses as an Effect stream.
 * @property rest
 *   The raw Octokit REST API client.
 * @property webhooks
 *   The initialized Github App webhooks handler.
 */
export class Github extends Effect.Service<Github>()('app/Github', {
	effect: Effect.gen(function* () {
		const appId = yield* githubAppId;
		const installationId = yield* githubInstallationId;
		const privateKey = yield* githubPrivateKey;
		const webhookSecret = yield* githubWebhookSecret;

		const { app, octokit } = yield* Effect.tryPromise({
			try: () =>
				getOctoApp({
					appId: Redacted.value(appId),
					installationId: Redacted.value(installationId),
					privateKey: Redacted.value(privateKey).replace(/\\n/g, '\n'),
					webhookSecret: Redacted.value(webhookSecret),
				}),
			catch: (cause) => new GithubError({ cause }),
		});

		const rest: Api['rest'] = octokit.rest;
		const webhooks: App['webhooks'] = app.webhooks;

		const request = <A>(f: (_: Api['rest']) => Promise<A>) =>
			Effect.withSpan(
				Effect.tryPromise({
					try: () => f(rest as any),
					catch: (cause) => new GithubError({ cause }),
				}),
				'Github.request'
			);

		const wrap =
			<A, Args extends Array<any>>(
				f: (_: Api['rest']) => (...args: Args) => Promise<OctokitResponse<A>>
			) =>
			(...args: Args) =>
				Effect.map(
					Effect.tryPromise({
						try: () => f(rest as any)(...args),
						catch: (cause) => new GithubError({ cause }),
					}),
					(_) => _.data
				);

		const stream = <A>(f: (_: Api['rest'], page: number) => Promise<OctokitResponse<Array<A>>>) =>
			Stream.paginateChunkEffect(0, (page) =>
				Effect.map(
					Effect.tryPromise({
						try: () => f(rest as any, page),
						catch: (cause) => new GithubError({ cause }),
					}),
					(_) => [Chunk.unsafeFromArray(_.data), maybeNextPage(page, _.headers.link)]
				)
			);

		return {
			request,
			wrap,
			stream,
			rest: rest as Api['rest'],
			webhooks: webhooks as App['webhooks'],
		} as const;
	}),
}) {}

/**
 * Determines the next page number for paginated GitHub API responses based on the presence of a "next" relation in the Link header.
 *
 * @param page - The current page number.
 * @param linkHeader - The optional Link header string from the GitHub API response.
 * @returns An Option containing the next page number if a "next" relation exists in the Link header; otherwise, None.
 */
const maybeNextPage = (page: number, linkHeader?: string) =>
	Option.fromNullable(linkHeader).pipe(
		Option.filter((_) => _.includes(`rel="next"`)),
		Option.as(page + 1)
	);
