/** 多结局：按优先级判定（特殊结局 > 就业质量线） */

import { hasTalent } from "./talents.js";

function sortOffersBySalary(offers, state) {
  const bonus = state?.salaryTierBonus ?? 0;
  const rank = (s) => {
    let r = 0;
    if (s.includes("30w")) r = 5;
    else if (s.includes("25k")) r = 4;
    else if (s.includes("18k")) r = 3;
    else if (s.includes("12k")) r = 2;
    else if (s.includes("8k")) r = 1;
    return r + bonus * 0.15;
  };
  return [...offers].sort((a, b) => rank(b.salaryTier) - rank(a.salaryTier));
}

/** 年薪区间下限（万），用于「饿不死」等 */
function offerSalaryLowWan(offer) {
  const t = offer?.salaryTier ?? "";
  const m = t.match(/年薪([\d.]+)万/);
  return m ? parseFloat(m[1]) : 12;
}

function hasPersonality(state, id) {
  return state.traits?.personalities?.some((p) => p.id === id);
}

function hasPyramidOffer(state) {
  return state.offers?.some((o) => o.isPyramidTrap);
}

function startupPivotDominates(state, n) {
  const su = state.pathStartup ?? 0;
  if (su < 4 || n >= 5) return false;
  return true;
}

function maybeStudyPivotEnding(state, n) {
  const sc = state.studyCount ?? 0;
  if (n >= 5 || sc < 10) return null;
  const p = Math.min(0.5, (sc - 9) * 0.045);
  if (Math.random() >= p) return null;
  return Math.random() < 0.5 ? "postgrad" : "civil";
}

