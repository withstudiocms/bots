/** biome-ignore-all lint/style/noNonNullAssertion: allowed */
import { Discord, DiscordREST, UI } from 'dfx/index';
import { eq } from 'drizzle-orm';
import { Effect, pipe } from 'effect';
import type { Octokit } from 'octokit';
import { DatabaseLive } from '../core/db-client.ts';
import type { ptalTable } from '../core/db-schema.ts';
import { Github } from '../core/github.ts';
import { DiscordEmbedBuilder } from './embed-builder.ts';

// Brand / Purple
const BRAND_COLOR = 0xa581f3;

// Draft / Grey
const DRAFT_COLOR = 0xcccccc;

// Success / Green
const SUCCESS_COLOR = 0x22c95f;

// Danger / Red
const DANGER_COLOR = 0x9c0238;

/**
 * Represents the possible states of a pull request.
 */
export type PullRequestState = 'draft' | 'waiting' | 'approved' | 'changes' | 'merged';

/**
 * Represents a GitHub pull request.
 */
export type PullRequest = Awaited<ReturnType<Octokit['rest']['pulls']['get']>>['data'];

/**
 * Represents the collection of review replies associated with a pull request.
 */
export type PullRequestReplies = Awaited<
	ReturnType<Octokit['rest']['pulls']['listReviews']>
>['data'];

/**
 * Represents the status of a review on a pull request.
 */
export enum ReviewStatus {
	COMMENTED = 0,
	APPROVED = 1,
	CHANGES_REQUESTED = 2,
	UNKNOWN = 3,
}

/**
 * Represents a review on a pull request.
 *
 * @property author - The username of the reviewer.
 * @property status - The status of the review, represented by the ReviewStatus enum.
 */
export type Review = {
	author: string;
	status: ReviewStatus;
};

/**
 * Summary information for a parsed pull request used by the application.
 *
 * The structure provides a compact representation of a pull request suitable for
 * UI rendering and business logic: a color indicator, a typed status with a human
 * readable label, the PR title, and the associated reviews.
 *
 * @remarks
 * - `PullRequestState` and `Review` are referenced types used for `status.type` and `reviews` respectively.
 *
 * @property color - Numeric color value associated with the PR (commonly an RGB/hex integer used for badges).
 * @property status - Object containing the PR's state and a human-friendly label:
 *   - `type`: the machine-readable state (`PullRequestState`).
 *   - `label`: a human-readable label for the state.
 * @property title - The pull request title.
 * @property reviews - Array of `Review` objects representing reviews on the pull request.
 */
export type ParsedPR = {
	color: number;
	status: {
		type: PullRequestState;
		label: string;
	};
	title: string;
	reviews: Review[];
};

/**
 * Options used to construct a PTA embed for a pull request.
 *
 * Contains the pull request data, associated review replies, a description to show
 * in the embed, the canonical pull request URL, and the guild/server ID where the
 * embed will be used or posted.
 *
 * @property pr - The PullRequest object to render in the embed (title, author, branch, status, etc.).
 * @property reviewList - Collection of replies or review comments associated with the pull request; used to display review state or conversation snippets.
 * @property description - A short description or summary to include in the embed; may include plaintext or markdown.
 * @property pullRequestUrl - The URL pointing to the pull request resource.
 * @property guildId - Identifier of the guild/server where the embed will be posted or associated.
 */
interface MakePTALEmbedOpts {
	pr: PullRequest;
	reviewList: PullRequestReplies;
	description: string;
	pullRequestUrl: URL;
	guildId: string;
}

/**
 * Returns the relevant emoji for a given status enum
 * @param status The enum
 * @returns The emoji
 */
const getReviewEmoji = (status: ReviewStatus) => {
	if (status === ReviewStatus.APPROVED) return ':white_check_mark:';
	if (status === ReviewStatus.CHANGES_REQUESTED) return ':no_entry_sign:';
	if (status === ReviewStatus.COMMENTED) return ':speech_balloon:';

	return ':question:';
};

/**
 * Converts a GitHub review status to a type-safe enum
 * @param status The review status from GitHub
 * @returns A review status enum value
 */
const convertStateToStatus = (status: string): ReviewStatus => {
	if (status === 'COMMENTED') return ReviewStatus.COMMENTED;
	if (status === 'APPROVED') return ReviewStatus.APPROVED;
	if (status === 'CHANGES_REQUESTED') return ReviewStatus.CHANGES_REQUESTED;
	return ReviewStatus.UNKNOWN;
};

/**
 * Handles the logic for parsing the review and PR data to reliably get a status.
 * @param pr The PR data
 * @param reviews The review data
 * @returns A pull request state
 */
