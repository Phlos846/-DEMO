/**
 * 天赋运行时：压力、金钱、行动点、与天才/关系等特例
 */

import { hasTalent } from "./talents.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function resumeCapFor(state) {
  return state?.resumeQualityMax ?? 120;
}

const EDU_HIGH = [
  { id: "edu_qingbei", name: "清北", tier: 6 },
  { id: "edu_985", name: "985", tier: 5 },
  { id: "edu_haigui", name: "海归", tier: 5 },
];

/** 开局前改写 traits：天才固定高学历 + 研究生 */
export function patchTraitsForGenius(rolled) {
  const pick = EDU_HIGH[Math.floor(Math.random() * EDU_HIGH.length)];
  rolled.education = { id: pick.id, name: pick.name, tier: pick.tier };
  if (!rolled.extraDegrees) rolled.extraDegrees = [];
  if (!rolled.extraDegrees.some((e) => e.id === "extra_master")) {
    rolled.extraDegrees.push({
      id: "extra_master",
      name: "硕士研究生（天赋附赠）",
      effects: { resumeQuality: 8, hiddenResume: 6, hiddenInterview: 5, salaryTierBonus: 1 },
    });
  }
}

/** 合并词条后再叠加大幅属性（天才） */
export function applyGeniusStatBonus(state) {
  if (!hasTalent(state, "genius")) return;
  state.resumeQuality = clamp(state.resumeQuality + 14, 0, resumeCapFor(state));
  state.hiddenResume = clamp(state.hiddenResume + 16, 0, 100);
  state.hiddenInterview = clamp(state.hiddenInterview + 14, 0, 100);
  state.stress = clamp(state.stress - 5, 0, 100);
}

export function applyNormalHumanBonus(state) {
  if (!hasTalent(state, "normal_human")) return;
  state.resumeQuality = clamp(state.resumeQuality + 3, 0, resumeCapFor(state));
  state.hiddenResume = clamp(state.hiddenResume + 2, 0, 100);
  state.hiddenInterview = clamp(state.hiddenInterview + 2, 0, 100);
  state.stress = clamp(state.stress - 2, 0, 100);
}

/** 玉米蒸：初始压力 */
export function applyCornInitialStress(state) {
  if (!hasTalent(state, "corn")) return;
  applyStressDelta(state, 14, "corn_init");
}

/** 作弊模式：不增加压力、不扣除精力（仍可降低压力、可恢复精力） */
export function isGodMode(state) {
  return state?.godMode === true;
}

/** 精力变化（上帝模式忽略负向扣除） */
export function applyEnergyDelta(state, delta) {
  const mx = state.energyMax ?? 100;
  if (isGodMode(state) && delta < 0) return;
  state.energy = clamp(state.energy + delta, 0, mx);
}

/** 0 精力 / 100 压力立即失败（上帝模式豁免） */
export function checkInstantFail(state) {
  if (!state || state.gameOver || isGodMode(state)) return false;
  if (state.energy <= 0) {
    state.vitalFailReason = "energy";
    state.gameOver = true;
    return true;
  }
  if (state.stress >= 100) {
    state.vitalFailReason = "stress";
    state.gameOver = true;
    return true;
  }
  return false;
}

/**
 * 压力变化：耐压王锁、心理强大、大心脏、玉米蒸、清澈大学生等
 * source: event | action | offer_anxiety | corn_init | hospital | other
 */
export function applyStressDelta(state, delta, source = "other") {
  if (isGodMode(state) && delta > 0) return;
  if (delta < 0) {
    let rel = delta;
    if (hasTalent(state, "boss_is_watching") && state.offers.length > 0) {
      rel *= 1.14;
    }
    state.stress = clamp(state.stress + rel, 0, 100);
    return;
  }
  if (delta === 0) return;

  if (state.stressLockUntilDay != null && state.day < state.stressLockUntilDay) {
    if (hasTalent(state, "pressure_king")) {
      return;
    }
  }

  let d = delta;

  if (d > 0 && hasTalent(state, "corn") && source !== "corn_init") {
    d *= 1.22;
  }
  if (d > 0 && hasTalent(state, "mind_strong")) {
    d *= 0.78;
  }
  if (d > 0 && hasTalent(state, "clear_eyed")) {
    d *= 0.92;
  }
  if (d > 0 && hasTalent(state, "big_heart")) {
    if (source === "event" || source === "offer_anxiety") d *= 0.36;
    else d *= 0.82;
  }

  if (d > 0 && hasTalent(state, "boss_is_watching") && source === "offer_anxiety") {
    d *= 1.32;
  }

  if (d > 0) {
    d *= 1.2;
  }

  state.stress = clamp(state.stress + d, 0, 100);

  if (hasTalent(state, "pressure_king") && !state.pressureKingTriggered && state.stress >= 79) {
    state.pressureKingTriggered = true;
    state.stressLockUntilDay = state.day + 7;
    state.pendingTalentLog = "【耐压王】触发：7 个自然日内压力不再上升。";
  }
}

/** 零 Offer 焦虑（跨日时） */
export function applyNoOfferAnxiety(state) {
  if (state.offers.length > 0 || state.day < 3) return;
  let base = 5 + Math.min(9, Math.floor(state.day / 3));
  if (hasTalent(state, "boss_is_watching")) base += 3;
  applyStressDelta(state, base, "offer_anxiety");
}

