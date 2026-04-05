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

  const state = {
    day: 1,
    maxDays: 30,
    actionPoints: 3,
    maxActionPointsPerDay: 3,
    stress: clamp(30 + (statFx.stress ?? 0), 0, 100),
    energy: clamp(80 + (statFx.energy ?? 0), 0, 100),
    godMode: !!opts.godMode,
    studyCount: 0,
    vitalFailReason: null,
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
