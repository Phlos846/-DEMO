/**
 * 随机事件：均匀抽取；5 日滑动窗口内事件总数 ∈ [1,3]，
 * 且窗口总次数服从：1 次 60% / 2 次 30% / 3 次 10%（在可行约束下重归一）。
 */

import {
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
} from "./talentRuntime.js";
import { hasTalent } from "./talents.js";
import { addLog } from "./state.js";
import { processInterviewsAtDayStart, processPendingResumeFeedback } from "./interviews.js";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function rnd() {
  return Math.random();
}

function bumpEnding(state, key, n) {
  state.endingTags[key] = (state.endingTags[key] ?? 0) + n;
}

function applyApDelta(state, delta) {
  state.actionPoints = clamp(state.actionPoints + delta, 0, state.maxActionPointsPerDay ?? 8);
}

/** 过去 4 个自然日（不含今天）已发生事件次数 */
export function countEventsInPrior4Days(state, day) {
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const d = day - i;
    if (d >= 1) n += state.eventsByDay[d] ?? 0;
  }
  return n;
}

/**
 * 今日应发生事件数量 k：满足 1 <= n+k <= 3，并按 60/30/10 抽窗口总次数 T
 */
export function sampleEventCountForToday(state) {
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

const INDUSTRY_POOL = ["internet", "finance", "game", "anime", "edu", "manufacture", "consult", "other"];

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
    state.day += 1;
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
    const nep = tryNepotismOffer(state);
    if (nep) addLog(state, nep);
    processPendingResumeFeedback(state);
    processInterviewsAtDayStart(state);
    addLog(state, `（时间跳过）进入第 ${state.day} 天。`);
  }
}

