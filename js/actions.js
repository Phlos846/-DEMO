/** 每日行动基础数值；性格增量由 state.personalityActionMods 叠加 */

import { applyStressDelta, talentStudyBonus, applyEnergyDelta, applyMoneyDelta } from "./talentRuntime.js";

export const ACTION_COSTS = {
  rest: { stress: -12, energy: 22 },
  fun: { stress: -18, energy: -15, money: -55 },
  study: { energy: -15, stress: 3, hiddenResume: 2, hiddenInterview: 1, resumeQuality: 3 },
  apply: { energy: -10, stress: 4 },
  path_startup: { energy: -16, stress: 4, resumeQuality: 2 },
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function mergeActionDeltas(base, extra) {
  const keys = new Set([...Object.keys(base), ...Object.keys(extra || {})]);
  const out = {};
  for (const k of keys) {
    const v = (base[k] ?? 0) + (extra?.[k] ?? 0);
    if (v !== 0 || base[k] !== undefined || extra?.[k] !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function energyCap(state) {
  return state.energyMax ?? 100;
}

export function applyDailyAction(state, actionId) {
  const base = ACTION_COSTS[actionId];
  if (!base) return "";

  const extra = state.personalityActionMods?.[actionId] ?? {};
  const c = mergeActionDeltas(base, extra);
  const mx = energyCap(state);

  if (actionId === "rest") {
    let en = c.energy ?? 0;
    if (state.playerTalents?.some((t) => t.id === "cattle")) {
      en = Math.round(en * 1.22);
    }
    applyStressDelta(state, c.stress ?? 0, "action");
    applyEnergyDelta(state, en);
    return "休息：压力下降，精力恢复。";
  }
  if (actionId === "fun") {
    applyStressDelta(state, c.stress ?? 0, "action");
    applyEnergyDelta(state, c.energy ?? 0);
    if (c.money != null && c.money !== 0) {
      applyMoneyDelta(state, c.money);
    }
    return "娱乐：吃喝玩乐都要花钱，压力降了，钱包也瘦了。";
  }
  if (actionId === "study") {
    const tb = talentStudyBonus(state);
    applyEnergyDelta(state, c.energy ?? 0);
    state.hiddenResume = clamp(state.hiddenResume + (c.hiddenResume ?? 0) + tb.hiddenResume, 0, 100);
    state.hiddenInterview = clamp(state.hiddenInterview + (c.hiddenInterview ?? 0) + tb.hiddenInterview, 0, 100);
    state.resumeQuality = clamp(state.resumeQuality + (c.resumeQuality ?? 0) + tb.resumeQuality, 0, 100);
    applyStressDelta(state, c.stress ?? 0, "action");
    state.studyCount = (state.studyCount ?? 0) + 1;
    return "学习：精力下降，简历完整度与隐藏通过率变化。";
  }
  if (actionId === "apply") {
    applyEnergyDelta(state, c.energy ?? 0);
    applyStressDelta(state, c.stress ?? 0, "action");
    return "准备投递：整理材料，精力下降，求职焦虑上升。";
  }
  if (actionId === "path_startup") {
    applyEnergyDelta(state, c.energy ?? 0);
    applyStressDelta(state, c.stress ?? 0, "action");
    state.resumeQuality = clamp(state.resumeQuality + (c.resumeQuality ?? 0), 0, 100);
    state.pathStartup = (state.pathStartup ?? 0) + 1;
    return "创业脑暴：画饼、写 BP、拉室友入股（口头）。";
  }
  return "";
}
