import { Schema } from 'effect';

/**
 * Schema for a GitHub license object included in webhook payloads.
 *
 * - key: Unique machine-readable key for the license (for example: "mit").
 * - name: Human-readable license name (for example: "MIT License").
 * - spdx_id: SPDX identifier for the license (for example: "MIT"); may be an
 *   alternate value such as "NOASSERTION" depending on the source.
 * - url: Nullable URL to the license resource in the REST API (string or null)
 *   when the license resource is available; null otherwise.
 * - node_id: GraphQL node identifier for the license.
 *
 * @remarks
 * Use this schema to validate or type-check license objects delivered by
 * GitHub webhooks or returned by the GitHub REST API.
 *
 * @see https://docs.github.com/en/rest/licenses/licenses
 */
export const LicenseSchema = Schema.Struct({
	key: Schema.String,
	name: Schema.String,
	spdx_id: Schema.String,
	url: Schema.NullOr(Schema.String),
	node_id: Schema.String,
});

/**
 * Schema describing a GitHub user object as returned in webhook payloads and API responses.
 *
 * Represents the validated shape for a user identity:
 *
 * @property login - The user's username (handle).
 * @property id - The numeric GitHub user ID.
 * @property node_id - The GraphQL global node identifier for the user.
 * @property name - Optional display name / full name of the user.
 * @property email - Optional email address; may be null.
 * @property avatar_url - URL to the user's avatar image.
 * @property gravatar_id - Gravatar identifier (may be an empty string).
 * @property url - API URL for the user resource.
 * @property html_url - Public web URL to the user's GitHub profile.
 * @property followers_url - API URL to list the user's followers.
 * @property following_url - Template API URL for the users the user is following (may include placeholders).
 * @property gists_url - Template API URL for the user's gists.
 * @property starred_url - Template API URL for repositories the user has starred.
 * @property subscriptions_url - API URL for the user's subscriptions.
 * @property organizations_url - API URL to list the user's organizations.
 * @property repos_url - API URL to list the user's repositories.
 * @property events_url - Template API URL for the user's events.
 * @property received_events_url - API URL for events received by the user.
 * @property type - The account type: one of 'Bot', 'User', or 'Organization'.
 * @property site_admin - True if the user is a GitHub site administrator (staff).
 *
 * @remarks
 * This comment documents the runtime schema produced by Schema.Struct and associated validators.
 */
export const UserSchema = Schema.Struct({
	login: Schema.String,
	id: Schema.Number,
	node_id: Schema.String,
	name: Schema.optional(Schema.String),
	email: Schema.optional(Schema.NullOr(Schema.String)),
	avatar_url: Schema.String,
	gravatar_id: Schema.String,
	url: Schema.String,
	html_url: Schema.String,
	followers_url: Schema.String,
	following_url: Schema.String,
	gists_url: Schema.String,
	starred_url: Schema.String,
	subscriptions_url: Schema.String,
	organizations_url: Schema.String,
	repos_url: Schema.String,
	events_url: Schema.String,
	received_events_url: Schema.String,
	type: Schema.Union(Schema.Literal('Bot'), Schema.Literal('User'), Schema.Literal('Organization')),
	site_admin: Schema.Boolean,
});

