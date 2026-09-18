import { applyEnergyDelta, applyMoneyDelta, applyStressDelta } from './talentRuntime.js?v=1.1.19';
import { strategyUnlocked } from './strategy-career.js?v=1.1.19';
export const STRATEGY_DAYS = [1, 6, 11, 16, 21, 26];

export const STRATEGIES = [
  { id: 'focus', name: '精投准备', desc: '每次学习获得 2 准备，上限 6。投递时可花 2 准备，使该公司的简历、面试基础成功率各增加 15 个百分点；每轮最多投 5 份。' },
  { id: 'volume', name: '海投复盘', desc: '每封简历或面试拒信获得 1 复盘，上限 6。投递时可花 2 复盘，使该公司的简历成功率增加 15 个百分点。' },
  { id: 'network', name: '人脉求职', desc: '每次娱乐获得 2 人脉，上限 6。投递时可花 3 人脉和 100 元内推，使该公司的简历成功率增加 25 个百分点。内推不保证录用，也不会识破陷阱。' },
  { id: 'research', requires: 'focus', name: '知己知彼', desc: '每次成功侧面打听额外获得 1 准备。情报也能成为精投的准备来源。' },
  { id: 'reuse', requires: 'focus', name: '准备复用', desc: '精投的公司最终拒绝你时，返还所花的 2 准备；上限仍为 6。' },
  { id: 'batch', requires: 'volume', name: '批量归档', desc: '同一轮累计投递 5 份时恢复 8 精力，每轮一次。可与精投混搭。' },
  { id: 'resilience', requires: 'volume', name: '以战养战', desc: '用复盘投递时额外恢复 6 精力，让拒信支撑下一轮行动。' },
  { id: 'favor', requires: 'network', name: '熟人引荐', desc: '内推不再花现金，仍消耗 3 人脉。省下的钱可以用于学习辅导。' },
  { id: 'connections', requires: 'network', name: '互帮互助', desc: '每次面试获得 Offer 时获得 2 人脉，上限 6；普通投递和内推均可触发。' },
  { id: 'rhythm', name: '节奏管理', desc: '休息获得 1 节奏，上限 3。学习自动消耗 1 节奏，在学习消耗后恢复 8 精力。' },
  { id: 'relax', requires: 'rhythm', name: '张弛有度', desc: '娱乐也获得 1 节奏，上限 3。可与人脉求职搭配。' },
  { id: 'deep', requires: 'rhythm', name: '深度专注', desc: '消耗节奏的学习额外提升 1 综合素质，受综合素质上限限制。' },
  { id: 'work', name: '兼职积累', desc: '每次接短工额外获得 80 元，但额外增加 4 压力。现金可用于辅导或内推。' },
  { id: 'portfolio', requires: 'work', name: '工作样本', desc: '每次接短工额外提升 1 简历能力，最高 100。工作也能积累求职经历。' },
  { id: 'efficient', requires: 'work', name: '熟练接单', desc: '每次接短工后恢复 6 精力，降低赚钱对后续行动的影响。' },
  { id: 'invest', name: '长期投资', desc: '之后购买的学习辅导由 2 次延长为 3 次，价格仍为 600 元。已购买的辅导不追补。' },
  { id: 'practice', requires: 'invest', name: '专项训练', desc: '每次接受辅导的学习额外提升 1 面试能力，最高 100。' },
  { id: 'rebate', requires: 'invest', name: '结课返现', desc: '用完一组辅导的最后一次学习后返还 150 元。' },
  { id: 'targeted', requires: 'focus', name: '定向拆题', desc: '每次实际使用精投时降低 4 压力。' },
  { id: 'archive', requires: 'volume', name: '拒信归档', desc: '选中后每累计收到 3 封简历或面试拒信，获得 60 元复盘资料补贴。' },
  { id: 'reputation', requires: 'network', name: '口碑相传', desc: '每次成功侧面打听获得 1 人脉，上限 6。' },
  { id: 'breathe', requires: 'rhythm', name: '呼吸训练', desc: '学习消耗节奏时，额外降低 3 压力。' },
  { id: 'settlement', requires: 'work', name: '结算加急', desc: '每次接短工额外获得 40 元。' },
  { id: 'consolidate', requires: 'invest', name: '温故知新', desc: '用完一组辅导的最后一次学习时，额外提升 2 综合素质，受上限限制。' },
  { id: 'general_rest', generic: true, name: '规律作息', desc: '每次休息额外恢复 4 精力。不同流派再次选择可叠加。' },
  { id: 'general_fun', generic: true, name: '放松有方', desc: '每次娱乐额外降低 3 压力。不同流派再次选择可叠加。' },
  { id: 'general_study', generic: true, name: '知识整理', desc: '每次学习额外提升 1 简历能力，最高 100。不同流派再次选择可叠加。' },
  { id: 'general_calm', generic: true, name: '循序渐进', desc: '每次学习后额外降低 1 压力。不同流派再次选择可叠加。' },
  { id: 'general_work', generic: true, name: '开源有道', desc: '每次接短工额外获得 30 元。不同流派再次选择可叠加。' },
  { id: 'general_care', generic: true, name: '恢复习惯', desc: '每次放松护理额外恢复 4 精力。不同流派再次选择可叠加。' },
];
export const hasStrategy = (s, id) => (s.strategies ?? []).includes(id);
export const strategyLevel = (s, id) => (s.strategies ?? []).filter(x => x === id).length;
export const strategyCores = s => STRATEGIES.filter(x => !x.requires && !x.generic && hasStrategy(s, x.id));
export function activeStrategy(s) {
  return [...(s.strategies ?? [])].reverse().map(id => STRATEGIES.find(x => x.id === id)).find(x => x && !x.requires && !x.generic);
}
export const strategyGrowthCount = (s, core) => (s.strategyGrowth?.[core] ?? []).length;
const availableCores = s => STRATEGIES.filter(x => !x.requires && !x.generic && strategyUnlocked(x.id) && !hasStrategy(s, x.id));
export function strategyDecision(s) {
  if (s.gameOver || s.applySession) return null;
  const active = activeStrategy(s);
  const growing = active && strategyGrowthCount(s, active.id) < 3;
  const regular = STRATEGY_DAYS.filter(day => s.day >= day).length - (s.strategyRegularUsed ?? 0);
  if (growing) {
    if ((s.strategyBonusGrowth ?? 0) > 0) return { kind: 'growth', source: 'strategyBonusGrowth', owner: active.id };
    if (regular > 0) return { kind: 'growth', source: 'regular', owner: active.id };
  } else if (availableCores(s).length) {
    if ((s.strategyBonusCore ?? 0) > 0) return { kind: 'core', source: 'strategyBonusCore' };
    if (regular > 0) return { kind: 'core', source: 'regular' };
  }
  return null;
}
export function canGrantStrategyChoice(s, kind) {
  if (s.gameOver) return false;
  if (kind === 'core') return availableCores(s).length > (s.strategyBonusCore ?? 0);
  const active = activeStrategy(s);
  return !!active && strategyGrowthCount(s, active.id) + (s.strategyBonusGrowth ?? 0) < 3;
}
export function grantStrategyChoice(s, kind) {
  if (!canGrantStrategyChoice(s, kind)) return false;
  const key = kind === 'core' ? 'strategyBonusCore' : 'strategyBonusGrowth';
  s[key] = (s[key] ?? 0) + 1;
  s.strategyDraft = null;
  strategyLog(s, kind === 'core' ? '获得额外流派名额；当前流派成长满 3 项后可领取。' : '获得额外成长选择，计入当前流派的 3 项成长进度。');
  return true;
}
function consumeDecision(s, decision) {
  if (decision.source === 'regular') s.strategyRegularUsed = (s.strategyRegularUsed ?? 0) + 1;
  else s[decision.source]--;
  s.strategyDraft = null;
}
export function strategyLog(s, message) {
  s.log.unshift({ day: s.day, msg: `【策略】${message}` });
  if (s.log.length > 80) s.log.pop();
}
function gain(s, key, amount, label) {
  const before = s[key] ?? 0;
  s[key] = Math.min(6, before + amount);
  strategyLog(s, `${label} +${s[key] - before}（${s[key]}/6）。`);
}
export function strategyDraft(s) {
  const decision = strategyDecision(s);
  if (!decision) return [];
  const key = `${decision.kind}:${decision.source}:${decision.owner ?? ''}:${s.strategyRegularUsed ?? 0}:${(s.strategies ?? []).length}`;
  if (!s.strategyDraft || s.strategyDraft.key !== key) {
    const owned = s.strategyGrowth?.[decision.owner] ?? [];
    const pool = decision.kind === 'core' ? availableCores(s)
      : STRATEGIES.filter(x => (x.requires === decision.owner || x.generic) && !owned.includes(x.id) && strategyUnlocked(x.id));
    if (decision.kind === 'growth' || strategyCores(s).length) {
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    let offered = pool;
    if (decision.kind === 'growth') {
      const exclusive = pool.find(x => x.requires === decision.owner);
      offered = exclusive ? [exclusive, ...pool.filter(x => x !== exclusive)].slice(0, 3) : pool.slice(0, 3);
    } else if (strategyCores(s).length) offered = pool.slice(0, 3);
    s.strategyDraft = { key, ids: offered.map(x => x.id) };
  }
  return s.strategyDraft.ids.map(id => STRATEGIES.find(x => x.id === id));
}
export function chooseStrategy(s, id) {
  if (!strategyDraft(s).some(x => x.id === id) || s.applySession) return false;
  const decision = strategyDecision(s);
  s.strategies ??= [];
  s.strategies.push(id);
  s.strategyGrowth ??= {};
  if (decision.kind === 'growth') (s.strategyGrowth[decision.owner] ??= []).push(id);
  else s.strategyGrowth[id] = [];
  consumeDecision(s, decision);
  strategyLog(s, `选择${decision.kind === 'core' ? '流派' : '成长'}「${STRATEGIES.find(x => x.id === id).name}」。`);
  return true;
}
export function skipStrategy(s) {
  if (!strategyDraft(s).length || s.applySession) return false;
  const decision = strategyDecision(s);
  s.skippedStrategies = (s.skippedStrategies ?? 0) + 1;
  consumeDecision(s, decision);
  strategyLog(s, '放弃本次选择；未获得成长，不计入 3 项成长进度。');
  return true;
}
export function onStrategyAction(s, action) {
  if (action === 'rest') applyEnergyDelta(s, 4 * strategyLevel(s, 'general_rest'));
  if (action === 'fun') applyStressDelta(s, -3 * strategyLevel(s, 'general_fun'), 'action');
  if (action === 'study') {
    s.hiddenResume = Math.min(100, s.hiddenResume + strategyLevel(s, 'general_study'));
    applyStressDelta(s, -strategyLevel(s, 'general_calm'), 'action');
  }
  if (action === 'work') applyMoneyDelta(s, 30 * strategyLevel(s, 'general_work'));
  if (action === 'recover') applyEnergyDelta(s, 4 * strategyLevel(s, 'general_care'));
  if (hasStrategy(s, 'rhythm') && (action === 'rest' || (action === 'fun' && hasStrategy(s, 'relax')))) {
    s.strategyRhythm = Math.min(3, (s.strategyRhythm ?? 0) + 1);
    strategyLog(s, `节奏 ${s.strategyRhythm}/3。`);
  }
  if (action === 'study' && hasStrategy(s, 'rhythm') && s.strategyRhythm > 0) {
    s.strategyRhythm--;
    const before = s.energy;
    applyEnergyDelta(s, 8);
    if (hasStrategy(s, 'breathe')) applyStressDelta(s, -3, 'action');
    if (hasStrategy(s, 'deep')) s.resumeQuality = Math.min(s.resumeQualityMax ?? 120, s.resumeQuality + 1);
    strategyLog(s, `消耗 1 节奏，精力 +${s.energy - before}${hasStrategy(s, 'deep') ? '，深度专注提升综合素质（受上限限制）' : ''}。`);
  }
  if (action === 'study' && s.coachedStudies > 0) {
    if (hasStrategy(s, 'consolidate') && s.coachedStudies === 1) {
      s.resumeQuality = Math.min(s.resumeQualityMax ?? 120, s.resumeQuality + 2);
      strategyLog(s, '温故知新：综合素质提升，受上限限制。');
    }
    if (hasStrategy(s, 'practice')) {
      s.hiddenInterview = Math.min(100, s.hiddenInterview + 1);
      strategyLog(s, '专项训练提升面试能力（受上限限制）。');
    }
    if (hasStrategy(s, 'rebate') && s.coachedStudies === 1) {
      applyMoneyDelta(s, 150); strategyLog(s, '结课返现 +150 元。');
    }
  }
  if (action === 'work' && hasStrategy(s, 'work')) {
    applyMoneyDelta(s, 80); applyStressDelta(s, 4, 'action');
    if (hasStrategy(s, 'settlement')) applyMoneyDelta(s, 40);
    if (hasStrategy(s, 'portfolio')) {
      s.hiddenResume = Math.min(100, s.hiddenResume + 1);
      strategyLog(s, '工作样本提升简历能力（受上限限制）。');
    }
    if (hasStrategy(s, 'efficient')) applyEnergyDelta(s, 6);
  }
  if (action === 'study' && hasStrategy(s, 'focus')) gain(s, 'strategyPrep', 2, '准备');
  if (action === 'fun' && hasStrategy(s, 'network')) gain(s, 'strategyContacts', 2, '人脉');
  if (action === 'reveal' && hasStrategy(s, 'research')) gain(s, 'strategyPrep', 1, '准备');
  if (action === 'reveal' && hasStrategy(s, 'reputation')) gain(s, 'strategyContacts', 1, '人脉');
}
export function onStrategyRejection(s, company) {
  if (hasStrategy(s, 'archive')) {
    s.strategyArchiveCount = (s.strategyArchiveCount ?? 0) + 1;
    if (s.strategyArchiveCount % 3 === 0) { applyMoneyDelta(s, 60); strategyLog(s, '拒信归档：补贴 +60 元。'); }
  }
  if (hasStrategy(s, 'volume')) gain(s, 'strategyReview', 1, '复盘');
  if (hasStrategy(s, 'reuse') && company.strategySupport === 'focus') gain(s, 'strategyPrep', 2, '返还准备');
}
export function onStrategyOffer(s) {
  if (hasStrategy(s, 'connections')) gain(s, 'strategyContacts', 2, '人脉');
}
export function approachUnavailable(s, id) {
  if (s.gameOver || !s.applySession) return '当前不可投递';
  if (id === 'normal') return '';
  if (!hasStrategy(s, id)) return '尚未选择对应策略';
  if (id === 'focus' && (s.strategyPrep ?? 0) < 2) return '需要 2 准备';
  if (id === 'volume' && (s.strategyReview ?? 0) < 2) return '需要 2 复盘';
  if (id === 'network') {
    if ((s.strategyContacts ?? 0) < 3) return '需要 3 人脉';
    if (!hasStrategy(s, 'favor') && s.money < 100) return '需要 100 元现金';
  }
  return '';
}
// Only called at submission. Merely viewing or skipping a company spends nothing.
export function spendApproach(s, company) {
  const id = s.applySession.strategyApproach ?? 'normal';
  if (approachUnavailable(s, id)) return false;
  if (id === 'focus') {
    s.strategyPrep -= 2;
    if (hasStrategy(s, 'targeted')) applyStressDelta(s, -4, 'action');
  }
  if (id === 'volume') {
    s.strategyReview -= 2;
    if (hasStrategy(s, 'resilience')) applyEnergyDelta(s, 6);
  }
  if (id === 'network') {
    s.strategyContacts -= 3;
    if (!hasStrategy(s, 'favor')) applyMoneyDelta(s, -100);
  }
  company.strategySupport = id;
  if (id !== 'normal') {
    s.strategyUses ??= {};
    s.strategyUses[id] = (s.strategyUses[id] ?? 0) + 1;
    strategyLog(s, `对「${company.name}」使用${STRATEGIES.find(x => x.id === id).name}。`);
  }
  return true;
}
export function onStrategySubmission(s) {
  if (hasStrategy(s, 'batch') && s.applySession.submitted === 5) {
    const before = s.energy;
    applyEnergyDelta(s, 8);
    strategyLog(s, `批量归档：精力 +${s.energy - before}。`);
  }
}
export function strategyPassBonus(company, stage) {
  if (company.strategySupport === 'focus') return .15;
  if (stage === 'interview') return 0;
  return company.strategySupport === 'volume' ? .15 : company.strategySupport === 'network' ? .25 : 0;
}
