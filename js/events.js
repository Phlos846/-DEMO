import { UNCERTAIN_EVENTS } from './uncertainEvents.js?v=1.1.42';
import { finishHighStressDay } from "./burnout.js?v=1.1.42";
import { CONDITIONAL_EVENTS, takeConditionalEvent } from "./conditionalEvents.js?v=1.1.42";
import { STRATEGY_EVENTS } from './strategy-events.js?v=1.1.42';
import { SPECIAL_ROUTE_EVENTS } from './specialEndingEvents.js?v=1.1.42';
/**
 * 随机事件：加权抽取（含梗文案与 emoji）；
 * 5 日滑动窗口内事件总数 ∈ [1,3]，窗口总次数 60%/30%/10%。
 * 部分事件需满足压力≥70、精力≤40 等才进入当日随机池。
 * immediateSettle：点「确定」后立刻 gameOver 并进入结局（清空当日剩余事件队列）；彩票与若干事件使用该逻辑。
 */

import {
  checkInstantFail,
  applyStressDelta,
  applyMoneyDelta,
  applyEnergyDelta,
  rollExeGlitchForDay,
  computeMaxActionPointsForDay,
  applyDailyMoneyTick,
  maybePinhaofanHospital,
  applyNoOfferAnxiety,
  applyPassiveDayRecovery,
  tryNepotismOffer,
} from "./talentRuntime.js?v=1.1.42";
import { hasTalent } from "./talents.js?v=1.1.42";
import { inFirstRunIntro } from './run-phase.js?v=1.1.42';
import { syncTasks, settleTaskDay } from './tasks.js?v=1.1.42';
import { EXPANSION_EVENTS } from './eventExpansion.js?v=1.1.42';
import { sampleEventPool } from './eventSampling.js?v=1.1.42';
import { addLog, clampResumeToCap } from "./state.js?v=1.1.42";
import { STUDY_RECOVERY_BUFF_MULT } from "./actions.js?v=1.1.42";
import { getEventInteraction, eventChoiceUnavailable, takeDueFollowups } from "./eventChoices.js?v=1.1.42";
import { eventAvailableThisRun, eventRepeatMultiplier, recordEventAppearance } from "./eventRecurrence.js?v=1.1.42";
import {
  addTransientEffect,
  transientUntilDay,
  purgeAllDebuffsForPurify,
  pruneExpiredTransientEffects,
} from "./transientEffects.js?v=1.1.42";
import { processInterviewsAtDayStart, processPendingResumeFeedback } from "./interviews.js?v=1.1.42";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function rnd() {
  return Math.random();
}

function bumpEnding(state, key, n) {
  state.endingTags[key] = (state.endingTags[key] ?? 0) + n;
}

function fxBuff(state, label, naturalDays, partial = {}) {
  addTransientEffect(state, {
    kind: "buff",
    label,
    untilDay: transientUntilDay(state, naturalDays),
    ...partial,
  });
}

function fxDebuff(state, label, naturalDays, partial = {}) {
  addTransientEffect(state, {
    kind: "debuff",
    label,
    untilDay: transientUntilDay(state, naturalDays),
    ...partial,
  });
}

function applyApDelta(state, delta) {
  state.actionPoints = clamp(state.actionPoints + delta, 0, state.maxActionPointsPerDay ?? 8);
}

/** 过去 4 个自然日（不含今天）已发生事件次数 */
export function countEventsInPrior4Days(state, day) {
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const d = day - i;
    if (d >= 1) n += Math.max(0, (state.eventsByDay[d] ?? 0) - (state.entertainmentEventsByDay?.[d] ?? 0) - (state.conditionalEventsByDay?.[d] ?? 0));
  }
  return n;
}

/**
 * 今日应发生事件数量 k：满足 1 <= n+k <= 3，并按 60/30/10 抽窗口总次数 T
 */
export function sampleEventCountForToday(state) {
  if (inFirstRunIntro(state)) return 0;
  const d = state.day;
  const n = countEventsInPrior4Days(state, d);
  const minK = Math.max(0, 1 - n);
  const maxK = Math.max(0, 3 - n);
  if (maxK === 0) return 0;
  if (minK > maxK) return 0;

  const opts = [];
  for (let T = 1; T <= 3; T++) {
    const w = T === 1 ? 0.6 : T === 2 ? 0.3 : 0.1;
    if (T < n || T > n + maxK) continue;
    const k = T - n;
    if (k < minK || k > maxK) continue;
    opts.push({ k, w });
  }
  if (!opts.length) return minK;

  const sum = opts.reduce((s, o) => s + o.w, 0);
  let r = rnd() * sum;
  for (const o of opts) {
    r -= o.w;
    if (r <= 0) return clamp(o.k, minK, maxK);
  }
  return opts[opts.length - 1].k;
}

/** 事件是否满足数值门槛（压力≥70 梗、脆皮低精力、负债等） */
function eventEligible(def, state) {
  if (def.eligible && !def.eligible(state)) return false;
  const r = def.requires;
  if (!r) return true;
  if (r.stressMin != null && state.stress < r.stressMin) return false;
  if (r.stressMax != null && state.stress > r.stressMax) return false;
  if (r.energyMin != null && state.energy < r.energyMin) return false;
  if (r.energyMax != null && state.energy > r.energyMax) return false;
  if (r.moneyMin != null && (state.money ?? 0) < r.moneyMin) return false;
  if (r.moneyMax != null && (state.money ?? 0) > r.moneyMax) return false;
  if (r.debtMin != null && (state.debt ?? 0) < r.debtMin) return false;
  if (r.dayMin != null && state.day < r.dayMin) return false;
  if (r.dayMax != null && state.day > r.dayMax) return false;
  if (r.studyMin != null && (state.studyCount ?? 0) < r.studyMin) return false;
  if (r.offersMin != null && (state.offers?.length ?? 0) < r.offersMin) return false;
  return true;
}

const INDUSTRY_POOL = ["internet", "finance", "game", "anime", "edu", "manufacture", "consult", "other"];

export const INDUSTRY_LABEL_ZH = {
  game: "游戏",
  anime: "动画/二次元",
  internet: "互联网",
  finance: "金融",
  edu: "教育",
  manufacture: "制造",
  consult: "咨询",
  other: "综合",
};

export function industrySalaryBuffLabelZh(industry) {
  return INDUSTRY_LABEL_ZH[industry] ?? industry;
}

function setIndustryBuff(state, industry, days = 7, mult = 1.2) {
  state.industrySalaryBuff = {
    industry,
    mult,
    untilDay: state.day + days,
  };
}

/** 休养跳过若干自然日：模拟跨日（生活费、精力、面试队列等） */
export function simulateForwardNaturalDays(state, steps) {
  for (let i = 0; i < steps; i++) {
    if (finishHighStressDay(state)) break;
    settleTaskDay(state);
    checkInstantFail(state);
    if (state.gameOver) break;
    const leavingDay = state.day;
    state.day += 1;
    pruneExpiredTransientEffects(state);
    if (
      state.studyRecoveryBuffUntilDay != null &&
      leavingDay <= state.studyRecoveryBuffUntilDay &&
      (state.studyByDay?.[leavingDay] ?? 0) >= 1
    ) {
      state.studyRecoveryBuffUntilDay += 1;
    }
    if (state.day > state.maxDays) {
      state.gameOver = true;
      addLog(state, "秋招时间在休养跳过中耗尽。");
      break;
    }
    rollExeGlitchForDay(state);
    applyDailyMoneyTick(state);
    const hosp = maybePinhaofanHospital(state);
    if (hosp) addLog(state, hosp);
    applyNoOfferAnxiety(state);
    applyPassiveDayRecovery(state);
    state.maxActionPointsPerDay = computeMaxActionPointsForDay(state);
    state.actionPoints = state.maxActionPointsPerDay;
    syncTasks(state);
    checkInstantFail(state);
    if (state.gameOver) break;
    const nep = tryNepotismOffer(state);
    if (nep) addLog(state, nep);
    const isFinalDay = state.day === state.maxDays;
    processPendingResumeFeedback(state, { forceFinalDay: isFinalDay });
    processInterviewsAtDayStart(state, { noApCost: isFinalDay });
    addLog(state, `（时间跳过）进入第 ${state.day} 天。`);
  }
}