/**
 * Schema describing a GitHub repository object as received in webhook payloads.
 *
 * Represents the canonical repository shape used throughout webhook events:
 *
 * Properties:
 * - id: number — Numeric repository identifier.
 * - node_id: string — GraphQL/Node identifier.
 * - name: string — Repository name (short).
 * - full_name: string — Repository name including owner (e.g., "owner/name").
 * - private: boolean — Whether the repository is private.
 * - owner: UserSchema — Owner object (user or organization).
 * - html_url: string — Web URL to the repository.
 * - description: string | null — Repository description; may be null.
 * - fork: boolean — Whether the repository is a fork.
 * - url, forks_url, keys_url, collaborators_url, teams_url, hooks_url, issue_events_url,
 *   events_url, assignees_url, branches_url, tags_url, blobs_url, git_tags_url, git_refs_url,
 *   trees_url, statuses_url, languages_url, stargazers_url, contributors_url, subscribers_url,
 *   subscription_url, commits_url, git_commits_url, comments_url, issue_comment_url, contents_url,
 *   compare_url, merges_url, archive_url, downloads_url, issues_url, pulls_url, milestones_url,
 *   notifications_url, labels_url, releases_url, deployments_url: string — Various API endpoint URLs.
 * - created_at: number | string — Creation timestamp (may be numeric or string).
 * - updated_at: string — Last updated timestamp (string).
 * - pushed_at: number | string | null — Last push timestamp; can be numeric, string, or null.
 * - git_url, ssh_url, clone_url, svn_url: string — VCS URLs for cloning/access.
 * - homepage: string | null — Project homepage; may be null.
 * - size: number — Size of the repository.
 * - stargazers_count, watchers_count, forks_count, forks, open_issues_count, open_issues, watchers: number — Counts.
 * - mirror_url: string | null — Mirror URL if repository is a mirror; may be null.
 * - archived: boolean — Whether the repository is archived.
 * - license: LicenseSchema | null — License information object or null if absent.
 * - default_branch: string — Default branch name (e.g., "main").
 * - is_template: boolean — Whether the repository is marked as a template.
 * - web_commit_signoff_required: boolean — Whether web commit signoff is required.
 * - topics: string[] — Array of repository topics/tags.
 * - visibility: 'public' | 'private' | 'internal' — Repository visibility.
 * - custom_properties: Record<{ key: string; value: null | string | string[] }> — A record/collection
 *   representing custom key/value properties; each entry has a string key and a value that can be
 *   null, a single string, or an array of strings.
 *
 * Remarks:
 * - Field shapes follow GitHub webhook payload conventions; some timestamp fields may be emitted
 *   as numbers or ISO strings depending on the event source/version.
 * - Many URL fields point to specific API endpoints for related resources.
 *
 * See: GitHub repository REST API object for equivalent fields and semantics.
 */
export const RepositorySchema = Schema.Struct({
	id: Schema.Number,
	node_id: Schema.String,
	name: Schema.String,
	full_name: Schema.String,
	private: Schema.Boolean,
	owner: UserSchema,
	html_url: Schema.String,
	description: Schema.NullOr(Schema.String),
	fork: Schema.Boolean,
	url: Schema.String,
	forks_url: Schema.String,
	keys_url: Schema.String,
	collaborators_url: Schema.String,
	teams_url: Schema.String,
	hooks_url: Schema.String,
	issue_events_url: Schema.String,
	events_url: Schema.String,
	assignees_url: Schema.String,
	branches_url: Schema.String,
	tags_url: Schema.String,
	blobs_url: Schema.String,
	git_tags_url: Schema.String,
	git_refs_url: Schema.String,
	trees_url: Schema.String,
	statuses_url: Schema.String,
	languages_url: Schema.String,
	stargazers_url: Schema.String,
	contributors_url: Schema.String,
	subscribers_url: Schema.String,
	subscription_url: Schema.String,
	commits_url: Schema.String,
	git_commits_url: Schema.String,
	comments_url: Schema.String,
	issue_comment_url: Schema.String,
	contents_url: Schema.String,
	compare_url: Schema.String,
	merges_url: Schema.String,
	archive_url: Schema.String,
	downloads_url: Schema.String,
	issues_url: Schema.String,
	pulls_url: Schema.String,
	milestones_url: Schema.String,
	notifications_url: Schema.String,
	labels_url: Schema.String,
	releases_url: Schema.String,
	deployments_url: Schema.String,
	created_at: Schema.Union(Schema.Number, Schema.String),
	updated_at: Schema.String,
	pushed_at: Schema.Union(Schema.Number, Schema.String, Schema.Null),
	git_url: Schema.String,
	ssh_url: Schema.String,
	clone_url: Schema.String,
	svn_url: Schema.String,
	homepage: Schema.NullOr(Schema.String),
	size: Schema.Number,
	stargazers_count: Schema.Number,
	watchers_count: Schema.Number,
	forks_count: Schema.Number,
	mirror_url: Schema.NullOr(Schema.String),
	archived: Schema.Boolean,
	open_issues_count: Schema.Number,
	license: Schema.NullOr(LicenseSchema),
	forks: Schema.Number,
	open_issues: Schema.Number,
	watchers: Schema.Number,
	default_branch: Schema.String,
	is_template: Schema.Boolean,
	web_commit_signoff_required: Schema.Boolean,
	topics: Schema.Array(Schema.String),
	visibility: Schema.Union(
		Schema.Literal('public'),
		Schema.Literal('private'),
		Schema.Literal('internal')
	),
	custom_properties: Schema.Record({
		key: Schema.String,
		value: Schema.Union(Schema.Null, Schema.String, Schema.Array(Schema.String)),
	}),
});

