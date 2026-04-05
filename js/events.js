/**
 * 随机事件：加权抽取（含梗文案与 emoji）；
 * 5 日滑动窗口内事件总数 ∈ [1,3]，窗口总次数 60%/30%/10%。
 * 部分事件需满足压力≥70、精力≤40 等才进入当日随机池。
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

/** 随机事件表：玩梗文案 + emoji；部分需压力/精力/金钱等门槛才进入随机池 */
const EVENT_DEFS = [
  {
    id: "evt_network",
    emoji: "🤝",
    weight: 1,
    title: "学长内推",
    desc: "一位学长愿意帮你内推一家中小厂，压力略降，简历完整度微升。",
    apply: (s) => {
      applyStressDelta(s, -6, "event");
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 4);
      bumpEnding(s, "network", 1);
    },
  },
  {
    id: "evt_ill",
    emoji: "🤒",
    weight: 1,
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
    emoji: "🎤",
    weight: 1,
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
    emoji: "📉",
    weight: 1,
    title: "行业传闻",
    desc: "群里疯传某赛道裁员，你的压力上升。",
    apply: (s) => {
      applyStressDelta(s, 12, "event");
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
    desc: "你突然想起明天有一门闭卷考试，今晚不突击就要挂科！行动点 -2，压力飙升。",
    apply: (s) => {
      applyApDelta(s, -2);
      applyStressDelta(s, 10, "event");
    },
  },
  {
    id: "evt_homework",
    emoji: "📁",
    weight: 1,
    title: "突发作业",
    desc: "你突然想起有个大作业 ddl 就在后天，而你现在还停留在新建文件夹。行动点 -2，压力飙升。",
    apply: (s) => {
      applyApDelta(s, -2);
      applyStressDelta(s, 10, "event");
    },
  },
  {
    id: "evt_gacha",
    emoji: "✨",
    weight: 1,
    title: "十连双金",
    desc: "你手滑点了十连，屏幕金光乱闪——双金！欧气爆棚，秋招焦虑瞬间被冲淡。压力 -15。",
    apply: (s) => {
      applyStressDelta(s, -15, "event");
      bumpEnding(s, "prep", 1);
    },
  },
  {
    id: "evt_breakup",
    emoji: "💔",
    weight: 1,
    title: "分手了",
    desc: "你和对象分手了。聊天记录停在已读不回，你盯着天花板到凌晨。精力 -35。",
    apply: (s) => {
      applyEnergyDelta(s, -35);
      applyStressDelta(s, 6, "event");
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
      const label = { game: "游戏", anime: "动画/二次元", internet: "互联网", finance: "金融", edu: "教育", manufacture: "制造", consult: "咨询", other: "综合" }[ind] ?? ind;
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
    desc: "你在二手群看到『内部测评码』，转账后被拉黑。压力 +10，精力 -30。",
    apply: (s) => {
      applyStressDelta(s, 10, "event");
      applyEnergyDelta(s, -30);
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
    weight: 0.07,
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
    weight: 1,
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
    desc: "凌晨三点你觉得自己『泰裤辣』，天亮一看全是错别字。简历完整度 +1，精力 -12，压力 +4。",
    apply: (s) => {
      s.resumeQuality = clampResumeToCap(s, s.resumeQuality + 1);
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
    desc: "热搜：『脆皮大学生』。你对号入座：蹲久了站起来眼前一黑。精力 -6，压力 +2，学校医务室开假条一张（无属性加成，纯梗）。",
    apply: (s) => {
      applyEnergyDelta(s, -6);
      applyStressDelta(s, 2, "event");
    },
  },
  {
    id: "evt_debt_call",
    emoji: "☎️",
    weight: 1.35,
    requires: { debtMin: 200 },
    title: "催收电话但打错号",
    desc: "电话：『您好分期』。你：『我没钱』。对方：『抱歉打错了』。虚惊一场又更焦虑。压力 +7。",
    apply: (s) => {
      applyStressDelta(s, 7, "event");
    },
  },
  {
    id: "evt_money_broke",
    emoji: "🫙",
    weight: 1.35,
    requires: { moneyMax: 400 },
    title: "钱包比脸还干净",
    desc: "拼单群喊『谁有红包』，你默默潜水。贫穷让你清醒：压力 +5，学习次数心理 +0（梗而已）。",
    apply: (s) => {
      applyStressDelta(s, 5, "event");
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
  const pool = EVENT_DEFS.filter((e) => eventEligible(e, state));
  if (!pool.length) {
    const fallback = EVENT_DEFS.find((e) => e.id === "evt_press_none") ?? EVENT_DEFS[0];
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
  recordEventResolved(state, logDay);
}