export function computeEnding(state) {
  const { stress, energy, offers, endingTags } = state;
  const n = offers.length;
  const best = sortOffersBySalary(offers, state)[0];
  const debt = state.debt ?? 0;
  const applied = state.appliedIds?.length ?? 0;

  if (state.vitalFailReason === "energy") {
    return {
      id: "vital_energy",
      title: "体力归零",
      body: "精力彻底见底，你连起床开电脑的力气都没有。秋招被迫按下暂停键——先睡觉、吃饭、晒太阳，人没了什么都没意义。",
    };
  }
  if (state.vitalFailReason === "stress") {
    return {
      id: "vital_stress",
      title: "压力爆表",
      body: "压力值顶到极限，心悸、失眠、对一切消息过敏。你意识到自己需要停下来了：再硬撑下去，拿到的 Offer 也换不回状态。",
    };
  }

  if (state.lotteryJackpot) {
    return {
      id: "lottery",
      title: "彩票结局 · 财富自由体验卡",
      body: "你买彩票（或刮刮乐）中了大奖，现金流一夜翻身，找工作突然变得『不急』。你知道这可能是暂时的，但今晚先开香槟。",
    };
  }

  if (hasPyramidOffer(state)) {
    return {
      id: "pyramid",
      title: "传销结局",
      body: "你拿到的『Offer』越看越不对劲：囤货、拉人头、话术培训三连。你意识到自己进了假公司——本质是传销组织。快跑，顺便报警。",
    };
  }

  if (debt >= 550 && stress >= 52) {
    return {
      id: "jiejie",
      title: "戒戒你好",
      body: "超前消费与生活费叠加，负债滚到让你失眠。某天深夜，痛苦的你打开 dilidili，点进一个叫戒舍的直播间……弹幕里全是『坦白』与『上岸』，你突然也想打一行字。",
    };
  }

  if (stress >= 92) {
    return {
      id: "burnout",
      title: "身心透支",
      body: "长期高压让你在秋招尾声几近崩溃。结局与身体状态相关，建议关注休息与节奏。",
    };
  }

  const studyPivot = maybeStudyPivotEnding(state, n);
  if (studyPivot === "postgrad") {
    return {
      id: "postgrad_tv",
      title: "考研 TV",
      body: "你埋头学习太久，就业节奏被彻底挤到次要位置。某天刷题刷到恍惚，你突然确信：考场才是下一主战场——秋招先告一段落。",
    };
  }
  if (studyPivot === "civil") {
    return {
      id: "civil_tv",
      title: "考公 TV",
      body: "学习强度拉满后，你对企业的邮件已读不回越来越无感。编制、行测、申论开始在脑内循环——你决定把主赛道切到另一条时间线。",
    };
  }

  if (n >= 5) {
    return {
      id: "grand_slam",
      title: "大满贯",
      body: "五份以上 Offer 在手，群聊里你是被@最多的那个人。选择困难症也是一种凡尔赛。",
    };
  }

  if (startupPivotDominates(state, n)) {
    const funded =
      (state.money ?? 0) >= 1800 &&
      ((endingTags.network ?? 0) >= 1 || hasTalent(state, "connection"));
    if (funded) {
      return {
        id: "startup",
        title: "创业结局",
        body: "你有了一个不错的想法，有志同道合的伙伴（至少口头入股），手头还有一点积蓄或家里底气。就这样迈向创业的大路——天使轮 PPT 已新建。",
      };
    }
    return {
      id: "startup_dream",
      title: "创业季番 · 未完待续",
      body: "你把大量行动点砸在创业脑暴上，但人脉或本金还差一口气。先工作攒钱、攒团队，车库时刻留给下一季。",
    };
  }

  if (n === 0 && hasTalent(state, "connection")) {
    return {
      id: "inherit_family",
      title: "继承家业",
      body: "秋招没有给你满意答案，但家里早有安排。你没能『靠自己』上岸，只能回去继承家里的公司——听起来像凡尔赛，你知道其中也有不自由的另一面。",
    };
  }

  if (n === 0 && applied >= 18) {
    return {
      id: "resume_tsunami",
      title: "简历海啸",
      body: "你投得够多、够勤，回复却像扔进黑洞。邮箱里只有『感谢投递』在排队。来年优化话术与项目包装，再战。",
    };
  }

  if (n === 0) {
    if (energy < 25) {
      return {
        id: "jobless_tired",
        title: "待业结局 · 春招再战",
        body: "没能找到心仪的工作，精力也见底。你决定先躺平充电，春招再战——只要别躺到春招也过期。",
      };
    }
    return {
      id: "jobless_spring",
      title: "待业结局 · 春招再战",
      body: "这一轮没有心仪 Offer，但你仍有余力调整策略。群友说『春招还有机会』，你选择相信并改简历。",
    };
  }

  if (n === 1 && best && offerSalaryLowWan(best) < 9) {
    return {
      id: "hungry_ok",
      title: "饿不死",
      body: "Offer 不算理想，薪资档位也偏保守，但好歹有了班上。先上岸，再骑驴找马——这是很多普通人的真实路线。",
    };
  }

  if (endingTags.risk >= 4 && n >= 1) {
    return {
      id: "industry_jinx",
      title: "行业冥灯",
      body: "你接到的机会总带着裁员传闻、业务动荡或薪资猫腻。能拿到 Offer 说明你能打，但也说明你很敢接高难度副本。",
    };
  }

  if (n >= 2 && n < 5 && stress < 30 && energy > 62 && best && offerSalaryLowWan(best) >= 12) {
    return {
      id: "chill_hire",
      title: "松弛上岸",
      body: "你没有把自己逼到极限，却稳稳拿了几份不错的意向。压力不高、精力还在——这届秋招你属于『心态赢家』。",
    };
  }

  if (n >= 4 && best && (best.salaryTier.includes("25k") || best.salaryTier.includes("30w"))) {
    return {
      id: "stacked",
      title: "收割机",
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
      title: "work-life 取舍",
      body: "你更在意可持续节奏，Offer 数量不一定最多，但方向更清晰。",
    };
  }

  if (n === 1) {
    return {
      id: "normal_ok",
      title: "普通结局 · 还不错",
      body: "你拿到了一份还不错的 Offer：不算顶薪，但方向清晰、能养活自己。秋招主线告一段落，剩下是入职前的琐碎与期待。",
    };
  }

  if (applied >= 22 && n <= 1) {
    return {
      id: "outsourcing_fate",
      title: "外包圣体",
      body: "投递量惊人，面试却总在『外包/项目制』里打转。你怀疑自己被打上了某种隐藏标签——先接活积累经验，还是坚决等正编，你得选。",
    };
  }

  return {
    id: "default_win",
    title: "上岸预备役",
    body: "你拿到了 Offer，秋招主线告一段落；具体选择仍取决于你对城市、业务与团队的偏好。",
  };
}

export function endingSummaryLines(state) {
  const edu = state.traits?.education?.name ?? "";
  const major = state.traits?.major?.name ?? "";
  const debt = state.debt ?? 0;
  const lines = [
    `学历 / 专业：${edu} · ${major}`,
    `现金结余：${Math.round(state.money ?? 0)}${debt > 0 ? ` · 负债：${Math.round(debt)}` : ""}`,
    `压力：${Math.round(state.stress)} · 精力：${Math.round(state.energy)} · 简历完整度：${Math.round(state.resumeQuality)}`,
    `Offer 数量：${state.offers.length} · 累计投递：${state.appliedIds?.length ?? 0} 家`,
    `学习次数：${state.studyCount ?? 0} · 创业脑暴次数：${state.pathStartup ?? 0}`,
    `薪资档位加成：${state.salaryTierBonus ?? 0} · 隐藏倾向（简历/面试）：${Math.round(state.hiddenResume)} / ${Math.round(state.hiddenInterview)}`,
  ];
  return lines;
}
