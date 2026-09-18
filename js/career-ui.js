import { CAREER_ITEMS, getCareer, careerLevel, careerOwned, buyCareerItem, selectRelic } from './career.js?v=1.1.19';
import { applyStressDelta, applyMoneyDelta } from './talentRuntime.js?v=1.1.19';

export function renderCareerShop(onChange = () => {}) {
  const root = document.getElementById('career-shop'); root.replaceChildren();
  document.getElementById('career-points').textContent = String(getCareer().points);
  for (const group of ['能力与背景', '策略', '信物']) {
    const title = document.createElement('h3'); title.textContent = group; root.append(title);
    const grid = document.createElement('div'); grid.className = 'money-grid'; root.append(grid);
    for (const item of CAREER_ITEMS.filter(x => (x.relic ? '信物' : x.id.startsWith('strategy_') ? '策略' : '能力与背景') === group)) {
      const card = document.createElement('div'); card.className = 'career-item';
      const name = document.createElement('strong'); name.textContent = item.name;
      const desc = document.createElement('p'); desc.className = 'hint'; desc.textContent = item.desc;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary';
      const level = careerLevel(item.id), cost = item.costs[level];
      const maxed = cost == null || (item.legacy && careerOwned(item.id));
      button.textContent = maxed ? '已解锁 / 满级' : `${cost} 点${item.costs.length > 1 ? ` · 升至 ${level + 1} 级` : ' · 解锁'}`;
      button.disabled = maxed || getCareer().points < cost || (item.requires && !careerOwned(item.requires));
      button.addEventListener('click', () => {
        const error = buyCareerItem(item.id);
        document.getElementById('career-message').textContent = error || `已解锁或升级「${item.name}」。学历解锁后可重随词条，其他强化从下局生效。`;
        renderCareerShop(onChange); onChange();
      });
      card.append(name, desc, button);
      if (item.relic && careerOwned(item.id)) {
        const equip = document.createElement('button'); equip.type = 'button'; equip.className = 'secondary';
        const active = getCareer().selectedRelic === item.id;
        equip.textContent = active ? '已携带 · 卸下' : '下局携带'; equip.setAttribute('aria-pressed', String(active));
        equip.addEventListener('click', () => {
          if (!selectRelic(active ? null : item.id)) document.getElementById('career-message').textContent = '浏览器无法保存携带设置。';
          renderCareerShop(onChange);
        }); card.append(equip);
      }
      grid.append(card);
    }
  }
}

export function renderRelic(s, refresh) {
  const root = document.getElementById('run-relic'); root.replaceChildren();
  const item = CAREER_ITEMS.find(x => x.relic && x.id === s.carriedRelic);
  root.classList.toggle('hidden', !item);
  if (!item) return;
  const label = document.createElement('p'); label.className = 'hint';
  label.textContent = `${item.name}：${item.desc} 不耗行动点。`;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'secondary';
  btn.textContent = s.relicUsed ? (s.relicInterviewReady ? '已使用，等待下一场面试' : '本局已使用') : '使用信物';
  btn.disabled = s.gameOver || s.relicUsed || (item.id === 'relic_letter' && s.stress <= 0);
  btn.addEventListener('click', () => {
    if (s.gameOver || s.relicUsed || (item.id === 'relic_letter' && s.stress <= 0)) return;
    s.relicUsed = true;
    let effect = '';
    if (item.id === 'relic_notes') { s.relicInterviewReady = true; effect = '下一场面试获得笔记加成'; }
    if (item.id === 'relic_letter') { const before = s.stress; applyStressDelta(s, -20, 'action'); effect = `压力 ${Math.round((s.stress - before) * 10) / 10}`; }
    if (item.id === 'relic_envelope') { applyMoneyDelta(s, 400); effect = '现金 +400'; }
    s.log.unshift({ day: s.day, msg: `使用${item.name}：${effect}。` });
    if (s.log.length > 80) s.log.pop(); refresh();
  });
  root.append(label, btn);
}
