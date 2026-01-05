import { type DiscordGateway, SendEvent } from 'dfx/gateway';
import {
	ActivityType,
	type GatewayActivityUpdateData,
	type GatewayPresenceUpdateData,
	PresenceUpdateStatus,
} from 'dfx/types';
import { Effect } from 'effect';
import { type SeasonalActivity, seasonalActivities } from '../static/activity-lists/seasonal.ts';
import { standardActivities } from '../static/activity-lists/standard.ts';
import { formattedLog } from './log.ts';

/**
 * Create a human-readable log message for an activity update.
 *
 * Maps the activity's type to a friendly label (for example "Playing", "Streaming",
 * "Listening to", "Watching", "Competing in", or "Custom status set to") and returns
 * the label followed by the activity name in quotes.
 *
 * @param activity - The activity update payload. Expected to include `type` and `name`.
 * @returns A formatted string describing the update, e.g. `Playing "Game Name"`.
 *
 * @example
 * // Produces: Playing "Chess"
 * buildUpdateLog({ type: ActivityType.Playing, name: 'Chess' });
 */
function buildUpdateLog(activity: GatewayActivityUpdateData) {
	const labelMap: Record<ActivityType, string> = {
		[ActivityType.Playing]: 'Playing',
		[ActivityType.Streaming]: 'Streaming',
		[ActivityType.Listening]: 'Listening to',
		[ActivityType.Watching]: 'Watching',
		[ActivityType.Competing]: 'Competing in',
		[ActivityType.Custom]: 'Custom status set to',
	};
	const label = labelMap[activity.type] || 'Activity set to';
	return `${label} "${activity.name}"`;
}

/**
 * Selects and returns a random element from the provided array.
 *
 * @typeParam T - The type of elements in the array.
 * @param arr - The array to select a random element from.
 * @returns A randomly selected element from the array.
 * @throws {RangeError} If the array is empty.
 */
function selectRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Formats a list of activity names into an array of presence update data objects.
 *
 * Each activity name is converted into a presence update object with a custom activity type.
 * The common presence properties (status, since, afk) are applied to each object.
 *
 * @param list - An array of activity names to format.
 * @returns An array of formatted presence update data objects.
 */
function formatActivities(list: string[]): GatewayPresenceUpdateData[] {
	const commonPresence = {
		status: PresenceUpdateStatus.Online,
		since: Date.now(),
		afk: false,
	};

	return list.map((entry) => ({
		...commonPresence,
		activities: [
			{
				type: ActivityType.Custom,
				name: entry,
				state: entry,
			},
		],
	}));
}

/**
 * Retrieves the appropriate list of activity presence updates based on the current date.
 *
 * This function checks the current date against predefined seasonal activity timeframes.
 * If the current date falls within a seasonal timeframe, the corresponding seasonal activities
 * are returned. Otherwise, the standard activities are returned.
 *
 * @returns An array of presence update data objects for the current season or standard activities.
 */
function getActivityList(): GatewayPresenceUpdateData[] {
	const standard: string[] = standardActivities;
	const seasonal: SeasonalActivity[] = seasonalActivities;

	const now = new Date();
	const month = now.getMonth() + 1; // getMonth() returns 0-11
	const day = now.getDate();

	for (const season of seasonal) {
		const { start, end } = season.timeframe;
		const isInSeason =
			(month > start.month || (month === start.month && day >= start.day)) &&
			(month < end.month || (month === end.month && day <= end.day));

		if (isInSeason) {
			return formatActivities(season.activities);
		}
	}

	return formatActivities(standard);
}

// create a cache to store the current presence
let currentPresence: GatewayPresenceUpdateData | null = null;

/**
 * Effect that updates the bot's activity presence on Discord.
 *
 * This effect selects a random activity from the predefined list and updates the bot's presence
 * via the provided Discord gateway. It ensures that the new activity is different from the current one
 * to avoid redundant updates.
 *
 * @param gateway - The Discord gateway instance used to send presence updates.
 * @returns An Effect that performs the presence update operation.
 */
export const activityUpdater = (gateway: DiscordGateway) =>
	Effect.gen(function* () {
		// Get the list of presence updates
		const presenceUpdates = getActivityList();

		// Select a random presence update
		let update = selectRandom(presenceUpdates);

		// If the selected presence is the same as the current one, select again
		if (currentPresence && currentPresence.activities[0].name === update.activities[0].name) {
			yield* Effect.logDebug(
				formattedLog('Presence', 'Selected presence is the same as current, selecting a new one...')
			);
			let newUpdate: GatewayPresenceUpdateData;
			do {
				newUpdate = selectRandom(presenceUpdates);
			} while (newUpdate.activities[0].name === currentPresence.activities[0].name);
			currentPresence = newUpdate;
			update = newUpdate;
			yield* Effect.logDebug(formattedLog('Presence', 'New presence selected.'));
		} else {
			yield* Effect.logDebug(
				formattedLog('Presence', 'Selected presence is different from current, keeping it.')
			);
			currentPresence = update;
		}

		yield* Effect.all([
			Effect.logDebug(
				formattedLog('Presence', `Updating presence: ${buildUpdateLog(update.activities[0])}`)
			),
			// Send the presence update to the gateway
			gateway.send(SendEvent.presenceUpdate(update)),
			Effect.logDebug(formattedLog('Presence', 'Presence updated successfully')),
		]);
	});
