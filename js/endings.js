import { salaryLowWanFromTierLabel } from "./companies.js?v=1.1.42";
import { BURNOUT_STRESS } from "./burnout.js?v=1.1.42";
import { SPECIAL_ENDINGS } from './specialEndingContent.js?v=1.1.42';
/** 多结局：按优先级判定（特殊结局 > 就业质量线） */

import { hasTalent } from "./talents.js?v=1.1.42";
import { educationTagClass } from "./eduTags.js?v=1.1.42";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 结算界面展示用 emoji，与 computeEnding 返回的 id 一一对应。
 * 未列出的 id 时由 getEndingEmoji 回退。
 */
export const ENDING_EMOJI = {
  ...Object.fromEntries(SPECIAL_ENDINGS.map(e => [e.id, e.emoji])),
  vital_energy: "🪫",
  vital_stress: "🤯",
  lottery: "🎰",
  pyramid: "🚨",
  jiejie: "📺",
  burnout: "😵",
  postgrad_tv: "📚",
  civil_tv: "🏛️",
  grand_slam: "🏆",
  underdog_snipe: "🎯",
  premium_salary: "💎",
  startup: "🚀",
  startup_dream: "🌱",
  inherit_family: "👔",
  resume_tsunami: "🌊",
  jobless_tired: "🛏️",
  jobless_spring: "🌸",
  hungry_ok: "🍚",
  industry_jinx: "🕯️",
  chill_hire: "😌",
  stacked: "🏅",
  popular: "⭐",
  scholar_risk: "🧭",
  balance: "⚖️",
  normal_ok: "✅",
  outsourcing_fate: "📦",
  default_win: "🛟",
  early_settle: "🏁",
  event_immigration_spam: "🌍",
  event_credit_crisis: "📑",
  event_headhunter_rush: "☎️",
};

export function getEndingEmoji(endingId) {
  if (!endingId) return "📋";
  return ENDING_EMOJI[endingId] ?? "📋";
}