/**
 * Lightweight schema describing a GitHub App installation.
 *
 * This schema captures the minimal identity information for an installation
 * as returned by GitHub (commonly seen in webhook payloads or API list responses).
 *
 * Properties:
 * - id: Numeric installation identifier assigned by GitHub.
 * - node_id: Opaque GraphQL Node ID string for the installation.
 *
 * Both fields are required for the lightweight representation. Use this schema when
 * you only need to reference or identify an installation and do not require the
 * full installation object.
 *
 * @remarks
 * - `id` is a plain integer used in REST API contexts.
 * - `node_id` is a base64-encoded string used by GitHub's GraphQL API.
 *
 * @example
 * // Valid example:
 * // { id: 123456, node_id: "MDExOlB1YmxpY0..." }
 *
 * @public
 */
export const InstallationLiteSchema = Schema.Struct({
	id: Schema.Number,
	node_id: Schema.String,
});

/**
 * Schema for a GitHub Organization object as seen in webhook payloads.
 *
 * Properties:
 * @property login - Organization login (string).
 * @property id - Numeric organization ID.
 * @property node_id - GraphQL node identifier (string).
 * @property url - API URL for the organization (string).
 * @property html_url - Optional public HTML URL for the organization (string | undefined).
 * @property repos_url - URL for the organization's repositories (string).
 * @property events_url - URL for the organization's events (string).
 * @property hooks_url - URL for the organization's hooks (string).
 * @property issues_url - URL for the organization's issues (string).
 * @property members_url - URL for organization members (string).
 * @property public_members_url - URL for public members (string).
 * @property avatar_url - URL of the organization's avatar image (string).
 * @property description - Nullable description text (string | null).
 *
 * @remarks
 * This constant represents a runtime validation/struct schema (using the project's Schema helpers)
 * and is intended to validate or parse organization objects delivered by GitHub webhooks.
 */
export const OrganizationSchema = Schema.Struct({
	login: Schema.String,
	id: Schema.Number,
	node_id: Schema.String,
	url: Schema.String,
	html_url: Schema.optional(Schema.String),
	repos_url: Schema.String,
	events_url: Schema.String,
	hooks_url: Schema.String,
	issues_url: Schema.String,
	members_url: Schema.String,
	public_members_url: Schema.String,
	avatar_url: Schema.String,
	description: Schema.NullOr(Schema.String),
});

