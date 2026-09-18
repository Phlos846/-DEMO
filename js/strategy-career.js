import { careerOwned } from './career.js?v=1.1.19';
const KEY = 'ar_strategy_career_v1';
export const STRATEGY_UNLOCKS = [
  { id: 'work', stat: 'days', target: 7, label: '一局到达第 7 天并结算' },
  { id: 'invest', stat: 'studies', target: 10, label: '一局学习 10 次并结算' },
  { id: 'reuse', stat: 'focus', target: 3, label: '一局使用精投 3 次并结算' },
  { id: 'resilience', stat: 'applications', target: 20, label: '一局投递 20 份并结算' },
  { id: 'favor', stat: 'network', target: 3, label: '一局使用内推 3 次并结算' },
  { id: 'connections', stat: 'offers', target: 3, label: '结算时持有至少 3 份 Offer' },
];
let cached;
export function getStrategyCareer() {
  if (cached) return cached;
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch {}
  const best = {};
  for (const x of STRATEGY_UNLOCKS) best[x.stat] = Number.isFinite(raw.best?.[x.stat]) ? Math.max(0, raw.best[x.stat]) : 0;
  cached = { runs: Number.isFinite(raw.runs) ? Math.max(0, raw.runs) : 0, best };
  return cached;
}
export function strategyUnlocked(id) {
  const rule = STRATEGY_UNLOCKS.find(x => x.id === id);
  return !rule || careerOwned(`strategy_${id}`) || getStrategyCareer().best[rule.stat] >= rule.target;
}
export function recordStrategyCareer(s) {
  if (s.strategyCareerResult) return s.strategyCareerResult;
  if (!s.gameOver) return { unlocked: [], saved: true };
  if (s.godMode) return s.strategyCareerResult = { unlocked: [], saved: true, cheat: true };
  const profile = getStrategyCareer();
  const locked = STRATEGY_UNLOCKS.filter(x => !strategyUnlocked(x.id));
  const stats = { days: Math.min(s.day, s.maxDays), studies: s.studyCount ?? 0,
    focus: s.strategyUses?.focus ?? 0, network: s.strategyUses?.network ?? 0,
    applications: s.appliedIds?.length ?? 0, offers: s.offers.length };
  for (const key of Object.keys(stats)) profile.best[key] = Math.max(profile.best[key] ?? 0, stats[key]);
  profile.runs++;
  let saved = true;
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { saved = false; }
  s.strategyCareerResult = { unlocked: locked.filter(x => strategyUnlocked(x.id)).map(x => x.id), saved };
  return s.strategyCareerResult;
}