/** 图鉴用：全结局 id + 标题 + 正文（与 computeEnding 一致） */
export const ENDING_CATALOG = [
  ...SPECIAL_ENDINGS,
  {
    id: "vital_energy",
    title: "体力归零",
    body: "持续的消耗让你难以继续准备和面试。你暂停了这一轮秋招，先安排休息，恢复日常生活。",
  },
  {
    id: "vital_stress",
    title: "压力爆表",
    body: "压力值顶到极限，心悸、失眠、对一切消息过敏。你意识到自己需要停下来了：再硬撑下去，拿到的 Offer 也换不回状态。",
  },
  {
    id: "lottery",
    title: "意外之财",
    body: "一笔意外的奖金改变了你的预算。你决定暂缓求职，重新考虑接下来的生活与工作安排。",
  },
  {
    id: "pyramid",
    title: "传销结局",
    body: "录用条件要求你先购买产品，再发展新的成员。核对信息后，你发现这是一家传销组织，决定停止联系并寻求帮助。",
  },
  {
    id: "jiejie",
    title: "账单之后",
    body: "消费账单和生活开销逐渐超出了承受范围。你暂停求职安排，整理债务，与家人商量可行的还款计划。",
  },
  {
    id: "burnout",
    title: "身心透支",
    body: "高压消耗了你的精力与耐心，你决定暂停秋招，先把生活节奏找回来。",
  },
  {
    id: "early_settle",
    title: "提前决定",
    body: "比较过手中的 Offer 后，你决定接受当前的机会，提前结束秋招。接下来，还有入职手续和新的生活安排需要准备。",
  },
  {
    id: "postgrad_tv",
    title: "转向考研",
    body: "这段时间的学习让你重新考虑了自己的方向。你决定结束这一轮秋招，把接下来的时间用于准备研究生考试。",
  },
  {
    id: "civil_tv",
    title: "转向考公",
    body: "准备期间，你逐渐明确了自己对工作环境的期待。你决定暂停企业求职，转而准备公务员考试。",
  },
  {
    id: "grand_slam",
    title: "大满贯",
    body: "五份以上的 Offer 给了你充足的选择空间。薪资之外，你开始认真比较城市、团队和未来的工作内容。",
  },
  {
    id: "underdog_snipe",
    title: "超出预期的机会",
    body: "履历并不突出，但这次岗位需求与你的表现恰好契合。你拿到了超出预期的薪资，也开始为入职后的工作做准备。",
  },
  {
    id: "premium_salary",
    title: "高薪工作",
    body: "扎实的准备和面试表现为你带来了一份高薪 Offer。你确认了录用条件，终于可以从密集的求职日程中歇一歇。",
  },
  {
    id: "startup",
    title: "创业结局",
    body: "想法、伙伴和启动资金逐渐有了着落。你决定结束秋招，尝试把项目做成一门生意，下一步是找到真正愿意付费的用户。",
  },
  {
    id: "startup_dream",
    title: "创业筹备中",
    body: "你花了不少时间讨论和验证创业想法，但资金或团队还没有准备好。项目暂时留在筹备阶段，你打算积累经验后再继续。",
  },
  {
    id: "inherit_family",
    title: "继承家业",
    body: "秋招没有带来满意的机会，你接受了家里的邀请，回去参与经营。熟悉的环境里，也有需要重新学习的工作和责任。",
  },
  {
    id: "resume_tsunami",
    title: "简历海啸",
    body: "你提交了许多简历，却没有等到合适的录用通知。整理过这一轮反馈后，你决定重新检查岗位方向和项目表达，为下一次招聘做准备。",
  },
  {
    id: "jobless_tired",
    title: "待业结局 · 春招再战",
    body: "这一轮没有找到心仪的工作，长时间的准备也让你十分疲惫。你决定先休整，再为春招安排新的计划。",
  },
  {
    id: "jobless_spring",
    title: "待业结局 · 春招再战",
    body: "这一轮没有找到心仪的工作，但你已经积累了一些面试经验。你开始整理反馈、修改简历，为春招保留机会。",
  },
  {
    id: "hungry_ok",
    title: "第一份工作",
    body: "这份 Offer 的薪资不高，但能支持目前的生活。你决定从这份工作开始，积累经验，再考虑之后的发展。",
  },
  {
    id: "industry_jinx",
    title: "波动中的选择",
    body: "你拿到的机会伴随着业务调整或待遇方面的风险。接受之前，你需要仔细核对合同，也为变化留出余地。",
  },
  {
    id: "chill_hire",
    title: "从容入职",
    body: "你在准备与休息之间保持了节奏，也拿到了几份合适的 Offer。结束秋招时，仍有精力迎接接下来的生活。",
  },
  {
    id: "stacked",
    title: "选择的余地",
    body: "多份高质量 Offer 在手，你在谈判与选择上拥有主动权。",
  },
  {
    id: "popular",
    title: "热门候选人",
    body: "多家公司愿意给你机会，可根据价值观与发展空间做权衡。",
  },
  {
    id: "scholar_risk",
    title: "冷静穿越周期",
    body: "行业传闻不断，但你凭扎实准备拿到关键 Offer，偏稳健路线。",
  },
  {
    id: "balance",
    title: "工作与生活",
    body: "你更在意可持续节奏，Offer 数量不一定最多，但方向更清晰。",
  },
  {
    id: "normal_ok",
    title: "普通结局 · 还不错",
    body: "你拿到了一份还不错的 Offer：不算顶薪，但方向清晰、能养活自己。这一轮秋招告一段落，剩下是入职前的琐碎与期待。",
  },
  {
    id: "outsourcing_fate",
    title: "项目制的起点",
    body: "你投递了许多岗位，最终的机会主要来自外包或项目制工作。你需要核对合同期限与工作安排，再决定是否从这里开始。",
  },
  {
    id: "default_win",
    title: "新的起点",
    body: "你拿到了 Offer，这一轮秋招告一段落；具体选择仍取决于你对城市、业务与团队的偏好。",
  },
  {
    id: "event_immigration_spam",
    title: "重新考虑方向",
    body: "连续的咨询电话让你重新考虑了海外学习与工作的可能。你暂停这一轮秋招，开始核对费用、材料和时间安排。",
  },
  {
    id: "event_credit_crisis",
    title: "培养方案 · 红线警告",
    body: "核对培养方案后，你发现还有课程或学分需要补齐。你暂停秋招，优先处理毕业要求，再安排后续求职。",
  },
  {
    id: "event_headhunter_rush",
    title: "口头承诺之后",
    body: "猎头在电话中介绍了岗位和薪资，你据此结束了这一轮求职。但正式录用材料尚未到手，接下来仍需要确认承诺能否落实。",
  },
];

export function sortOffersBySalary(offers, state) {
  return [...offers].sort((a, b) => salaryLowWanFromTierLabel(b.salaryTier) - salaryLowWanFromTierLabel(a.salaryTier));
}

