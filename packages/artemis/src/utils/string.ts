import { Option, pipe } from 'effect';

/**
 * Extracts and returns the first paragraph from a given string.
 *
 * A paragraph is defined as the text before the first newline character.
 * Leading and trailing whitespace is trimmed from the result.
 *
 * @param str - The input string from which to extract the first paragraph.
 * @returns The first paragraph of the input string, trimmed of whitespace.
 */
export const firstParagraph = (str: string) => str.trim().split('\n')[0].trim();

/**
 * Removes surrounding double quotes from the given string, if they exist.
 *
 * @param str - The input string from which to remove surrounding double quotes.
 * @returns The input string without surrounding double quotes, if they were present; otherwise, returns the original string.
 */
export const removeQuotes = (str: string) =>
	str.startsWith('"') && str.endsWith('"') ? str.slice(1, -1) : str;

/**
 * Removes a trailing period from the given string, if it exists.
 *
 * @param str - The input string from which to remove the trailing period.
 * @returns The input string without a trailing period, if it had one; otherwise, returns the original string.
 */
export const removePeriod = (str: string) => (str.endsWith('.') ? str.slice(0, -1) : str);

/**
 * Returns an `Option` containing the trimmed string if it is non-empty, otherwise returns `None`.
 *
 * @param str - The input string which may be undefined or empty.
 * @returns An `Option` containing the trimmed string if it has content, or `None` if it is undefined or empty.
 */
export const nonEmpty = (str: string | undefined) =>
	pipe(
		Option.fromNullable(str),
		Option.map((_) => _.trim()),
		Option.filter((_) => _.length > 0)
	);

/**
 * Truncates a string to a specified number of words and appends a suffix if truncation occurs.
 *
 * @param str - The input string to be truncated.
 * @param nWords - The maximum number of words to retain from the input string.
 * @param suffix - The string to append if truncation occurs. Defaults to '...'.
 * @returns The truncated string with the suffix if truncation occurred, otherwise the original string.
 */
export const truncateWords = (str: string, nWords: number, suffix = '...') => {
	const truncated = str.split(' ', nWords).join(' ');
	return truncated.length < str.length ? truncated + suffix : truncated;
};

/**
 * Truncates a string to a specified length and appends an ellipsis ("...") if the string exceeds that length.
 *
 * @param str - The input string to be truncated.
 * @param len - The maximum allowed length of the resulting string, including the ellipsis if truncation occurs.
 * @returns The truncated string with an ellipsis if it was longer than the specified length, otherwise the original string.
 */
export const truncate = (str: string, len: number) =>
	str.length > len ? `${str.substring(0, len - 3)}...` : str;
