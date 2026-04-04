/**
 * 求职匹配分（类 ELO）+ 公司难度 + 简历/面试通过率
 * 目标期望：简历约 30%、面试约 40%（随属性与难度波动）
 */

import {
  SALARY_BANDS_META,
  TREATMENT_TAGS,
  REPUTATION_TAGS,
  HIDDEN_POOL,
  computeBaseApplyBonusFromTags,
  getFlatTagLabels,
  hashSeed,
  pickSeeded,
} from "./companies.js";
import { hasTalent } from "./talents.js";
import { talentPassBonus } from "./talentRuntime.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function rnd() {
  return Math.random();
}

export const INITIAL_RATING = 1500;
export const RATING_MIN = 1100;
export const RATING_MAX = 1900;
export const K_ELO = 26;

export function ratingToBias(rating) {
  return clamp((rating - INITIAL_RATING) / 320, -1.15, 1.15);
}

export function computeCompanyDifficulty(company) {
  const tags = company.tags;
  if (!tags) return 0.5;
  const tier = tags.salary.tier;
  const tierN = tier / 24;
  let good = 0;
  let bad = 0;
  const countQ = (q) => {
    if (q === "good") good += 1;
    else if (q === "bad") bad += 1;
  };
  countQ(tags.salary.quality);
  countQ(tags.treatment.quality);
  for (const r of tags.reputation) countQ(r.quality);

  const attract = good - bad * 0.6;
  let d =
    0.2 +
    0.58 * tierN +
    0.045 * attract +
    (tags.treatment.label.includes("996") ? 0.06 : 0) +
    (tags.treatment.label.includes("双休") ? 0.05 : 0);

  if (company.hasHidden && company.hiddenTag?.quality === "good") d += 0.03;
  return clamp(d, 0.12, 0.94);
}

function is211Science(state) {
  return state.traits?.education?.id === "edu_211" && state.traits?.major?.id === "major_sci";
}

/** 年薪区间下限（万），来自标签如「年薪18万-19万」 */
function salaryLowWanFromCompany(company) {
  const label = company.tags?.salary?.label ?? "";
  const m = label.match(/年薪([\d.]+)万/);
  return m ? parseFloat(m[1]) : 0;
}

function passModifier211Sci(state, company) {
  if (!is211Science(state)) return 0;
  const low = salaryLowWanFromCompany(company);
  if (low >= 18) return -0.14;
  if (low >= 15 && low < 18) return 0.06;
  return 0;
}

export function expectedResumePass(state, company, hiddenRevealed) {
  if (state.godMode) return 1;
  const d = company.difficulty ?? computeCompanyDifficulty(company);
  const hr = state.hiddenResume / 100;
  const rq = state.resumeQuality / 100;
  const blend = hr * 0.55 + rq * 0.45;
  let p = 0.22 + 0.45 * blend - 0.48 * d;
  if (hiddenRevealed && company.hiddenTag) {
    p += 0.04 + (company.hiddenTag.applyMod ?? 0) * 0.0015;
  }
  const tb = talentPassBonus(state);
  p += tb.resume;
  if (hasTalent(state, "otaku_pro") && (company.industry === "game" || company.industry === "anime")) {
    p += 0.078;
  }
  p += passModifier211Sci(state, company);
  return clamp(p, 0.04, 0.58);
}

export function expectedInterviewPass(state, company, hiddenRevealed) {
  if (state.godMode) return 1;
  const d = company.difficulty ?? computeCompanyDifficulty(company);
  const hi = state.hiddenInterview / 100;
  const rq = state.resumeQuality / 100;
  const blend = hi * 0.65 + rq * 0.35;
  let p = 0.3 + 0.4 * blend - 0.42 * d;
  if (hiddenRevealed) p += 0.045;
  p += talentPassBonus(state).interview;
  if (hasTalent(state, "otaku_pro") && (company.industry === "game" || company.industry === "anime")) {
    p += 0.085;
  }
  p += passModifier211Sci(state, company);
  return clamp(p, 0.06, 0.68);
}

export function updateJobSearchRating(state, expectedProb, actualOne) {
  const exp = clamp(expectedProb, 0.02, 0.98);
  const act = actualOne ? 1 : 0;
  state.jobSearchRating = clamp(
    state.jobSearchRating + K_ELO * (act - exp),
    RATING_MIN,
    RATING_MAX,
  );
}

function salaryWeightsFromBias(bias) {
  const n = SALARY_BANDS_META.length;
  const mu = (n - 1) * (0.48 + 0.22 * bias);
  const sigma = Math.max(4.2, 5.5 - 0.8 * Math.abs(bias));
  const w = [];
  for (let i = 0; i < n; i++) {
    w.push(Math.exp(-0.5 * ((i - mu) / sigma) * ((i - mu) / sigma)));
  }
  return w;
}

