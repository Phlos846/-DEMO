/**
 * 天赋运行时：压力、金钱、行动点、与天才/关系等特例
 */

import { hasTalent } from "./talents.js";
import {
  aggregateStressGainMult,
  aggregateStressReliefMult,
  aggregateEnergyDrainMult,
  aggregateEnergyRecoverMult,
  aggregatePassiveEnergyRecoverMult,
} from "./transientEffects.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function resumeCapFor(state) {
  return state?.resumeQualityMax ?? 120;
}

function stressCap(state) {
  return state?.stressMax ?? 100;
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
  state.stress = clamp(state.stress - 5, 0, stressCap(state));
}

export function applyNormalHumanBonus(state) {
  if (!hasTalent(state, "normal_human")) return;
  state.resumeQuality = clamp(state.resumeQuality + 3, 0, resumeCapFor(state));
  state.hiddenResume = clamp(state.hiddenResume + 2, 0, 100);
  state.hiddenInterview = clamp(state.hiddenInterview + 2, 0, 100);
  state.stress = clamp(state.stress - 2, 0, stressCap(state));
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

/** 精力变化（上帝模式忽略负向扣除）；受临时 buff/debuff：精力消耗/回复倍率 */
export function applyEnergyDelta(state, delta) {
  const mx = state.energyMax ?? 100;
  if (isGodMode(state) && delta < 0) return;
  let adj = delta;
  if (delta < 0) {
    adj = delta * aggregateEnergyDrainMult(state);
  } else if (delta > 0) {
    adj = delta * aggregateEnergyRecoverMult(state);
  }
  state.energy = clamp(state.energy + adj, 0, mx);
}

/** 0 精力 / 满压力立即失败（上帝模式豁免）；压力即动力的满压缓冲整场仅一次 */
export function checkInstantFail(state) {
  if (!state || state.gameOver || isGodMode(state)) return false;
  if (state.energy <= 0) {
    state.vitalFailReason = "energy";
    state.gameOver = true;
    return true;
  }
  const cap = stressCap(state);
  if (
    state.stress < cap &&
    hasTalent(state, "stress_to_power") &&
    cap >= 120 &&
    state.stress120GraceDay != null
  ) {
    state.stress120GraceConsumed = true;
    state.stress120GraceDay = null;
  }
  if (state.stress >= cap) {
    if (hasTalent(state, "stress_to_power") && cap >= 120) {
      if (state.stress120GraceConsumed) {
        state.vitalFailReason = "stress";
        state.gameOver = true;
        return true;
      }
      if (state.stress120GraceDay == null) {
        state.stress120GraceDay = state.day;
        return false;
      }
      if (state.day > state.stress120GraceDay) {
        state.vitalFailReason = "stress";
        state.gameOver = true;
        return true;
      }
      return false;
    }
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
    rel *= aggregateStressReliefMult(state);
    state.stress = clamp(state.stress + rel, 0, stressCap(state));
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
    d *= aggregateStressGainMult(state);
  }

  if (d > 0) {
    d *= 1.2;
  }

  state.stress = clamp(state.stress + d, 0, stressCap(state));

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
  if (hasTalent(state, "frail_body")) rec = Math.round(rec * 0.72);
  if (hasTalent(state, "coffee_life")) rec += 4;
  if (hasTalent(state, "night_owl") && state.day % 2 === 0) {
    rec = Math.round(rec * 0.62);
  }
  rec = Math.round(rec * aggregatePassiveEnergyRecoverMult(state));
  const mx = state.energyMax ?? 100;
  state.energy = clamp(state.energy + rec, 0, mx);
}

/**
 * 黑色天赋：每日开始时（runMorningPhase 入口）
 * 作弊模式跳过负面
 */
export function applyBlackTalentMorning(state) {
  if (!state || isGodMode(state)) return;
  if (hasTalent(state, "overthink")) {
    applyStressDelta(state, 2, "other");
  }
  if (hasTalent(state, "echo_chamber")) {
    const r = state.jobSearchRating ?? 1500;
    state.jobSearchRating = clamp(r - 3, 1100, 1900);
  }
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

/** 结局页：天赋相关的数值摘要（与文案 desc 互补） */
export function getEndingTalentNumericHints(state) {
  const hints = [];
  const tb = talentPassBonus(state);
  if (tb.resume > 0 || tb.interview > 0) {
    hints.push(
      `简历/面试概率乘区：×${(1 + tb.resume).toFixed(3)} / ×${(1 + tb.interview).toFixed(3)}`,
    );
  }
  if (hasTalent(state, "thinner_bolder")) {
    const cap = state.resumeQualityMax ?? 120;
    let rq = Math.max(0, Math.min(cap, state.resumeQuality ?? 0));
    let m = 1;
    if (rq <= 0) m = 0;
    else {
      const slope = (1.2 - 2) / (50 - 1);
      if (rq <= 1) m = 2 * rq;
      else if (rq <= 50) m = 2 + (rq - 1) * slope;
      else m = 1.2 + (rq - 50) * slope;
    }
    hints.push(`越薄越勇：期望乘区 ×${m.toFixed(2)}（完整度 0→0，1→2，50→1.2，线性）`);
  }
  const sb = talentStudyBonus(state);
  if (sb.hiddenResume || sb.hiddenInterview || sb.resumeQuality) {
    hints.push(
      `「学习」额外：隐藏简历+${sb.hiddenResume} · 隐藏面试+${sb.hiddenInterview} · 完整度+${sb.resumeQuality}`,
    );
  }
  const ad = talentApplyEnergyDiscount(state);
  if (ad > 0) hints.push(`投递单次精力减免：-${ad}`);
  if (hasTalent(state, "maimai_lurker")) {
    hints.push(`侧面打听精力：${talentRevealEnergyCost(state)}（含天赋）`);
  }
  if ((state.energyMax ?? 100) !== 100) {
    hints.push(`精力上限：${state.energyMax}`);
  }
  if ((state.stressMax ?? 100) !== 100) {
    hints.push(`压力上限：${state.stressMax}`);
  }
  const cap = computeMaxActionPointsForDay(state);
  if (cap !== 3 || (state.exeGlitchToday ?? 0) !== 0) {
    hints.push(`结算日行动点上限：${cap}（含天赋与当日特殊）`);
  }
  if (hasTalent(state, "frail_body")) {
    hints.push("体虚：跨日精力恢复 ×0.72（相对基础，与牛马等叠乘）");
  }
  if (hasTalent(state, "resume_red_flag")) {
    hints.push("简历疑云：简历过筛期望 ×0.89");
  }
  if (hasTalent(state, "stage_fright")) {
    hints.push("面试怯场：面试期望 ×0.87");
  }
  if (hasTalent(state, "overthink")) {
    hints.push("精神内耗：每日开始 +2 压力");
  }
  if (hasTalent(state, "echo_chamber")) {
    hints.push("信息茧房：每日开始匹配分 −3（夹在 1100–1900）");
  }
  return hints;
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