/**
 * Schema describing the payload of a GitHub "repository_dispatch" style event.
 *
 * Properties:
 * - action: A short string identifying the repository-level action or event name.
 * - branch: The branch or ref name the event is associated with (e.g. "main" or "refs/heads/feature").
 * - repository: Metadata for the repository that generated the event (validated by RepositorySchema).
 * - sender: The user or actor that triggered the event (validated by UserSchema).
 * - clientPayload: Arbitrary key/value data supplied by the repository dispatch call. Each entry
 *   has a string key and an unknown value (validated as a record of { key: string, value: unknown }).
 * - installation: Information about the GitHub App installation (validated by InstallationLiteSchema).
 * - organization: Optional organization information when the repository belongs to an organization
 *   (validated by OrganizationSchema); may be undefined for user-owned repositories.
 *
 * Remarks:
 * This schema is intended for validating inbound webhook payloads or internal messages that model
 * repository dispatch events. The clientPayload is intentionally permissive for values so callers
 * can include arbitrary structured data.
 *
 * @public
 */
export const RepositoryDispatchEventSchema = Schema.Struct({
	action: Schema.String,
	branch: Schema.String,
	repository: RepositorySchema,
	sender: UserSchema,
	client_payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
	installation: InstallationLiteSchema,
	organization: Schema.optional(OrganizationSchema),
});

/**
 * Schema describing a GitHub team "parent" object.
 *
 * Represents the core, read-only fields returned by GitHub for a team when included
 * as a parent/reference in webhooks or API responses.
 *
 * Properties:
 * - name: The team's display name.
 * - id: Numeric database identifier for the team.
 * - node_id: The GraphQL node identifier.
 * - slug: URL-friendly identifier for the team.
 * - description: Nullable textual description of the team.
 * - privacy: One of 'closed' | 'secret' | 'open' indicating team visibility.
 * - url: API endpoint URL for the team resource.
 * - html_url: Public web URL for the team.
 * - members_url: API URL template to access team members (may include template tokens).
 * - repositories_url: API URL to list repositories associated with the team.
 * - permission: Default permission string applied for the team on repositories.
 * - notification_setting: Optional; one of 'notifications_enabled' | 'notifications_disabled'.
 *
 * @example
 * // Example shape:
 * // {
 * //   name: "Engineering",
 * //   id: 123456,
 * //   node_id: "MDQ6VGVhbTEyMzQ1Ng==",
 * //   slug: "engineering",
 * //   description: null,
 * //   privacy: "closed",
 * //   url: "https://api.github.com/teams/123456",
 * //   html_url: "https://github.com/orgs/example/teams/engineering",
 * //   members_url: "https://api.github.com/teams/123456/members{/member}",
 * //   repositories_url: "https://api.github.com/teams/123456/repos",
 * //   permission: "admin",
 * //   notification_setting: "notifications_enabled"
 * // }
 */
export const TeamSchemaParent = Schema.Struct({
	name: Schema.String,
	id: Schema.Number,
	node_id: Schema.String,
	slug: Schema.String,
	description: Schema.NullOr(Schema.String),
	privacy: Schema.Union(Schema.Literal('closed'), Schema.Literal('secret'), Schema.Literal('open')),
	url: Schema.String,
	html_url: Schema.String,
	members_url: Schema.String,
	repositories_url: Schema.String,
	permission: Schema.String,
	notification_setting: Schema.optional(
		Schema.Union(Schema.Literal('notifications_enabled'), Schema.Literal('notifications_disabled'))
	),
});

/**
 * Schema for a Team object.
 *
 * Extends the fields defined in TeamSchemaParent and adds a nullable
 * `parent` property which, when present, must conform to TeamSchemaParent.
 *
 * Constructed with `Schema.Struct`, this schema is intended for runtime
 * validation and (de)serialization of team payloads (e.g., from GitHub
 * webhooks or internal APIs).
 *
 * Details:
 * - Inherits all fields from `TeamSchemaParent` via spread of `TeamSchemaParent.fields`.
 * - `parent` is nullable/optional: `Schema.NullOr(TeamSchemaParent)`.
 *
 * @public
 */
export const TeamSchema = Schema.Struct({
	...TeamSchemaParent.fields,
	parent: Schema.NullOr(TeamSchemaParent),
});

