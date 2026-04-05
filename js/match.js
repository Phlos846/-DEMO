/**
 * 求职匹配分（类 ELO）+ 简历/面试通过率
 *
 * 通过率 ≈ 基础成功率(学历) × 简历完整度修正 × 公司通过难度修正(好/一般/坏词条) × 市场匹配(薪资档与学历) × 分层微调(resumeStratifiedPassTune) × 其他(隐藏数值、天赋等)
 * 薪资档抽样：高斯中心强锚定「该学历期望档」中位数，并与 ELO bias、完成度（最多约 +5 档≈+5w 右移）混合。
 * 待遇/风评词条：随薪资档分位 + 学历调整权重；完成度低更易少绿词条、高更易多绿词条；分层微调抵消词条分布对期望通过率的系统性偏移。
 * 薪资条目的好/坏/一般仍计入 countTagQualities，与待遇、风评一起进公司通过难度修正。
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
import { getNetaPresetById } from "./netaCompanies.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** 0–1，120 满值等价于旧版 100 满值在公式中的作用 */
function resumeQualityNorm(state) {
  const cap = state?.resumeQualityMax ?? 120;
  if (cap <= 0) return 0;
  return clamp((state?.resumeQuality ?? 0) / cap, 0, 1);
}

/**
 * 蓝色天赋「越薄越勇」：按当前简历完整度（绝对值，相对 resumeQualityMax）分段线性。
 * 完成度 0 → 乘区 0；0–1 → 0→2；1–50 → 2→1.2；50 以上按同斜率延伸。
 */