/** 随机事件表：玩梗文案 + emoji；部分需压力/精力/金钱等门槛才进入随机池 */
export const EVENT_DEFS = [
  ...SPECIAL_ROUTE_EVENTS,
  ...STRATEGY_EVENTS,
  ...CONDITIONAL_EVENTS,
  {
    id: 'evt_offer_withdrawn', emoji: '📩', title: '录用通知被撤回',
    desc: 'HR 发来邮件：“因业务调整，原定岗位编制取消，我们很遗憾地撤回录用通知。”随机失去一份已获得的 Offer，压力 +12。这是已经发生的通知，每局最多一次。',
    requires: { offersMin: 1, dayMin: 8 }, maxPerRun: 1, weight: 0.8,
    apply(s) {
      if (!s.offers?.length) return;
      const [withdrawn] = s.offers.splice(Math.floor(Math.random() * s.offers.length), 1);
      if (s.playerChosenOffer?.companyId === withdrawn.companyId) s.playerChosenOffer = null;
      applyStressDelta(s, 12, 'event');
      addLog(s, `「${withdrawn.name}」因岗位编制取消撤回 Offer，当前剩余 ${s.offers.length} 份。`);
    },
  },
  ...EXPANSION_EVENTS,
  ...UNCERTAIN_EVENTS,
  {
    id: "evt_network",
    maxPerRun: 1,
    emoji: "🤝",
    weight: 1,
    title: "学长内推",
    desc: "一位学长愿意帮你内推一家中小厂，压力略降，综合素质微升；这份支持让你接下来几天面对小事时更平静（压力获得量↓，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, -5, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 3);
      fxBuff(s, "学长余温：压力获得↓", 3, { stressGainMult: 0.94 });
      bumpEnding(s, "network", 1);
    },
  },
  {
    id: "evt_ill",
    emoji: "🤒",
    weight: 1,
    title: "熬夜感冒",
    desc: "连续熬夜后你感冒了：当场精力大减、压力上升；病后几天身体发虚（精力消耗↑，持续 3 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -12);
      applyStressDelta(s, 5, "event");
      fxDebuff(s, "感冒未愈：精力消耗↑", 3, { energyDrainMult: 1.15 });
      bumpEnding(s, "health", 1);
    },
  },
  {
    id: "evt_mock",
    emoji: "🎤",
    weight: 1,
    title: "模拟面试",
    desc: "学校组织模拟面试，面试发挥隐藏分提升、略耗精力；模拟考余韵让你几天内更容易真正放松下来（降压效果↑，持续 3 天）。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 4, 0, 100);
      applyEnergyDelta(s, -6);
      fxBuff(s, "模拟考余韵：降压更有效", 3, { stressReliefMult: 1.08 });
      bumpEnding(s, "prep", 1);
    },
  },
  {
    id: "evt_rumor",
    emoji: "📉",
    weight: 1,
    title: "行业传闻",
    desc: "群里疯传某赛道裁员，压力当场上升；焦虑余波让你几天内更容易越想越慌（压力获得量↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
      fxDebuff(s, "行业焦虑余波：压力获得↑", 3, { stressGainMult: 1.1 });
      bumpEnding(s, "risk", 1);
    },
  },
  {
    id: "evt_side",
    maxPerRun: 1,
    emoji: "💻",
    weight: 1,
    title: "副业机会",
    desc: "有人找你接外包，精力下降但综合素质上升。",
    apply: (s) => {
      applyEnergyDelta(s, -10);
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 6);
      bumpEnding(s, "money", 1);
    },
  },
  {
    id: "evt_exam",
    emoji: "📝",
    weight: 1,
    title: "突发考试",
    desc: "你突然想起明天有一门闭卷考试，今晚不突击就要挂科！行动点 -2，压力飙升；简历排版与项目描述全被复习资料挤到明天再说——综合素质 -6。",
    apply: (s) => {
      applyApDelta(s, -2);
      applyStressDelta(s, 10, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality - 6);
    },
  },
  {
    id: "evt_homework",
    emoji: "📁",
    weight: 1,
    title: "突发作业",
    desc: "你突然想起有个大作业 ddl 就在后天，而你现在还停留在新建文件夹。行动点 -2，压力飙升；秋招文档在桌面最下层吃灰——综合素质 -7。",
    apply: (s) => {
      applyApDelta(s, -2);
      applyStressDelta(s, 10, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality - 7);
    },
  },
  {
    id: "evt_gacha",
    emoji: "✨",
    weight: 1,
    title: "十连双金",
    desc: "一次抽取出现了两份稀有奖励。意外的好运让你放松下来；这份好心情让你几天内更容易被小事治愈（降压效果↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, -9, "event");
      fxBuff(s, "欧气余韵：降压更有效", 3, { stressReliefMult: 1.12 });
      bumpEnding(s, "prep", 1);
    },
  },
  {
    id: "evt_breakup",
    emoji: "💔",
    weight: 1,
    title: "分手了",
    desc: "你和对象分手了。聊天记录停在已读不回，你盯着天花板到凌晨。精力 -35；几天没碰简历，版本还停留在『我们』时写的自我评价——综合素质 -8。",
    apply: (s) => {
      applyEnergyDelta(s, -35);
      applyStressDelta(s, 6, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality - 8);
    },
  },
  {
    id: "evt_pay_bad_luck",
    emoji: "💸",
    weight: 1,
    title: "临时支出",
    desc: "外卖撒了、耳机丢了、屏幕裂了——倒霉事三连，你只能花钱平事。金钱 -55。",
    apply: (s) => {
      applyMoneyDelta(s, -55);
    },
  },
  {
    id: "evt_melon",
    emoji: "🍉",
    weight: 1,
    title: "寝室里的近况",
    desc: "晚饭时，同学讲起了寝室最近的趣事。聊着聊着，你暂时放下了求职的烦恼。压力 -20。",
    apply: (s) => {
      applyStressDelta(s, -20, "event");
    },
  },
  {
    id: "evt_press_none",
    emoji: "📰",
    weight: 1.1,
    title: "新闻发布会",
    desc: "你看完了一场公司的新闻发布会，没有发现与目前求职方向相关的信息。无额外影响。",
    apply: () => {},
  },
  {
    id: "evt_press_industry",
    emoji: "🚀",
    weight: 1,
    title: "新闻发布会（行业红利）",
    desc: "政策吹风指向某一赛道，财经博主连夜出『深度解读』。你顺着岗位 JD 一搜：好像真有风口。7 日内对应行业岗位薪资展示 +20%。",
    apply: (s) => {
      const ind = INDUSTRY_POOL[Math.floor(rnd() * INDUSTRY_POOL.length)];
      setIndustryBuff(s, ind, 7, 1.2);
      const label = industrySalaryBuffLabelZh(ind);
      addLog(s, `【行业风向】${label} 赛道薪资展示 +20%（至第 ${s.industrySalaryBuff.untilDay} 天）。`);
    },
  },
  {
    id: "evt_press_meta",
    emoji: "📱",
    weight: 1,
    title: "新闻发布会后的讨论",
    desc: "行业消息引起了群里的讨论。听完不同的看法，你发现大家也没有确定答案，不必急着下结论。压力 -5。",
    apply: (s) => {
      applyStressDelta(s, -5, "event");
    },
  },
  {
    id: "evt_poison_skip",
    emoji: "🍱",
    weight: 0.42,
    title: "拼好饭中毒",
    desc: "你吃拼好饭中毒了！急诊挂水两天，秋招节奏被迫空转。时间推进 2 个自然日，另扣医药费 200；随后两日的生活费仍会正常结算。",
    apply: (s) => {
      applyMoneyDelta(s, -200);
      applyStressDelta(s, 12, "event");
      applyEnergyDelta(s, -45);
      simulateForwardNaturalDays(s, 2);
      s.eventModalQueue = [];
      s.eventPlanDay = s.day;
    },
  },
  {
    id: "evt_scam",
    emoji: "🎣",
    weight: 1,
    title: "诈骗",
    desc: "你购买了所谓的内部测评资料，转账后却被对方拉黑。处理这件事打乱了准备计划。压力 +10，精力 -30，综合素质 -6。",
    apply: (s) => {
      applyStressDelta(s, 10, "event");
      applyEnergyDelta(s, -30);
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality - 6);
    },
  },
  {
    id: "evt_pe_test",
    emoji: "🏃",
    weight: 1,
    title: "体测",
    desc: "体测接连进行了跑步、引体向上和肺活量测试。结束后，你只想坐下来歇一会儿。精力 -48。",
    apply: (s) => {
      applyEnergyDelta(s, -48);
      applyStressDelta(s, 4, "event");
    },
  },
  {
    id: "evt_client_change",
    emoji: "📎",
    weight: 1,
    title: "甲方说你再改改",
    desc: "实习群里甲方发来『微调一下』，附件是整包重做。你深吸一口气，简历里又多了两行黑话。压力 +6，综合素质 +2。",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 2);
    },
  },
  {
    id: "evt_skeleton",
    emoji: "💀",
    weight: 1,
    title: "群里的低落情绪",
    desc: "群里接连出现了求职不顺的消息。你翻看了很久，自己的准备也停了下来。精力 -8。",
    apply: (s) => {
      applyEnergyDelta(s, -8);
    },
  },
  {
    id: "evt_lucky_money",
    emoji: "🧧",
    weight: 1,
    title: "两笔小惊喜",
    desc: "你抢到了群里的拼手气红包，还中了支付立减。金钱 +35。",
    apply: (s) => {
      applyMoneyDelta(s, 35);
    },
  },
  {
    id: "evt_lottery_jackpot",
    maxPerRun: 1,
    emoji: "🎰",
    weight: 0.035,
    immediateSettle: true,
    title: "刮刮乐中奖",
    desc: "你在便利店买了一张刮刮乐，核对后发现中了大奖。这笔钱让你决定重新安排求职计划。（触发后立即进入结局）",
    apply: (s) => {
      s.lotteryJackpot = true;
      applyMoneyDelta(s, 88888);
      applyStressDelta(s, -25, "event");
      addLog(s, `第 ${s.day} 天：刮刮乐头奖到账，人生节奏突变……本局立即结算。`);
    },
  },
  {
    id: "evt_immigration_spam",
    maxPerRun: 1,
    emoji: "🌍",
    weight: 0.04,
    immediateSettle: true,
    title: "接连不断的咨询电话",
    desc: "留过联系方式后，你接到了多家中介的电话。考虑过另一条路线，你决定暂停秋招，先研究海外学习与工作的要求。（触发后立即进入结局）",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
      s.eventImmediateEnding = {
        id: "event_immigration_spam",
        title: "重新考虑方向",
        body: "连续的咨询电话让你重新考虑了海外学习与工作的可能。你暂停这一轮秋招，开始核对费用、材料和时间安排。",
      };
      addLog(s, `第 ${s.day} 天：移民咨询连环 call——本局立即结算。`);
    },
  },
  {
    id: "evt_credit_email",
    maxPerRun: 1,
    emoji: "📑",
    weight: 0.041,
    immediateSettle: true,
    title: "学分预警邮件",
    desc: "教务处系统：『当前培养方案未达标，存在延毕风险』。你需要先确认毕业要求，面试准备暂时搁下了。（触发后立即进入结局）",
    apply: (s) => {
      applyStressDelta(s, 14, "event");
      s.eventImmediateEnding = {
        id: "event_credit_crisis",
        title: "培养方案 · 红线警告",
        body: "核对培养方案后，你发现还有课程或学分需要补齐。你暂停秋招，优先处理毕业要求，再安排后续求职。",
      };
      addLog(s, `第 ${s.day} 天：收到学分预警——本局立即结算。`);
    },
  },
  {
    id: "evt_headhunter_rush",
    maxPerRun: 1,
    emoji: "☎️",
    weight: 0.037,
    immediateSettle: true,
    title: "猎头急电口头 OC",
    desc: "陌生号码报出你简历上的项目细节：『我们总包更高，现在口头定？』你脑子一热先答应了。（触发后立即进入结局）",
    apply: (s) => {
      applyStressDelta(s, -4, "event");
      s.eventImmediateEnding = {
        id: "event_headhunter_rush",
        title: "口头承诺之后",
        body: "猎头在电话中介绍了岗位和薪资，你据此结束了这一轮求职。但正式录用材料尚未到手，接下来仍需要确认承诺能否落实。",
      };
      addLog(s, `第 ${s.day} 天：猎头急电口头意向——本局立即结算。`);
    },
  },
  {
    id: "evt_bnpl",
    emoji: "💳",
    weight: 1,
    title: "分期账单",
    desc: "几笔免息分期让眼前的支出显得不多，合计账单却超出了预期。负债 +480。",
    apply: (s) => {
      s.debt = (s.debt ?? 0) + 480;
      applyStressDelta(s, 5, "event");
    },
  },
  {
    id: "evt_startup_spark",
    emoji: "📊",
    weight: 1,
    title: "寝室路演夜",
    desc: "室友拍桌：『这个痛点绝对有市场！』你们在白板上画到凌晨，居然像那么回事。创业进度 +1（多触发几次更易走向创业结局）。",
    apply: (s) => {
      s.pathStartup = (s.pathStartup ?? 0) + 1;
      applyEnergyDelta(s, -10);
      bumpEnding(s, "network", 1);
    },
  },
  {
    id: "evt_doxx_fear",
    emoji: "📦",
    weight: 1,
    title: "隐私泄露的担忧",
    desc: "看到个人信息泄露的讨论后，你检查了公开简历和账号的隐私设置。压力 +9。",
    apply: (s) => {
      applyStressDelta(s, 9, "event");
    },
  },
  {
    id: "evt_launch_again",
    emoji: "🎮",
    weight: 1.45,
    title: "游戏更新中",
    desc: "你打算玩十分钟游戏，打开后才发现有一个很大的更新包。等下载完成，原定的休息时间已经过去了。压力 +4，精力 -6。",
    apply: (s) => {
      applyStressDelta(s, 4, "event");
      applyEnergyDelta(s, -6);
    },
  },
  {
    id: "evt_hr_read",
    emoji: "👀",
    weight: 1,
    title: "HR 已读不回",
    desc: "投递状态从『已送达』变成『已读』，然后就没有然后了。压力 +7。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
    },
  },
  {
    id: "evt_interview_meme",
    emoji: "🌳",
    weight: 1,
    title: "题目之外的问题",
    desc: "练习面试时，同学忽然问你怎样应对压力。你发现，除了准备技术题，也需要想清楚自己的工作方式。面试能力 +3，压力 +3。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 3, 0, 100);
      applyStressDelta(s, 3, "event");
    },
  },
  {
    id: "evt_meme_shushu",
    emoji: "🐭",
    weight: 1,
    title: "有人说出了同样的烦恼",
    desc: "一篇求职记录写出了你最近的烦恼，也分享了整理经历的方法。你留下回复，顺手记下了一条建议。压力 -6，简历能力 +1。",
    apply: (s) => {
      applyStressDelta(s, -6, "event");
      s.hiddenResume = clamp(s.hiddenResume + 1, 0, 100);
    },
  },
  {
    id: "evt_meme_monkey",
    emoji: "🐒",
    weight: 1,
    title: "休息时的一段视频",
    desc: "一段模仿例会的短视频让你笑了起来，随后又想起了还没完成的准备。精力 -5，压力 +3。",
    apply: (s) => {
      applyEnergyDelta(s, -5);
      applyStressDelta(s, 3, "event");
    },
  },
  {
    id: "evt_meme_cpu",
    emoji: "🧠",
    weight: 1,
    title: "含糊的岗位承诺",
    desc: "招聘方反复强调发展空间，却迟迟不愿说明工作内容和待遇。沟通结束后，你仍有不少疑问。压力 +8。",
    apply: (s) => {
      applyStressDelta(s, 8, "event");
    },
  },
  {
    id: "evt_meme_pie",
    emoji: "🥧",
    weight: 1,
    title: "一堂职业分享课",
    desc: "分享课谈了许多职业规划，也留下了一些没有讲清的实际问题。你记下几条思路，准备之后再核实。综合素质 +2，压力 +4。",
    apply: (s) => {
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 2);
      applyStressDelta(s, 4, "event");
    },
  },
  {
    id: "evt_meme_996",
    emoji: "🏥",
    weight: 1,
    title: "体检套餐里的提醒",
    desc: "群转：某厂体检套餐送『颈椎康复咨询』。你默默把『能接受一定强度加班』删了又写回去。压力 +5，精力 -6。",
    apply: (s) => {
      applyStressDelta(s, 5, "event");
      applyEnergyDelta(s, -6);
    },
  },
  {
    id: "evt_meme_dian",
    emoji: "🗿",
    weight: 1,
    title: "弹性工作，弹向哪边",
    desc: "招聘页写着弹性工作，评论里却有人问：下班时间也可以自己选吗？你笑了一下，把这个问题记进面试清单。压力 -4。",
    apply: (s) => {
      applyStressDelta(s, -4, "event");
    },
  },
  {
    id: "evt_meme_ji",
    emoji: "📧",
    weight: 1,
    title: "错过笔试期限",
    desc: "邮件要求 24 小时内完成笔试，你发现它时，链接已经过期。压力 +11。",
    apply: (s) => {
      applyStressDelta(s, 11, "event");
    },
  },
  {
    id: "evt_meme_run",
    emoji: "🛫",
    weight: 1,
    title: "讲座背后的推广",
    desc: "海报写『出海与远程办公』，到场发现是留学中介。你领了一瓶水，听完介绍后提前离开。压力 -3，金钱 -20。",
    apply: (s) => {
      applyStressDelta(s, -3, "event");
      applyMoneyDelta(s, -20);
    },
  },
  {
    id: "evt_meme_yyds",
    emoji: "👑",
    weight: 1,
    title: "学长发来的内推码",
    desc: "学长发来内推码，还附上了岗位要求和申请步骤。你核对经历，整理好准备提交的材料。综合素质 +3，压力 -2。",
    apply: (s) => {
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 3);
      applyStressDelta(s, -2, "event");
    },
  },
  {
    id: "evt_meme_shuanq",
    emoji: "🙏",
    weight: 1,
    title: "结束时说错了话",
    desc: "面试结束时，你一紧张，把道谢的话说成了别的句子。走出房间后，还在回想那几秒钟。面试能力 -2，压力 +6。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview - 2, 0, 100);
      applyStressDelta(s, 6, "event");
    },
  },
  {
    id: "evt_meme_lead",
    emoji: "📱",
    weight: 1,
    title: "室友外放的发布会",
    desc: "室友外放发布会，你被迫听完『遥遥领先』十二遍。莫名焦虑。压力 +5，精力 -4。",
    apply: (s) => {
      applyStressDelta(s, 5, "event");
      applyEnergyDelta(s, -4);
    },
  },
  {
    id: "evt_meme_show",
    emoji: "🦚",
    weight: 1,
    title: "室友拿到了高薪 Offer",
    desc: "朋友圈九宫格：『感谢过去努力的自己』。你点赞手速比脑子快。压力 +7。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
    },
  },
  {
    id: "evt_meme_ie",
    emoji: "🫥",
    weight: 1,
    title: "第一次无领导小组练习",
    desc: "群面规则：『请积极发言』。你全程『嗯嗯』，结束脑内复盘八百遍。面试隐藏分 +1，压力 +9。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 1, 0, 100);
      applyStressDelta(s, 9, "event");
    },
  },
  {
    id: "evt_meme_zhendu",
    emoji: "🤡",
    weight: 1,
    title: "一道意外的面试题",
    desc: "面试官：『你觉得我司文化像哪种动物』。你：『啊？』。压力 +5，精力 -3。",
    apply: (s) => {
      applyStressDelta(s, 5, "event");
      applyEnergyDelta(s, -3);
    },
  },
  {
    id: "evt_meme_taiku",
    emoji: "🕶️",
    weight: 1,
    title: "凌晨改好的简历",
    desc: "凌晨三点，你终于改完简历。早上重新打开，却发现疲惫时漏掉了不少错字。综合素质 -7，精力 -12，压力 +4。",
    apply: (s) => {
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality - 7);
      applyEnergyDelta(s, -12);
      applyStressDelta(s, 4, "event");
    },
  },
  {
    id: "evt_meme_walk",
    emoji: "🚶",
    weight: 1,
    title: "Citywalk 改简历",
    desc: "你试着一边散步一边整理投递。走了很远，手机上只提交了两份申请，倒是看到了平时没留意的街景。精力 -8，压力 -3。",
    apply: (s) => {
      applyEnergyDelta(s, -8);
      applyStressDelta(s, -3, "event");
    },
  },
  {
    id: "evt_meme_404",
    emoji: "🔍",
    weight: 1,
    title: "招聘页面无法访问",
    desc: "招聘页面一直提示无法访问，你尝试刷新，也没有找到岗位是否下架的说明。压力 +6。",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
    },
  },
  {
    id: "evt_meme_dance",
    emoji: "💃",
    weight: 1,
    title: "误传的面试要求",
    desc: "群里有人说面试要展示才艺，你练了半小时才发现消息不实。不过，活动一下身体也算休息。精力 -10，压力 -4。",
    apply: (s) => {
      applyEnergyDelta(s, -10);
      applyStressDelta(s, -4, "event");
    },
  },
  {
    id: "evt_meme_barbie",
    emoji: "🍖",
    weight: 1,
    title: "群面遇到校友",
    desc: "群面里有几位熟悉的校友。你有些紧张，也从他们的表达中学到了新的思路。压力 +8，面试能力 +2。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 2, 0, 100);
      applyStressDelta(s, 8, "event");
    },
  },
  {
    id: "evt_stress_pofang",
    emoji: "🧱",
    weight: 1.85,
    requires: { stressMin: 70 },
    title: "深夜的求职动态",
    desc: "凌晨，你仍在翻看别人的录用消息，越看越担心自己的进度。压力 +6，精力 -8。",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
      applyEnergyDelta(s, -8);
    },
  },
  {
    id: "evt_stress_beng",
    emoji: "😬",
    weight: 1.85,
    requires: { stressMin: 70 },
    title: "招聘平台的加班讨论",
    desc: "平台推来一篇加班讨论，你担心起工作节奏，也记下了几个面试时要问的问题。压力 +5，简历能力 +1。",
    apply: (s) => {
      applyStressDelta(s, 5, "event");
      s.hiddenResume = clamp(s.hiddenResume + 1, 0, 100);
    },
  },
  {
    id: "evt_stress_han",
    emoji: "💦",
    weight: 1.75,
    requires: { stressMin: 70 },
    title: "练习前的紧张",
    desc: "准备录制自我介绍时，你反复想象面试官会怎样评价，迟迟没有按下开始键。压力 +4，精力 -5。",
    apply: (s) => {
      applyStressDelta(s, 4, "event");
      applyEnergyDelta(s, -5);
    },
  },
  {
    id: "evt_stress_boat",
    emoji: "⛵",
    weight: 1.4,
    requires: { stressMin: 75 },
    title: "一条鼓励的消息",
    desc: "朋友发来一句鼓励。你看着尚未回复的申请，仍有些担心，但有人记得你的近况，也让心情缓和了一点。压力先 +3，再 -5。",
    apply: (s) => {
      applyStressDelta(s, -2, "event");
    },
  },
  {
    id: "evt_energy_crispy",
    emoji: "🦴",
    weight: 1.5,
    requires: { energyMax: 40 },
    title: "起身时的一阵眩晕",
    desc: "久坐后突然起身，你感到一阵眩晕，决定放慢安排。当场精力与压力小幅变化；接下来更容易疲惫（精力消耗↑，持续 3 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -4);
      applyStressDelta(s, 1, "event");
      fxDebuff(s, "脆皮认证：精力消耗↑", 3, { energyDrainMult: 1.1 });
    },
  },
  {
    id: "evt_debt_call",
    emoji: "☎️",
    weight: 1.35,
    requires: { debtMin: 200 },
    title: "催收电话但打错号",
    desc: "电话：『您好分期』。你：『我没钱』。对方：『抱歉打错了』。虚惊一场仍心慌；催债阴影让你几天内更容易被小事吓到（压力获得↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, 4, "event");
      fxDebuff(s, "催债阴影：压力获得↑", 3, { stressGainMult: 1.08 });
    },
  },
  {
    id: "evt_money_broke",
    emoji: "🫙",
    weight: 1.35,
    requires: { moneyMax: 400 },
    title: "余额不多了",
    desc: "查看余额后，你发现可支配的钱已经不多。接下来的开销需要重新安排，当场压力上升；两天内更容易担忧（压力获得↑，持续 2 天）。",
    apply: (s) => {
      applyStressDelta(s, 3, "event");
      fxDebuff(s, "贫穷清醒：压力获得↑", 2, { stressGainMult: 1.06 });
    },
  },

  // —— 与 buff/debuff 机制相关的新事件（参与每日随机池）——
  {
    id: "evt_fx_matcha",
    emoji: "🍵",
    weight: 1,
    title: "下午的一杯拿铁",
    desc: "你和同学在楼下新店点了两杯拿铁，坐下来聊了会儿。现金 -35；接下来几天精力恢复有所改善（跨日精力恢复↑，持续 3 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -35);
      applyStressDelta(s, -3, "event");
      fxBuff(s, "咖啡因：跨日精力恢复↑", 3, { passiveEnergyRecoverMult: 1.12 });
    },
  },
  {
    id: "evt_fx_alarm",
    emoji: "⏰",
    weight: 1.05,
    title: "闹钟集体失灵",
    desc: "三个闹钟全没响，你惊醒时离组会只剩十分钟。当场狂飙压力；几天内身体一直处于『赶场模式』（精力消耗↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, 9, "event");
      fxDebuff(s, "赶场模式：精力消耗↑", 3, { energyDrainMult: 1.12 });
    },
  },
  {
    id: "evt_fx_therapy",
    emoji: "🛋️",
    weight: 0.95,
    title: "校园心理咨询",
    desc: "学校心理健康中心发券，你去聊了一小时：当场压力略降；几天内情绪更稳，不容易被坏消息一下击穿（压力获得↓，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, -6, "event");
      fxBuff(s, "心理缓冲：压力获得↓", 3, { stressGainMult: 0.9 });
    },
  },
  {
    id: "evt_fx_doomscroll",
    emoji: "📱",
    weight: 1.1,
    title: "睡前刷拒信",
    desc: "你原本只想看一眼邮箱，却翻到凌晨两点。当场精力下降；几天内睡前仍难以放下求职的担忧（压力获得↑，持续 3 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -8);
      applyStressDelta(s, 5, "event");
      fxDebuff(s, "睡前焦虑：压力获得↑", 3, { stressGainMult: 1.1 });
    },
  },
  {
    id: "evt_fx_meditation",
    emoji: "🧘",
    weight: 0.9,
    title: "冥想 APP 打卡七天",
    desc: "其实只坚持了三天，但呼吸法真的有用：当场降压；几天内更容易从压力里抽身（降压效果↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, -7, "event");
      fxBuff(s, "呼吸法：降压更有效", 3, { stressReliefMult: 1.1 });
    },
  },
  {
    id: "evt_fx_hangover",
    emoji: "🍺",
    weight: 0.85,
    title: "宿醉周一",
    desc: "昨晚聚餐喝高，今早头痛欲裂。当场精力大幅下降；几天内仍感到疲惫（精力消耗↑，降压效果↓，持续 3 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -14);
      applyStressDelta(s, 6, "event");
      fxDebuff(s, "宿醉：更累更难放松", 3, { energyDrainMult: 1.1, stressReliefMult: 0.92 });
    },
  },
  {
    id: "evt_fx_vitamin",
    emoji: "💊",
    weight: 1,
    title: "维生素囤货",
    desc: "直播间冲动下单三大瓶，当场现金 -88；但几天内恢复精力更顺（主动精力回复↑，持续 3 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -88);
      applyStressDelta(s, -2, "event");
      fxBuff(s, "补剂心理：精力回复↑", 3, { energyRecoverMult: 1.12 });
    },
  },
  {
    id: "evt_fx_flu",
    emoji: "💉",
    weight: 0.95,
    title: "校医院流感疫苗",
    desc: "排队一小时，胳膊酸两天，当场小耗精力；但几天内心态莫名稳一点（压力获得↓，持续 3 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -5);
      applyStressDelta(s, -2, "event");
      fxBuff(s, "疫苗心理：压力获得↓", 3, { stressGainMult: 0.92 });
    },
  },
  {
    id: "evt_fx_peer_offer",
    emoji: "📣",
    weight: 1.05,
    title: "室友晒 Offer",
    desc: "群里有人晒三方，你替他高兴，也开始担心自己的进度；几天内更容易受到比较的影响（压力获得↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, 11, "event");
      fxDebuff(s, "同辈压力：压力获得↑", 3, { stressGainMult: 1.12 });
    },
  },
  {
    id: "evt_fx_purify_shrine",
    emoji: "⛩️",
    weight: 0.22,
    title: "路过神社洗手净化",
    desc: "旅游博主同款：你认真洗了手、在心里默念『秋招退散』。罕见地感到一阵清爽——若身上有负面状态效果，可一并卸下；并小幅降压。",
    apply: (s) => {
      purgeAllDebuffsForPurify(s);
      applyStressDelta(s, -5, "event");
    },
  },

  // —— 娱乐 tag：仅「娱乐」行动 20% 额外触发，不参与每日随机事件池 ——
  {
    id: "evt_ent_travel",
    tags: ["entertainment"],
    emoji: "✈️",
    weight: 1,
    requires: { moneyMin: 400 },
    title: "说走就走的短途旅行",
    desc: "机票酒店一气呵成，邮箱未读可以晚点再焦虑。跳过若干自然日（不超过截止日），压力清零、精力拉满；下一次行动不消耗行动点。",
    apply: (s) => {
      const maxD = s.maxDays ?? 30;
      const steps = Math.min(3, Math.max(0, maxD - s.day));
      if (steps > 0) simulateForwardNaturalDays(s, steps);
      s.stress = 0;
      s.energy = s.energyMax ?? 100;
      s.funNextActionFree = true;
      bumpEnding(s, "travel", 1);
    },
  },
  {
    id: "evt_ent_daytrip",
    tags: ["entertainment"],
    emoji: "🚌",
    weight: 1.1,
    title: "特种兵式一日游",
    desc: "凌晨出发半夜回城，打卡五个景点。跳过 1 个自然日；走了一整天，身体很累，心情却轻松了一些。",
    apply: (s) => {
      const maxD = s.maxDays ?? 30;
      if (s.day < maxD) simulateForwardNaturalDays(s, 1);
      applyMoneyDelta(s, -120);
      applyStressDelta(s, -14, "event");
      applyEnergyDelta(s, -18);
    },
  },
  {
    id: "evt_ent_script",
    tags: ["entertainment"],
    emoji: "🎭",
    weight: 1,
    title: "剧本杀通刷",
    desc: "一车硬核玩家，你从下午盘到深夜。钱包与精力双减，但至少今晚不用想秋招。",
    apply: (s) => {
      applyMoneyDelta(s, -100);
      applyStressDelta(s, -10, "event");
      applyEnergyDelta(s, -10);
    },
  },
  {
    id: "evt_ent_karaoke",
    tags: ["entertainment"],
    emoji: "🎤",
    weight: 1,
    title: "KTV 通宵场",
    desc: "大家轮流点歌，一直唱到天亮。心情放松了，嗓子和身体却需要休息。",
    apply: (s) => {
      applyMoneyDelta(s, -150);
      applyStressDelta(s, -12, "event");
      applyEnergyDelta(s, -22);
    },
  },
  {
    id: "evt_ent_cinema",
    tags: ["entertainment"],
    emoji: "🎬",
    weight: 1.05,
    title: "电影院连场马拉松",
    desc: "连续看完三部电影，出门才发现已经天黑。今晚没有检查邮箱。",
    apply: (s) => {
      applyMoneyDelta(s, -95);
      applyStressDelta(s, -9, "event");
      applyEnergyDelta(s, -8);
    },
  },
  {
    id: "evt_ent_catcafe",
    tags: ["entertainment"],
    emoji: "🐱",
    weight: 1.15,
    title: "猫咖吸猫一整天",
    desc: "一只猫在你旁边睡了一下午。离开前，你给店里办了张次卡。",
    apply: (s) => {
      applyMoneyDelta(s, -88);
      applyStressDelta(s, -16, "event");
      applyEnergyDelta(s, 6);
    },
  },
  {
    id: "evt_ent_comicon",
    tags: ["entertainment"],
    emoji: "🎨",
    weight: 0.85,
    requires: { moneyMin: 300 },
    title: "漫展里的长队",
    desc: "限定谷、签售、摄影区三选一排队。等待和逛展花了不少体力与现金，不过和同好聊天很开心。",
    apply: (s) => {
      applyMoneyDelta(s, -260);
      applyStressDelta(s, -6, "event");
      applyEnergyDelta(s, -28);
    },
  },
  {
    id: "evt_ent_boardgame",
    tags: ["entertainment"],
    emoji: "🎲",
    weight: 1.1,
    title: "桌游吧连开三局",
    desc: "德式美式乱炖，输的人请奶茶。",
    apply: (s) => {
      applyMoneyDelta(s, -70);
      applyStressDelta(s, -9, "event");
      applyEnergyDelta(s, -6);
    },
  },
  {
    id: "evt_ent_onsen",
    tags: ["entertainment"],
    emoji: "♨️",
    weight: 0.9,
    requires: { moneyMin: 500 },
    title: "温泉酒店休息日",
    desc: "私汤+自助餐，压力随水蒸气飘散。",
    apply: (s) => {
      applyMoneyDelta(s, -420);
      applyStressDelta(s, -24, "event");
      s.energy = s.energyMax ?? 100;
    },
  },
  {
    id: "evt_ent_hike",
    tags: ["entertainment"],
    emoji: "🥾",
    weight: 1,
    title: "徒步登山放空",
    desc: "山顶风大，拒信也想不起来了。",
    apply: (s) => {
      applyMoneyDelta(s, -55);
      applyStressDelta(s, -11, "event");
      applyEnergyDelta(s, -20);
      s.hiddenInterview = clamp((s.hiddenInterview ?? 0) + 2, 0, 100);
    },
  },
  {
    id: "evt_ent_festival",
    tags: ["entertainment"],
    emoji: "🎸",
    weight: 0.75,
    requires: { moneyMin: 600 },
    title: "户外音乐节",
    desc: "草地被踩成了泥，鞋子脏了，喜欢的歌却一首没错过。",
    apply: (s) => {
      applyMoneyDelta(s, -380);
      applyStressDelta(s, -18, "event");
      applyEnergyDelta(s, -32);
    },
  },
  {
    id: "evt_ent_fishing",
    tags: ["entertainment"],
    emoji: "🎣",
    weight: 1.05,
    title: "钓鱼空军一整天",
    desc: "鱼没上钩，焦虑上钩了。",
    apply: (s) => {
      applyMoneyDelta(s, -45);
      applyStressDelta(s, 6, "event");
      applyEnergyDelta(s, -10);
    },
  },
  {
    id: "evt_ent_escape",
    tags: ["entertainment"],
    emoji: "🔦",
    weight: 1,
    title: "密室逃脱尖叫局",
    desc: "朋友比你先尖叫起来，你只好带着大家找出口。出来后，面试似乎也没那么让人紧张了。",
    apply: (s) => {
      applyMoneyDelta(s, -140);
      applyStressDelta(s, -11, "event");
      applyEnergyDelta(s, -12);
    },
  },
  {
    id: "evt_ent_influencer",
    tags: ["entertainment"],
    emoji: "📸",
    weight: 1,
    title: "网红店排队翻车",
    desc: "拍照两小时吃饭五分钟，口味一般，队很长。",
    apply: (s) => {
      applyMoneyDelta(s, -95);
      applyStressDelta(s, 4, "event");
      applyEnergyDelta(s, -8);
    },
  },
  {
    id: "evt_ent_esports",
    tags: ["entertainment"],
    emoji: "🖥️",
    weight: 0.95,
    requires: { moneyMin: 350 },
    title: "电竞酒店开黑通宵",
    desc: "大家连输了五局，还是约好了再来一次。第二天起床，才发现昨晚睡得太少。",
    apply: (s) => {
      applyMoneyDelta(s, -240);
      applyStressDelta(s, -13, "event");
      applyEnergyDelta(s, -18);
    },
  },
  {
    id: "evt_ent_ski",
    tags: ["entertainment"],
    emoji: "⛷️",
    weight: 0.7,
    requires: { moneyMin: 800 },
    title: "滑雪初体验",
    desc: "摔得屁股疼，但风在耳边的时候脑子是空的。",
    apply: (s) => {
      applyMoneyDelta(s, -520);
      applyStressDelta(s, -9, "event");
      applyEnergyDelta(s, -24);
    },
  },
  {
    id: "evt_ent_stoodup",
    tags: ["entertainment"],
    emoji: "🫠",
    weight: 1,
    title: "剧本杀被鸽",
    desc: "几位玩家临时取消，游戏没能开始。你在店里等了两小时，只好和剩下的人商量改期。",
    apply: (s) => {
      applyStressDelta(s, 10, "event");
      applyEnergyDelta(s, -6);
    },
  },
  {
    id: "evt_ent_picnic",
    tags: ["entertainment"],
    emoji: "🧺",
    weight: 1.1,
    title: "公园野餐半日",
    desc: "草坪、三明治、飞盘，简历排版突然有了灵感。",
    apply: (s) => {
      applyMoneyDelta(s, -48);
      applyStressDelta(s, -7, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 2);
    },
  },
  {
    id: "evt_ent_museum",
    tags: ["entertainment"],
    emoji: "🏛️",
    weight: 1.1,
    title: "博物馆慢游",
    desc: "看展比看 JD 治愈，顺便记了两句文案进简历。",
    apply: (s) => {
      applyMoneyDelta(s, -35);
      applyStressDelta(s, -6, "event");
      s.hiddenResume = clamp((s.hiddenResume ?? 0) + 2, 0, 100);
    },
  },
  {
    id: "evt_ent_talkshow",
    tags: ["entertainment"],
    emoji: "🎙️",
    weight: 1,
    title: "线下脱口秀",
    desc: "笑到脸酸，短暂忘记邮箱红点。",
    apply: (s) => {
      applyMoneyDelta(s, -128);
      applyStressDelta(s, -13, "event");
    },
  },
  {
    id: "evt_ent_amusement",
    tags: ["entertainment"],
    emoji: "🎢",
    weight: 0.85,
    requires: { moneyMin: 400 },
    title: "游乐园尖叫解压",
    desc: "过山车比群面刺激，下来腿软心轻。",
    apply: (s) => {
      applyMoneyDelta(s, -290);
      applyStressDelta(s, -17, "event");
      applyEnergyDelta(s, -22);
    },
  },
  {
    id: "evt_ent_bar",
    tags: ["entertainment"],
    emoji: "🍸",
    weight: 0.95,
    requires: { moneyMin: 250 },
    title: "清吧小酌两杯",
    desc: "微醺时觉得 offer 总会有的——明天酒醒再说。",
    apply: (s) => {
      applyMoneyDelta(s, -165);
      applyStressDelta(s, -9, "event");
      applyEnergyDelta(s, -6);
    },
  },
  {
    id: "evt_ent_binge",
    tags: ["entertainment"],
    emoji: "📺",
    weight: 1.15,
    title: "宅家追剧一整天",
    desc: "看完一整天的剧，你放松了一些，也想起今天还没打开简历。明天需要重新安排准备时间。",
    apply: (s) => {
      applyStressDelta(s, -8, "event");
      applyEnergyDelta(s, -6);
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality - 3);
    },
  },
  {
    id: "evt_ent_spa",
    tags: ["entertainment"],
    emoji: "💆",
    weight: 0.9,
    requires: { moneyMin: 450 },
    title: "按摩 SPA 一条龙",
    desc: "肩颈松了，也暂时放下了准备任务。",
    apply: (s) => {
      applyMoneyDelta(s, -310);
      applyStressDelta(s, -21, "event");
      applyEnergyDelta(s, 12);
    },
  },
  {
    id: "evt_ent_scratch",
    tags: ["entertainment"],
    emoji: "🎫",
    weight: 1.05,
    title: "便利店顺手刮一张",
    desc: "小亏小赚听天由命，比等 HR 回邮件刺激。",
    apply: (s) => {
      applyMoneyDelta(s, -20);
      applyStressDelta(s, -3, "event");
      if (Math.random() < 0.08) {
        applyMoneyDelta(s, 80);
        addLog(s, "居然刮出点小奖！");
      }
    },
  },
  {
    id: "evt_ent_cycling",
    tags: ["entertainment"],
    emoji: "🚴",
    weight: 1,
    title: "骑行环城",
    desc: "风糊一脸，卡路里与焦虑一起燃烧。",
    apply: (s) => {
      applyMoneyDelta(s, -42);
      applyStressDelta(s, -10, "event");
      applyEnergyDelta(s, -26);
    },
  },
  {
    id: "evt_ent_photo",
    tags: ["entertainment"],
    emoji: "📷",
    weight: 0.95,
    requires: { moneyMin: 200 },
    title: "外拍约拍一整天",
    desc: "修图修到半夜，但朋友圈点赞恢复精力。",
    apply: (s) => {
      applyMoneyDelta(s, -175);
      applyStressDelta(s, -8, "event");
      applyEnergyDelta(s, -14);
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 3);
    },
  },
  {
    id: "evt_ent_concert",
    tags: ["entertainment"],
    emoji: "🎤",
    weight: 0.65,
    requires: { moneyMin: 1200 },
    title: "演唱会内场",
    desc: "票价超出了原先的预算。熟悉的前奏响起时，你还是觉得这一晚值得。",
    apply: (s) => {
      applyMoneyDelta(s, -880);
      applyStressDelta(s, -28, "event");
      applyEnergyDelta(s, -36);
    },
  },
  {
    id: "evt_ent_farm",
    tags: ["entertainment"],
    emoji: "🌾",
    weight: 0.95,
    requires: { moneyMin: 350 },
    title: "农家乐两日游",
    desc: "旅行本身：现金 -220，压力 -14，精力 -12。进入下一自然日，放弃今日剩余行动机会（第 30 天不再推进日期）。跨日的生活费、恢复、天赋及面试另行结算，最终净变化以结果为准。",
    apply: (s) => {
      const maxD = s.maxDays ?? 30;
      if (s.day < maxD) simulateForwardNaturalDays(s, 1);
      applyMoneyDelta(s, -220);
      applyStressDelta(s, -14, "event");
      applyEnergyDelta(s, -12);
    },
  },
  {
    id: "evt_ent_citywalk",
    tags: ["entertainment"],
    emoji: "🚶",
    weight: 1.15,
    title: "Citywalk 城市漫步",
    desc: "无目的乱走，耳机里播播客，居然想通了一道面试题。",
    apply: (s) => {
      applyMoneyDelta(s, -52);
      applyStressDelta(s, -6, "event");
      applyEnergyDelta(s, -10);
      s.hiddenInterview = clamp((s.hiddenInterview ?? 0) + 1, 0, 100);
    },
  },
  {
    id: "evt_ent_fx_stream",
    tags: ["entertainment"],
    emoji: "📺",
    weight: 1,
    title: "直播间的一份礼物",
    desc: "深夜看主播开箱，手滑送了礼物。当场现金与精力小损；不过直播间里的聊天让你几天内面对小事时更平静（压力获得↓，持续 3 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -48);
      applyStressDelta(s, -4, "event");
      applyEnergyDelta(s, -5);
      fxBuff(s, "弹幕护体：压力获得↓", 3, { stressGainMult: 0.93 });
    },
  },
  {
    id: "evt_ent_fx_mukbang",
    tags: ["entertainment"],
    emoji: "🍜",
    weight: 1.02,
    title: "看吃播看到饿",
    desc: "外卖 +60，吃完后恢复了一些精力，也有些困倦；几天内更容易吃撑犯困（精力消耗↑，持续 2 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -60);
      applyStressDelta(s, -5, "event");
      applyEnergyDelta(s, 4);
      fxDebuff(s, "碳水困：精力消耗↑", 2, { energyDrainMult: 1.08 });
    },
  },
  {
    id: "evt_ent_fx_asmr",
    tags: ["entertainment"],
    emoji: "🎧",
    weight: 0.95,
    title: "ASMR 入睡失败",
    desc: "戴耳机躺了两小时越听越清醒。当场略耗精力；但白噪音让你几天内更容易真正放松（降压效果↑，持续 3 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -4);
      applyStressDelta(s, -3, "event");
      fxBuff(s, "白噪音：降压更有效", 3, { stressReliefMult: 1.08 });
    },
  },
  {
    id: "evt_ent_fx_kpop",
    tags: ["entertainment"],
    emoji: "💃",
    weight: 1,
    title: "广场上的舞蹈邀请",
    desc: "朋友邀请你一起跳舞。起初有些紧张，结束后却放松了不少，几天内精力恢复更好（主动精力回复↑，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
      applyEnergyDelta(s, -12);
      fxBuff(s, "多巴胺：精力回复↑", 3, { energyRecoverMult: 1.1 });
    },
  },
  {
    id: "evt_ent_fx_arcade",
    tags: ["entertainment"],
    emoji: "🕹️",
    weight: 1.05,
    title: "街机厅币花光",
    desc: "游戏币很快用完了，你却没拿到期待的奖品。失落让当场压力小幅上升，几天内也更容易紧张（压力获得↑，持续 3 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -120);
      applyStressDelta(s, 6, "event");
      applyEnergyDelta(s, -8);
      fxDebuff(s, "上头阴影：压力获得↑", 3, { stressGainMult: 1.08 });
    },
  },
  {
    id: "evt_ent_fx_hotpot",
    tags: ["entertainment"],
    emoji: "🍲",
    weight: 1,
    title: "火锅局聊到半夜",
    desc: "辣锅 + 冰饮，肠胃当场抗议；几天内更容易累（精力消耗↑，持续 2 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -95);
      applyStressDelta(s, -10, "event");
      applyEnergyDelta(s, -6);
      fxDebuff(s, "辣锅后劲：精力消耗↑", 2, { energyDrainMult: 1.09 });
    },
  },
  {
    id: "evt_ent_fx_night_market",
    tags: ["entertainment"],
    emoji: "🏮",
    weight: 1.08,
    title: "逛到收摊的夜市",
    desc: "烤串奶茶一条龙，现金 -70，当场略降压；夜市余韵让你几天内跨日恢复精力更稳（跨日精力恢复↑，持续 3 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -70);
      applyStressDelta(s, -8, "event");
      applyEnergyDelta(s, -14);
      fxBuff(s, "逛吃恢复精力：跨日精力恢复↑", 3, { passiveEnergyRecoverMult: 1.1 });
    },
  },
  {
    id: "evt_ent_fx_volleyball",
    tags: ["entertainment"],
    emoji: "🏐",
    weight: 0.92,
    title: "球场上的强劲对手",
    desc: "对手接连得分，你有些沮丧，当场压力小升、精力大耗；但运动后几天内心态反而更钝感（压力获得↓，持续 3 天）。",
    apply: (s) => {
      applyStressDelta(s, 5, "event");
      applyEnergyDelta(s, -22);
      fxBuff(s, "运动钝感：压力获得↓", 3, { stressGainMult: 0.94 });
    },
  },
  {
    id: "evt_ent_fx_purify_bath",
    tags: ["entertainment"],
    emoji: "🛁",
    weight: 0.3,
    requires: { moneyMin: 150 },
    title: "大浴场泡汤净化",
    desc: "搓澡师傅手劲不小，泡进热水后，你才慢慢放松下来。这次休整可解除身上的负面状态，并降低压力、恢复少量精力。",
    apply: (s) => {
      applyMoneyDelta(s, -85);
      purgeAllDebuffsForPurify(s);
      applyStressDelta(s, -8, "event");
      applyEnergyDelta(s, 6);
    },
  },
  {
    id: "evt_ent_fx_morning_jog",
    tags: ["entertainment"],
    emoji: "🌅",
    weight: 1.05,
    title: "晨跑打卡三天",
    desc: "原本约好跑三天，这次只完成了一天，但阳光和风是真的：当场小耗精力、略降压；晨跑余韵让你两天内跨日恢复精力更好（持续 2 天）。",
    apply: (s) => {
      applyEnergyDelta(s, -10);
      applyStressDelta(s, -5, "event");
      fxBuff(s, "晨跑余韵：跨日精力恢复↑", 2, { passiveEnergyRecoverMult: 1.12 });
    },
  },
  {
    id: "evt_ent_maimai_chuni",
    tags: ["entertainment"],
    emoji: "🎵",
    weight: 1.32,
    title: "舞萌DX / 中二节奏",
    desc: "街机厅刷分：判定全绿、手台敲到起茧，Offer 邮件暂时读不到条——专注节奏让你暂时放下了求职的烦恼，压力额外大幅下降（略耗精力与游戏币）。",
    apply: (s) => {
      applyMoneyDelta(s, -65);
      applyStressDelta(s, -24, "event");
      applyEnergyDelta(s, -10);
    },
  },
];

