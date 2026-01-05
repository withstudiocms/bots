import { Config } from 'effect';

// Node Environment Configuration

export const nodeEnv = Config.withDefault(Config.string('NODE_ENV'), 'development');

// Discord configuration

export const discordBotToken = Config.redacted('DISCORD_BOT_TOKEN');

// Database configuration

export const databaseUrl = Config.redacted('TURSO_DATABASE_URL');
export const databaseAuthToken = Config.redacted('TURSO_AUTH_TOKEN');

// Github configuration

export const githubAppId = Config.redacted('GITHUB_APP_ID');
export const githubInstallationId = Config.redacted('GITHUB_INSTALLATION_ID');
export const githubPrivateKey = Config.redacted('GITHUB_PRIVATE_KEY');
export const githubWebhookSecret = Config.redacted('GITHUB_WEBHOOK_SECRET');

// Groq configuration

export const groqApiKey = Config.redacted('GROQ_API_KEY');

export const docsearchBaseUrl = Config.string('DOCSEARCH_BASE_URL');

// HTTP configuration

export const httpHost = Config.withDefault(Config.string('HTTP_HOST'), '0.0.0.0');
export const httpPort = Config.withDefault(Config.number('HTTP_PORT'), 3000);
export const httpPublicDomain = Config.withDefault(
	Config.string('HTTP_PUBLIC_DOMAIN'),
	'artemis.studiocms.cloud'
);

// Activity Updater configuration

export const presenceSchedule = Config.withDefault(
	Config.string('PRESENCE_CRON_SCHEDULE'),
	'*/5 * * * *'
);
export const presenceTimezone = Config.withDefault(Config.string('PRESENCE_CRON_TIMEZONE'), 'UTC');

// Auto-thread configuration

export const autoThreadsTopicKeyword = Config.withDefault(
	Config.string('AUTO_THREADS_KEYWORD'),
	'[threads]'
);

// No-Embed configuration

export const noEmbedKeyword = Config.withDefault(Config.string('NO_EMBED_KEYWORD'), '[noembed]');
export const noEmbedUrlWhitelist = Config.withDefault(
	Config.array(Config.string('NO_EMBED_URL_WHITELIST')),
	['studiocms.dev']
);
export const noEmbedUrlExclude = Config.withDefault(
	Config.array(Config.string('NO_EMBED_URL_EXCLUDE')),
	['studiocms.cloud']
);

// PTAL configuration

export const ptalEnabled = Config.withDefault(Config.boolean('PTAL_ENABLED'), true);

// Algolia configuration

export const algoliaAppId = Config.string('ALGOLIA_APP_ID');

export const algoliaApiKey = Config.string('ALGOLIA_API_KEY');

export const algoliaIndexName = Config.string('ALGOLIA_INDEX_NAME');
