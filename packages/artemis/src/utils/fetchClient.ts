import { Effect } from 'effect';

export const eFetch = Effect.fn((url: string | URL) => Effect.tryPromise(() => fetch(url)));
