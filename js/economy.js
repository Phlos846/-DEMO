import { applyMoneyDelta, applyEnergyDelta, applyStressDelta, livingCostMultiplier } from './talentRuntime.js?v=1.1.19';
import { hasTalent } from './talents.js?v=1.1.19';
import { hasStrategy, strategyLevel, onStrategyAction } from './strategies.js?v=1.1.19';

export const MONEY_OPTIONS = [
  { id: 'work', label: '接短工', detail: '+220 元 · 1 行动点 · 精力 −18、压力 +8；每日一次', cost: 0 },
  { id: 'coach', label: '预约辅导', detail: '600 元 · 接下来 2 次学习属性收益 ×1.5；不叠加，不耗行动点', cost: 600 },
  { id: 'recover', label: '安排放松护理', detail: '300 元 · 精力 +18、压力 −10；每日一次，不耗行动点', cost: 300 },
  { id: 'repay', label: '偿还欠款', detail: '每次最多还 500 元；不耗行动点', cost: 0 },
];

export function moneyOptionUnavailable(s, id) {
  const option = MONEY_OPTIONS.find(o => o.id === id);
  if (!option || s.gameOver) return '当前不可用';
  if ((s.money ?? 0) < option.cost) return '现金不足';
  if (id === 'work') {
    if (s.lastWorkDay === s.day) return '今日已接短工';
    if (s.actionPoints < 1) return '行动点不足';
    if (s.energy <= 18) return '精力需高于 18';
  }
  if (id === 'coach' && (s.coachedStudies ?? 0) > 0) return '辅导尚未用完';
  if (id === 'recover') {
    if (s.lastPaidRecoveryDay === s.day) return '今日已使用';
    if (s.energy >= (s.energyMax ?? 100) && s.stress <= 0) return '状态已满';
  }
  if (id === 'repay' && (!(s.debt > 0) || !(s.money > 0))) return '无欠款或无可用现金';
  return '';
}

export function useMoneyOption(s, id) {
  const reason = moneyOptionUnavailable(s, id);
  if (reason) return { ok: false, reason };
  const before = { money: s.money, energy: s.energy, stress: s.stress, debt: s.debt };
  const option = MONEY_OPTIONS.find(o => o.id === id);
  applyMoneyDelta(s, -option.cost);
  if (id === 'work') {
    s.lastWorkDay = s.day;
    s.actionPoints--;
    applyMoneyDelta(s, 220);
    applyEnergyDelta(s, -18);
    applyStressDelta(s, 8, 'action');
  } else if (id === 'coach') {
    s.coachedStudies = hasStrategy(s, 'invest') ? 3 : 2;
  } else if (id === 'recover') {
    s.lastPaidRecoveryDay = s.day;
    applyEnergyDelta(s, 18);
    applyStressDelta(s, -10, 'action');
  } else {
    const paid = Math.min(500, s.money, s.debt);
    applyMoneyDelta(s, -paid);
    s.debt -= paid;
  }
  if (id === 'work') onStrategyAction(s, 'work');
  if (id === 'recover') onStrategyAction(s, 'recover');
  const signed = value => `${value >= 0 ? '+' : ''}${Math.round(value * 10) / 10}`;
  const changes = ['money', 'energy', 'stress', 'debt'].filter(k => s[k] !== before[k])
    .map(k => `${({money:'现金', energy:'精力', stress:'压力', debt:'负债'})[k]} ${signed(s[k] - before[k])}`);
  if (id === 'coach') changes.push(`接下来 ${s.coachedStudies} 次学习属性收益 ×1.5`);
  return { ok: true, note: `${option.label}：${changes.join('，')}。` };
}

export function livingBudgetSummary(s) {
  const daily = (s.baseLivingCost ?? 100) * livingCostMultiplier(s) + (hasTalent(s, 'coffee_life') ? 10 : 0);
  const remaining = Math.max(0, s.maxDays - s.day);
  return `日常生活费约 ${Math.round(daily)} 元/天；剩余 ${remaining} 天约需 ${Math.round(daily * remaining)} 元（未计收入、房租及额外消费）。`;
}

export function moneyOptionDetail(s, id) {
  if (id === 'coach') return `600 元 · 接下来 ${hasStrategy(s, 'invest') ? 3 : 2} 次学习属性收益 ×1.5；不叠加，不耗行动点`;
  if (id === 'work') {
    const income = 220 + (hasStrategy(s, 'work') ? 80 : 0) + (hasStrategy(s, 'settlement') ? 40 : 0) + 30 * strategyLevel(s, 'general_work');
    return `+${income} 元 · 1 行动点 · 精力 −18、压力 +${hasStrategy(s, 'work') ? 12 : 8}${hasStrategy(s, 'efficient') ? '；完成后回 6 精力' : ''}${hasStrategy(s, 'portfolio') ? '；简历能力 +1' : ''}；每日一次`;
  }
  if (id === 'recover') return `300 元 · 精力 +${18 + 4 * strategyLevel(s, 'general_care')}、压力 −10；每日一次，不耗行动点`;
  return MONEY_OPTIONS.find(x => x.id === id).detail;
}