function cloneEvent(def) {
  return { ...def, apply: def.apply };
}

function pickUniformEvent(state, reserved, pacing) {
  const illDef = EVENT_DEFS.find(e => e.id === "evt_ill");
  if (hasTalent(state, "clear_eyed") && rnd() < 0.12 * eventRepeatMultiplier(illDef, state)) {
    const ill = EVENT_DEFS.find((e) => e.id === "evt_ill");
    if (ill && eventEligible(ill, state) && eventAvailableThisRun(ill, state, reserved)) {
      pacing.notices = 0;
      return cloneEvent(ill);
    }
  }
  const pool = EVENT_DEFS.filter(
    (e) => eventEligible(e, state) && eventAvailableThisRun(e, state, reserved) && !e.tags?.includes("entertainment") && !e.tags?.includes("conditional"),
  );
  return sampleEventPool(pool, state, pacing);
}

/** 为本自然日生成事件队列（每早调用一次） */
export function planEventsForCurrentDay(state) {
  const d = state.day;
  if (inFirstRunIntro(state)) { state.eventPlanDay = d; state.eventModalQueue = []; return state.eventModalQueue; }
  if (state.eventPlanDay === d && Array.isArray(state.eventModalQueue)) {
    return state.eventModalQueue;
  }
  state.eventPlanDay = d;
  if (d === 1) {
    state.eventModalQueue = [];
    return state.eventModalQueue;
  }
  const k = sampleEventCountForToday(state);
  const q = takeDueFollowups(state);
  const conditional = takeConditionalEvent(state);
  if (conditional) q.push(conditional);
  const reserved = new Set();
  const pacing = { notices: state.eventNoticeStreak ?? 2 };
  for (let i = 0; i < k; i++) {
    const event = pickUniformEvent(state, reserved, pacing);
    if (!event) break;
    q.push(event);
    reserved.add(event.id);
  }
  state.eventModalQueue = q;
  return q;
}