function pickSalaryIndexByRating(seed, rating) {
  const bias = ratingToBias(rating);
  const w = salaryWeightsFromBias(bias);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = ((hashSeed(seed) >>> 0) / 4294967296 + rnd() * 0.12) % 1;
  r *= sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

function rollQualityTier(seed, rating) {
  const t = ratingToBias(rating);
  let pBad = clamp(0.28 - 0.18 * t, 0.14, 0.48);
  let pGood = clamp(0.3 + 0.22 * t, 0.14, 0.55);
  let pNorm = 1 - pBad - pGood;
  if (pNorm < 0.12) {
    const s = pBad + pGood + 0.12;
    pBad /= s;
    pGood /= s;
    pNorm = 0.12;
  }
  const r = ((hashSeed(seed + 11) >>> 0) / 4294967296 + rnd() * 0.12) % 1;
  if (r < pBad) return "bad";
  if (r < pBad + pNorm) return "normal";
  return "good";
}

function weightedChoose(items, seed) {
  const sum = items.reduce((s, x) => s + x.w, 0);
  let r = ((hashSeed(seed) >>> 0) / 4294967296) * sum;
  for (let i = 0; i < items.length; i++) {
    r -= items[i].w;
    if (r <= 0) return items[i].item;
  }
  return items[items.length - 1].item;
}

function pickTreatmentByRating(seed, rating) {
  const rb = ratingToBias(rating);
  const shift = 1 + 0.35 * rb;
  const items = TREATMENT_TAGS.map((x) => {
    let w = 1;
    if (x.quality === "good") w *= shift;
    if (x.quality === "bad") w *= 2 - shift;
    return { item: x, w: Math.max(0.06, w) };
  });
  const raw = weightedChoose(items, seed + 1000);
  return { id: raw.id, label: raw.label, quality: raw.quality };
}

function pickReputationSet(seed, rating) {
  const count = rnd() < 0.55 ? 1 : 2;
  const rb = ratingToBias(rating);
  const shift = 1 + 0.4 * rb;
  let pool = REPUTATION_TAGS.map((x) => {
    let w = 1;
    if (x.quality === "good") w *= shift;
    if (x.quality === "bad") w *= 2 - shift;
    return { x, w: Math.max(0.06, w) };
  });
  const out = [];
  let s = seed;
  for (let k = 0; k < count && pool.length; k++) {
    const sum = pool.reduce((a, b) => a + b.w, 0);
    let r = ((hashSeed(s + k * 131) >>> 0) / 4294967296) * sum;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    const [picked] = pool.splice(idx, 1);
    out.push({ id: picked.x.id, label: picked.x.label, quality: picked.x.quality });
    s = hashSeed(s + 17);
  }
  return out;
}

/** 上帝模式：顶配薪资 + 全好标签、无隐藏雷 */
function materializeCompanyGodMode(shell) {
  const top = SALARY_BANDS_META[SALARY_BANDS_META.length - 1];
  const salary = { id: top.id, label: top.label, tier: top.tier, quality: "good" };
  const treatment = { id: "tr_weekend", label: "双休", quality: "good" };
  const reputation = [
    { id: "rep_leader", label: "行业龙头", quality: "good" },
    { id: "rep_stable", label: "风评稳健", quality: "good" },
  ];
  const tags = { salary, treatment, reputation };
  shell.tags = tags;
  shell.hasHidden = false;
  shell.hiddenTag = null;
  shell.baseApplyBonus = computeBaseApplyBonusFromTags(tags, tags.salary.tier);
  shell.visibleTags = getFlatTagLabels({ tags });
  shell.difficulty = computeCompanyDifficulty(shell);
  shell._genRating = INITIAL_RATING;
  shell.industry = "internet";
}

/**
 * 按当前匹配分生成/刷新公司标签与难度（同一职位每次进入投递序列时随匹配分更新）
 */
export function materializeCompany(state, shell) {
  if (state.godMode) {
    materializeCompanyGodMode(shell);
    return;
  }
  const rating = state.jobSearchRating;
  const seed = shell.baseSeed;
  let salIdx = pickSalaryIndexByRating(seed, rating);
  if (is211Science(state)) {
    const r = rnd();
    if (r < 0.42) {
      const targetLow = 15 + Math.floor(rnd() * 3);
      const idx = SALARY_BANDS_META.findIndex((b) => b.label.startsWith(`年薪${targetLow}万`));
      if (idx >= 0) salIdx = idx;
    } else {
      const targetLow = 18 + Math.floor(rnd() * 2);
      const idx = SALARY_BANDS_META.findIndex((b) => b.label.startsWith(`年薪${targetLow}万`));
      if (idx >= 0) salIdx = idx;
    }
  }
  const salMeta = SALARY_BANDS_META[salIdx];
  const salary = {
    id: salMeta.id,
    label: salMeta.label,
    tier: salMeta.tier,
    quality: rollQualityTier(seed + 3, rating),
  };

  const treatment = pickTreatmentByRating(seed + 1000, rating);
  const reputation = pickReputationSet(seed + 2000, rating);
  const tags = { salary, treatment, reputation };

  const hasHidden = rnd() < 0.4;
  const hiddenTag = hasHidden ? { ...pickSeeded(HIDDEN_POOL, seed + 5000) } : null;

  const baseApplyBonus = computeBaseApplyBonusFromTags(tags, tags.salary.tier);

  shell.tags = tags;
  shell.hasHidden = hasHidden;
  shell.hiddenTag = hiddenTag;
  shell.baseApplyBonus = baseApplyBonus;
  shell.visibleTags = getFlatTagLabels({ tags });

  shell.difficulty = computeCompanyDifficulty(shell);
  shell._genRating = rating;

  const inds = ["internet", "finance", "game", "anime", "edu", "manufacture", "consult", "other"];
  shell.industry = pickSeeded(inds, seed + 7771);
}
