import { addLog } from "./state.js";
import { expectedInterviewPass, updateJobSearchRating } from "./match.js";
import { hasTalent } from "./talents.js";
import { applyStressDelta } from "./talentRuntime.js";

const MAX_INTERVIEWS_PER_NATURAL_DAY = 2;

function roll() {
  return Math.random();
}

/** 到通知日：揭晓数日前投递的简历是否过筛（2–3 天延迟） */
export function processPendingResumeFeedback(state) {
  const pending = state.resumePending ?? [];
  const still = [];
  const banner = [];
  for (const item of pending) {
    if (state.day < item.notifyDay) {
      still.push(item);
      continue;
    }
    const co = item.company;
    if (item.passed) {
      scheduleInterview(state, co, { hiddenRevealed: item.hiddenRevealed }, { silent: true });
      const line = `${co.name}：简历过筛（HR 终于回邮件了），已排入面试队列。`;
      addLog(state, `第 ${state.day} 天：${line}`);
      banner.push(line);
    } else {
      const line = `${co.name}：简历未过筛（拒信虽迟但到）。`;
      addLog(state, `第 ${state.day} 天：${line}`);
      banner.push(line);
    }
  }
  state.resumePending = still;
  return banner;
}

/** 每个自然日开始时：面试强行消耗行动点；同一自然日最多处理 2 场，其余留在队列顺延 */
export function processInterviewsAtDayStart(state) {
  const messages = [];
  let doneToday = 0;
  while (
    state.interviewQueue.length > 0 &&
    state.actionPoints > 0 &&
    doneToday < MAX_INTERVIEWS_PER_NATURAL_DAY
  ) {
    const job = state.interviewQueue.shift();
    state.actionPoints -= 1;
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
        salaryTier,
        industry: company.industry ?? "other",
        salaryDisplayMultiplier: hasTalent(state, "bluff") ? 1.2 : 1,
        isPyramidTrap: company.hiddenTag?.id === "hid_pyramid",
      };
      state.offers.push(offer);
      bumpEndingWeights(state, company);
      messages.push(`面试通过：获得 ${company.name} 的 Offer。`);
      addLog(state, `第 ${state.day} 天：面试 ${company.name} 通过。`);
      if (state.godMode) {
        state.gameOver = true;
        addLog(state, "【作弊模式】已拿 Offer，按规则直接结算本局。");
        break;
      }
    } else {
      applyStressDelta(state, 11, "interview_fail");
      messages.push(`面试未通过：${company.name}。`);
      addLog(state, `第 ${state.day} 天：面试 ${company.name} 未通过。`);
    }
  }
  if (
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