export function recordEventResolved(state, day) {
  const d = day ?? state.day;
  state.eventsByDay[d] = (state.eventsByDay[d] ?? 0) + 1;
}

const resolvedEvents = new WeakSet();
const startedEvents = new WeakMap();
const resourceFields = { money: '现金', debt: '负债', actionPoints: '行动点', energy: '精力', stress: '压力', resumeQuality: '综合素质', hiddenResume: '简历过筛倾向', hiddenInterview: '面试发挥', day: '日期', strategyBonusGrowth: '额外成长名额', strategyBonusCore: '额外流派名额' };

function applyWithSummary(state, apply) {
  const previousOffers = [...(state.offers ?? [])];
  const before = Object.fromEntries(Object.keys(resourceFields).map(k => [k, state[k] ?? 0]));
  const previousEffects = new Set((state.transientEffects ?? []).map(fx => fx.id));
  const outcome = apply(state);
  const changes = Object.entries(resourceFields).flatMap(([key, label]) => {
    const delta = Math.round(((state[key] ?? 0) - before[key]) * 10) / 10;
    return delta ? [label + ' ' + (delta > 0 ? '+' : '') + delta] : [];
  });
  for (const offer of previousOffers) {
    if (!(state.offers ?? []).includes(offer)) changes.push(`「${offer.name}」撤回 Offer（剩余 ${state.offers.length} 份）`);
  }
  for (const fx of state.transientEffects ?? []) {
    if (!previousEffects.has(fx.id)) changes.push('新增状态「' + fx.label + '」');
  }
  const effects = changes.join('，') || '即时资源无变化';
  return typeof outcome?.narrative === 'string' ? `${outcome.narrative}。${effects}` : effects;
}