function thinnerBolderPassMult(state) {
  if (!hasTalent(state, "thinner_bolder")) return 1;
  const cap = state?.resumeQualityMax ?? 120;
  let rq = state?.resumeQuality ?? 0;
  rq = clamp(rq, 0, cap);
  if (rq <= 0) return 0;
  const slope = (1.2 - 2) / (50 - 1);
  if (rq <= 1) {
    return 2 * rq;
  }
  if (rq <= 50) {
    return 2 + (rq - 1) * slope;
  }
  return 1.2 + (rq - 50) * slope;
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

/** 薪资 + 待遇 + 风评词条的好/一般/坏计数 */
export function countTagQualities(tags) {
  let good = 0;
  let normal = 0;
  let bad = 0;
  const q = (x) => {
    if (x === "good" || x === "excellent") good += 1;
    else if (x === "bad") bad += 1;
    else normal += 1;
  };
  if (!tags?.salary) return { good: 0, normal: 0, bad: 0 };
  q(tags.salary.quality);
  q(tags.treatment.quality);
  for (const r of tags.reputation ?? []) q(r.quality);
  return { good, normal, bad };
}

/**
 * 公司通过难度修正：仅由好/一般/坏词条数量决定；好词条越多修正越低（通过越难）。
 */
export function companyTagPassModifier(tags) {
  const { good, bad } = countTagQualities(tags);
  const mod = 1.06 - 0.09 * good + 0.06 * bad;
  return clamp(mod, 0.42, 1.32);
}

/** 学历越高基础成功率越高（与 traits 中学历 tier 对应）；表内系数读出后统一 ×1.1；含硕士/博士附加学历时基础 ×1.2；最后统一 ×0.9。简历过筛在 expectedResumePass 内再 ×1.05（各学位投递基础 +5%）。 */
function educationBasePassRate(state) {
  const eduId = state?.traits?.education?.id;
  const map = {
    edu_qingbei: 0.287,
    edu_985: 0.245,
    edu_haigui: 0.238,
    edu_211: 0.2065,
    edu_puben: 0.175,
    /** 大专 < 野鸡 < 普本，整体较前版略提高 */
    edu_yeji: 0.165,
    edu_dazhuan: 0.14,
  };
  let base = map[eduId] ?? 0.162;
  base *= 1.1;
  if (
    state?.traits?.extraDegrees?.some(
      (e) => e.id === "extra_master" || e.id === "extra_phd",
    )
  ) {
    base *= 1.2;
  }
  return base * 0.9;
}

/**
 * 简历完整度修正：完成度 30/120（满值 25%）时因子为 1，满值（100%）时为 1.8，其间线性。
 * rq = 当前完整度 / 上限。
 */
function resumeQualityPassModifier(state) {
  const rq = resumeQualityNorm(state);
  const rq30 = 30 / 120;
  const m = 1 + (0.8 / (1 - rq30)) * (rq - rq30);
  return clamp(m, 0.5, 2.2);
}

function hiddenResumePassModifier(state) {
  const hr = (state.hiddenResume ?? 50) / 100;
  return 0.88 + 0.24 * hr;
}

/** 与开局 hiddenInterview 默认 45 对齐时因子为 1 */
function hiddenInterviewPassModifier(state) {
  const hi = (state.hiddenInterview ?? 45) / 100;
  return 0.892 + 0.24 * hi;
}

/**
 * 市场匹配：薪资档与学历期望档越接近修正越高（ELO 抽样中心已对齐学历，使多数投递落在匹配带）。
 */
function targetSalaryTierIndexForEduTier(eduTier) {
  const m = { 0: 2, 1: 4, 3: 8, 4: 11, 5: 14, 6: 17 };
  return m[eduTier] ?? 11;
}

function marketAlignmentMod(state, company) {
  const eduTier = state.traits?.education?.tier ?? 3;
  const salTier = company.tags?.salary?.tier ?? 12;
  const target = targetSalaryTierIndexForEduTier(eduTier);
  const dist = Math.abs(salTier - target);
  const align = 1 - Math.min(1, dist / 14);
  return 0.92 + 0.16 * align;
}

/** 供 UI / 难度展示：词条越好（通过越容易）则难度数值越低 */
export function computeCompanyDifficulty(company) {
  const tags = company.tags;
  if (!tags) return 0.5;
  const cmod = companyTagPassModifier(tags);
  const t = (cmod - 0.42) / (1.32 - 0.42);
  return clamp(0.88 - 0.76 * t, 0.12, 0.94);
}

function is211Science(state) {
  return state.traits?.education?.id === "edu_211" && state.traits?.major?.id === "major_sci";
}

/** 年薪区间下限（万），来自标签如「年薪18万-19万」 */
function salaryLowWanFromLabel(label) {
  const m = (label ?? "").match(/年薪([\d.]+)万/);
  return m ? parseFloat(m[1]) : 0;
}

function salaryLowWanFromCompany(company) {
  return salaryLowWanFromLabel(company.tags?.salary?.label ?? "");
}

/** 12w 以下坏、12w–18w（含12不含18）一般、18w–25w（不含25）好、25w 及以上极好 */
function salaryQualityFromAnnualLowWan(lowWan) {
  if (lowWan < 12) return "bad";
  if (lowWan < 18) return "normal";
  if (lowWan < 25) return "good";
  return "excellent";
}

/** 211+理科 对特定薪资带的额外修正（乘性） */
function passMultiplier211Sci(state, company) {
  if (!is211Science(state)) return 1;
  const low = salaryLowWanFromCompany(company);
  if (low >= 18) return 0.88;
  if (low >= 15 && low < 18) return 1.06;
  return 1;
}

/**
 * 与刷新岗位时薪资高斯中心一致：学历锚点 + ELO + 简历完成度右移，表示「当前更容易刷到的」薪资档中心。
 */
function salarySampleMuForState(state) {
  const bias = ratingToBias(state.jobSearchRating ?? INITIAL_RATING);
  const eduTier = state?.traits?.education?.tier ?? 3;
  const n = SALARY_BANDS_META.length;
  const targetIdx = targetSalaryTierIndexForEduTier(eduTier);
  const rq = resumeQualityNorm(state);
  const spreadBase = (n - 1) * (0.48 + 0.22 * bias);
  const legacyShift = educationSalaryMuShift(eduTier ?? 3);
  let mu = 0.63 * targetIdx + 0.37 * (spreadBase + legacyShift);
  mu += rq * 5;
  return clamp(mu, 0.5, n - 1.5);
}

/**
 * 向上投递：岗位薪资档高于「当前更容易刷到的薪资水平」（sample mu）时期望 ×0.8。
 * 传销隐藏 tag（hid_pyramid）不套用惩罚。
 */
function upwardStretchResumePenaltyMult(state, company) {
  if (company.hiddenTag?.id === "hid_pyramid") return 1;
  const tags = company.tags;
  if (!tags?.salary) return 1;
  const mu = salarySampleMuForState(state);
  const salTier = tags.salary?.tier ?? 0;
  if (salTier > mu) return 0.8;
  return 1;
}

export function expectedResumePass(state, company, hiddenRevealed) {
  if (state.godMode) return 1;
  if (company.hiddenTag?.id === "hid_pyramid") return 1;
  const tags = company.tags;
  if (!tags) return 0.02;

  const base = educationBasePassRate(state) * 1.05;
  const cmod = companyTagPassModifier(tags);
  const resumeMod = resumeQualityPassModifier(state);
  const hidMod = hiddenResumePassModifier(state);
  const marketMod = marketAlignmentMod(state, company);
  const tb = talentPassBonus(state);

  let p =
    base *
    cmod *
    resumeMod *
    hidMod *
    marketMod *
    (1 + tb.resume) *
    passMultiplier211Sci(state, company);

  if (hiddenRevealed && company.hiddenTag) {
    p *= 1 + 0.04 + (company.hiddenTag.applyMod ?? 0) * 0.0015;
  }
  if (hasTalent(state, "otaku_pro") && (company.industry === "game" || company.industry === "anime")) {
    p *= 1.078;
  }
  if (hasTalent(state, "ddl_warrior") && state.day >= (state.maxDays ?? 30) - 9) {
    p *= 1.2;
  }
  p *= thinnerBolderPassMult(state);
  p *= upwardStretchResumePenaltyMult(state, company);
  if (hasTalent(state, "resume_red_flag")) p *= 0.89;

  p *= resumeStratifiedPassTune(state, tags);

  return clamp(p, 0.02, 0.92);
}

export function expectedInterviewPass(state, company, hiddenRevealed) {
  if (state.godMode) return 1;
  if (company.hiddenTag?.id === "hid_pyramid") return 1;
  const tags = company.tags;
  if (!tags) return 0.025;

  const base = educationBasePassRate(state);
  const cmod = companyTagPassModifier(tags);
  const resumeMod = resumeQualityPassModifier(state);
  const hidMod = hiddenInterviewPassModifier(state);
  const marketMod = marketAlignmentMod(state, company);
  const tb = talentPassBonus(state);

  let p =
    base *
    cmod *
    resumeMod *
    hidMod *
    marketMod *
    (1 + tb.interview) *
    passMultiplier211Sci(state, company);

  if (hiddenRevealed) p *= 1.045;
  if (hasTalent(state, "otaku_pro") && (company.industry === "game" || company.industry === "anime")) {
    p *= 1.085;
  }
  if (hasTalent(state, "ddl_warrior") && state.day >= (state.maxDays ?? 30) - 9) {
    p *= 1.2;
  }
  p *= thinnerBolderPassMult(state);
  if (hasTalent(state, "stage_fright")) p *= 0.87;

  p *= resumeStratifiedPassTune(state, tags);

  return clamp(p, 0.025, 0.92);
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

/** 学历越低 mu 越靠左（低薪档），越高越靠高薪档；与 ELO bias 叠加 */
function educationSalaryMuShift(eduTier) {
  const m = { 0: -6.8, 1: -4.5, 3: -2.0, 4: 0, 5: 3.0, 6: 5.0 };
  return m[eduTier] ?? 0;
}

/**
 * 薪资抽样：强锚定「该学历期望档」中位数 + 匹配分扩散；简历完成度高时整体右移（最多约 +5 个薪资带，约 +5w）。
 */
function salaryWeightsForState(state, bias) {
  const n = SALARY_BANDS_META.length;
  const mu = salarySampleMuForState(state);
  const sigma = Math.max(3.1, 4.9 - 0.7 * Math.abs(bias));
  const w = [];
  for (let i = 0; i < n; i++) {
    w.push(Math.exp(-0.5 * ((i - mu) / sigma) * ((i - mu) / sigma)));
  }
  return w;
}

function pickSalaryIndexByRating(seed, state) {
  const bias = ratingToBias(state.jobSearchRating ?? INITIAL_RATING);
  const w = salaryWeightsForState(state, bias);
  const sum = w.reduce((a, b) => a + b, 0);
  let r = ((hashSeed(seed) >>> 0) / 4294967296 + rnd() * 0.12) % 1;
  r *= sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

/** 低完成度更易刷到绿词条较少岗位，高完成度更易刷到绿词条较多岗位（待遇+风评池内权重） */
function resumeStratifiedTagMultipliers(state) {
  const rq = resumeQualityNorm(state);
  return {
    goodPull: 0.48 + 0.62 * rq,
    badPull: 1.24 - 0.44 * rq,
    normalPull: 0.88 + 0.22 * rq,
  };
}

/** 风评条数：低完成度侧重 1～2 条，高完成度侧重 2～4 条，便于出现「1～2 绿 / 2～3 绿」组合 */
function pickReputationCountForResume(u, rq) {
  if (rq < 0.34) {
    if (u < 0.36) return 1;
    if (u < 0.76) return 2;
    if (u < 0.91) return 3;
    if (u < 0.98) return 4;
    return 5;
  }
  if (rq > 0.66) {
    if (u < 0.1) return 1;
    if (u < 0.3) return 2;
    if (u < 0.64) return 3;
    if (u < 0.88) return 4;
    return 5;
  }
  if (u < 0.2) return 1;
  if (u < 0.44) return 2;
  if (u < 0.68) return 3;
  if (u < 0.86) return 4;
  return 5;
}

/**
 * 轻度补偿：使分层词条后 cmod 相对「该完成度下典型绿词条数」不过度偏离，保持投递/面试概率总体浮动区间稳定。
 */
function resumeStratifiedPassTune(state, tags) {
  const rq = resumeQualityNorm(state);
  const cmod = companyTagPassModifier(tags);
  const gStar = 1.4 + 0.92 * rq;
  const bStar = Math.max(0.12, 0.4 - 0.12 * rq);
  const cStar = clamp(1.06 - 0.09 * gStar + 0.06 * bStar, 0.42, 1.32);
  const mix = 0.22;
  const r = (1 - mix) + mix * (cStar / cmod);
  return clamp(r, 0.93, 1.07);
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

/**
 * 低学历 + 低薪档：更易出坏词条；低学历 + 中薪档：更易出一般词条。
 * 高学历略偏向高薪档的好词条（与 rating 原逻辑叠加）。
 */
function tagQualityWeightsForEducationSalary(eduTier, salIdx) {
  const n = SALARY_BANDS_META.length;
  const t = n > 1 ? salIdx / (n - 1) : 0.5;
  let goodBoost = 1;
  let normalBoost = 1;
  let badBoost = 1;
  if (eduTier <= 1) {
    if (t < 0.4) {
      badBoost = 1.9;
      goodBoost = 0.48;
      normalBoost = 0.92;
    } else if (t < 0.7) {
      normalBoost = 1.7;
      goodBoost = 0.68;
      badBoost = 0.85;
    } else {
      goodBoost = 0.88;
      badBoost = 1.08;
    }
  } else if (eduTier === 3) {
    if (t < 0.35) {
      badBoost = 1.25;
      goodBoost = 0.82;
    } else if (t < 0.65) {
      normalBoost = 1.22;
    }
  } else if (eduTier >= 6) {
    if (t > 0.55) {
      goodBoost = 1.22;
      badBoost = 0.8;
    }
  } else if (eduTier >= 5) {
    if (t > 0.52) {
      goodBoost = 1.12;
      badBoost = 0.88;
    }
  }
  return { goodBoost, normalBoost, badBoost };
}

function pickTreatmentByRating(state, seed, rating, salIdx, eduTier) {
  const rb = ratingToBias(rating);
  const shift = 1 + 0.35 * rb;
  const tw = tagQualityWeightsForEducationSalary(eduTier ?? 3, salIdx);
  const rs = resumeStratifiedTagMultipliers(state);
  const items = TREATMENT_TAGS.map((x) => {
    let w = 1;
    if (x.quality === "good" || x.quality === "excellent") w *= shift * tw.goodBoost * rs.goodPull;
    else if (x.quality === "bad") w *= (2 - shift) * tw.badBoost * rs.badPull;
    else w *= tw.normalBoost * rs.normalPull;
    return { item: x, w: Math.max(0.06, w) };
  });
  const raw = weightedChoose(items, seed + 1000);
  return { id: raw.id, label: raw.label, quality: raw.quality };
}

function pickReputationSet(state, seed, rating, salIdx, eduTier) {
  const rq = resumeQualityNorm(state);
  const u = (hashSeed(seed + 7) >>> 0) / 4294967296;
  const count = pickReputationCountForResume(u, rq);
  const rb = ratingToBias(rating);
  const shift = 1 + 0.4 * rb;
  const tw = tagQualityWeightsForEducationSalary(eduTier ?? 3, salIdx);
  const rs = resumeStratifiedTagMultipliers(state);
  let pool = REPUTATION_TAGS.map((x) => {
    let w = 1;
    if (x.quality === "good" || x.quality === "excellent") w *= shift * tw.goodBoost * rs.goodPull;
    else if (x.quality === "bad") w *= (2 - shift) * tw.badBoost * rs.badPull;
    else w *= tw.normalBoost * rs.normalPull;
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

const MAX_REPUTATION_TAGS = 5;

/**
 * 传销陷阱：额外展示 1–3 个绿色（好）风评（种子随机，非固定 +3），便于包装又不与「风评条数」强绑定。
 * 已满 5 条时改为用好评换差评/一般，条数不变。
 */
function augmentPyramidVisibleGoodTags(tags, seed) {
  const wasFull = tags.reputation.length >= MAX_REPUTATION_TAGS;
  let existing = new Set(tags.reputation.map((r) => r.id));
  let candidates = REPUTATION_TAGS.filter((x) => x.quality === "good" && !existing.has(x.id));
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = ((hashSeed(seed + i * 997) >>> 0) % (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const rawDesired = 1 + ((hashSeed(seed + 9021) >>> 0) % 3);
  const room = Math.max(0, MAX_REPUTATION_TAGS - tags.reputation.length);
  const nAdd = Math.min(rawDesired, room, candidates.length);
  for (let i = 0; i < nAdd; i++) {
    const x = candidates[i];
    tags.reputation.push({ id: x.id, label: x.label, quality: x.quality });
    existing.add(x.id);
  }
  if (wasFull && candidates.length) {
    candidates = REPUTATION_TAGS.filter((x) => x.quality === "good" && !existing.has(x.id));
    if (candidates.length) {
      const idx = tags.reputation.findIndex((r) => r.quality !== "good");
      if (idx >= 0) {
        const x = candidates[((hashSeed(seed + 6001) >>> 0) % candidates.length)];
        tags.reputation[idx] = { id: x.id, label: x.label, quality: x.quality };
      }
    }
  }
}

/** 梗公司：固定薪资档 + 待遇/风评，与 netaCompanies 预设一致 */
function materializeNetaCompany(state, shell) {
  const preset = getNetaPresetById(shell.netaPresetId);
  const salMeta = preset ? SALARY_BANDS_META.find((b) => b.id === preset.salaryBandId) : null;
  const trMeta = preset ? TREATMENT_TAGS.find((t) => t.id === preset.treatmentId) : null;
  if (!preset || !salMeta || !trMeta) {
    delete shell.isNetaRef;
    delete shell.netaPresetId;
    materializeCompany(state, shell);
    return;
  }
  const salary = {
    id: salMeta.id,
    label: salMeta.label,
    tier: salMeta.tier,
    quality: salaryQualityFromAnnualLowWan(salaryLowWanFromLabel(salMeta.label)),
  };
  const treatment = { id: trMeta.id, label: trMeta.label, quality: trMeta.quality };
  const reputation = [];
  for (const rid of preset.reputationIds) {
    const r = REPUTATION_TAGS.find((x) => x.id === rid);
    if (r) reputation.push({ id: r.id, label: r.label, quality: r.quality });
  }
  const tags = { salary, treatment, reputation };
  let hiddenTag = null;
  if (preset.hasHidden) {
    if (preset.hiddenId) {
      const h = HIDDEN_POOL.find((x) => x.id === preset.hiddenId);
      if (h) hiddenTag = { ...h };
    } else {
      hiddenTag = { ...pickSeeded(HIDDEN_POOL, shell.baseSeed + 5000) };
    }
  }
  if (hiddenTag?.id === "hid_pyramid") {
    augmentPyramidVisibleGoodTags(tags, shell.baseSeed + 9021);
  }
  shell.tags = tags;
  shell.hasHidden = !!hiddenTag;
  shell.hiddenTag = hiddenTag;
  shell.baseApplyBonus = computeBaseApplyBonusFromTags(tags, tags.salary.tier);
  shell.visibleTags = getFlatTagLabels({ tags });
  shell.difficulty = computeCompanyDifficulty(shell);
  shell._genRating = state.jobSearchRating;
  shell.industry = preset.industry;
}

/** 上帝模式：顶配薪资 + 全好标签、无隐藏雷 */
function materializeCompanyGodMode(shell) {
  const top = SALARY_BANDS_META[SALARY_BANDS_META.length - 1];
  const salary = {
    id: top.id,
    label: top.label,
    tier: top.tier,
    quality: salaryQualityFromAnnualLowWan(salaryLowWanFromLabel(top.label)),
  };
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
  if (shell.isNetaRef && shell.netaPresetId) {
    materializeNetaCompany(state, shell);
    return;
  }
  if (state.godMode) {
    materializeCompanyGodMode(shell);
    return;
  }
  const rating = state.jobSearchRating;
  const seed = shell.baseSeed;
  const eduTier = state.traits?.education?.tier ?? 3;
  let salIdx = pickSalaryIndexByRating(seed, state);
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
    quality: salaryQualityFromAnnualLowWan(salaryLowWanFromLabel(salMeta.label)),
  };

  const treatment = pickTreatmentByRating(state, seed + 1000, rating, salIdx, eduTier);
  const reputation = pickReputationSet(state, seed + 2000, rating, salIdx, eduTier);
  const tags = { salary, treatment, reputation };

  const hasHidden = rnd() < 0.4;
  let hiddenTag = null;
  if (hasHidden) {
    /** 相对旧版「抽到传销后 50% 换掉」：去掉折损，传销条件概率由 1/18 提至 1/9（+100%） */
    hiddenTag = { ...pickSeeded(HIDDEN_POOL, seed + 5000) };
  }

  if (hiddenTag?.id === "hid_pyramid") {
    augmentPyramidVisibleGoodTags(tags, seed + 9021);
  }

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
