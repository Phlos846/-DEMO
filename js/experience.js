const FIELDS = { actionPoints: '行动点', money: '现金', debt: '负债', energy: '精力', stress: '压力', resumeQuality: '综合素质', hiddenResume: '简历能力', hiddenInterview: '面试能力' };
export const resourceSnapshot = s => Object.fromEntries(Object.keys(FIELDS).map(key => [key, s[key] ?? 0]));
export function resourceChangeText(s, before, capTargets = []) {
  const changes = Object.entries(FIELDS).flatMap(([key, label]) => {
    const delta = Math.round(((s[key] ?? 0) - before[key]) * 10) / 10;
    const cap = key === 'energy' ? s.energyMax ?? 100 : key === 'resumeQuality' ? s.resumeQualityMax ?? 120 : 100;
    if (delta) return [`${label} ${delta > 0 ? '+' : ''}${delta}${delta > 0 && capTargets.includes(key) && s[key] >= cap ? '（已达上限）' : ''}`];
    return capTargets.includes(key) && s[key] >= cap ? [`${label}已达上限`] : [];
  });
  return changes.join(' · ') || '数值无变化';
}
export function showResourceFeedback(s, before, label, capTargets = [], note = '') {
  s.lastActionFeedback = { day: s.day, text: `${label}：${resourceChangeText(s, before, capTargets)}${note ? ` · ${note}` : ''}` };
  renderResourceFeedback(s);
}
export function renderResourceFeedback(s) {
  for (const id of ['action-feedback', 'apply-feedback']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const text = s.lastActionFeedback?.day === s.day ? s.lastActionFeedback.text : '';
    el.textContent = text;
    el.classList.toggle('hidden', !text);
  }
}
export function nextDayInterviewPreview(s) {
  if (s.gameOver || s.day >= s.maxDays) return '';
  const count = s.interviewQueue?.length ?? 0;
  const final = s.day + 1 === s.maxDays;
  const pending = (s.resumePending ?? []).filter(x => final || x.notifyDay <= s.day + 1).length;
  if (!count && !pending) return '暂无面试安排';
  const planned = final ? count : Math.min(2, count);
  const lines = count ? [`已有 ${count} 场待安排面试，${final ? '明日统一结算，不消耗行动点' : `明日预计安排 ${planned} 场、占用 ${planned} 行动点${count > 2 ? '，其余顺延' : ''}`}`] : [];
  if (pending) lines.push(`另有 ${pending} 份简历明日反馈，可能增加面试`);
  return lines.join('；') + '。';
}

// Preserve disclosure state through resource refreshes; key includes run identity.
const disclosures = new Map();
export function rememberDisclosures(root) {
  root.querySelectorAll('details[data-disclosure]').forEach(el => disclosures.set(el.dataset.disclosure, el.open));
}
export function disclosure(key, title, className = '') {
  const el = document.createElement('details'); el.className = className;
  el.dataset.disclosure = key; el.open = disclosures.get(key) ?? false;
  const summary = document.createElement('summary'); summary.textContent = title; el.append(summary);
  return el;
}
