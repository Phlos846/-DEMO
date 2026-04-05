/** 每日行动基础数值；性格增量由 state.personalityActionMods 叠加 */

import { applyStressDelta, talentStudyBonus, applyEnergyDelta, applyMoneyDelta } from "./talentRuntime.js";
import { clampResumeToCap } from "./state.js";
import { hasTalent } from "./talents.js";

/** 用脑过度时学习三维/简历增益乘算（供界面展示） */
export const STUDY_OVERLOAD_GAIN_MULT = 0.55;
/** 顿悟突破后学习增益乘算（供界面展示） */
export const STUDY_RECOVERY_BUFF_MULT = 1.28;

export const ACTION_COSTS = {
  rest: { stress: -6, energy: 22 },
  fun: { stress: -28, energy: -11, money: -55 },
  study: { energy: -15, stress: 3, hiddenResume: 2, hiddenInterview: 1, resumeQuality: 3 },
  apply: { energy: -8, stress: 4 },
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

/** 娱乐扣钱前的理论下限（±10% 浮动），用于主界面按钮是否可点 */
export function minCashForFunAction(state) {
  const c = mergeActionDeltas(ACTION_COSTS.fun, state.personalityActionMods?.fun ?? {});
  const m = c.money ?? 0;
  if (m >= 0) return 0;
  return Math.ceil(Math.abs(m) * 0.9 - 1e-9);
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
      let moneyDelta = c.money;
      if (moneyDelta < 0) {
        const factor = 0.9 + Math.random() * 0.2;
        moneyDelta = Math.round(moneyDelta * factor);
      }
      applyMoneyDelta(state, moneyDelta);
    }
    return "娱乐：吃喝玩乐都要花钱，压力降了，钱包也瘦了。";
  }
  if (actionId === "study") {
    if (!state.studyByDay) state.studyByDay = {};
    state.studyByDay[state.day] = (state.studyByDay[state.day] ?? 0) + 1;
    const hadOverloadDebuff =
      state.studyOverloadDebuffUntilDay != null && state.day <= state.studyOverloadDebuffUntilDay;
    const tb = talentStudyBonus(state);
    applyEnergyDelta(state, c.energy ?? 0);
    const studyScale = 0.9;
    let studyEffMult = 1;
    if (hasTalent(state, "stress_to_power")) {
      const st = state.stress ?? 0;
      if (st > 80) studyEffMult = 1.5;
      else if (st < 80) studyEffMult = 0.2;
    }
    const overloadMult =
      state.studyOverloadDebuffUntilDay != null && state.day <= state.studyOverloadDebuffUntilDay
        ? STUDY_OVERLOAD_GAIN_MULT
        : 1;
    const recoveryMult =
      state.studyRecoveryBuffUntilDay != null && state.day <= state.studyRecoveryBuffUntilDay
        ? STUDY_RECOVERY_BUFF_MULT
        : 1;
    /** 收益在基准值 ±30% 内浮动（每项独立随机） */
    const gainFloat = () => 0.7 + Math.random() * 0.6;
    const hrGain = Math.round(
      ((c.hiddenResume ?? 0) + tb.hiddenResume) *
        studyScale *
        studyEffMult *
        overloadMult *
        recoveryMult *
        gainFloat(),
    );
    const hiGain = Math.round(
      ((c.hiddenInterview ?? 0) + tb.hiddenInterview) *
        studyScale *
        studyEffMult *
        overloadMult *
        recoveryMult *
        gainFloat(),
    );
    const rqGain = Math.round(
      ((c.resumeQuality ?? 0) + tb.resumeQuality) *
        studyScale *
        studyEffMult *
        overloadMult *
        recoveryMult *
        gainFloat(),
    );
    state.hiddenResume = clamp(state.hiddenResume + hrGain, 0, 100);
    state.hiddenInterview = clamp(state.hiddenInterview + hiGain, 0, 100);
    state.resumeQuality = clampResumeToCap(state, state.resumeQuality + rqGain);
    applyStressDelta(state, c.stress ?? 0, "action");
    state.studyCount = (state.studyCount ?? 0) + 1;
    /** 考公/考研倾向：与本次学习的 overloadMult、recoveryMult 一致（无额外随机） */
    state.studyPivotHidden = (state.studyPivotHidden ?? 0) + overloadMult * recoveryMult;
    if (hadOverloadDebuff) {
      state.studyCountWhileOverloadDebuff = (state.studyCountWhileOverloadDebuff ?? 0) + 1;
    }
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
    state.resumeQuality = clampResumeToCap(state, state.resumeQuality + (c.resumeQuality ?? 0));
    state.pathStartup = (state.pathStartup ?? 0) + 1;
    return "创业脑暴：画饼、写 BP、拉室友入股（口头）。";
  }
  return "";
}
