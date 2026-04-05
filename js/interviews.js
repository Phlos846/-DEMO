import { addLog } from "./state.js";
import { buildSettlementTagParts } from "./companies.js";
import { expectedInterviewPass, updateJobSearchRating } from "./match.js";
import { hasTalent } from "./talents.js";
import { applyStressDelta } from "./talentRuntime.js";

const MAX_INTERVIEWS_PER_NATURAL_DAY = 2;

function roll() {
  return Math.random();
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function resumePassLine(name) {
  return pick([
    `${name}：简历过筛！邮件里终于不是「感谢投递」纯模板了，已排入面试队列。`,
    `${name}：过筛通知来了——你在工位上差点没压住嘴角，下一场是面试。`,
    `${name}：HR 回信了：简历通过初筛。你刷新邮箱三次才敢信。`,
    `${name}：简历过筛，系统状态「初筛通过」。拒信文件夹暂时少了一封。`,
    `${name}：邮件标题写着「下一环节：面试」——简历这关，你过了。`,
    `${name}：初筛通过。你默默把这家公司从「海投名单」挪到「要认真准备」。`,
  ]);
}

function resumeFailLine(name) {
  return pick([
    `${name}：简历未过筛，拒信虽迟但到。`,
    `${name}：感谢信 +1，匹配度「暂不合适」。`,
    `${name}：简历停留在「已查看」，然后就没有然后了。`,
    `${name}：拒信模板已送达——感谢你的投递（下次还敢）。`,
    `${name}：初筛未通过，又一份石沉大海；至少不用纠结面试穿啥了。`,
    `${name}：系统提示「未进入下一环节」：简历没过。`,
  ]);
}

function apHintInterview(noApCost) {
  if (noApCost) {
    return "秋招截止日统一安排面试，本场不消耗行动点。";
  }
  return "提示：每场面试在进入新一天时消耗 1 个行动点；本场已计入当日消耗。";
}

function pushInterviewPassModal(state, companyName, noApCost) {
  const ap = apHintInterview(noApCost);
  const m = pick([
    {
      emoji: "🎉",
      title: "面试通过",
      body: `你在「${companyName}」的面试过关，Offer 已收入囊中。\n\n${ap}`,
    },
    {
      emoji: "✅",
      title: "稳了！Offer 到手",
      body: `「${companyName}」这一关你扛住了，新 Offer 已加入列表。\n\n${ap}`,
    },
    {
      emoji: "🏆",
      title: "面试通过",
      body: `面试官点头的那一刻，你在心里给自己放了一串电子鞭炮。「${companyName}」的 Offer 来了。\n\n${ap}`,
    },
    {
      emoji: "🥳",
      title: "过了！",
      body: `「${companyName}」发来通过通知——秋招清单上可以划掉一个勾了。\n\n${ap}`,
    },
    {
      emoji: "💼",
      title: "面试通过",
      body: `从投递到面试再到录用意向，「${companyName}」这条线跑通了。\n\n${ap}`,
    },
  ]);
  state.interviewModalQueue.push(m);
}

function pushInterviewFailModal(state, companyName, noApCost) {
  const ap = noApCost
    ? "截止日统一面试，本场不扣行动点。"
    : "提示：本场面试已消耗 1 个行动点（未通过也会扣除）。";
  const m = pick([
    {
      emoji: "📩",
      title: "面试未通过",
      body: `「${companyName}」这一轮没有选中你，感谢信已在路上。\n\n${ap}`,
    },
    {
      emoji: "😔",
      title: "遗憾落选",
      body: `「${companyName}」反馈：与岗位不够匹配。你关掉邮件，深吸一口气。\n\n${ap}`,
    },
    {
      emoji: "🫠",
      title: "面试未通过",
      body: `复盘「${companyName}」整场，你记得自己哪句可以答得更好——下次再来。\n\n${ap}`,
    },
    {
      emoji: "📋",
      title: "未通过",
      body: `「${companyName}」暂无后续安排。行动点已经花出去，只能向前看。\n\n${ap}`,
    },
    {
      emoji: "🌧️",
      title: "面试凉了",
      body: `「${companyName}」的感谢信语气很礼貌，礼貌得让你想笑一下。\n\n${ap}`,
    },
  ]);
  state.interviewModalQueue.push(m);
}

/** 到通知日：揭晓数日前投递的简历是否过筛（2–3 天延迟）
 * @param {{ forceFinalDay?: boolean }} [options] forceFinalDay：第 maxDays 天强制揭晓未到通知日的待反馈（避免秋招结束仍无结果） */
export function processPendingResumeFeedback(state, options = {}) {
  const forceFinalDay = !!options.forceFinalDay && state.day >= state.maxDays;
  const pending = state.resumePending ?? [];
  const still = [];
  const banner = [];
  for (const item of pending) {
    if (state.day < item.notifyDay && !forceFinalDay) {
      still.push(item);
      continue;
    }
    const co = item.company;
    if (item.passed) {
      scheduleInterview(state, co, { hiddenRevealed: item.hiddenRevealed }, { silent: true });
      const line = resumePassLine(co.name);
      addLog(state, `第 ${state.day} 天：${line}`);
      banner.push(line);
    } else {
      const line = resumeFailLine(co.name);
      addLog(state, `第 ${state.day} 天：${line}`);
      banner.push(line);
    }
  }
  state.resumePending = still;
  return banner;
}

/** 每个自然日开始时：面试强行消耗行动点；同一自然日最多处理 2 场，其余留在队列顺延。
 * @param {{ noApCost?: boolean }} [options] noApCost：第 maxDays 日统一清空队列，不扣行动点、不受每日场次上限 */
export function processInterviewsAtDayStart(state, options = {}) {
  const noApCost = !!options.noApCost && state.day >= state.maxDays;
  state.interviewModalQueue = [];
  const messages = [];
  let doneToday = 0;
  while (
    state.interviewQueue.length > 0 &&
    (noApCost || state.actionPoints > 0) &&
    doneToday < (noApCost ? Number.MAX_SAFE_INTEGER : MAX_INTERVIEWS_PER_NATURAL_DAY)
  ) {
    const job = state.interviewQueue.shift();
    if (!noApCost) state.actionPoints -= 1;
    doneToday += 1;
    const company = job.company;
    const hiddenRevealed = !!job.resumePassContext?.hiddenRevealed;
    const expectedP = expectedInterviewPass(state, company, hiddenRevealed);
    const pass = roll() < expectedP;
    updateJobSearchRating(state, expectedP, pass ? 1 : 0);

    if (pass) {
      applyStressDelta(state, -9, "interview_pass");
      const salaryTier =
        company.tags?.salary?.label ??
        company.visibleTags?.find((t) => t.includes("薪") || t.includes("年薪")) ??
        "薪资面议";
      const offer = {
        companyId: company.id,
        name: company.name,
        logo: company.logo ?? "🏢",
        tags: [...(company.visibleTags ?? [])],
        settlementTags: buildSettlementTagParts(company),
        salaryTier,
        industry: company.industry ?? "other",
        salaryDisplayMultiplier: hasTalent(state, "bluff") ? 1.2 : 1,
        isPyramidTrap: company.hiddenTag?.id === "hid_pyramid",
      };
      state.offers.push(offer);
      bumpEndingWeights(state, company);
      const logLine = pick([
        `第 ${state.day} 天：面试「${company.name}」通过，Offer 已入库。`,
        `第 ${state.day} 天：「${company.name}」面试过关，新 Offer +1。`,
        `第 ${state.day} 天：在「${company.name}」面试中拿下 Offer。`,
        `第 ${state.day} 天：「${company.name}」发来录用意向，面试通过。`,
      ]);
      addLog(state, logLine);
      pushInterviewPassModal(state, company.name, noApCost);
      if (state.godMode) {
        state.gameOver = true;
        addLog(state, "【作弊模式】已拿 Offer，按规则直接结算本局。");
        break;
      }
    } else {
      applyStressDelta(state, 11, "interview_fail");
      const logLine = pick([
        `第 ${state.day} 天：面试「${company.name}」未通过。`,
        `第 ${state.day} 天：「${company.name}」面试遗憾落选。`,
        `第 ${state.day} 天：「${company.name}」这一轮没有面上。`,
        `第 ${state.day} 天：「${company.name}」反馈：未进入下一环节。`,
      ]);
      addLog(state, logLine);
      pushInterviewFailModal(state, company.name, noApCost);
    }
  }
  if (
    !noApCost &&
    doneToday >= MAX_INTERVIEWS_PER_NATURAL_DAY &&
    state.interviewQueue.length > 0 &&
    state.actionPoints > 0
  ) {
    addLog(
      state,
      `第 ${state.day} 天：今日最多安排 ${MAX_INTERVIEWS_PER_NATURAL_DAY} 场面试，其余 ${state.interviewQueue.length} 场已顺延至后续自然日。`,
    );
  }
  return messages;
}

function bumpEndingWeights(state, company) {
  const h = company.hiddenTag?.endingWeight;
  if (h) state.endingTags[h] = (state.endingTags[h] ?? 0) + 1;
}

export function scheduleInterview(state, company, resumePassContext, options = {}) {
  state.interviewQueue.push({
    company,
    resumePassContext: resumePassContext ?? {},
  });
  if (!options.silent) {
    addLog(state, `第 ${state.day} 天：${company.name} 简历过筛，等待面试（将消耗行动点）。`);
  }
}
