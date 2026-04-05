/**
 * 随机事件：加权抽取（含梗文案与 emoji）；
 * 5 日滑动窗口内事件总数 ∈ [1,3]，窗口总次数 60%/30%/10%。
 * 部分事件需满足压力≥70、精力≤40 等才进入当日随机池。
 * immediateSettle：点「确定」后立刻 gameOver 并进入结局（清空当日剩余事件队列）；彩票与若干事件使用该逻辑。
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
import { addLog, clampResumeToCap } from "./state.js";
import { STUDY_RECOVERY_BUFF_MULT } from "./actions.js";
import {
  addTransientEffect,
  transientUntilDay,
  purgeAllDebuffsForPurify,
  pruneExpiredTransientEffects,
} from "./transientEffects.js";
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

/** 事件是否满足数值门槛（压力≥70 梗、脆皮低精力、负债等） */
function eventEligible(def, state) {
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
    state.day += 1;
    pruneExpiredTransientEffects(state);
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
    const isFinalDay = state.day === state.maxDays;
    processPendingResumeFeedback(state, { forceFinalDay: isFinalDay });
    processInterviewsAtDayStart(state, { noApCost: isFinalDay });
    addLog(state, `（时间跳过）进入第 ${state.day} 天。`);
  }
}

/** 随机事件表：玩梗文案 + emoji；部分需压力/精力/金钱等门槛才进入随机池 */
const EVENT_DEFS = [
  {
    id: "evt_network",
    emoji: "🤝",
    weight: 1,
    title: "学长内推",
    desc: "一位学长愿意帮你内推一家中小厂，压力略降，简历完整度微升；学长余温让你几天内更不容易被小事点炸（压力获得量↓，持续 3 天）。",
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
    emoji: "💻",
    weight: 1,
    title: "副业机会",
    desc: "有人找你接外包，精力下降但简历完整度上升。",
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
    desc: "你突然想起明天有一门闭卷考试，今晚不突击就要挂科！行动点 -2，压力飙升；简历排版与项目描述全被复习资料挤到明天再说——简历完整度 -6。",
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
    desc: "你突然想起有个大作业 ddl 就在后天，而你现在还停留在新建文件夹。行动点 -2，压力飙升；秋招文档在桌面最下层吃灰——简历完整度 -7。",
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
    desc: "你手滑点了十连，屏幕金光乱闪——双金！欧气当场降压；欧气余韵让你几天内更容易被小事治愈（降压效果↑，持续 3 天）。",
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
    desc: "你和对象分手了。聊天记录停在已读不回，你盯着天花板到凌晨。精力 -35；几天没碰简历，版本还停留在『我们』时写的自我评价——简历完整度 -8。",
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
    title: "破钱消灾",
    desc: "外卖撒了、耳机丢了、屏幕裂了——倒霉事三连，你只能花钱平事。金钱 -55。",
    apply: (s) => {
      applyMoneyDelta(s, -55);
    },
  },
  {
    id: "evt_melon",
    emoji: "🍉",
    weight: 1,
    title: "有瓜吃",
    desc: "隔壁寝室有人表白翻车又复合，群里截图满天飞。你吃瓜吃到忘记焦虑。压力 -20。",
    apply: (s) => {
      applyStressDelta(s, -20, "event");
    },
  },
  {
    id: "evt_press_none",
    emoji: "📰",
    weight: 1.1,
    title: "新闻发布会",
    desc: "热搜上说某大厂『战略性优化』，评论区人均 CEO。你看完只觉得：这瓜不熟，与你无关。无事发生。",
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
    title: "新闻发布会（赛博围观）",
    desc: "监管约谈、平台整改、股价跳水三连上热搜。群聊里人人像战略顾问，你默默把『了解』刷了一屏，心态意外地稳。压力 -5。",
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
    desc: "你在二手群看到『内部测评码』，转账后被拉黑。压力 +10，精力 -30；被骗后你怀疑人生，把简历里『诚信』那条删了又加、加了又删——简历完整度 -6。",
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
    desc: "一千米、引体向上、肺活量一条龙。你跑完只想躺平。精力 -48（已按上限裁剪，避免单事件清空条）。",
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
    desc: "实习群里甲方发来『微调一下』，附件是整包重做。你深吸一口气，简历里又多了两行黑话。压力 +6，简历完整度 +2。",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 2);
    },
  },
  {
    id: "evt_skeleton",
    emoji: "💀",
    weight: 1,
    title: "群友发骷髅",
    desc: "群里有人连刷骷髅表情包，配文『学信网可查的绝望』。你被赛博丧气感染，精力 -8。",
    apply: (s) => {
      applyEnergyDelta(s, -8);
    },
  },
  {
    id: "evt_lucky_money",
    emoji: "🧧",
    weight: 1,
    title: "赛博财神",
    desc: "你抢到了群里的拼手气红包，还中了支付立减。金钱 +35。",
    apply: (s) => {
      applyMoneyDelta(s, 35);
    },
  },
  {
    id: "evt_lottery_jackpot",
    emoji: "🎰",
    weight: 0.035,
    immediateSettle: true,
    title: "刮刮乐欧皇",
    desc: "便利店排队顺手刮了一张，店员表情凝固——你中了头奖档。先财务自由几天，秋招？再说吧。（触发后立即进入结局）",
    apply: (s) => {
      s.lotteryJackpot = true;
      applyMoneyDelta(s, 88888);
      applyStressDelta(s, -25, "event");
      addLog(s, `第 ${s.day} 天：刮刮乐头奖到账，人生节奏突变……本局立即结算。`);
    },
  },
  {
    id: "evt_immigration_spam",
    emoji: "🌍",
    weight: 0.04,
    immediateSettle: true,
    title: "移民中介连环 call",
    desc: "你在『留学移民测评』页手滑留了电话，各大洲中介轮番轰炸。心态爆炸的你把招聘 APP 全静音——先研究语言考试，秋招这条线暂且存档。（触发后立即进入结局）",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
      s.eventImmediateEnding = {
        id: "event_immigration_spam",
        title: "咨询留痕 · 世界线分叉",
        body: "电话被各大洲中介打爆之后，你意识到『免费咨询』四个字有多贵。你把秋招群静音，打开另一套时间线：先考试，先材料，先把自己从『应届』里捞出来再说。",
      };
      addLog(s, `第 ${s.day} 天：移民咨询连环 call——本局立即结算。`);
    },
  },
  {
    id: "evt_credit_email",
    emoji: "📑",
    weight: 0.041,
    immediateSettle: true,
    title: "学分预警邮件",
    desc: "教务处系统：『当前培养方案未达标，存在延毕风险』。你盯着『延毕』两个字，面试题突然不香了。（触发后立即进入结局）",
    apply: (s) => {
      applyStressDelta(s, 14, "event");
      s.eventImmediateEnding = {
        id: "event_credit_crisis",
        title: "培养方案 · 红线警告",
        body: "邮件里的『未达标』三个字比任何拒信都冷。接下来几周要面对导师、重修和教务系统——秋招只能先挂起，先把毕业证这条主线打通。",
      };
      addLog(s, `第 ${s.day} 天：收到学分预警——本局立即结算。`);
    },
  },
  {
    id: "evt_headhunter_rush",
    emoji: "☎️",
    weight: 0.037,
    immediateSettle: true,
    title: "猎头急电口头 OC",
    desc: "陌生号码报出你简历上的项目细节：『我们总包更高，现在口头定？』你脑子一热先答应了。（触发后立即进入结局）",
    apply: (s) => {
      applyStressDelta(s, -4, "event");
      s.eventImmediateEnding = {
        id: "event_headhunter_rush",
        title: "口头 OC · 先杀青为敬",
        body: "电话那头语速飞快：级别、总包、入职窗口。你挂断后才想起来——口头承诺算不算上岸？至少这一局秋招，你想先画上句号。",
      };
      addLog(s, `第 ${s.day} 天：猎头急电口头意向——本局立即结算。`);
    },
  },
  {
    id: "evt_bnpl",
    emoji: "💳",
    weight: 1,
    title: "免息分期≈不要钱",
    desc: "12 期免息让你产生幻觉：先把想买的都下单。账单总会来的。无形负债 +480。",
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
    title: "开盒警告",
    desc: "论坛有人晒『盒武器教程』，你下意识检查了自己隐私设置。焦虑上头。压力 +9。",
    apply: (s) => {
      applyStressDelta(s, 9, "event");
    },
  },
  {
    id: "evt_launch_again",
    emoji: "🎮",
    weight: 1.45,
    title: "原神启动…失败",
    desc: "你本想『十分钟放松』，结果更新包 60G。等待条走完，罪恶感先拉满。压力 +4，精力 -6。",
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
    title: "面试题：二叉树翻转心情",
    desc: "面试官微笑着问你『如何缓解压力』，你脑子里只有 LeetCode。胡诌一通居然过了隐藏考察？面试隐藏分 +3，压力 +3。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview + 3, 0, 100);
      applyStressDelta(s, 3, "event");
    },
  },
  {
    id: "evt_meme_shushu",
    emoji: "🐭",
    weight: 1,
    title: "鼠鼠我呀，也想拿 Offer",
    desc: "论坛热帖：『鼠鼠秋招只配当分母吗』。你手滑点了个赞，赛博共鸣让压力短暂 -6，但隐藏简历分 +1（鼠鼠也要卷）。",
    apply: (s) => {
      applyStressDelta(s, -6, "event");
      s.hiddenResume = clamp(s.hiddenResume + 1, 0, 100);
    },
  },
  {
    id: "evt_meme_monkey",
    emoji: "🐒",
    weight: 1,
    title: "吗喽的命也是命",
    desc: "短视频里吗喽摘香蕉配字幕『周一例会』。你笑完突然想哭：精力 -5，压力 +3。",
    apply: (s) => {
      applyEnergyDelta(s, -5);
      applyStressDelta(s, 3, "event");
    },
  },
  {
    id: "evt_meme_cpu",
    emoji: "🧠",
    weight: 1,
    title: "被 HR「CPU」了",
    desc: "群友科普：『这不是 PUA，是职场预期管理』。你似懂非懂，只觉得脑子嗡嗡的。压力 +8。",
    apply: (s) => {
      applyStressDelta(s, 8, "event");
    },
  },
  {
    id: "evt_meme_pie",
    emoji: "🥧",
    weight: 1,
    title: "画饼学导论",
    desc: "直播课标题：《从期权到福报——饼的烘焙与消化》。听完你简历里多写了一句『对齐颗粒度』。简历完整度 +2，压力 +4。",
    apply: (s) => {
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 2);
      applyStressDelta(s, 4, "event");
    },
  },
  {
    id: "evt_meme_996",
    emoji: "🏥",
    weight: 1,
    title: "996.ICU 联名款体检",
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
    title: "典中典之「弹性工作」",
    desc: "脉脉热评：『弹性＝弹走你的下班』。太典了，你复制进备忘录当段子素材。压力 -4（笑一下算了）。",
    apply: (s) => {
      applyStressDelta(s, -4, "event");
    },
  },
  {
    id: "evt_meme_ji",
    emoji: "📧",
    weight: 1,
    title: "寄！笔试链接已过期",
    desc: "邮件写『请在 24h 内完成』，你看到时已是第 25h。群友：『稳了，寄了』。压力 +11。",
    apply: (s) => {
      applyStressDelta(s, 11, "event");
    },
  },
  {
    id: "evt_meme_run",
    emoji: "🛫",
    weight: 1,
    title: "润学讲座进校园",
    desc: "海报写『出海与远程办公』，到场发现是留学中介。你白嫖了一瓶水，心态略平和。压力 -3，金钱 -20。",
    apply: (s) => {
      applyStressDelta(s, -3, "event");
      applyMoneyDelta(s, -20);
    },
  },
  {
    id: "evt_meme_yyds",
    emoji: "👑",
    weight: 1,
    title: "学长 YYDS 内推码",
    desc: "群里甩码：『懂的都懂』。你抢到了但不知道往哪填，先截图发朋友圈。简历完整度 +3，压力 -2。",
    apply: (s) => {
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 3);
      applyStressDelta(s, -2, "event");
    },
  },
  {
    id: "evt_meme_shuanq",
    emoji: "🙏",
    weight: 1,
    title: "栓 Q 面试官",
    desc: "二面结束你顺口『栓 Q 老师』，全场沉默三秒。面试隐藏分 -2（社死），压力 +6。",
    apply: (s) => {
      s.hiddenInterview = clamp(s.hiddenInterview - 2, 0, 100);
      applyStressDelta(s, 6, "event");
    },
  },
  {
    id: "evt_meme_lead",
    emoji: "📱",
    weight: 1,
    title: "遥遥领先（音量键）",
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
    title: "显眼包室友拿ssp了",
    desc: "朋友圈九宫格：『感谢过去努力的自己』。你点赞手速比脑子快。压力 +7。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
    },
  },
  {
    id: "evt_meme_ie",
    emoji: "🫥",
    weight: 1,
    title: "i 人地狱：无领导小组",
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
    title: "尊嘟假嘟 OC 面",
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
    title: "泰裤辣通宵改简历",
    desc: "凌晨三点你觉得自己『泰裤辣』，天亮一看全是错别字。简历完整度 -7（得重改），精力 -12，压力 +4。",
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
    desc: "小红书教程：边走边投更松弛。你走断腿只投出去两家。精力 -8，压力 -3。",
    apply: (s) => {
      applyEnergyDelta(s, -8);
      applyStressDelta(s, -3, "event");
    },
  },
  {
    id: "evt_meme_404",
    emoji: "🔍",
    weight: 1,
    title: "404 Not Found 人生",
    desc: "官网招聘页 404，群友说『岗位已下架，心也已下架』。你 F5 到手指抽筋。压力 +6。",
    apply: (s) => {
      applyStressDelta(s, 6, "event");
    },
  },
  {
    id: "evt_meme_dance",
    emoji: "💃",
    weight: 1,
    title: "科目三面试（误）",
    desc: "群误传『某厂面试要才艺』。你练了半小时摇花手最后发现是谣言。精力 -10，压力 -4（至少运动了）。",
    apply: (s) => {
      applyEnergyDelta(s, -10);
      applyStressDelta(s, -4, "event");
    },
  },
  {
    id: "evt_meme_barbie",
    emoji: "🍖",
    weight: 1,
    title: "芭比 Q 了，群面撞同门",
    desc: "群面一看全是校友，题目还是『如何优雅地卷』。压力 +8，面试隐藏分 +2（熟人 buff）。",
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
    title: "破防了家人们（压力版）",
    desc: "凌晨刷到『秋招结束了吗』热搜，评论区全是上岸截图。你当场破防。压力再 +6，精力 -8。",
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
    title: "绷不住了，脉脉红点名场面",
    desc: "脉脉推送：『你司本周热帖』。点开第一条就是加班吐槽。绷。压力 +5，隐藏简历 +1（你记笔记了）。",
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
    title: "汗流浃背了吧老弟",
    desc: "视频梗刷多了，你一看到『请自我介绍』就自动脑补配音。紧张到出汗。压力 +4，精力 -5。",
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
    title: "轻舟已过万重山？",
    desc: "鸡汤帖：『轻舟已过万重山』。你看了看拒信文件夹：山还在，舟漏水。压力 +3，但心态强行 -5 压（算自我和解）。",
    apply: (s) => {
      applyStressDelta(s, -2, "event");
    },
  },
  {
    id: "evt_energy_crispy",
    emoji: "🦴",
    weight: 1.5,
    requires: { energyMax: 40 },
    title: "脆皮大学生实锤",
    desc: "热搜：『脆皮大学生』。你对号入座：蹲久了站起来眼前一黑。当场精力与压力小波动；脆皮认证让你几天内一动就累（精力消耗↑，持续 3 天）。",
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
    title: "钱包比脸还干净",
    desc: "拼单群喊『谁有红包』，你默默潜水。贫穷让你清醒：当场压力上升；贫穷清醒让你两天内更容易焦虑（压力获得↑，持续 2 天）。",
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
    title: "抹茶拿铁续命",
    desc: "楼下新店第二杯半价，你吨吨吨灌下去：钱包 -35，但咖啡因让你几天内没那么容易累脱力（跨日精力恢复↑，持续 3 天）。",
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
    title: "白嫖心理咨询券",
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
    desc: "你发誓只看一眼邮箱，结果刷到两点。当场精力下滑；几天内睡前更容易焦虑上头（压力获得↑，持续 3 天）。",
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
    desc: "昨晚聚餐喝高，今早头痛欲裂。当场精力崩盘；几天内又晕又丧（精力消耗↑，降压效果↓，持续 3 天）。",
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
    desc: "直播间冲动下单三大瓶，当场现金 -88；但几天内回血更顺（主动精力回复↑，持续 3 天）。",
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
    desc: "群里有人晒三方，你当场酸到压力飙升；几天内更容易被比较心态绑架（压力获得↑，持续 3 天）。",
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
    desc: "凌晨出发半夜回城，打卡五个景点。跳过 1 个自然日；钱花了、腿废了，压力倒是真降了。",
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
    desc: "麦霸附体，第二天嗓子哑了、人废了。压力释放，身体抗议。",
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
    desc: "爆米花配三部片，逃避可耻但有用。",
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
    desc: "毛茸茸治愈赛博焦虑，顺便办了张次卡。",
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
    title: "漫展排队地狱",
    desc: "限定谷、签售、摄影区三选一排队。钱没了，腿断了，但同好碰杯很快乐。",
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
    title: "温泉酒店躺平",
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
    desc: "泥地、人浪、耳鸣三件套，但现场真的炸。",
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
    desc: "恐怖本+脆皮队友=心率拉满。出来觉得秋招面试也没那么可怕。",
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
    desc: "五连跪但快乐，第二天脸肿成匹配分。",
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
    desc: "车炸了，你在店里干等两小时，气到想给 HR 发拒信。",
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
    desc: "爽剧连刷，简历文档一眼没开。摆烂的快乐与罪恶感并存。",
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
    desc: "肩颈松了，脑子也暂时不卷了。",
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
    desc: "修图修到半夜，但朋友圈点赞回血。",
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
    desc: "贵到肉疼，嗨到失忆，秋招明天再想。",
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
    desc: "摘菜烧灶，短暂当回自然人。跳过 1 日。",
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
    title: "直播打赏上头",
    desc: "深夜看主播开箱，手滑送了礼物。当场现金与精力小损；但弹幕护体让你几天内没那么容易破防（压力获得↓，持续 3 天）。",
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
    desc: "外卖 +60，碳水炸弹当场回血又犯困；几天内更容易吃撑犯困（精力消耗↑，持续 2 天）。",
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
    title: "随舞广场社死",
    desc: "你被朋友拽去随机舞蹈，当场社死压力飙升；但跳完反而爽了，几天内回血更顺（主动精力回复↑，持续 3 天）。",
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
    desc: "推币机血亏，当场心态小崩；币圈阴影让你几天内更容易上头（压力获得↑，持续 3 天）。",
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
    title: "夜市逛到腿断",
    desc: "烤串奶茶一条龙，现金 -70，当场略降压；夜市余韵让你几天内跨日回血更稳（跨日精力恢复↑，持续 3 天）。",
    apply: (s) => {
      applyMoneyDelta(s, -70);
      applyStressDelta(s, -8, "event");
      applyEnergyDelta(s, -14);
      fxBuff(s, "逛吃回血：跨日精力恢复↑", 3, { passiveEnergyRecoverMult: 1.1 });
    },
  },
  {
    id: "evt_ent_fx_volleyball",
    tags: ["entertainment"],
    emoji: "🏐",
    weight: 0.92,
    title: "野球场被虐",
    desc: "被扣到怀疑人生，当场压力小升、精力大耗；但运动后几天内心态反而更钝感（压力获得↓，持续 3 天）。",
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
    desc: "搓澡师傅手劲惊人，你泡到灵魂出窍。稀有体验：洗去一身晦气——若身上有负面状态效果可卸下；当场降压并小回血。",
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
    desc: "你立 flag 只跑了一天，但阳光和风是真的：当场小耗精力、略降压；晨跑余韵让你两天内跨日回血更好（持续 2 天）。",
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
    desc: "街机厅刷分：判定全绿、手台敲到起茧，Offer 邮件暂时读不到条——音游治百病，压力额外大幅下降（略耗精力与游戏币）。",
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

function pickUniformEvent(state) {
  if (hasTalent(state, "clear_eyed") && rnd() < 0.12) {
    const ill = EVENT_DEFS.find((e) => e.id === "evt_ill");
    if (ill && eventEligible(ill, state)) return cloneEvent(ill);
  }
  const pool = EVENT_DEFS.filter(
    (e) => eventEligible(e, state) && !e.tags?.includes("entertainment"),
  );
  if (!pool.length) {
    const fallback =
      EVENT_DEFS.find((e) => e.id === "evt_press_none" && !e.tags?.includes("entertainment")) ??
      EVENT_DEFS.find((e) => !e.tags?.includes("entertainment")) ??
      EVENT_DEFS[0];
    return cloneEvent(fallback);
  }
  const sum = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = rnd() * sum;
  for (const e of pool) {
    r -= e.weight ?? 1;
    if (r <= 0) return cloneEvent(e);
  }
  return cloneEvent(pool[pool.length - 1]);
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
  if (!event.skipRecordEvent) recordEventResolved(state, logDay);
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
  if ((state.studyCountWhileOverloadDebuff ?? 0) <= 3) return null;
  if (state.studyOverloadDebuffUntilDay == null || state.day > state.studyOverloadDebuffUntilDay) {
    return null;
  }
  state.studyOverloadDebuffUntilDay = null;
  state.studyCountWhileOverloadDebuff = 0;
  state.studyRecoveryBuffUntilDay = state.day + 2;
  return {
    title: "咬牙顿悟",
    desc: `你在效率低谷里仍硬啃书本，某一刻突然想通了：过劳的迷雾散去，「用脑过度」状态解除；接下来三个自然日「学习」带来的隐藏简历、隐藏面试与简历完整度增益约为 ×${STUDY_RECOVERY_BUFF_MULT.toFixed(2)}。`,
    emoji: "💡",
    skipRecordEvent: true,
    apply(s) {
      applyStressDelta(s, -5, "event");
      addLog(s, `咬牙顿悟：解除用脑过度，接下来三天学习效率提升（约 ×${STUDY_RECOVERY_BUFF_MULT.toFixed(2)}）。`);
    },
  };
}

/**
 * 在「学习」行动结算后调用：若滚动五日内学习次数过多则弹事件并设置三日 debuff。
 * 已处于过劳 debuff 时不再重复弹窗。
 */
export function tryStudyOverloadEvent(state) {
  if (studyCountLast5Days(state) < STUDY_OVERLOAD_THRESHOLD) return null;
  if (state.studyOverloadDebuffUntilDay != null && state.day <= state.studyOverloadDebuffUntilDay) {
    return null;
  }
  state.studyOverloadDebuffUntilDay = state.day + 2;
  state.studyCountWhileOverloadDebuff = 0;
  return {
    title: "用脑过度",
    desc:
      "最近五天里你学习次数拉满，大脑已经抗议了。接下来三个自然日「学习」带来的隐藏简历、隐藏面试与简历完整度增益会明显下降，记得穿插休息；若在低谷期仍坚持学习超过三次，有机会顿悟翻身。",
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
  const pool = EVENT_DEFS.filter((e) => e.tags?.includes("entertainment") && eventEligible(e, state));
  if (!pool.length) return null;
  const sum = pool.reduce((s, e) => s + (e.weight ?? 1), 0);
  let r = rnd() * sum;
  for (const e of pool) {
    r -= e.weight ?? 1;
    if (r <= 0) return cloneEvent(e);
  }
  return cloneEvent(pool[pool.length - 1]);
}

