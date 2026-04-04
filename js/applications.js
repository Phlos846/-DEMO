import { addLog } from "./state.js";
import { materializeCompany, expectedResumePass, updateJobSearchRating } from "./match.js";
import {
  talentRevealEnergyCost,
  talentApplyEnergyDiscount,
  applyStressDelta,
  applyEnergyDelta,
} from "./talentRuntime.js";
import { buildCompaniesForApplySession } from "./companies.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function startApplySession(state) {
  state.nextCompanyBatch = (state.nextCompanyBatch ?? 0) + 1;
  const batch = buildCompaniesForApplySession(state.nextCompanyBatch);
  const order = shuffle(batch);
  if (order.length < 10) {
    return { ok: false, reason: "本轮公司池异常，无法投递。" };
  }
  state.applySession = {
    order,
    index: 0,
    submitted: 0,
    target: 10,
    currentRevealed: false,
    materializedIndex: -1,
  };
  return { ok: true };
}

export function getCurrentCompany(state) {
  const s = state.applySession;
  if (!s) return null;
  const co = s.order[s.index] ?? null;
  if (co && s.materializedIndex !== s.index) {
    materializeCompany(state, co);
    s.materializedIndex = s.index;
  }
  return co;
}

export function canReveal(state) {
  const co = getCurrentCompany(state);
  if (!co || !state.applySession) return false;
  if (!co.hasHidden || !co.hiddenTag) return false;
  if (state.applySession.currentRevealed) return false;
  return state.energy >= talentRevealEnergyCost(state);
}

/** 「侧面打听」：消耗精力揭示隐藏标签 */
export function revealHidden(state) {
  if (!canReveal(state)) return false;
  const cost = talentRevealEnergyCost(state);
  const mx = state.energyMax ?? 100;
  applyEnergyDelta(state, -cost);
  state.applySession.currentRevealed = true;
  return true;
}

/** 单次投递：按玩家属性与公司难度计算过筛概率（目标期望约 30%） */
export function submitCurrentCompany(state) {
  const s = state.applySession;
  const co = getCurrentCompany(state);
  if (!co || s.submitted >= s.target) return null;

  const eCost = Math.max(2, 5 - talentApplyEnergyDiscount(state));
  const mx = state.energyMax ?? 100;
  applyEnergyDelta(state, -eCost);
  applyStressDelta(state, 2, "action");
  state.appliedIds.push(co.id);

  const hiddenRevealed = s.currentRevealed;
  const expectedP = expectedResumePass(state, co, hiddenRevealed);
  const passed = Math.random() < expectedP;
  updateJobSearchRating(state, expectedP, passed ? 1 : 0);

  if (!state.resumePending) state.resumePending = [];
  const lag = state.godMode ? 1 : 2 + Math.floor(Math.random() * 2);
  const notifyDay = state.day + lag;
  state.resumePending.push({
    company: JSON.parse(JSON.stringify(co)),
    hiddenRevealed,
    notifyDay,
    passed,
  });

  s.submitted += 1;
  s.index += 1;
  s.currentRevealed = false;

  const msg = `已投递 ${co.name}。HR 约 2–3 个工作日内邮件反馈，届时见分晓。`;
  addLog(state, `第 ${state.day} 天：${msg}`);
  return msg;
}

export function skipCurrentCompany(state) {
  const s = state.applySession;
  const co = getCurrentCompany(state);
  if (!co || s.submitted >= s.target) return null;
  state.skippedIds.push(co.id);
  s.index += 1;
  s.currentRevealed = false;
  addLog(state, `第 ${state.day} 天：查看下一家，跳过 ${co.name}。`);
  return `已跳过 ${co.name}，无法回头投递该公司。`;
}

export function applySessionComplete(state) {
  const s = state.applySession;
  if (!s) return true;
  if (s.submitted >= s.target) return true;
  const remaining = s.order.length - s.index;
  const need = s.target - s.submitted;
  return remaining < need;
}

export function endApplySession(state) {
  state.applySession = null;
}