// Facts settle on display; decisions settle only after a valid selection.
export function beginEvent(state, event) {
  if (startedEvents.has(event)) return startedEvents.get(event);
  recordEventAppearance(state, event);
  const interaction = getEventInteraction(event);
  if (!event.skipRecordEvent) {
    state.eventNoticeStreak = interaction.mode === 'notice' ? (state.eventNoticeStreak ?? 2) + 1 : 0;
  }
  const started = { mode: interaction.mode, day: state.day, summary: '', terminal: false };
  startedEvents.set(event, started);
  if (!event.skipRecordEvent) recordEventResolved(state, started.day);
  if (!event.skipRecordEvent && event.tags?.includes("conditional")) {
    state.conditionalEventsByDay ??= {};
    state.conditionalEventsByDay[started.day] = (state.conditionalEventsByDay[started.day] ?? 0) + 1;
  }
  if (!event.skipRecordEvent && event.tags?.includes('entertainment')) {
    state.entertainmentEventsByDay ??= {};
    state.entertainmentEventsByDay[started.day] = (state.entertainmentEventsByDay[started.day] ?? 0) + 1;
  }
  if (interaction.mode === 'notice' || interaction.before) {
    started.summary = applyWithSummary(state, interaction.before ?? event.apply);
    addLog(state, '事件「' + event.title + '」已发生：' + started.summary + '。');
    checkInstantFail(state);
  }
  started.terminal = state.gameOver;
  if (interaction.mode === 'notice' || started.terminal) {
    resolvedEvents.add(event);
    started.result = { ok: true, notice: true, label: '继续', summary: started.summary, immediateSettle: interaction.mode === 'notice' && !!event.immediateSettle };
  }
  return started;
}