/**
 * Represents the shape of a GitHub label object as returned in webhook payloads and API responses.
 *
 * @remarks
 * The schema describes the common properties of a repository label.
 *
 * @property id - Numeric identifier of the label.
 * @property node_id - GraphQL global node identifier for the label.
 * @property url - API URL for this label resource.
 * @property name - Human-readable name of the label.
 * @property color - Hexadecimal color value for the label (typically without a leading '#').
 * @property default - Boolean indicating whether this is one of the repository's default labels.
 * @property description - Optional textual description of the label; may be null when absent.
 */
export const LabelSchema = Schema.Struct({
	id: Schema.Number,
	node_id: Schema.String,
	url: Schema.String,
	name: Schema.String,
	color: Schema.String,
	default: Schema.Boolean,
	description: Schema.NullOr(Schema.String),
});

/**
 * Schema describing a GitHub milestone object.
 *
 * This mirrors the fields returned by GitHub's REST API and webhook payloads for a milestone.
 *
 * Remarks:
 * - Date/time fields are ISO 8601 strings (e.g. "2021-01-01T00:00:00Z") or null where noted.
 * - The `creator` property refers to a user object validated by `UserSchema`.
 *
 * @property {string} url - The API URL for this milestone.
 * @property {string} html_url - The HTML URL for viewing the milestone on GitHub.
 * @property {string} labels_url - The API URL to list labels associated with issues in this milestone.
 * @property {number} id - Numeric database identifier for the milestone.
 * @property {string} node_id - GraphQL node identifier for the milestone.
 * @property {number} number - Repository-scoped milestone number.
 * @property {'open' | 'closed'} state - Current state of the milestone; either "open" or "closed".
 * @property {string} title - Human-readable title of the milestone.
 * @property {string | null} description - Optional textual description; null if not provided.
 * @property {UserSchema} creator - The user who created the milestone (validated by UserSchema).
 * @property {number} open_issues - Count of open issues assigned to the milestone.
 * @property {number} closed_issues - Count of closed issues assigned to the milestone.
 * @property {string} created_at - ISO 8601 timestamp for when the milestone was created.
 * @property {string} updated_at - ISO 8601 timestamp for the last update to the milestone.
 * @property {string | null} closed_at - ISO 8601 timestamp when the milestone was closed, or null if still open.
 * @property {string | null} due_on - ISO 8601 due date for the milestone, or null if none set.
 */
export const MilestoneSchema = Schema.Struct({
	url: Schema.String,
	html_url: Schema.String,
	labels_url: Schema.String,
	id: Schema.Number,
	node_id: Schema.String,
	number: Schema.Number,
	state: Schema.Union(Schema.Literal('open'), Schema.Literal('closed')),
	title: Schema.String,
	description: Schema.NullOr(Schema.String),
	creator: UserSchema,
	open_issues: Schema.Number,
	closed_issues: Schema.Number,
	created_at: Schema.String,
	updated_at: Schema.String,
	closed_at: Schema.NullOr(Schema.String),
	due_on: Schema.NullOr(Schema.String),
});

/**
 * Schema describing a simple hyperlink object.
 *
 * The schema requires a single property:
 * - href: string — the URL or path that the link references.
 *
 * Intended use:
 * - Validate or type-check objects that represent links with a single `href` field.
 *
 * Notes:
 * - The schema enforces that `href` is a string; callers should ensure the value is a valid URL or
 *   acceptable relative path according to their application rules.
 *
 * @example
 * // Valid according to this schema:
 * // { href: "https://example.com" }
 */
export const LinkSchema = Schema.Struct({
	href: Schema.String,
});

/**
 * Union schema for GitHub author association values.
 *
 * Represents the relationship between an actor (author/committer) and a repository as
 * emitted in GitHub webhook payloads (e.g., commits, pull requests).
 *
 * Allowed literal values:
 * - "COLLABORATOR" — The user is a collaborator on the repository.
 * - "CONTRIBUTOR" — The user has previously contributed to the repository.
 * - "FIRST_TIMER" — The user is participating for the first time (first contribution event).
 * - "FIRST_TIME_CONTRIBUTOR" — The user is contributing to this repository for the first time.
 * - "MANNEQUIN" — A placeholder account representing a removed or anonymized user.
 * - "MEMBER" — The user is a member of the organization that owns the repository.
 * - "NONE" — The user has no special association with the repository.
 * - "OWNER" — The user owns the repository.
 *
 * Use this schema to validate or document author association fields in webhook handling code.
 */