/** 基础生活费倍率（不含咖啡固定加价） */
export function livingCostMultiplier(state) {
  let m = 1;
  if (hasTalent(state, "frugal")) m *= 0.5;
  if (hasTalent(state, "pinhaofan")) m *= 0.5;
  if (hasTalent(state, "david")) m *= 1.5;
  return Math.max(0.15, m);
}

/**
 * 现金变动；不足部分记入负债（用于结局「戒戒你好」等）
 */
export function applyMoneyDelta(state, delta) {
  let m = (state.money ?? 0) + delta;
  if (m < 0) {
    state.debt = (state.debt ?? 0) + -m;
    m = 0;
  }
  state.money = m;
}

/** 新一天开始时的金钱结算（在进入该日的 morning 前调用） */
export function applyDailyMoneyTick(state) {
  const base = state.baseLivingCost ?? 100;
  let cost = base * livingCostMultiplier(state);
  if (hasTalent(state, "coffee_life")) cost += 10;
  const dayJitter = 0.9 + Math.random() * 0.2;
  cost = Math.round(cost * dayJitter);
  applyMoneyDelta(state, -cost);

  if (hasTalent(state, "golden_touch")) {
    applyMoneyDelta(state, 18);
  }

  if (hasTalent(state, "worker_king")) {
    applyMoneyDelta(state, 52);
  }

  if (hasTalent(state, "parttime") && state.day % 2 === 0) {
    applyMoneyDelta(state, 38);
  }

  if (hasTalent(state, "rent") && state.day >= 10 && state.day % 10 === 0) {
    applyMoneyDelta(state, -200);
  }
}

/** 拼好饭：进医院 */
export function maybePinhaofanHospital(state) {
  if (!hasTalent(state, "pinhaofan")) return null;
  if (Math.random() > 0.07) return null;
  applyMoneyDelta(state, -120);
  applyStressDelta(state, 5, "hospital");
  applyEnergyDelta(state, -18);
  return "【拼好饭】吃坏肚子进医院，花钱又伤身……";
}

/** 每日开始时结算「秋招.exe」卡顿（整日有效） */
export function rollExeGlitchForDay(state) {
  if (!hasTalent(state, "exe_not_responding")) {
    state.exeGlitchToday = 0;
    return;
  }
  state.exeGlitchToday = Math.random() < 0.12 ? -1 : 0;
}

/** 计算当日最大行动点（不含当前已消耗） */
export function computeMaxActionPointsForDay(state) {
  let cap = 3;
  if (hasTalent(state, "efficient")) cap += 1;
  if (hasTalent(state, "parttime") && state.day % 2 === 0) cap -= 1;
  if (hasTalent(state, "night_owl") && state.day % 2 === 1) cap += 1;
  cap += state.exeGlitchToday ?? 0;
  return clamp(cap, 1, 8);
}

/** 跨日被动精力恢复 */
export function applyPassiveDayRecovery(state) {
  let rec = 14;
  if (hasTalent(state, "cattle")) rec = Math.round(rec * 1.25);
  if (hasTalent(state, "coffee_life")) rec += 4;
  if (hasTalent(state, "night_owl") && state.day % 2 === 0) {
    rec = Math.round(rec * 0.62);
  }
  const mx = state.energyMax ?? 100;
  state.energy = clamp(state.energy + rec, 0, mx);
}

/** 侧面打听精力消耗 */
export function talentRevealEnergyCost(state) {
  let c = 9;
  if (hasTalent(state, "maimai_lurker")) c -= 2;
  return Math.max(5, c);
}

/** 学习额外收益 */
export function talentStudyBonus(state) {
  let hr = 0;
  let hi = 0;
  let rq = 0;
  if (hasTalent(state, "love_study")) {
    hr += 2;
    hi += 1;
    rq += 3;
  }
  if (hasTalent(state, "ppt_weaver")) {
    rq += 2;
  }
  return { hiddenResume: hr, hiddenInterview: hi, resumeQuality: rq };
}

/** 简历/面试概率加值（乘在公式里 1+r / 1+i；数值约为原 1.3×） */
export function talentPassBonus(state) {
  let r = 0;
  let i = 0;
  if (hasTalent(state, "bluff")) {
    r += 0.0455;
    i += 0.052;
  }
  if (hasTalent(state, "cattle")) {
    r += 0.026;
    i += 0.0325;
  }
  if (hasTalent(state, "parttime")) {
    r += 0.0195;
    i += 0.0156;
  }
  if (hasTalent(state, "normal_human")) {
    r += 0.013;
    i += 0.013;
  }
  if (hasTalent(state, "offer_hunter")) {
    r += 0.0156;
    i -= 0.0078;
  }
  return { resume: r, interview: i };
}

/** 投递精力基础减免（在 applications 里再 clamp） */
export function talentApplyEnergyDiscount(state) {
  if (hasTalent(state, "resume_tailor")) return 2;
  if (hasTalent(state, "offer_hunter")) return 1;
  return 0;
}

/** 关系户：尝试直接给 Offer */
export function tryNepotismOffer(state) {
  if (!hasTalent(state, "connection")) return null;
  if (Math.random() > 0.045) return null;
  const offer = {
    companyId: "nepotism",
    name: "关系内推·待定岗",
    logo: "🤝",
    tags: ["内推通道", "年薪18万-22万档", "流程简化"],
    salaryTier: "年薪18万-22万（关系加成）",
    industry: "other",
    isPyramidTrap: false,
    salaryDisplayMultiplier: hasTalent(state, "bluff") ? 1.2 : 1,
  };
  state.offers.push(offer);
  return "【家里有关系】神秘力量投递了一份高薪意向，记得请吃饭。";
}
