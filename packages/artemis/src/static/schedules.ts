import { Effect, Schedule } from 'effect';

export const PTALRefreshSchedule = Schedule.spaced('150 seconds' /* 2.5 minutes */);

export const spacedOnceSecond = Schedule.spaced('1 seconds');

export const delayByOneSecond = Schedule.addDelay(Schedule.once, () => '1 seconds');

export const delayByTenSeconds = Schedule.addDelay(Schedule.once, () => '10 seconds');

export const effectSleep2Seconds = Effect.sleep('2 seconds');

export const BlueSkyPollSchedule = Schedule.spaced('1 minutes');