export const AuthorAssociationSchema = Schema.Union(
	Schema.Literal('COLLABORATOR'),
	Schema.Literal('CONTRIBUTOR'),
	Schema.Literal('FIRST_TIMER'),
	Schema.Literal('FIRST_TIME_CONTRIBUTOR'),
	Schema.Literal('MANNEQUIN'),
	Schema.Literal('MEMBER'),
	Schema.Literal('NONE'),
	Schema.Literal('OWNER')
);

/**
 * Schema describing the auto-merge configuration attached to a Pull Request.
 *
 * This schema models the information returned by GitHub when auto-merge has been
 * configured for a pull request.
 *
 * Properties:
 * - enabled_by: The user (see UserSchema) who enabled auto-merge.
 * - merge_method: The merge strategy to use. One of:
 *   - 'merge'  — create a merge commit
 *   - 'squash' — squash all commits into a single commit
 *   - 'rebase' — rebase commits onto the base branch
 * - commit_title: The title to use for the merge commit or the squashed commit.
 * - commit_message: The commit message body to use when performing the merge.
 *
 * All fields are required by this schema.
 */
export const PullRequestAutoMergeSchema = Schema.Struct({
	enabled_by: UserSchema,
	merge_method: Schema.Union(
		Schema.Literal('merge'),
		Schema.Literal('squash'),
		Schema.Literal('rebase')
	),
	commit_title: Schema.String,
	commit_message: Schema.String,
});

/**
 * Allowed link relation keys for a GitHub Pull Request `_links` object.
 *
 * Each key corresponds to a common relation returned by the GitHub API:
 * - 'self'            : API URL for the pull request itself
 * - 'html'            : Web (HTML) URL for viewing the pull request on github.com
 * - 'issue'           : URL of the associated issue
 * - 'comments'        : URL for issue comments
 * - 'review_comments' : URL for review comments on the PR
 * - 'review_comment'  : URL template for a single review comment
 * - 'commits'         : URL listing commits in the pull request
 * - 'statuses'        : URL for the combined status of the PR head commit
 *
 * Declared as a readonly literal tuple (as const) so a union of these string
 * literals can be derived for precise typing in TypeScript.
 */
const PullRequest_LinksKeys = [
	'self',
	'html',
	'issue',
	'comments',
	'review_comments',
	'review_comment',
	'commits',
	'statuses',
] as const;

/**
 * Schema describing the "links" object on a GitHub pull request.
 *
 * This structured schema maps every key listed in `PullRequest_LinksKeys` to the
 * `LinkSchema`, enforcing that the `_links` (or similarly named) object on a pull
 * request payload contains only the expected link entries and that each entry
 * conforms to `LinkSchema`.
 *
 * Type: Schema.Struct<{ [K in (typeof PullRequest_LinksKeys)[number]]: typeof LinkSchema }>
 *
 * Remarks:
 * - The exact set of property names is determined by `PullRequest_LinksKeys`.
 * - Use this schema to validate or parse the `_links` portion of GitHub webhook
 *   payloads or API responses for pull requests.
 *
 * @see LinkSchema
 * @see PullRequest_LinksKeys
 */
const PullRequest_LinksSchema: Schema.Struct<{
	[K in (typeof PullRequest_LinksKeys)[number]]: typeof LinkSchema;
}> = Schema.Struct(
	PullRequest_LinksKeys.reduce(
		(acc, key) => {
			acc[key] = LinkSchema;
			return acc;
		},
		{} as Record<(typeof PullRequest_LinksKeys)[number], typeof LinkSchema>
	)
);

