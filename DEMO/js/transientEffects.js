/**
 * 临时状态效果（buff/debuff）：与性格、天赋无关，由随机事件等施加。
 * 每日 advanceDay 后 day 递增，需调用 pruneExpiredTransientEffects。
 * 「净化」类：清除 debuff 型 transient，并可选解除「用脑过度」机械 debuff。
 */

import { addLog } from "./state.js";

function clamp01product(parts) {
  let m = 1;
  for (const x of parts) {
    if (x != null && Number.isFinite(x)) m *= x;
  }
  return m;
}

export function pruneExpiredTransientEffects(state) {
  if (!state.transientEffects?.length) return;
  state.transientEffects = state.transientEffects.filter((e) => e.untilDay >= state.day);
}

/** 持续 n 个自然日（含当日）：untilDay = day + n - 1 */
export function transientUntilDay(state, naturalDays) {
  return state.day + naturalDays - 1;
}

/**
 * @param {object} state
 * @param {object} opts
 * @param {'buff'|'debuff'} opts.kind
 * @param {string} opts.label 状态栏短文案
 * @param {number} opts.untilDay
 * @param {string} [opts.id]
 * @param {number} [opts.stressGainMult]
 * @param {number} [opts.stressReliefMult]
 * @param {number} [opts.energyDrainMult]
 * @param {number} [opts.energyRecoverMult]
 * @param {number} [opts.passiveEnergyRecoverMult]
 */
export function addTransientEffect(state, opts) {
  const {
    kind,
    label,
    untilDay,
    id,
    stressGainMult = 1,
    stressReliefMult = 1,
    energyDrainMult = 1,
    energyRecoverMult = 1,
    passiveEnergyRecoverMult = 1,
  } = opts;
  state.transientEffects = state.transientEffects ?? [];
  state.transientEffects.push({
    id: id ?? `fx_${state.day}_${Math.random().toString(36).slice(2, 9)}`,
    kind,
    label,
    untilDay,
    stressGainMult,
    stressReliefMult,
    energyDrainMult,
    energyRecoverMult,
    passiveEnergyRecoverMult,
  });
}

export function aggregateStressGainMult(state) {
  const parts = [];
  for (const e of state.transientEffects ?? []) {
    if (e.untilDay < state.day) continue;
    parts.push(e.stressGainMult);
  }
  return clamp01product(parts);
}

export function aggregateStressReliefMult(state) {
  const parts = [];
  for (const e of state.transientEffects ?? []) {
    if (e.untilDay < state.day) continue;
    parts.push(e.stressReliefMult);
  }
  return clamp01product(parts);
}

export function aggregateEnergyDrainMult(state) {
  const parts = [];
  for (const e of state.transientEffects ?? []) {
    if (e.untilDay < state.day) continue;
    parts.push(e.energyDrainMult);
  }
  return clamp01product(parts);
}

export function aggregateEnergyRecoverMult(state) {
  const parts = [];
  for (const e of state.transientEffects ?? []) {
    if (e.untilDay < state.day) continue;
    parts.push(e.energyRecoverMult);
  }
  return clamp01product(parts);
}

export function aggregatePassiveEnergyRecoverMult(state) {
  const parts = [];
  for (const e of state.transientEffects ?? []) {
    if (e.untilDay < state.day) continue;
    parts.push(e.passiveEnergyRecoverMult);
  }
  return clamp01product(parts);
}

export function purgeDebuffTransientEffects(state) {
  const before = state.transientEffects?.length ?? 0;
  state.transientEffects = (state.transientEffects ?? []).filter((e) => e.kind !== "debuff");
  return before - (state.transientEffects?.length ?? 0);
}

/** 净化：移除所有 debuff 型 transient，并解除用脑过度（若处于生效日） */
export function purgeAllDebuffsForPurify(state) {
  const removedFx = purgeDebuffTransientEffects(state);
  let clearedOverload = false;
  if (state.studyOverloadDebuffUntilDay != null && state.day <= state.studyOverloadDebuffUntilDay) {
    state.studyOverloadDebuffUntilDay = null;
    state.studyCountWhileOverloadDebuff = 0;
    clearedOverload = true;
  }
  if (removedFx > 0 || clearedOverload) {
    addLog(state, "净化：已清除负面状态效果。");
  }
  return { removedFx, clearedOverload };
}
