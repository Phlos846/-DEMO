import { STRATEGIES, STRATEGY_DAYS, strategyDraft, strategyDecision, strategyCores, activeStrategy, strategyGrowthCount, chooseStrategy, hasStrategy, strategyLevel, approachUnavailable } from './strategies.js?v=1.1.42';
import { strategyCopy } from './strategy-copy.js?v=1.1.42';
import { rememberDisclosures, disclosure } from './experience.js?v=1.1.42';
import { STRATEGY_UNLOCKS, getStrategyCareer, strategyUnlocked } from './strategy-career.js?v=1.1.42';

export function renderStrategyCareer() {
  const profile = getStrategyCareer();
  document.querySelectorAll('[data-strategy-career]').forEach(root => {
    root.replaceChildren();
    const note = document.createElement('p'); note.className = 'hint';
    note.textContent = `已记录 ${profile.runs} 局。可达成以下目标免费解锁，或在局外成长商店花点数解锁。已有进度保留；作弊局不计入，清除网站数据会丢失进度。`;
    root.append(note);
    for (const rule of STRATEGY_UNLOCKS) {
      const item = STRATEGIES.find(x => x.id === rule.id);
      const detail = document.createElement('details');
      const title = document.createElement('summary');
      title.textContent = `${strategyUnlocked(rule.id) ? '已解锁' : '未解锁'} · ${item.name}`;
      const condition = document.createElement('p');
      condition.textContent = `${rule.label}（${Math.min(profile.best[rule.stat], rule.target)}/${rule.target}）`;
      const body = document.createElement('p'); body.textContent = item.desc;
      detail.append(title, condition, body); root.append(detail);
    }
  });
}

export function renderStrategies(s, refresh) {
  const owned = document.getElementById('strategy-owned');
  rememberDisclosures(owned);
  owned.replaceChildren();
  for (const item of strategyCores(s)) {
    const detail = disclosure(`${s.careerRunId}:strategy:${item.id}`, `${item.name} · 成长 ${strategyGrowthCount(s, item.id)}/3`);
    detail.append(strategyDescription(item, s));
    for (const id of s.strategyGrowth?.[item.id] ?? []) {
      const buff = STRATEGIES.find(x => x.id === id);
      const entry = disclosure(`${s.careerRunId}:strategy:${item.id}:${id}`, `${buff.generic ? `通用 · 共 ${strategyLevel(s, id)} 层` : '专属'} · ${buff.name}`, 'strategy-buff');
      entry.append(strategyDescription(buff, s));
      detail.append(entry);
    }
    owned.append(detail);
  }
  const resourceText = [];
  if (hasStrategy(s, 'focus')) resourceText.push(`准备 ${s.strategyPrep ?? 0}/6`);
  if (hasStrategy(s, 'volume')) resourceText.push(`复盘 ${s.strategyReview ?? 0}/6`);
  if (hasStrategy(s, 'network')) resourceText.push(`人脉 ${s.strategyContacts ?? 0}/6`);
  if (hasStrategy(s, 'rhythm')) resourceText.push(`节奏 ${s.strategyRhythm ?? 0}/3`);
  document.getElementById('strategy-resources').textContent = resourceText.join(' · ');
  document.getElementById('strategy-resources').classList.toggle('hidden', !resourceText.length);
  const draft = strategyDraft(s), choices = document.getElementById('strategy-choices');
  choices.replaceChildren();
  const decision = strategyDecision(s), active = activeStrategy(s);
  const nextDay = STRATEGY_DAYS.find(day => day > s.day);
  const pending = [s.strategyBonusGrowth > 0 ? `额外成长 ${s.strategyBonusGrowth} 次` : '', s.strategyBonusCore > 0 ? `额外流派 ${s.strategyBonusCore} 次` : ''].filter(Boolean);
  document.getElementById('strategy-progress').textContent = [draft.length ? '待选择' : nextDay ? `下次选择：第 ${nextDay} 天` : '', ...pending].filter(Boolean).join(' · ');
  document.getElementById('strategy-progress').classList.toggle('hidden', !document.getElementById('strategy-progress').textContent);
  document.getElementById('strategy-choice-title').textContent = decision?.kind === 'growth' ? '选择策略成长 buff' : '选择新流派';
  document.getElementById('strategy-choice-progress').textContent = `${decision?.source === 'regular' ? '常规选择' : '事件额外选择'} · ${decision?.kind === 'growth' ? `${active.name} ${strategyGrowthCount(s, active.id)}/3` : `已拥有 ${strategyCores(s).length} 个流派`}`;
  document.getElementById('strategy-choice-rule').textContent = decision?.kind === 'growth'
    ? '专属或通用 buff 均计入成长，选满 3 项才能选下一流派。通用 buff 在当前流派内不重复，跨流派可叠加。放弃不会增加成长进度。'
    : '随机候选中选择一个流派；选满 3 项成长后才能选下一流派。放弃消耗本次名额。';
  document.getElementById('btn-strategy-skip').textContent = decision?.kind === 'growth' ? '本次不选择成长 buff' : '本次不选择流派';
  for (const item of draft) {
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'secondary';
    const name = document.createElement('strong'); name.textContent = `${item.generic ? '通用 · ' : item.requires ? '专属 · ' : ''}${item.name}`;
    const desc = strategyDescription(item, s, true);
    btn.append(name, desc);
    btn.addEventListener('click', () => {
      if (chooseStrategy(s, item.id)) {
        document.getElementById('strategy-choice-modal').close();
        refresh();
      }
    });
    choices.append(btn);
  }
}

function strategyDescription(item, s, choosing = false) {
  const root = document.createElement('span'); root.className = 'strategy-description';
  for (const [i, text] of strategyCopy(item).entries()) {
    const row = document.createElement('span'); row.textContent = `${['触发', '效果', '限制'][i]}：${text}`; root.append(row);
  }
  if (item.generic && choosing) {
    const row = document.createElement('span'); row.textContent = `当前 ${strategyLevel(s, item.id)} 层 → 选择后 ${strategyLevel(s, item.id) + 1} 层`; root.append(row);
  }
  return root;
}

export function renderApproaches(s, refresh) {
  const root = document.getElementById('strategy-approaches'); root.replaceChildren();
  root.classList.toggle('hidden', !(s.strategies?.length > 0));
  const options = [
    ['normal', '普通投递'],
    ['focus', `精投 · 2 准备（持有 ${s.strategyPrep ?? 0}）`],
    ['volume', `运用复盘 · 2 复盘（持有 ${s.strategyReview ?? 0}）`],
    ['network', `内推 · 3 人脉${hasStrategy(s, 'favor') ? '' : ' + 100 元'}（持有 ${s.strategyContacts ?? 0}）`],
  ];
  for (const [id, name] of options) {
    if (id !== 'normal' && !hasStrategy(s, id)) continue;
    const reason = approachUnavailable(s, id);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'secondary';
    const selected = (s.applySession.strategyApproach ?? 'normal') === id;
    btn.setAttribute('aria-pressed', String(selected));
    btn.textContent = `${selected ? '✓ ' : ''}${name}${reason ? ` · ${reason}` : ''}`;
    btn.disabled = !!reason;
    btn.addEventListener('click', () => { s.applySession.strategyApproach = id; refresh(); });
    root.append(btn);
  }
  const hint = document.createElement('p'); hint.className = 'hint';
  hint.textContent = `本轮最多投递 ${s.applySession.target} 份。每家公司只能选一种方式，点击投递才消耗资源；面试加成仍受精力、压力影响，成功率上限不变。`;
  root.append(hint);
}
