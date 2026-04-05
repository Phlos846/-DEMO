import { rollAllTraits, mergeStaticTraitEffects, computePersonalityActionMods } from "./traits.js";
import { INITIAL_RATING } from "./match.js";
import { rollPlayerTalents } from "./talents.js";
import {
  patchTraitsForGenius,
  applyGeniusStatBonus,
  applyCornInitialStress,
  applyNormalHumanBonus,
  rollExeGlitchForDay,
  computeMaxActionPointsForDay,
  applyDailyMoneyTick,
} from "./talentRuntime.js";

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
  const rolled = opts.rolledTraits ?? rollAllTraits();
  const playerTalents = opts.playerTalents ?? rollPlayerTalents();

  if (playerTalents.some((t) => t.id === "genius")) {
    patchTraitsForGenius(rolled);
  }

  const rawFx = mergeStaticTraitEffects(rolled);
  const salaryTierBonus = clamp(Math.round(rawFx.salaryTierBonus ?? 0), -6, 10);
  const { salaryTierBonus: _st, ...statFx } = rawFx;

  const personalityActionMods = computePersonalityActionMods(rolled.personalities.map((p) => p.id));

  let money = 4800;
  if (playerTalents.some((t) => t.id === "rent")) {
    money -= 200;
  }

  const stressMax = playerTalents.some((t) => t.id === "stress_to_power") ? 120 : 100;

  const state = {
    day: 1,
    maxDays: 30,
    actionPoints: 3,
    maxActionPointsPerDay: 3,
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
    vitalFailReason: null,
    stressMax,
    energyMax: playerTalents.some((t) => t.id === "cattle") ? 118 : 100,
    resumeQualityMax: RESUME_QUALITY_MAX,
    resumeQuality: clamp(45 + (statFx.resumeQuality ?? 0), 0, RESUME_QUALITY_MAX),
    hiddenResume: clamp(50 + (statFx.hiddenResume ?? 0), 0, 100),
    hiddenInterview: clamp(45 + (statFx.hiddenInterview ?? 0), 0, 100),
    salaryTierBonus,
    traits: rolled,
    personalityActionMods,
    playerTalents,
    jobSearchRating: INITIAL_RATING,
    money,
    debt: 0,
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

  return state;
}

export function addLog(state, msg) {
  state.log.unshift({ day: state.day, msg });
  if (state.log.length > 80) state.log.pop();
}
