// History belongs to the current run. Queued events are reserved, not yet seen.
export function eventRepeatMultiplier(event, state) {
  const count = state.eventHistory?.[event.id]?.count ?? 0;
  const weights = event.repeatWeightDecay ?? [1, 0.3, 0.1];
  return weights[Math.min(count, weights.length - 1)];
}

export function eventAvailableThisRun(event, state, reserved = new Set()) {
  if (reserved.has(event.id)) return false;
  const history = state.eventHistory?.[event.id];
  if ((history?.count ?? 0) >= (event.maxPerRun ?? Infinity)) return false;
  if (history && state.day - history.lastDay < (event.cooldownDays ?? 5)) return false;
  return eventRepeatMultiplier(event, state) > 0;
}

export function recordEventAppearance(state, event) {
  if (!event.id || event.skipRecordEvent || event.appearanceRecorded) return;
  event.appearanceRecorded = true;
  state.eventHistory ??= {};
  const previous = state.eventHistory[event.id];
  state.eventHistory[event.id] = { count: (previous?.count ?? 0) + 1, lastDay: state.day };
}