/**
 * PullRequestSchema
 *
 * Represents the shape of a GitHub pull request as exposed by the webhook payloads.
 *
 * Fields
 * - url: string — API URL for this pull request.
 * - id: number — Numeric database identifier.
 * - node_id: string — GraphQL/Node identifier.
 * - html_url: string — Human-facing web URL for the pull request.
 * - diff_url: string — URL to the diff.
 * - patch_url: string — URL to the patch.
 * - issue_url: string — API URL for the related issue.
 * - number: number — Pull request number within the repository.
 * - state: 'open' | 'closed' — PR state.
 * - locked: boolean — Whether the conversation is locked.
 * - title: string — PR title.
 * - user: UserSchema — Author of the PR (short user object).
 * - body: string | null — PR description (nullable).
 * - created_at: string — Creation timestamp (ISO 8601 string).
 * - updated_at: string — Last updated timestamp (ISO 8601 string).
 * - closed_at: string | null — Close timestamp if closed.
 * - merged_at: string | null — Merge timestamp if merged.
 * - merge_commit_sha: string | null — SHA of the merge commit when merged.
 * - assignee: UserSchema | undefined — Single assignee (optional).
 * - assignees: UserSchema[] — List of assignees.
 * - requested_reviewers: (UserSchema | TeamSchema)[] — Reviewers explicitly requested (users or teams).
 * - requested_teams: TeamSchema[] — Teams requested for review.
 * - labels: LabelSchema[] — Labels applied to the PR.
 * - milestone: MilestoneSchema | null — Associated milestone (nullable).
 * - commits_url: string — API URL for commits in this PR.
 * - review_comments_url: string — API URL for review comments.
 * - review_comment_url: string — Template URL for a single review comment.
 * - comments_url: string — API URL for issue comments.
 * - statuses_url: string — API URL for commit statuses.
 * - head: { label: string; ref: string; sha: string; user: UserSchema; repo: RepositorySchema } —
 *     The head branch (source) for the PR, including user and repository objects.
 * - base: { label: string; ref: string; sha: string; user: UserSchema; repo: RepositorySchema } —
 *     The base branch (target) for the PR, including user and repository objects.
 * - _links: PullRequest_LinksSchema — Link relations for HTML/API endpoints.
 * - author_association: AuthorAssociationSchema — How the author is associated with the repo.
 * - auto_merge: PullRequestAutoMergeSchema | null — Auto-merge configuration if enabled (nullable).
 * - active_lock_reason: 'off-topic' | 'too heated' | 'resolved' | 'spam' | null —
 *     Reason for an active conversation lock (nullable).
 * - draft: boolean — Whether the PR is a draft.
 * - merged: boolean | null — Whether the PR has been merged (nullable when unknown).
 * - mergeable: boolean | null — Whether the PR can be merged cleanly (nullable when unknown).
 * - rebaseable: boolean | null — Whether the PR can be rebased cleanly (nullable when unknown).
 * - mergeable_state: string — Mergeability state descriptor (e.g. "clean", "dirty", etc.).
 * - merged_by: UserSchema | null — User who merged the PR (nullable).
 * - comments: number — Total issue comments count.
 * - review_comments: number — Total review comments count.
 * - maintainer_can_modify: boolean — Whether maintainers can modify the PR branch.
 * - commits: number — Number of commits in the PR.
 * - additions: number — Total added lines.
 * - deletions: number — Total deleted lines.
 * - changed_files: number — Number of files changed.
 *
 * Notes
 * - Many timestamp fields are ISO 8601 strings and some fields are nullable when the value is not applicable or unknown.
 * - Arrays reference nested schema types (UserSchema, TeamSchema, LabelSchema, etc.) rather than raw primitives.
 * - Use this schema to validate or type-check webhook payloads representing pull requests.
 */