/** 玩家已选主 Offer，否则按薪资排序自动最优（结局与展示共用） */
export function getBestOfferForEnding(state) {
  if (state?.playerChosenOffer) return state.playerChosenOffer;
  if (!state?.offers?.length) return null;
  return sortOffersBySalary(state.offers, state)[0];
}

export function getBestOffer(state) {
  return getBestOfferForEnding(state);
}

function tagQualityZh(q) {
  if (q === "premium") return "顶薪";
  if (q === "excellent") return "极好";
  if (q === "good") return "好";
  if (q === "bad") return "坏";
  return "一般";
}

/** 分享文案：与结算页一致列出隐藏词条 */
function settlementTagsPlainForShare(best) {
  const st = best.settlementTags;
  if (st?.parts?.length || st?.hidden) {
    const bits = (st.parts ?? []).map((p) => `${p.label}（${tagQualityZh(p.quality ?? "normal")}）`);
    if (st.hidden) {
      bits.push(`[隐藏] ${st.hidden.label}（${tagQualityZh(st.hidden.quality ?? "normal")}）`);
    }
    return bits.join(" · ");
  }
  return Array.isArray(best.tags) && best.tags.length ? best.tags.join(" · ") : "（无标签展示）";
}

/** 年薪区间下限（万），用于「第一份工作」等 */
function offerSalaryLowWan(offer) {
  const t = offer?.salaryTier ?? "";
  const m = t.match(/年薪([\d.]+)万/);
  return m ? parseFloat(m[1]) : 12;
}

function hasPersonality(state, id) {
  return state.traits?.personalities?.some((p) => p.id === id);
}

/** 传销结局：当前视为「主 Offer」的一份为传销陷阱（玩家自选或自动薪资最优） */
function pyramidEndingApplies(state) {
  return getBestOfferForEnding(state)?.isPyramidTrap === true;
}

/** 学历/三维纸面偏弱，易触发「捡漏」类结局 */
function isWeakOnPaper(state) {
  const eduTier = state.traits?.education?.tier ?? 3;
  const cap = state.resumeQualityMax ?? 120;
  const rqEquiv = cap > 0 ? (state.resumeQuality / cap) * 100 : 0;
  const blend = (state.hiddenResume + rqEquiv + state.hiddenInterview) / 3;
  return eduTier <= 3 || blend < 52;
}

function startupPivotDominates(state, n) {
  const su = state.pathStartup ?? 0;
  if (su < 4 || n >= 5) return false;
  return true;
}

/**
 * 隐藏累加 S：每次学习 += overloadMult×recoveryMult（与 actions.js 一致）。
 * 进入考研/考公结局的基础概率 p(S) 为分段线性且整体连续：S=25→40%，S=30→70%，S=42→100%；
 * [0,25] 从 0 线性接上，S>42 恒为 1。中性倍率下 S 与「学习次数」同步，故约 25/30/42 次学习对应上述比例。
 * 每个 Offer 仍使最终判定概率 -2%。
 */
function studyPivotBaseProbability(S) {
  if (S <= 0) return 0;
  if (S < 25) return 0.4 * (S / 25);
  if (S <= 30) return 0.4 + (0.7 - 0.4) * ((S - 25) / (30 - 25));
  if (S <= 42) return 0.7 + (1 - 0.7) * ((S - 30) / (42 - 30));
  return 1;
}

function maybeStudyPivotEnding(state, n) {
  if (n >= 5) return null;
  const S = state.studyPivotHidden ?? 0;
  if (S <= 0) return null;
  let p = studyPivotBaseProbability(S);
  p = Math.max(0, p - 0.02 * n);
  if (Math.random() >= p) return null;
  return Math.random() < 0.5 ? "postgrad" : "civil";
}

/** 同一局内多次 computeEnding 共用一次随机，避免选 Offer 前后考研/考公结果不一致 */
function getStudyPivotEnding(state, n) {
  const hasGraduateDegree = state.traits?.extraDegrees?.some(
    (degree) => degree.id === "extra_master" || degree.id === "extra_phd",
  );
  if (Object.prototype.hasOwnProperty.call(state, "studyPivotBranch")) {
    if (hasGraduateDegree && state.studyPivotBranch === "postgrad") state.studyPivotBranch = null;
    return state.studyPivotBranch;
  }
  const r = maybeStudyPivotEnding(state, n);
  state.studyPivotBranch = hasGraduateDegree && r === "postgrad" ? null : r;
  return state.studyPivotBranch;
}