export function resolveEvent(state, event, choiceId) {
  if (resolvedEvents.has(event)) return { ok: false };
  const interaction = getEventInteraction(event);
  if (interaction.mode === 'notice') {
    if (choiceId != null && choiceId !== 'original') return { ok: false };
    return beginEvent(state, event).result;
  }
  const selected = interaction.choices.find(c => c.id === choiceId);
  if (!selected) return { ok: false };
  const started = beginEvent(state, event);
  if (started.terminal) return started.result;
  if (eventChoiceUnavailable(state, selected)) return { ok: false };
  resolvedEvents.add(event);
  const summary = applyWithSummary(state, selected.apply);
  addLog(state, '事件「' + event.title + '」选择「' + selected.label + '」：' + summary + '。');
  return { ok: true, immediateSettle: !!selected.immediateSettle, summary, label: selected.label };
}

/** 当前自然日及前四日内的学习行动总次数（滚动五日窗） */
export function studyCountLast5Days(state) {
  if (!state.studyByDay) return 0;
  let sum = 0;
  for (let d = state.day - 4; d <= state.day; d++) {
    if (d >= 1) sum += state.studyByDay[d] ?? 0;
  }
  return sum;
}

/** 滚动五日内学习次数 ≥ 此值则触发「用脑过度」 */
export const STUDY_OVERLOAD_THRESHOLD = 5;

