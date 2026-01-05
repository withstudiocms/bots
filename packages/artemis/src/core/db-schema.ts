import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Represents the 'guilds' table schema in the SQLite database.
 *
 * This table stores information about Discord guilds (servers) that the bot is a member of.
 */
export const guilds = sqliteTable('guilds', {
	id: text().primaryKey().unique().notNull(),
	ptal_announcement_role: text(),
});

/**
 * Defines the `repos` table schema for SQLite.
 *
 * The table stores repository metadata and associates each repository with a guild.
 *
 * Columns:
 * - `id`: Primary key, auto-incremented integer, unique, not null.
 * - `label`: Repository label, text, not null.
 * - `owner`: Repository owner, text, not null.
 * - `repo`: Repository name, text, not null.
 * - `guildId`: Foreign key referencing `guilds.id`, text, not null.
 *   - On delete and update, cascades changes.
 */
export const repos = sqliteTable('repos', {
	id: int().primaryKey({ autoIncrement: true }).unique().notNull(),
	label: text().notNull(),
	owner: text().notNull(),
	repo: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});

/**
 * Defines the `crowdin_embed` table schema for the SQLite database.
 *
 * @table crowdin_embed
 * @property {number} id - Primary key, auto-incremented, unique, and not nullable.
 * @property {string} owner - The owner of the repository, not nullable.
 * @property {string} repo - The repository name, not nullable.
 * @property {string} channelId - The Discord channel ID associated with the embed, not nullable.
 * @property {string} guildId - The Discord guild ID, not nullable. References the `guilds.id` column with cascading updates and deletes.
 */
export const crowdinEmbed = sqliteTable('crowdin_embed', {
	id: int().primaryKey({ autoIncrement: true }).unique().notNull(),
	owner: text().notNull(),
	repo: text().notNull(),
	channelId: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});

/**
 * Schema definition for the "ptals" SQLite table.
 *
 * Each record represents a PTAL ("please take a look") entry that links a chat
 * message to a repository and pull request, along with descriptive metadata.
 *
 * Columns:
 * - id: Auto-incrementing integer primary key.
 * - channel: Channel identifier (string). Not nullable.
 * - message: Message identifier or content (string). Not nullable and unique.
 * - repository: Repository identifier (string). Not nullable.
 * - owner: Repository owner (string). Not nullable.
 * - pr: Pull request number (integer). Not nullable.
 * - description: Human-readable description (string). Not nullable.
 *
 * Remarks:
 * - The table is created via the project's sqliteTable helper and is intended
 *   for use with the application's query builder and migration tooling.
 * - The unique constraint on `message` prevents duplicate PTAL entries for the
 *   same message.
 *
 * @constant
 * @name ptalTable
 */
export const ptalTable = sqliteTable('ptals', {
	id: int().primaryKey({ autoIncrement: true }),
	channel: text().notNull(),
	message: text().notNull().unique(),
	repository: text().notNull(),
	owner: text().notNull(),
	pr: int().notNull(),
	description: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});

/**
 * Schema definition for the "bluesky_tracked_accounts" SQLite table.
 *
 * Each record represents a BlueSky account being tracked for a specific guild.
 *
 * Columns:
 * - did: Decentralized Identifier (string). Primary key, unique, and not nullable.
 * - guild: Guild identifier (string). Not nullable.
 * - last_checked_at: Timestamp of the last check (string). Not nullable.
 */
export const blueSkyTrackedAccounts = sqliteTable('bluesky_tracked_accounts', {
	did: text().primaryKey().unique().notNull(),
	guild: text().notNull(),
	last_checked_at: text().notNull(),
	date_added: text().notNull(),
});

/**
 * Schema definition for the "bluesky_channel_subscriptions" SQLite table.
 *
 * Each record represents a subscription of a Discord channel to a BlueSky account's activities.
 *
 * Columns:
 * - did: Decentralized Identifier (string). Primary key, unique, and not nullable.
 * - guild: Guild identifier (string). Not nullable.
 * - track_top_level: Integer flag indicating whether to track top-level posts. Not nullable.
 * - track_replies: Integer flag indicating whether to track replies. Not nullable.
 * - track_reposts: Integer flag indicating whether to track reposts. Not nullable.
 */
export const blueSkyChannelSubscriptions = sqliteTable('bluesky_channel_subscriptions', {
	did: text().notNull().primaryKey().unique(),
	guild: text().notNull(),
	track_top_level: int().notNull(),
	track_replies: int().notNull(),
	track_reposts: int().notNull(),
});

/**
 * Schema definition for the "bluesky_processed_posts" SQLite table.
 *
 * Each record represents a BlueSky post that has already been processed to avoid duplicate handling.
 *
 * Columns:
 * - post_uri: Unique identifier for the BlueSky post (string). Primary key, unique, and not nullable.
 * - did: Decentralized Identifier of the account that made the post (string). Not nullable.
 * - guild: Guild identifier (string). Not nullable.
 * - post_type: Type of the post (string). Not nullable.
 * - processed_at: Timestamp when the post was processed (string). Not nullable.
 */
export const blueSkyProcessedPosts = sqliteTable('bluesky_processed_posts', {
	post_uri: text().notNull().primaryKey().unique(),
	did: text().notNull(),
	guild: text().notNull(),
	post_type: text().notNull(),
	processed_at: text().notNull(),
});

/**
 * Schema definition for the "bluesky_config" SQLite table.
 *
 * Each record represents configuration settings for BlueSky integration within a guild.
 *
 * Columns:
 * - guild: Guild identifier (string). Primary key, unique, and not nullable.
 * - post_channel_id: Discord channel ID where BlueSky posts will be sent (string). Not nullable.
 * - ping_role_id: Discord role ID to ping for BlueSky updates (string). Not nullable.
 * - ping_role_enabled: Integer flag indicating whether pinging the role is enabled. Not nullable.
 */
export const blueSkyConfig = sqliteTable('bluesky_config', {
	guild: text().primaryKey().unique().notNull(),
	post_channel_id: text().notNull(),
	ping_role_id: text().notNull(),
	ping_role_enabled: int().notNull(),
});