/** 转向考研 / 转向考公：不进入玩家选主 Offer 流程 */
export function shouldPromptPlayerOfferChoice(preliminaryEndingId) {
  const skip = new Set(["postgrad_tv", "civil_tv"]);
  return !skip.has(preliminaryEndingId);
}

/**
 * @param {{ skipPyramidCheck?: boolean }} [options] 初次试算时跳过传销判定（选完 Offer 后再算）
 */
export function computeEnding(state, options = {}) {
  const { stress, energy, offers, endingTags } = state;
  const n = offers.length;
  const best = getBestOfferForEnding(state);
  const debt = state.debt ?? 0;
  const applied = state.appliedIds?.length ?? 0;

  if (state.vitalFailReason === "energy") {
    return {
      id: "vital_energy",
      title: "体力归零",
      body: "持续的消耗让你难以继续准备和面试。你暂停了这一轮秋招，先安排休息，恢复日常生活。",
    };
  }
  if (state.vitalFailReason === "stress") {
    return {
      id: "vital_stress",
      title: "压力爆表",
      body: "压力值顶到极限，心悸、失眠、对一切消息过敏。你意识到自己需要停下来了：再硬撑下去，拿到的 Offer 也换不回状态。",
    };
  }

  if (state.burnoutEarlyEnd) {
    return { ...ENDING_CATALOG.find(e => e.id === "burnout") };
  }

  if (state.eventImmediateEnding?.id) {
    const fe = state.eventImmediateEnding;
    return { id: fe.id, title: fe.title, body: fe.body };
  }

  if (state.lotteryJackpot) {
    return {
      id: "lottery",
      title: "意外之财",
      body: "一笔意外的奖金改变了你的预算。你决定暂缓求职，重新考虑接下来的生活与工作安排。",
    };
  }

  if (!options.skipPyramidCheck && pyramidEndingApplies(state)) {
    return {
      id: "pyramid",
      title: "传销结局",
      body: "录用条件要求你先购买产品，再发展新的成员。核对信息后，你发现这是一家传销组织，决定停止联系并寻求帮助。",
    };
  }

  if ((debt >= 350 && stress >= 52) || debt >= 600) {
    return {
      id: "jiejie",
      title: "账单之后",
      body: "消费账单和生活开销逐渐超出了承受范围。你暂停求职安排，整理债务，与家人商量可行的还款计划。",
    };
  }

  if (stress >= BURNOUT_STRESS) {
    return {
      id: "burnout",
      title: "身心透支",
      body: "高压消耗了你的精力与耐心，你决定暂停秋招，先把生活节奏找回来。",
    };
  }

  if (state.voluntaryEarlyEnd && n >= 1) {
    return {
      id: "early_settle",
      title: "提前决定",
      body: "比较过手中的 Offer 后，你决定接受当前的机会，提前结束秋招。接下来，还有入职手续和新的生活安排需要准备。",
    };
  }

  const studyPivot = getStudyPivotEnding(state, n);
  if (studyPivot === "postgrad") {
    return {
      id: "postgrad_tv",
      title: "转向考研",
      body: "这段时间的学习让你重新考虑了自己的方向。你决定结束这一轮秋招，把接下来的时间用于准备研究生考试。",
    };
  }
  if (studyPivot === "civil") {
    return {
      id: "civil_tv",
      title: "转向考公",
      body: "准备期间，你逐渐明确了自己对工作环境的期待。你决定暂停企业求职，转而准备公务员考试。",
    };
  }

  if (n >= 5) {
    return {
      id: "grand_slam",
      title: "大满贯",
      body: "五份以上的 Offer 给了你充足的选择空间。薪资之外，你开始认真比较城市、团队和未来的工作内容。",
    };
  }

  if (n >= 1 && n < 5 && best) {
    const lowW = offerSalaryLowWan(best);
    if (isWeakOnPaper(state) && lowW >= 16) {
      return {
        id: "underdog_snipe",
        title: "超出预期的机会",
        body: "履历并不突出，但这次岗位需求与你的表现恰好契合。你拿到了超出预期的薪资，也开始为入职后的工作做准备。",
      };
    }
    if (!isWeakOnPaper(state) && lowW >= 22) {
      return {
        id: "premium_salary",
        title: "高薪工作",
        body: "扎实的准备和面试表现为你带来了一份高薪 Offer。你确认了录用条件，终于可以从密集的求职日程中歇一歇。",
      };
    }
  }

  if (startupPivotDominates(state, n)) {
    const funded =
      (state.money ?? 0) >= 1800 &&
      ((endingTags.network ?? 0) >= 1 || hasTalent(state, "connection"));
    if (funded) {
      return {
        id: "startup",
        title: "创业结局",
        body: "想法、伙伴和启动资金逐渐有了着落。你决定结束秋招，尝试把项目做成一门生意，下一步是找到真正愿意付费的用户。",
      };
    }
    return {
      id: "startup_dream",
      title: "创业筹备中",
      body: "你花了不少时间讨论和验证创业想法，但资金或团队还没有准备好。项目暂时留在筹备阶段，你打算积累经验后再继续。",
    };
  }

  if (n === 0 && hasTalent(state, "connection")) {
    return {
      id: "inherit_family",
      title: "继承家业",
      body: "秋招没有带来满意的机会，你接受了家里的邀请，回去参与经营。熟悉的环境里，也有需要重新学习的工作和责任。",
    };
  }

  if (n === 0 && applied >= 18) {
    return {
      id: "resume_tsunami",
      title: "简历海啸",
      body: "你提交了许多简历，却没有等到合适的录用通知。整理过这一轮反馈后，你决定重新检查岗位方向和项目表达，为下一次招聘做准备。",
    };
  }

  if (n === 0) {
    if (energy < 25) {
      return {
        id: "jobless_tired",
        title: "待业结局 · 春招再战",
        body: "这一轮没有找到心仪的工作，长时间的准备也让你十分疲惫。你决定先休整，再为春招安排新的计划。",
      };
    }
    return {
      id: "jobless_spring",
      title: "待业结局 · 春招再战",
      body: "这一轮没有找到心仪的工作，但你已经积累了一些面试经验。你开始整理反馈、修改简历，为春招保留机会。",
    };
  }

  if (n === 1 && best && offerSalaryLowWan(best) < 9) {
    return {
      id: "hungry_ok",
      title: "第一份工作",
      body: "这份 Offer 的薪资不高，但能支持目前的生活。你决定从这份工作开始，积累经验，再考虑之后的发展。",
    };
  }

  if (endingTags.risk >= 4 && n >= 1) {
    return {
      id: "industry_jinx",
      title: "波动中的选择",
      body: "你拿到的机会伴随着业务调整或待遇方面的风险。接受之前，你需要仔细核对合同，也为变化留出余地。",
    };
  }

  if (n >= 2 && n < 5 && stress < 30 && energy > 62 && best && offerSalaryLowWan(best) >= 12) {
    return {
      id: "chill_hire",
      title: "从容入职",
      body: "你在准备与休息之间保持了节奏，也拿到了几份合适的 Offer。结束秋招时，仍有精力迎接接下来的生活。",
    };
  }

  if (n >= 4 && best && salaryLowWanFromTierLabel(best.salaryTier) >= 25) {
    return {
      id: "stacked",
      title: "选择的余地",
      body: "多份高质量 Offer 在手，你在谈判与选择上拥有主动权。",
    };
  }

  if (n >= 3) {
    return {
      id: "popular",
      title: "热门候选人",
      body: "多家公司愿意给你机会，可根据价值观与发展空间做权衡。",
    };
  }

  if (endingTags.risk >= 3 && hasPersonality(state, "per_strict")) {
    return {
      id: "scholar_risk",
      title: "冷静穿越周期",
      body: "行业传闻不断，但你凭扎实准备拿到关键 Offer，偏稳健路线。",
    };
  }

  if (endingTags.balance >= 2 || offers.some((o) => o.tags?.some((t) => t.includes("朝九晚五")))) {
    return {
      id: "balance",
      title: "工作与生活",
      body: "你更在意可持续节奏，Offer 数量不一定最多，但方向更清晰。",
    };
  }

  if (n === 1) {
    return {
      id: "normal_ok",
      title: "普通结局 · 还不错",
      body: "你拿到了一份还不错的 Offer：不算顶薪，但方向清晰、能养活自己。这一轮秋招告一段落，剩下是入职前的琐碎与期待。",
    };
  }

  if (applied >= 22 && n <= 1) {
    return {
      id: "outsourcing_fate",
      title: "项目制的起点",
      body: "你投递了许多岗位，最终的机会主要来自外包或项目制工作。你需要核对合同期限与工作安排，再决定是否从这里开始。",
    };
  }

  return {
    id: "default_win",
    title: "新的起点",
    body: "你拿到了 Offer，这一轮秋招告一段落；具体选择仍取决于你对城市、业务与团队的偏好。",
  };
}

