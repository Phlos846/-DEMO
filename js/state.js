import { careerOwned, careerLevel, getCareer } from './career.js?v=1.1.19';
import { rollAllTraits, mergeStaticTraitEffects, computePersonalityActionMods } from "./traits.js?v=1.1.19";
import { INITIAL_RATING } from "./match.js?v=1.1.19";
import { rollPlayerTalents } from "./talents.js?v=1.1.19";
import {
  patchTraitsForGenius,
  applyGeniusStatBonus,
  applyCornInitialStress,
  applyNormalHumanBonus,
  rollExeGlitchForDay,
  computeMaxActionPointsForDay,
  applyDailyMoneyTick,
} from "./talentRuntime.js?v=1.1.19";

export const RESUME_QUALITY_MAX = 120;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function resumeQualityCap(state) {
  return state?.resumeQualityMax ?? RESUME_QUALITY_MAX;
}

export function clampResumeToCap(state, v) {
  return clamp(v, 0, resumeQualityCap(state));
}

/**
 * @param {object} [opts]
 * @param {object} [opts.rolledTraits] 二周目等：沿用开局界面预览的词条
 * @param {object[]} [opts.playerTalents]
 * @param {boolean} [opts.godMode] 作弊码 114514
 */
export function createInitialState(opts = {}) {
  const rolled = opts.rolledTraits ? structuredClone(opts.rolledTraits) : rollAllTraits();
  rolled.extraDegrees = (rolled.extraDegrees ?? []).filter(x =>
    (x.id !== 'extra_master' || careerOwned('master')) && (x.id !== 'extra_phd' || careerOwned('phd')));
  const playerTalents = opts.playerTalents ?? rollPlayerTalents();

  if (playerTalents.some((t) => t.id === "genius")) {
    patchTraitsForGenius(rolled);
  }

  const rawFx = mergeStaticTraitEffects(rolled);
  const salaryTierBonus = clamp(Math.round(rawFx.salaryTierBonus ?? 0), -6, 10);
  const { salaryTierBonus: _st, ...statFx } = rawFx;

  const personalityActionMods = computePersonalityActionMods(rolled.personalities.map((p) => p.id));

  let money = 4800 + careerLevel('savings') * 200;
  if (playerTalents.some((t) => t.id === "rent")) {
    money -= 200;
  }

  const stressMax = playerTalents.some((t) => t.id === "stress_to_power") ? 120 : 100;
  // Draw once per run: each integer from -5 through +5 is equally likely.
  const initialQualityVariation = Math.floor(Math.random() * 11) - 5;

  const state = {
    careerRunId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    carriedRelic: getCareer().selectedRelic,
    relicUsed: false,
    relicInterviewReady: false,
    day: 1,
    maxDays: 30,
    actionPoints: 4,
    maxActionPointsPerDay: 4,
    stress: clamp(30 + (statFx.stress ?? 0), 0, stressMax),
    energy: clamp(80 + (statFx.energy ?? 0), 0, 100),
    godMode: !!opts.godMode,
    studyCount: 0,
    /** 自然日 -> 当日学习行动次数，用于连续五日学习过劳判定 */
    studyByDay: {},
    /** 学习过劳 debuff 持续至该自然日（含）；与 tryStudyOverloadEvent 同步 */
    studyOverloadDebuffUntilDay: null,
    /** 当前一轮「用脑过度」期间，在 debuff 下完成的「学习」次数（用于强制突破判定） */
    studyCountWhileOverloadDebuff: 0,
    /** 「顿悟」学习增益 buff 持续至该自然日（含） */
    studyRecoveryBuffUntilDay: null,
    /** 考公/考研结局用隐藏累加：每次学习按用脑过度、顿悟倍率增加，不对玩家展示 */
    studyPivotHidden: 0,
    vitalFailReason: null,
    highStressDays: 0,
    burnoutCheckedDay: null,
    burnoutEarlyEnd: false,
    stressMax,
    energyMax: playerTalents.some((t) => t.id === "cattle") ? 118 : 100,
    resumeQualityMax: RESUME_QUALITY_MAX,
    initialQualityVariation,
    resumeQuality: clamp(45 + (statFx.resumeQuality ?? 0) + initialQualityVariation, 0, RESUME_QUALITY_MAX),
    hiddenResume: clamp(50 + (statFx.hiddenResume ?? 0), 0, 100),
    hiddenInterview: clamp(45 + (statFx.hiddenInterview ?? 0), 0, 100),
    salaryTierBonus,
    traits: rolled,
    personalityActionMods,
    playerTalents,
    jobSearchRating: INITIAL_RATING,
    money,
    debt: 0,
    coachedStudies: 0,
    lastWorkDay: null,
    lastPaidRecoveryDay: null,
    strategies: [],
    skippedStrategies: 0,
    strategyRegularUsed: 0,
    strategyGrowth: {},
    strategyBonusGrowth: 0,
    strategyBonusCore: 0,
    strategyArchiveCount: 0,
    strategyDraft: null,
    strategyPrep: 0,
    strategyReview: 0,
    strategyContacts: 0,
    strategyRhythm: 0,
    strategyUses: {},
    pathStartup: 0,
    lotteryJackpot: false,
    baseLivingCost: 100,
    exeGlitchToday: 0,
    pressureKingTriggered: false,
    stressLockUntilDay: null,
    /** 压力即动力：仅一轮「满压当日不立刻死、次日仍满则死」；顶满后若降压则记为已消耗，之后满压立刻死 */
    stress120GraceDay: null,
    stress120GraceConsumed: false,
    nextCompanyBatch: 0,
    resumePending: [],
    applySession: null,
    appliedIds: [],
    skippedIds: [],
    interviewQueue: [],
    offers: [],
    endingTags: {},
    eventsByDay: {},
    entertainmentEventsByDay: {},
    entertainmentMisses: 0,
    conditionalCheckDay: null,
    conditionalEventsByDay: {},
    eventHistory: {},
    eventFollowups: [],
    eventNoticeStreak: 2,
    eventPlanDay: null,
    eventModalQueue: [],
    industrySalaryBuff: null,
    log: [],
    gameOver: false,
    /** 结算时玩家点选的主 Offer；未选时结局按薪资自动最优 */
    playerChosenOffer: null,
    /** 本自然日是否已使用过「透支再行动」（每日最多一次） */
    overdraftUsedToday: false,
    /** 为 true 时，下一次跨日不触发跨日精力恢复，并额外 -15 精力 */
    overdraftPendingPenalty: false,
    /** 玩家主动「提前结算」结束本局（需至少一份 Offer） */
    voluntaryEarlyEnd: false,
    /** 随机事件中「立刻结算」类结局：{ id, title, body }，由 computeEnding 优先采用 */
    eventImmediateEnding: null,
    /** 当日面试结果弹窗队列：{ emoji, title, body }[] */
    interviewModalQueue: [],
    /** 娱乐额外事件等：下一次选择行动时不消耗行动点 */
    funNextActionFree: false,
    /** 随机事件施加的临时 buff/debuff（与性格/天赋无关） */
    transientEffects: [],
  };

  applyGeniusStatBonus(state);
  applyNormalHumanBonus(state);
  applyCornInitialStress(state);

  rollExeGlitchForDay(state);
  state.maxActionPointsPerDay = computeMaxActionPointsForDay(state);
  state.actionPoints = state.maxActionPointsPerDay;

  applyDailyMoneyTick(state);

  addLog(state, `开局综合素质波动：${initialQualityVariation >= 0 ? '+' : ''}${initialQualityVariation}，初始综合素质 ${state.resumeQuality}。`);
  if (careerLevel('savings')) addLog(state, `局外求职储备：开局现金 +${careerLevel('savings') * 200}。`);

  return state;
}

export function addLog(state, msg) {
  state.log.unshift({ day: state.day, msg });
  if (state.log.length > 80) state.log.pop();
}