/**
 * 在「用脑过度」持续期间，若 debuff 下「学习」次数 &gt; 3（第 4 次起）则触发：清除 debuff，并获得三日学习增益 buff。
 */
export function tryStudyBreakthroughEvent(state) {
  if (inFirstRunIntro(state)) return null;
  if ((state.studyCountWhileOverloadDebuff ?? 0) <= 3) return null;
  if (state.studyOverloadDebuffUntilDay == null || state.day > state.studyOverloadDebuffUntilDay) {
    return null;
  }
  state.studyOverloadDebuffUntilDay = null;
  state.studyCountWhileOverloadDebuff = 0;
  state.studyRecoveryBuffUntilDay = state.day + 2;
  return {
    id: "evt_study_breakthrough",
    title: "重新理清思路",
    desc: `你在效率低谷里仍硬啃书本，某一刻突然想通了：过劳的迷雾散去，「用脑过度」状态解除；接下来三个自然日「学习」带来的隐藏简历、隐藏面试与综合素质增益约为 ×${STUDY_RECOVERY_BUFF_MULT.toFixed(2)}。`,
    emoji: "💡",
    skipRecordEvent: true,
    apply(s) {
      applyStressDelta(s, -5, "event");
      addLog(s, `重新理清思路：解除用脑过度，接下来三天学习效率提升（约 ×${STUDY_RECOVERY_BUFF_MULT.toFixed(2)}）。`);
    },
  };
}

