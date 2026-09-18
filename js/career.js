// Persistent progression only; no imports from gameplay modules.
const KEY = 'ar_career_v1';
export const CAREER_ITEMS = [
  { id: 'master', name: '硕士研究生', costs: [8], desc: '解锁硕士随机词条；普本及以上背景有 34% 概率获得，天才可附赠。' },
  { id: 'phd', name: '博士研究生', costs: [12], requires: 'master', desc: '解锁博士随机词条；普本及以上背景有 5% 概率获得。需先解锁硕士。' },
  { id: 'genius', name: '天才倾向', costs: [6, 10, 14], desc: '每级使天才在金色天赋池内的相对抽取权重增加原始值的 100%，最高 4 倍；不改变金色池概率，不保证获得。' },
  { id: 'savings', name: '求职储备', costs: [4, 6, 8], desc: '每级开局现金 +200 元，最多 +600 元。' },
  { id: 'strategy_work', name: '策略：兼职积累', costs: [4], desc: '解锁短工额外收入与压力的策略及其强化候选。', legacy: ['days', 7] },
  { id: 'strategy_invest', name: '策略：长期投资', costs: [5], desc: '解锁延长付费辅导的策略及其强化候选。', legacy: ['studies', 10] },
  { id: 'strategy_reuse', name: '策略：准备复用', costs: [4], desc: '解锁精投失败返还准备；局内仍需先选精投准备。', legacy: ['focus', 3] },
  { id: 'strategy_resilience', name: '策略：以战养战', costs: [4], desc: '解锁消耗复盘恢复精力；局内仍需先选海投复盘。', legacy: ['applications', 20] },
  { id: 'strategy_favor', name: '策略：熟人引荐', costs: [5], desc: '解锁免现金内推；局内仍需先选人脉求职。', legacy: ['network', 3] },
  { id: 'strategy_connections', name: '策略：互帮互助', costs: [5], desc: '解锁拿到 Offer 返还人脉；局内仍需先选人脉求职。', legacy: ['offers', 3] },
  { id: 'relic_notes', name: '信物：面试笔记', costs: [5], relic: true, desc: '每局一次，主动使用后，下一场面试基础成功率 +15 个百分点；仍受状态惩罚与上限限制。' },
  { id: 'relic_letter', name: '信物：朋友的留言', costs: [4], relic: true, desc: '每局一次，主动使用降低 20 压力，受现有减压修正影响。' },
  { id: 'relic_envelope', name: '信物：备用红包', costs: [4], relic: true, desc: '每局一次，主动使用获得 400 元现金。' },
];
const WINS = new Set(['early_settle','grand_slam','underdog_snipe','premium_salary','hungry_ok','industry_jinx','chill_hire','stacked','popular','scholar_risk','balance','normal_ok','outsourcing_fate','default_win']);
let cache;
function normalize(raw) {
  const levels = {};
  for (const item of CAREER_ITEMS) levels[item.id] = Math.max(0, Math.min(item.costs.length, Math.floor(Number(raw?.levels?.[item.id]) || 0)));
  return { points: Math.max(0, Math.floor(Number(raw?.points) || 0)), levels,
    seen: Array.isArray(raw?.seen) ? [...new Set(raw.seen.filter(x => typeof x === 'string'))] : [],
    rewarded: Array.isArray(raw?.rewarded) ? raw.rewarded.filter(x => typeof x === 'string') : [],
    selectedRelic: CAREER_ITEMS.some(x => x.relic && x.id === raw?.selectedRelic && levels[x.id]) ? raw.selectedRelic : null };
}
export function getCareer() {
  if (cache) return cache;
  let raw = {};
  try {
    const stored = localStorage.getItem(KEY);
    raw = stored ? JSON.parse(stored) : { seen: JSON.parse(localStorage.getItem('ar_codex_v1') || '{}').end ?? [] };
  } catch {}
  cache = normalize(raw);
  return cache;
}
function commit(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)); cache = next; return true; } catch { return false; }
}
export const careerLevel = id => getCareer().levels[id] ?? 0;
export function careerOwned(id) {
  if (careerLevel(id) > 0) return true;
  const item = CAREER_ITEMS.find(x => x.id === id);
  if (item?.legacy) {
    try { return (JSON.parse(localStorage.getItem('ar_strategy_career_v1') || '{}').best?.[item.legacy[0]] ?? 0) >= item.legacy[1]; } catch {}
  }
  return false;
}
export function buyCareerItem(id) {
  const item = CAREER_ITEMS.find(x => x.id === id), profile = getCareer();
  if (!item) return '商品不存在';
  const level = careerLevel(id), cost = item.costs[level];
  if (cost == null || (item.legacy && careerOwned(id))) return '已经解锁或满级';
  if (item.requires && !careerOwned(item.requires)) return '请先解锁硕士';
  if (profile.points < cost) return '成长点不足';
  const next = structuredClone(profile); next.points -= cost; next.levels[id] = level + 1;
  return commit(next) ? '' : '浏览器无法保存，购买未生效，点数未扣除';
}
export function selectRelic(id) {
  if (id && !CAREER_ITEMS.some(x => x.id === id && x.relic && careerOwned(id))) return false;
  const next = structuredClone(getCareer()); next.selectedRelic = id;
  return commit(next);
}
export function awardCareer(s, ending) {
  if (s.careerReward) return s.careerReward;
  if (!s.gameOver) return { text: '', saved: true };
  if (s.godMode) return s.careerReward = { text: '作弊局不获得成长点。', saved: true };
  const profile = getCareer();
  if (profile.rewarded.includes(s.careerRunId)) return s.careerReward = { text: '本局成长点已领取。', saved: true };
  const win = s.offers.length > 0 && WINS.has(ending.id), fresh = !profile.seen.includes(ending.id);
  const earned = (win ? 3 : 0) + (fresh ? 2 : 0);
  const next = structuredClone(profile); next.points += earned;
  if (fresh) next.seen.push(ending.id);
  next.rewarded.push(s.careerRunId);
  const saved = commit(next);
  const result = { saved, text: saved ? `本局成长点 +${earned}（成功求职 ${win ? '+3' : '+0'}，新结局 ${fresh ? '+2' : '+0'}），余额 ${next.points}。` : '浏览器无法保存，成长点尚未入账。' };
  if (saved) s.careerReward = result;
  return result;
}