const computePullRequestStatus = (
	pr: PullRequest,
	reviews: Map<string, string>
): PullRequestState => {
	if (pr.draft) {
		return 'draft';
	}

	if (pr.merged) {
		return 'merged';
	}

	if (!pr.mergeable || reviews.size === 0 || pr.mergeable_state === 'blocked') {
		return 'waiting';
	}

	const reviewAuthors = Array.from(reviews.keys());

	if (reviewAuthors.find((author) => reviews.get(author) === 'CHANGES_REQUESTED')) {
		return 'changes';
	}

	if (
		pr.mergeable &&
		!reviewAuthors.find((author) => reviews.get(author) === 'CHANGES_REQUESTED')
	) {
		return 'approved';
	}

	return 'waiting';
};

/**
 * Map for converting a PR state to the matching Discord label
 */
const prStatusMap = new Map<PullRequestState, string>([
	['draft', ':white_circle: Draft'],
	['approved', ':white_check_mark: Approved'],
	['changes', ':no_entry_sign: Changes requested'],
	['merged', ':purple_circle: Merged'],
	['waiting', ':hourglass: Awaiting reviews'],
]);

const prStatusColors = new Map<PullRequestState, number>([
	['draft', DRAFT_COLOR],
	['approved', SUCCESS_COLOR],
	['changes', DANGER_COLOR],
	['merged', SUCCESS_COLOR],
	['waiting', BRAND_COLOR],
]);

/**
 * Takes in a PR and parses it for easy use in the Discord API.
 * @param pr The pr response data
 * @param reviews The reviews response data
 * @returns Parsed data
 */
export const parsePullRequest = (pr: PullRequest, reviews: Map<string, string>): ParsedPR => {
	const status = computePullRequestStatus(pr, reviews);

	const reviewAuthors = Array.from(reviews.keys());

	return {
		color: prStatusColors.get(status)!,
		status: {
			type: status,
			label: prStatusMap.get(status)!,
		},
		title: pr.title,
		reviews: reviewAuthors.map((author) => ({
			author,
			status: convertStateToStatus(reviews.get(author)!),
		})),
	};
};

/**
 * Creates the payloads required to post or edit a "PTAL / Ready for Review" Discord message for a GitHub pull request.
 *
 * This Effect-powered generator:
 * - Reads guild configuration from the database to determine an optional PTAL announcement role.
 * - Consolidates the supplied review list to the latest unique state per reviewer.
 * - Parses the provided pull request to determine title, status, reviews, and embed color (via parsePullRequest).
 * - Builds a Discord embed summarizing repository, status, and reviews, and attaches "View on GitHub" and "View Changed Files" link buttons.
 * - Constructs both an interaction response payload (for new messages) and an edit payload (for updating existing messages).
 *
 * @param opts - Options for building the PTAL embed.
 * @param opts.pr - Pull request object (shape expected by parsePullRequest) used to derive title, status, reviews and color.
 * @param opts.reviewList - Array of review objects returned by GitHub; used to derive the latest review state per reviewer.
 * @param opts.description - Human-readable description/body to include above the embed content.
 * @param opts.pullRequestUrl - URL instance pointing to the pull request (must contain '/pull/' in its pathname).
 * @param opts.guildId - Discord guild identifier used to look up guild settings (e.g. PTAL announcement role) in the database.
 *
 * @returns An object containing:
 * - newInteraction: CreateInteractionResponseRequest — payload suitable for responding to an interaction with a new channel message.
 * - edit: MessageEditRequestPartial — payload suitable for editing an existing message.
 *
 * @throws If the database lookup fails or required input is malformed (for example, if pullRequestUrl does not contain a '/pull/' segment).
 *
 * @remarks
 * - If a PTAL announcement role is configured for the guild, the role will be pinged and included in allowed_mentions; otherwise no role mention is included.
 * - The function performs no external HTTP calls to GitHub itself — it only uses the provided pr and reviewList data.
 * - The exact shapes expected for `pr` and items in `reviewList` must be compatible with the internal parsePullRequest and getReviewEmoji helpers.
 */