export function endingSummaryLines(state) {
  const eduId = state.traits?.education?.id ?? "";
  const edu = state.traits?.education?.name ?? "";
  const major = state.traits?.major?.name ?? "";
  const debt = state.debt ?? 0;
  const eduMajorHtml = `学历 / 专业：<span class="${educationTagClass(eduId)}">${escapeHtml(edu)}</span> · ${escapeHtml(major)}`;
  const lines = [
    { html: eduMajorHtml },
    `现金结余：${Math.round(state.money ?? 0)}${debt > 0 ? ` · 负债：${Math.round(debt)}` : ""}`,
    `压力：${Number(state.stress ?? 0).toFixed(1)} / ${state.stressMax ?? 100} · 精力：${Math.round(state.energy)} · 综合素质：${Math.round(state.resumeQuality)} / ${state.resumeQualityMax ?? 120}`,
    `Offer 数量：${state.offers.length} · 累计投递：${state.appliedIds?.length ?? 0} 家`,
    `学习次数：${state.studyCount ?? 0} · 创业脑暴次数：${state.pathStartup ?? 0}`,
    `薪资档位加成：${state.salaryTierBonus ?? 0} · 隐藏倾向（简历/面试）：${Math.round(state.hiddenResume)} / ${Math.round(state.hiddenInterview)}`,
  ];
  return lines;
}

