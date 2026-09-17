// Optional presentation layer: no game state changes, reloads or game module imports.
const root = document.documentElement;
const header = document.querySelector('.top-bar');
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'secondary layout-switch';
header.append(toggle);
const offerPanel = document.querySelector('#offer-list').closest('.card');
offerPanel.classList.add('offers-panel');

const actions = document.querySelector('.actions');
const rules = actions.querySelector(':scope > .hint');
const rulesAnchor = document.createComment('Original action rules position');
rules.before(rulesAnchor);
const details = document.createElement('details');
details.className = 'action-rules';
const summary = document.createElement('summary');
summary.textContent = '行动规则与透支说明';
details.append(summary);

const logPanel = document.querySelector('.log-panel');
const expand = document.createElement('button');
expand.type = 'button';
expand.className = 'secondary log-expand';
expand.textContent = '展开日志（最多 40 条）';
expand.setAttribute('aria-expanded', 'false');
expand.setAttribute('aria-controls', 'game-log');
expand.addEventListener('click', () => {
  const open = logPanel.classList.toggle('logs-expanded');
  expand.setAttribute('aria-expanded', String(open));
  expand.textContent = open ? '收起日志' : '展开日志（最多 40 条）';
});
logPanel.append(expand);

function setLayout(modern) {
  root.classList.toggle('ui-modern', modern);
  toggle.textContent = modern ? '切换经典布局' : '试用新版布局';
  toggle.setAttribute('aria-label', modern ? '当前为新版布局，切换经典布局' : '当前为经典布局，切换新版布局');
  if (modern) {
    details.append(rules);
    actions.append(details);
  } else {
    rulesAnchor.after(rules);
    details.remove();
  }
  try { localStorage.setItem('ar_layout_v1', modern ? 'modern' : 'classic'); } catch {}
}
let modern = true;
try { modern = localStorage.getItem('ar_layout_v1') !== 'classic'; } catch {}
setLayout(modern);
toggle.addEventListener('click', () => setLayout(!root.classList.contains('ui-modern')));