export const makePTALEmbed = Effect.fn('MakePtalEmbed')(function* (opts: MakePTALEmbedOpts) {
	// Destructure options
	const { pr, reviewList, description, pullRequestUrl, guildId } = opts;

	// Get database client
	const db = yield* DatabaseLive;

	const dbData = yield* db.execute((c) =>
		c.select().from(db.schema.guilds).where(eq(db.schema.guilds.id, guildId)).get()
	);
	const ptalRoleId = dbData?.ptal_announcement_role;

	const splitPath = pullRequestUrl.pathname.split('/pull/');
	const [owner, repo] = splitPath[0].slice(1).split('/');

	const seen = new Map<string, string>();

	yield* Effect.try(() => {
		for (const review of reviewList) {
			if (!review.user) continue;

			const seenReview = seen.get(review.user.login);

			if (seenReview && seenReview === review.state) continue;

			seen.delete(review.user.login);
			seen.set(review.user.login, review.state);
		}
	});

	const { reviews, status, title, color } = parsePullRequest(pr, seen);

	const role_ping = ptalRoleId ? `<@&${ptalRoleId}>\n` : '';

	const message = `${role_ping}# PTAL / Ready for Review\n\n${description}`;

	const embed = new DiscordEmbedBuilder()
		.setTitle(title)
		.setColor(color)
		.setTimestamp(new Date())
		.addFields([
			{
				name: 'Repository',
				value: `[${owner}/${repo}](${pullRequestUrl.toString().split('/pull/')[0]})`,
			},
			{
				name: 'Status',
				value: status.label,
			},
			{
				name: 'Reviews',
				value:
					reviews
						.map(
							(review) =>
								`${getReviewEmoji(review.status)} [@${review.author}](https://github.com/${review.author})`
						)
						.join('\n') || '*No reviews yet*',
			},
		])
		.build();

	const viewOnGithub = UI.button({
		label: 'View on GitHub',
		style: Discord.ButtonStyleTypes.LINK,
		url: pullRequestUrl.href,
	});

	const viewFilesChanged = UI.button({
		label: 'View Changed Files',
		style: Discord.ButtonStyleTypes.LINK,
		url: new URL(`${pullRequestUrl.href}/files`).href,
	});

	const buttonRow = UI.row([viewOnGithub, viewFilesChanged]);

	const commonData = {
		content: message,
		embeds: [embed],
		components: [buttonRow],
		allowed_mentions: {
			roles: ptalRoleId ? [ptalRoleId] : [],
		},
	};

	return {
		newInteraction: {
			type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
			data: commonData,
		},
		edit: commonData,
	};
});

/**
 * Edits an existing "PTAL" embed message in Discord based on the current state of a GitHub pull request.
 *
 * This Effect-powered generator:
 * - Acquires the DatabaseLive, Github and DiscordREST services.
 * - Fetches the GitHub pull request and its review list, and fetches the Discord channel for the stored channel id in parallel.
 * - If the channel is not found or is not a guild text channel, the effect returns early (no-op).
 * - Retrieves the original Discord message identified by the stored message id.
 * - Builds an updated PTAL embed using makePTALEmbed (providing the PR, review list, description and a constructed PR URL).
 * - Updates the original Discord message with the new embed.
 * - If the pull request is merged, removes the corresponding PTAL row from the database.
 *
 * Concurrency/ordering:
 * - Initial service acquisition and the first set of network calls (pull request, reviews, channel) are performed in parallel where possible.
 * - Message fetch, embed creation and message update happen sequentially after the channel/PR data is available.
 *
 * Side effects:
 * - Updates a message in Discord.
 * - May delete a row from the ptal table in the database if the PR is merged.
 *
 * Error handling:
 * - Failures from GitHub, Discord or the database will surface as failures of the returned Effect (i.e. the effect will fail with the underlying error).
 *
 * @param data - A row-like object inferred from ptalTable (ptalTable.$inferSelect) containing at least:
 *   - owner: string — GitHub repository owner
 *   - repository: string — GitHub repository name
 *   - pr: number — pull request number
 *   - channel: string — Discord channel id containing the PTAL message
 *   - message: string — Discord message id to edit
 *   - description?: string — optional description used when constructing the embed
 *   - id: unknown — primary id of the ptalTable row (used for deletion if merged)
 *
 * @returns An Effect that completes when the embed has been edited (and the DB row deleted if applicable).
 */
export const editPTALEmbed = Effect.fn('EditPtalEmbed')(function* (
	data: typeof ptalTable.$inferSelect
) {
	const [db, github, rest] = yield* Effect.all([DatabaseLive, Github, DiscordREST]);

	const getGHPullRequest = github.wrap((_) => _.pulls.get);
	const getGHPullReviewList = github.wrap((_) => _.pulls.listReviews);

	const [pullReq, reviewList, channel] = yield* Effect.all([
		getGHPullRequest({
			owner: data.owner,
			repo: data.repository,
			pull_number: data.pr,
		}),
		getGHPullReviewList({
			owner: data.owner,
			repo: data.repository,
			pull_number: data.pr,
		}),
		rest.getChannel(data.channel),
	]);

	if (!channel || channel.type !== Discord.ChannelTypes.GUILD_TEXT) return;

	const originalMessage = yield* pipe(Effect.sleep('1 seconds'), () =>
		rest.getMessage(data.channel, data.message)
	);

	const pullRequestUrl = new URL(
		`https://github.com/${data.owner}/${data.repository}/pull/${data.pr}`
	);

	const { edit } = yield* makePTALEmbed({
		pr: pullReq,
		reviewList: reviewList,
		description: data.description,
		pullRequestUrl,
		guildId: channel.guild_id,
	});

	yield* pipe(Effect.sleep('1 seconds'), () =>
		rest.updateMessage(channel.id, originalMessage.id, edit)
	);

	if (pullReq.merged) {
		yield* db.execute((c) =>
			c.delete(db.schema.ptalTable).where(eq(db.schema.ptalTable.id, data.id))
		);
	}
});
