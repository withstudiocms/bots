/** biome-ignore-all lint/style/noNonNullAssertion: this is fine */
import { drizzle } from 'drizzle-orm/libsql/node';

/**
 * Returns a new Drizzle libSQL connection.
 * @returns
 */
export const useDB = () => {
	const client = drizzle({
		connection: {
			url: process.env.DATABASE_URL!,
			authToken: process.env.DATABASE_AUTH_TOKEN!,
		},
	});

	return client;
};
