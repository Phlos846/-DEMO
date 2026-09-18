import { checkInstantFail } from './talentRuntime.js?v=1.1.19';

export const BURNOUT_STRESS = 85;
export const BURNOUT_DAYS = 3;

// Sample once at day end, before recovery, including days advanced by events.
export function finishHighStressDay(state) {
  if (state.gameOver) return true;
  if (state.godMode) return false;
  if (checkInstantFail(state)) return true;
  if (state.burnoutCheckedDay === state.day) return false;
  const previous = state.burnoutCheckedDay;
  state.burnoutCheckedDay = state.day;
  state.highStressDays = state.stress >= BURNOUT_STRESS
    ? (previous === state.day - 1 ? (state.highStressDays ?? 0) : 0) + 1
    : 0;
  if (state.highStressDays < BURNOUT_DAYS) return false;
  state.burnoutEarlyEnd = true;
  state.gameOver = true;
  return true;
}
