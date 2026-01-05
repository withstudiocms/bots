/**
 * Drizzle configuration file for the Artemis project.
 *
 * This configuration sets up Drizzle ORM with the following options:
 * - Output directory for generated files: `./drizzle`
 * - Path to the schema definition: `./src/db/schema.ts`
 * - Database dialect: `turso`
 * - Database credentials are loaded from environment variables:
 *   - `TURSO_DATABASE_URL` (required)
 *   - `TURSO_AUTH_TOKEN` (optional)
 *
 * @see https://orm.drizzle.team/docs/overview
 */

import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	out: './drizzle',
	schema: './src/core/db-schema.ts',
	dialect: 'turso',
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: If this is not set, we want it to throw an error
		url: process.env.TURSO_DATABASE_URL!,
		authToken: process.env.TURSO_AUTH_TOKEN,
	},
});