/**
 * 在「学习」行动结算后调用：若滚动五日内学习次数过多则弹事件并设置三日 debuff。
 * 已处于过劳 debuff 时不再重复弹窗；「顿悟」期间不触发用脑过度。
 */
export function tryStudyOverloadEvent(state) {
  if (inFirstRunIntro(state)) return null;
  if (state.studyRecoveryBuffUntilDay != null && state.day <= state.studyRecoveryBuffUntilDay) {
    return null;
  }
  if (studyCountLast5Days(state) < STUDY_OVERLOAD_THRESHOLD) return null;
  if (state.studyOverloadDebuffUntilDay != null && state.day <= state.studyOverloadDebuffUntilDay) {
    return null;
  }
  state.studyOverloadDebuffUntilDay = state.day + 2;
  state.studyCountWhileOverloadDebuff = 0;
  return {
    id: "evt_study_overload",
    title: "用脑过度",
    desc:
      "最近五天里你频繁学习，疲惫开始影响注意力。接下来三个自然日「学习」带来的隐藏简历、隐藏面试与综合素质增益会明显下降，记得穿插休息；若在低谷期仍坚持学习超过三次，有机会重新理清思路。",
    emoji: "🧠",
    skipRecordEvent: true,
    apply(s) {
      applyStressDelta(s, 4, "event");
      addLog(s, "用脑过度：接下来三天学习效率下降。");
    },
  };
}

/** 娱乐行动 20% 额外触发：仅从带 entertainment 标签的事件池抽取 */
export function pickRandomEntertainmentEvent(state) {
  if (inFirstRunIntro(state)) return null;
  const reserved = new Set((state.eventModalQueue ?? []).map(e => e.id));
  const pool = EVENT_DEFS.filter((e) => e.tags?.includes("entertainment") && eventEligible(e, state) && eventAvailableThisRun(e, state, reserved));
  return sampleEventPool(pool, state);
}

export const ENTERTAINMENT_PITY_AFTER = 7;
/** Called once after a completed entertainment action. Empty pools preserve pity. */
export function tryEntertainmentEvent(state, random = Math.random) {
  if (state.gameOver || inFirstRunIntro(state)) return null;
  const misses = state.entertainmentMisses ?? 0;
  if (misses < ENTERTAINMENT_PITY_AFTER && random() >= 0.2) {
    state.entertainmentMisses = misses + 1;
    return null;
  }
  const event = pickRandomEntertainmentEvent(state);
  state.entertainmentMisses = event ? 0 : Math.min(ENTERTAINMENT_PITY_AFTER, misses + 1);
  return event;
}