export const PullRequestSchema = Schema.Struct({
	url: Schema.String,
	id: Schema.Number,
	node_id: Schema.String,
	html_url: Schema.String,
	diff_url: Schema.String,
	patch_url: Schema.String,
	issue_url: Schema.String,
	number: Schema.Number,
	state: Schema.Union(Schema.Literal('open'), Schema.Literal('closed')),
	locked: Schema.Boolean,
	title: Schema.String,
	user: UserSchema,
	body: Schema.NullOr(Schema.String),
	created_at: Schema.String,
	updated_at: Schema.String,
	closed_at: Schema.NullOr(Schema.String),
	merged_at: Schema.NullOr(Schema.String),
	merge_commit_sha: Schema.NullOr(Schema.String),
	assignee: Schema.optional(UserSchema),
	assignees: Schema.Array(UserSchema),
	requested_reviewers: Schema.Array(Schema.Union(UserSchema, TeamSchema)),
	requested_teams: Schema.Array(TeamSchema),
	labels: Schema.Array(LabelSchema),
	milestone: Schema.NullOr(MilestoneSchema),
	commits_url: Schema.String,
	review_comments_url: Schema.String,
	review_comment_url: Schema.String,
	comments_url: Schema.String,
	statuses_url: Schema.String,
	head: Schema.Struct({
		label: Schema.String,
		ref: Schema.String,
		sha: Schema.String,
		user: UserSchema,
		repo: RepositorySchema,
	}),
	base: Schema.Struct({
		label: Schema.String,
		ref: Schema.String,
		sha: Schema.String,
		user: UserSchema,
		repo: RepositorySchema,
	}),
	_links: PullRequest_LinksSchema,
	author_association: AuthorAssociationSchema,
	auto_merge: Schema.NullOr(PullRequestAutoMergeSchema),
	active_lock_reason: Schema.NullOr(
		Schema.Union(
			Schema.Literal('off-topic'),
			Schema.Literal('too heated'),
			Schema.Literal('resolved'),
			Schema.Literal('spam')
		)
	),
	draft: Schema.Boolean,
	merged: Schema.NullOr(Schema.Boolean),
	mergeable: Schema.NullOr(Schema.Boolean),
	rebaseable: Schema.NullOr(Schema.Boolean),
	mergeable_state: Schema.String,
	merged_by: Schema.NullOr(UserSchema),
	comments: Schema.Number,
	review_comments: Schema.Number,
	maintainer_can_modify: Schema.Boolean,
	commits: Schema.Number,
	additions: Schema.Number,
	deletions: Schema.Number,
	changed_files: Schema.Number,
});

/**
 * Schema for validating GitHub "pull_request" webhook event payloads.
 *
 * Represents the expected shape of the event delivered when actions occur on a pull request.
 *
 * Properties:
 * - action: the action that triggered the event (for example "opened", "closed", "reopened", "synchronize", "assigned", etc.)
 * - number: the pull request number within the repository
 * - assignee: optional user object for the assignee (if present)
 * - repository: repository metadata where the pull request belongs
 * - sender: the user who triggered the event
 * - installation: optional installation details for GitHub Apps
 * - organization: optional organization metadata (if the repository belongs to an organization)
 * - pull_request: the full pull request object containing details about the PR
 *
 * Use this schema to validate incoming webhook payloads and to provide type-safe access to the event fields.
 *
 * @remarks
 * This is a runtime schema definition intended for payload validation; it is not a TypeScript type alias. For static typing, derive types from the schema or create corresponding interfaces.
 *
 * @see https://docs.github.com/en/webhooks-and-events/webhooks/webhook-events-and-payloads#pull_request
 */
export const PullRequestEventSchema = Schema.Struct({
	action: Schema.String,
	number: Schema.Number,
	assignee: Schema.optional(UserSchema),
	repository: RepositorySchema,
	sender: UserSchema,
	installation: Schema.optional(InstallationLiteSchema),
	organization: Schema.optional(OrganizationSchema),
	pull_request: PullRequestSchema,
});