const EVENT_DEFS = [
  {
    id: "evt_network",
    title: "学长内推",
    desc: "一位学长愿意帮你内推一家中小厂，压力略降，简历完整度微升。",
    apply: (s) => {
      applyStressDelta(s, -6, "event");
      s.resumeQuality = clamp(s.resumeQuality + 4, 0, 100);
      bumpEnding(s, "network", 1);
    },
  },
  {
    id: "evt_ill",
    title: "熬夜感冒",
    desc: "连续熬夜后你感冒了，精力大幅下降。",
    apply: (s) => {
      applyEnergyDelta(s, -22);
      applyStressDelta(s, 8, "event");
      bumpEnding(s, "health", 1);
    },
  },
  {
    id: "evt_mock",
    title: "模拟面试",
    desc: "学校组织模拟面试，面试发挥隐藏分提升。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 5, 0, 100);
      applyEnergyDelta(s, -8);
      bumpEnding(s, "prep", 1);
    },
  },
  {
    id: "evt_rumor",
    title: "行业传闻",
    desc: "群里疯传某赛道裁员，你的压力上升。",
    apply: (s) => {
      applyStressDelta(s, 12, "event");
      bumpEnding(s, "risk", 1);
    },
  },
  {
    id: "evt_side",
    title: "副业机会",
    desc: "有人找你接外包，精力下降但简历完整度上升。",
    apply: (s) => {
      applyEnergyDelta(s, -10);
      s.resumeQuality = clamp(s.resumeQuality + 6, 0, 100);
      bumpEnding(s, "money", 1);
    },
  },
  {
    id: "evt_exam",
    title: "突发考试",
    desc: "你突然想起明天有一门闭卷考试，今晚不突击就要挂科！行动点 -2，压力飙升。",
    apply: (s) => {
      applyApDelta(s, -2);
      applyStressDelta(s, 10, "event");
    },
  },
  {
    id: "evt_homework",
    title: "突发作业",
    desc: "你突然想起有个大作业 ddl 就在后天，而你现在还停留在新建文件夹。行动点 -2，压力飙升。",
    apply: (s) => {
      applyApDelta(s, -2);
      applyStressDelta(s, 10, "event");
    },
  },
  {
    id: "evt_gacha",
    title: "十连双金",
    desc: "你手滑点了十连，屏幕金光乱闪——双金！欧气爆棚，秋招焦虑瞬间被冲淡。压力 -15。",
    apply: (s) => {
      applyStressDelta(s, -15, "event");
      bumpEnding(s, "prep", 1);
    },
  },
  {
    id: "evt_breakup",
    title: "分手了",
    desc: "你和对象分手了。聊天记录停在已读不回，你盯着天花板到凌晨。精力 -35。",
    apply: (s) => {
      applyEnergyDelta(s, -35);
      applyStressDelta(s, 6, "event");
    },
  },
  {
    id: "evt_pay_bad_luck",
    title: "破钱消灾",
    desc: "外卖撒了、耳机丢了、屏幕裂了——倒霉事三连，你只能花钱平事。金钱 -55。",
    apply: (s) => {
      applyMoneyDelta(s, -55);
    },
  },
  {
    id: "evt_melon",
    title: "有瓜吃",
    desc: "隔壁寝室有人表白翻车又复合，群里截图满天飞。你吃瓜吃到忘记焦虑。压力 -20。",
    apply: (s) => {
      applyStressDelta(s, -20, "event");
    },
  },
  {
    id: "evt_press_none",
    title: "新闻发布会",
    desc: "热搜上说某大厂『战略性优化』，评论区人均 CEO。你看完只觉得：这瓜不熟，与你无关。无事发生。",
    apply: () => {},
  },
  {
    id: "evt_press_industry",
    title: "新闻发布会（行业红利）",
    desc: "政策吹风指向某一赛道，财经博主连夜出『深度解读』。你顺着岗位 JD 一搜：好像真有风口。7 日内对应行业岗位薪资展示 +20%。",
    apply: (s) => {
      const ind = INDUSTRY_POOL[Math.floor(rnd() * INDUSTRY_POOL.length)];
      setIndustryBuff(s, ind, 7, 1.2);
      const label = { game: "游戏", anime: "动画/二次元", internet: "互联网", finance: "金融", edu: "教育", manufacture: "制造", consult: "咨询", other: "综合" }[ind] ?? ind;
      addLog(s, `【行业风向】${label} 赛道薪资展示 +20%（至第 ${s.industrySalaryBuff.untilDay} 天）。`);
    },
  },
  {
    id: "evt_press_meta",
    title: "新闻发布会（赛博围观）",
    desc: "监管约谈、平台整改、股价跳水三连上热搜。群聊里人人像战略顾问，你默默把『了解』刷了一屏，心态意外地稳。压力 -5。",
    apply: (s) => {
      applyStressDelta(s, -5, "event");
    },
  },
  {
    id: "evt_poison_skip",
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
    title: "诈骗",
    desc: "你在二手群看到『内部测评码』，转账后被拉黑。压力 +10，精力 -30。",
    apply: (s) => {
      applyStressDelta(s, 10, "event");
      applyEnergyDelta(s, -30);
    },
  },
  {
    id: "evt_pe_test",
    title: "体测",
    desc: "一千米、引体向上、肺活量一条龙。你跑完只想躺平。精力 -48（已按上限裁剪，避免单事件清空条）。",
    apply: (s) => {
      applyEnergyDelta(s, -48);
      applyStressDelta(s, 4, "event");
    },
  },
  {
    id: "evt_client_change",
    title: "甲方说你再改改",
    desc: "实习群里甲方发来『微调一下』，附件是整包重做。你深吸一口气，简历里又多了两行黑话。压力 +6，简历完整度 +2。",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
      s.resumeQuality = clamp(s.resumeQuality + 2, 0, 100);
    },
  },
  {
    id: "evt_skeleton",
    title: "群友发骷髅",
    desc: "群里有人连刷骷髅表情包，配文『学信网可查的绝望』。你被赛博丧气感染，精力 -8。",
    apply: (s) => {
      applyEnergyDelta(s, -8);
    },
  },
  {
    id: "evt_lucky_money",
    title: "赛博财神",
    desc: "你抢到了群里的拼手气红包，还中了支付立减。金钱 +35。",
    apply: (s) => {
      applyMoneyDelta(s, 35);
    },
  },
  {
    id: "evt_lottery_jackpot",
    title: "刮刮乐欧皇",
    desc: "便利店排队顺手刮了一张，店员表情凝固——你中了头奖档。先财务自由几天，秋招？再说吧。（结局向事件）",
    apply: (s) => {
      s.lotteryJackpot = true;
      applyMoneyDelta(s, 88888);
      applyStressDelta(s, -25, "event");
    },
  },
  {
    id: "evt_bnpl",
    title: "免息分期≈不要钱",
    desc: "12 期免息让你产生幻觉：先把想买的都下单。账单总会来的。无形负债 +480。",
    apply: (s) => {
      s.debt = (s.debt ?? 0) + 480;
      applyStressDelta(s, 5, "event");
    },
  },
  {
    id: "evt_startup_spark",
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
    title: "开盒警告",
    desc: "论坛有人晒『盒武器教程』，你下意识检查了自己隐私设置。焦虑上头。压力 +9。",
    apply: (s) => {
      applyStressDelta(s, 9, "event");
    },
  },
  {
    id: "evt_launch_again",
    title: "原神启动…失败",
    desc: "你本想『十分钟放松』，结果更新包 60G。等待条走完，罪恶感先拉满。压力 +4，精力 -6。",
    apply: (s) => {
      applyStressDelta(s, 4, "event");
      applyEnergyDelta(s, -6);
    },
  },
  {
    id: "evt_hr_read",
    title: "HR 已读不回",
    desc: "投递状态从『已送达』变成『已读』，然后就没有然后了。压力 +7。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
    },
  },
  {
    id: "evt_interview_meme",
    title: "面试题：二叉树翻转心情",
    desc: "面试官微笑着问你『如何缓解压力』，你脑子里只有 LeetCode。胡诌一通居然过了隐藏考察？面试隐藏分 +3，压力 +3。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 3, 0, 100);
      applyStressDelta(s, 3, "event");
    },
  },
];

function cloneEvent(def) {
  return { ...def, apply: def.apply };
}

function pickUniformEvent(state) {
  if (hasTalent(state, "clear_eyed") && rnd() < 0.12) {
    const ill = EVENT_DEFS.find((e) => e.id === "evt_ill");
    if (ill) return cloneEvent(ill);
  }
  const def = EVENT_DEFS[Math.floor(rnd() * EVENT_DEFS.length)];
  return cloneEvent(def);
}

/** 为本自然日生成事件队列（每早调用一次） */
export function planEventsForCurrentDay(state) {
  const d = state.day;
  if (state.eventPlanDay === d && Array.isArray(state.eventModalQueue)) {
    return state.eventModalQueue;
  }
  state.eventPlanDay = d;
  if (d === 1) {
    state.eventModalQueue = [];
    return state.eventModalQueue;
  }
  const k = sampleEventCountForToday(state);
  const q = [];
  for (let i = 0; i < k; i++) {
    q.push(pickUniformEvent(state));
  }
  state.eventModalQueue = q;
  return q;
}

export function recordEventResolved(state, day) {
  const d = day ?? state.day;
  state.eventsByDay[d] = (state.eventsByDay[d] ?? 0) + 1;
}

export function resolveEvent(state, event) {
  const logDay = state.day;
  event.apply(state);
  recordEventResolved(state, logDay);
}

