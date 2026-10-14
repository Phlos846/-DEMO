import { prepareTask, taskEffectText, taskList, activeTasks, taskCanFinishEarly, taskGoalsMet } from './tasks.js?v=1.1.42';
import { resolveTaskReferral, REFERRAL_DECLINE_CASH } from './task-opportunities.js?v=1.1.42';
import { rememberDisclosures, disclosure, resourceSnapshot, showResourceFeedback } from './experience.js?v=1.1.42';

function paragraph(root, text, className = 'hint') {
  const p = document.createElement('p'); p.className = className; p.textContent = text; root.append(p); return p;
}
export function renderTask(s, refresh) {
  const root = document.getElementById('limited-task-panel');
  const all = taskList(s), active = activeTasks(s).sort((a, b) => a.deadline - b.deadline);
  const referrals = (s.taskInterviewRequests ?? []).filter(r => r.company);
  rememberDisclosures(root); root.replaceChildren();
  root.classList.toggle('hidden', (!all.length && !referrals.length) || s.godMode);
  if ((!all.length && !referrals.length) || s.godMode) return;
  paragraph(root, `进行中 ${active.length} / 2`, 'hint');
  for (const task of active) {
    const item = document.createElement('article'); item.className = 'limited-task-item'; item.dataset.taskId = task.id;
    renderTaskItem(item, s, task, refresh); root.append(item);
  }
  const rules = disclosure(`${s.careerRunId}:task-rules`, '任务规则');
  paragraph(rules, '只统计任务出现后的行动。多数任务在截止日结束时校核，标明即时结算的任务达标即领奖；未标明逾期影响的任务无惩罚。数值受天赋、状态及上限影响。');
  paragraph(rules, '最多两项同时进行。普通行动可推进两项任务，专用准备分别计数；逾期影响只结算一次，现金不足部分计入负债。');
  root.append(rules);
  const finished = all.filter(t => t.status !== 'active');
  if (finished.length) {
    const history = disclosure(`${s.careerRunId}:task-history`, `已处理任务 · ${finished.length} 项`, 'task-history');
    for (const task of finished.slice().reverse()) {
      const item = document.createElement('article'); item.className = 'limited-task-item';
      renderTaskItem(item, s, task, refresh); history.append(item);
    }
    root.append(history);
  }
  for (const referral of referrals) renderReferral(root, s, referral, refresh);
}
function renderTaskItem(root, s, task, refresh) {
  if (task) {
    let body = root;
    if (task.status !== 'active') {
      body = disclosure(`${s.careerRunId}:task:${task.id}:${task.status}`, `${task.status === 'completed' ? '已完成' : '已到期'} · ${task.name}`, 'completed-task');
      root.append(body);
      const effects = { ...(task.actualEffects ?? { money: task.actualReward }) }; delete effects.interview;
      paragraph(root, task.status === 'completed' ? `实际收益：${taskEffectText(effects)}${task.actualEffects?.interview ? '；岗位推荐见下方' : ''}`
        : task.penalty ? `实际影响：${taskEffectText(task.actualPenalty)}` : '未完成。');
    } else {
      const heading = document.createElement('h2'); heading.textContent = `${task.penalty ? '限时事务' : '限时机会'} · ${task.name}`; root.append(heading);
      paragraph(root, `剩余 ${Math.max(0, task.deadline - s.day + 1)} 天 · 第 ${task.deadline} 天结束截止（含当天）`, 'task-deadline');
      paragraph(root, taskCanFinishEarly(task) ? '达标即结算' : taskGoalsMet(s, task) ? '已达标，等待截止日校核' : '截止日结束时统一校核', 'hint');
    }
    for (const goal of task.goals) {
      const row = document.createElement('div'); row.className = 'task-goal';
      paragraph(row, goal.label, 'task-goal-label');
      paragraph(row, `${goal.progress} / ${goal.target}`, 'task-goal-count');
      const progress = document.createElement('progress'); progress.max = goal.target; progress.value = goal.progress;
      progress.setAttribute('aria-label', goal.label); row.append(progress); body.append(row);
    }
    if (task.status === 'active') {
      paragraph(root, `奖励：${taskEffectText(task.reward)}`, 'task-reward');
      if (task.penalty) paragraph(root, `逾期：${taskEffectText(task.penalty)}`, 'task-penalty');
      if (task.preparation) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary';
        button.textContent = `${task.preparation} · 1 行动点 · 基础 4 精力`;
        button.disabled = s.gameOver || s.actionPoints < 1 || !!s.applySession || task.goals.find(g => g.action === 'task_prepare').progress >= 1;
        button.addEventListener('click', () => {
          const before = resourceSnapshot(s);
          if (prepareTask(s, task.id)) { refresh(); showResourceFeedback(s, before, task.preparation); }
        });
        root.append(button);
      }
      const info = disclosure(`${s.careerRunId}:task:${task.id}:info`, '任务说明');
      paragraph(info, task.story);
      root.append(info);
    }
  }
}