/**
 * 纯文本，供结算页分享 / 复制（与 endingSummaryLines 数据一致，无 HTML）
 * @param {{ pageUrl?: string }} [opts] 传入当前页 URL 时文末附带「在线游玩」一行
 */
export function buildEndingShareText(state, end, opts = {}) {
  const emoji = getEndingEmoji(end?.id);
  const parts = [];
  parts.push(`【秋招模拟器】${emoji} ${end.title}`);
  parts.push("");
  parts.push(end.body);
  parts.push("");
  if (end?.id === "early_settle" && state?.day != null) {
    parts.push(`本局提前结束于第 ${state.day} 天。`);
    parts.push("");
  }
  const talNames = (state.playerTalents ?? []).map((t) => t.name).filter(Boolean);
  if (talNames.length) {
    parts.push(`天赋：${talNames.join("、")}`);
    parts.push("");
  }
  const best = getBestOffer(state);
  if (best) {
    let salLine = best.salaryTier ?? "薪资面议";
    if (best.salaryDisplayMultiplier && best.salaryDisplayMultiplier > 1) {
      salLine += " · 虚张声势展示+20%";
    }
    const buff = state.industrySalaryBuff;
    if (buff && buff.untilDay >= state.day && best.industry && buff.industry === best.industry) {
      salLine += " · 行业风向+20%展示";
    }
    parts.push(`主 Offer：${best.logo ?? "💼"} ${best.name} · ${salLine}`);
    parts.push(`标签：${settlementTagsPlainForShare(best)}`);
    parts.push("");
  }
  const edu = state.traits?.education?.name ?? "";
  const major = state.traits?.major?.name ?? "";
  parts.push(`学历 / 专业：${edu} · ${major}`);
  const debt = state.debt ?? 0;
  parts.push(`现金结余：${Math.round(state.money ?? 0)}${debt > 0 ? ` · 负债：${Math.round(debt)}` : ""}`);
  parts.push(
    `压力：${Number(state.stress ?? 0).toFixed(1)} / ${state.stressMax ?? 100} · 精力：${Math.round(state.energy)} · 综合素质：${Math.round(state.resumeQuality)} / ${state.resumeQualityMax ?? 120}`,
  );
  parts.push(`Offer 数量：${state.offers.length} · 累计投递：${state.appliedIds?.length ?? 0} 家`);
  parts.push(`学习次数：${state.studyCount ?? 0} · 创业脑暴次数：${state.pathStartup ?? 0}`);
  parts.push(`薪资档位加成：${state.salaryTierBonus ?? 0} · 隐藏倾向（简历/面试）：${Math.round(state.hiddenResume)} / ${Math.round(state.hiddenInterview)}`);
  const url = opts.pageUrl;
  if (url) {
    parts.push("");
    parts.push(`在线游玩：${url}`);
  }
  return parts.join("\n");
}
