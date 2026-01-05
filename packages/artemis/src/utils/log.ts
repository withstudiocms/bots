import { Effect } from 'effect';

/**
 * Formats a log message with a specific prefix for ArtemisBot.
 *
 * @param prefix - The prefix to include in the log message, typically indicating the log context or source.
 * @param message - The message to be logged.
 * @returns The formatted log string in the format: `[ArtemisBot:<prefix>] <message>`.
 */
export function formattedLog(prefix: string | false, message: string): string {
	return `[ArtemisBot${prefix ? `:${prefix}` : ''}] ${message}`;
}

/**
 * Formats an array of log messages by applying a prefix to each message and wrapping them with `Effect.log`.
 *
 * @param prefix - The prefix to prepend to each log message.
 * @param messages - An array of log messages to be formatted and logged.
 * @returns An array of effects, each representing a formatted log message.
 */
export function formatArrayLog(prefix: string, messages: string[]) {
	return messages.map((msg) => Effect.log(formattedLog(prefix, msg)));
}
