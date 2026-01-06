/** biome-ignore-all lint/style/noNonNullAssertion: this is fine */
import { drizzle } from 'drizzle-orm/libsql/node';

/**
 * Returns a new Drizzle libSQL connection.
 * @returns
 */
export const useDB = () => {
	const client = drizzle({
		connection: {
			url: process.env.TURSO_URL!,
			authToken: process.env.TURSO_AUTH_TOKEN!,
		},
	});

	return client;
};