const qualityLabels = { premium: '顶薪', excellent: '极好', good: '好', normal: '一般', bad: '差' };
function companyTags(root, company, key) {
  const tags = [ ['待遇', company.tags.treatment], ...company.tags.reputation.map(tag => ['风评', tag]) ];
  const row = document.createElement('div'); row.className = 'referral-tags';
  for (const [type, tag] of tags) {
    const item = disclosure(`${key}:${tag.id}`, tag.label, 'referral-tag-detail');
    item.querySelector('summary').className = `tag tag-q-${tag.quality}`;
    paragraph(item, `${type} · ${qualityLabels[tag.quality] ?? '一般'}`); row.append(item);
  }
  root.append(row);
}
function renderReferral(root, s, referral, refresh) {
  const company = referral.company, key = `${s.careerRunId}:referral:${company.id}`;
  const pending = referral.status === 'pending';
  const card = pending ? document.createElement('div') : disclosure(`${key}:${referral.status}`, `${company.name} · ${referral.status === 'accepted' ? '已接受' : referral.status === 'declined' ? '已放弃' : '已到期'}`, 'referral-card completed-referral');
  if (pending) { card.className = 'referral-card'; const title = document.createElement('h3'); title.textContent = `岗位推荐 · ${company.name}`; card.append(title); }
  paragraph(card, company.tags.salary.label, `referral-salary ${company.tags.salary.quality === 'premium' ? 'tag-premium' : ''}`);
  companyTags(card, company, key);
  if (pending) {
    paragraph(card, `第 ${referral.deadline} 天结束前确认。两种选择都保留已到账的能力奖励。`);
    const choices = document.createElement('div'); choices.className = 'referral-choices';
    for (const [accept, label, benefit] of [[true, '接受推荐', '跳过初筛 · 该场基础成功率 +15 个百分点'], [false, '放弃推荐', `资料补贴 +${REFERRAL_DECLINE_CASH} 元 · 不耗行动点`]]) {
      const choice = document.createElement('div');
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = accept ? 'primary' : 'secondary'; btn.textContent = label;
      btn.disabled = s.gameOver || !!s.applySession;
      btn.addEventListener('click', () => { const before = resourceSnapshot(s); if (resolveTaskReferral(s, referral, accept)) { refresh(); showResourceFeedback(s, before, label); } });
      choice.append(btn); paragraph(choice, benefit); choices.append(choice);
    }
    card.append(choices);
    const info = disclosure(`${key}:rules`, '面试安排');
    paragraph(info, '加成受精力、压力和成功率上限限制，不保证录用。普通日面试消耗 1 行动点，截止日沿用统一结算规则。未确认到期不发放弃补贴。');
    card.append(info);
  } else {
    paragraph(card, referral.status === 'accepted' ? '面试已加入队列。' : referral.status === 'declined' ? `资料补贴 ${referral.declineCash} 元已到账。` : '确认期限已过，能力奖励保留。');
  }
  root.append(card);
}
