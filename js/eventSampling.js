import { getEventInteraction } from './eventChoices.js';
import { eventRepeatMultiplier } from './eventRecurrence.js';

export function isInteractiveEvent(event) {
  return getEventInteraction(event).mode !== 'notice';
}

// The caller filters cooldowns, run limits and requirements before this selection.
export function sampleEventPool(pool, state, pacing = { notices: state.eventNoticeStreak ?? 2 }, random = Math.random) {
  if (!pool.length) return null;
  const choices = pool.filter(isInteractiveEvent);
  const notices = pool.filter(e => !isInteractiveEvent(e));
  const useChoice = choices.length && (!notices.length || pacing.notices >= 2 || random() < .7);
  const group = useChoice ? choices : notices.length ? notices : choices;
  const weighted = group.map(event => ({event, weight:(event.weight ?? 1) * eventRepeatMultiplier(event, state)})).filter(x => x.weight > 0);
  if (!weighted.length) return null;
  let roll = random() * weighted.reduce((sum,x) => sum+x.weight,0);
  let selected = weighted[weighted.length-1].event;
  for (const item of weighted) { roll -= item.weight; if (roll < 0) { selected=item.event; break; } }
  pacing.notices = isInteractiveEvent(selected) ? 0 : pacing.notices+1;
  return {...selected};
}
