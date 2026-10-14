import { applyMoneyDelta, applyEnergyDelta, applyStressDelta } from './talentRuntime.js?v=1.1.42';
import { inFirstRunIntro } from './run-phase.js?v=1.1.42';

// Goals count successful player actions after the task appears, never outcomes of RNG.
export const TASKS = [
  { id: 'applications', name: '拓宽选择', story: '就业中心开放了本期求职补贴，将在截止日核对投递记录后发放。', goals: [{ action: 'apply', target: 8, label: '投递不同企业' }], reward: 150 },
  { id: 'study', name: '准备练习', story: '校友提供了一笔学习资料补贴，鼓励持续准备。', goals: [{ action: 'study', target: 3, label: '完成学习' }], reward: 120,
    eligible: s => s.resumeQuality < (s.resumeQualityMax ?? 120) },
  { id: 'balanced', name: '准备与尝试', story: '求职互助小组邀请你把准备付诸行动，完成后返还一笔资料费用。', goals: [{ action: 'study', target: 2, label: '完成学习' }, { action: 'apply', target: 4, label: '投递不同企业' }], reward: 180 },
  { id: 'research', name: '多问一步', story: '校友正在整理岗位信息，为认真核对企业情况的同学提供通讯补贴。', goals: [{ action: 'reveal', target: 3, label: '侧面打听不同企业' }], reward: 120 },
  { id: 'work', name: '短期协作', story: '兼职平台开放了短期协作奖励，截止日核对两次短工记录后统一发放。', goals: [{ action: 'work', target: 2, label: '完成短工' }], reward: 100 },
  { id: 'rest', name: '留出休息', story: '同学约定一起调整作息，完成计划后请你吃一顿饭，餐费已留好。', goals: [{ action: 'rest', target: 3, label: '完成休息' }], reward: 100,
    eligible: s => s.energy < 70 || s.stress >= 45 },
  { id: 'fun', name: '走出准备室', story: '校园活动提供参与补贴，给紧张的准备日程留一点空闲。', goals: [{ action: 'fun', target: 2, label: '完成娱乐' }], reward: 100,
    eligible: s => s.money >= 300 && s.stress >= 40 },
];

const qualityGoal = target => ({ stat: 'resumeQuality', target, label: '综合素质达到' });
const actionGoal = (action, target, label) => ({ action, target, label });
const nextQuality = s => Math.min(100, Math.max(60, Math.floor(s.resumeQuality / 10) * 10 + 10));
TASKS.push(
  { id: 'counselor', name: '辅导员推荐面试', story: '辅导员收到一家合作企业的面试名额。请先完善准备，达到要求后可直接进入面试。',
    goalsFor: s => [qualityGoal(nextQuality(s)), actionGoal('study', 1, '完成一次准备学习')], reward: { interview: 1, hiddenInterview: 2 },
    earlyCompletion: true, eligible: s => s.resumeQuality >= 50 && s.resumeQuality < 100 },
  { id: 'alumni_interview', name: '校友团队补招', story: '校友所在团队临时补招，愿意推荐了解岗位、基础准备充分的同学直接面试。',
    goals: [qualityGoal(65), actionGoal('reveal', 1, '侧面打听企业')], reward: { interview: 1, hiddenInterview: 2 },
    earlyCompletion: true, eligible: s => s.resumeQuality >= 55 },
  { id: 'portfolio_review', name: '作品集集中评阅', story: '专业老师愿意集中评阅项目材料，认真准备后会提供修改意见。',
    goals: [actionGoal('study', 2, '完成学习')], reward: { resumeQuality: 3, hiddenResume: 2 },
    eligible: s => s.resumeQuality < (s.resumeQualityMax ?? 120) },
  { id: 'mock_interview', name: '就业中心模拟面试', story: '就业中心开放模拟面试点评。先完成两次准备，老师会帮你梳理表达和回答。',
    goals: [actionGoal('study', 2, '完成学习')], reward: { hiddenInterview: 4 },
    eligible: s => s.hiddenInterview < 100 },
  { id: 'resume_revision', name: '投递后的简历复核', story: '求职互助小组邀请你复核材料，再提交几份申请，学长会提供修改建议。',
    goals: [actionGoal('study', 1, '完成学习'), actionGoal('apply', 3, '投递不同企业')], reward: { hiddenResume: 3, resumeQuality: 1 },
    eligible: s => (s.appliedIds?.length ?? 0) >= 8 },
  { id: 'presentation', name: '项目展示邀请', story: '学院邀请你参加项目展示。准备内容后，还需要花时间整理展示材料。',
    goals: [actionGoal('study', 1, '完成学习'), actionGoal('task_prepare', 1, '整理展示材料')],
    reward: { hiddenInterview: 3, money: 80 }, preparation: '整理展示材料' },
  { id: 'graduation_materials', name: '毕业材料核对', story: '学院通知补齐毕业材料，需要花一点时间核对。逾期会收到催办提醒。',
    goals: [actionGoal('task_prepare', 1, '核对毕业材料')], reward: { stress: -5, resumeQuality: 1 },
    earlyCompletion: true, penalty: { stress: 5 }, duration: 3, preparation: '核对毕业材料' },
  { id: 'course_review', name: '课程复习提醒', story: '课程考核临近，老师提醒尽快复习。拖到截止后再补准备，会增加压力。',
    goals: [actionGoal('study', 2, '完成复习学习')], reward: { hiddenInterview: 2, stress: -4 },
    penalty: { stress: 6 }, duration: 4 },
  { id: 'bill_buffer', name: '账单前的资金准备', story: '一笔账单即将到期。完成一次短工可获得协作补贴，逾期仍未准备会产生额外费用。',
    goals: [actionGoal('work', 1, '完成短工')], reward: { money: 60, stress: -4 },
    penalty: { money: -60, stress: 3 }, duration: 4,
    eligible: s => (s.debt ?? 0) > 0 || s.money < 800 },
);

export function taskEffectText(effects) {
  if (typeof effects === 'number') effects = { money: effects };
  const labels = { money: '现金', debt: '负债', resumeQuality: '综合素质', hiddenResume: '简历能力', hiddenInterview: '面试能力', energy: '精力', stress: '压力' };
  const parts = Object.entries(effects ?? {}).filter(([key, value]) => labels[key] && value !== 0)
    .map(([key, value]) => `${labels[key]} ${value > 0 ? '+' : ''}${value}${key === 'money' || key === 'debt' ? ' 元' : ''}`);
  if (effects?.interview) parts.push('一次优质岗位推荐（可接受或放弃）');
  return parts.join('，') || '无额外变化';
}

function applyEffects(s, effects, task) {
  if (typeof effects === 'number') effects = { money: effects };
  const actual = {};
  const debtBefore = s.debt ?? 0;
  for (const [key, delta] of Object.entries(effects ?? {})) {
    if (key === 'interview') {
      s.taskInterviewRequests ??= [];
      s.taskInterviewRequests.push({ taskId: task.id, taskName: task.name });
      actual.interview = 1;
      continue;
    }
    const before = s[key] ?? 0;
    if (key === 'money') applyMoneyDelta(s, delta);
    else if (key === 'energy') applyEnergyDelta(s, delta);
    else if (key === 'stress') applyStressDelta(s, delta, 'event');
    else if (['resumeQuality', 'hiddenResume', 'hiddenInterview'].includes(key)) {
      s[key] = Math.max(0, Math.min(key === 'resumeQuality' ? (s.resumeQualityMax ?? 120) : 100, before + delta));
    }
    actual[key] = Math.round(((s[key] ?? 0) - before) * 100) / 100;
  }
  if ((s.debt ?? 0) > debtBefore) actual.debt = s.debt - debtBefore;
  return actual;
}

function log(s, text) {
  s.log ??= [];
  s.log.unshift({ day: s.day, msg: `【限时任务】${text}` });
  if (s.log.length > 80) s.log.pop();
}
export const TASK_OVERLAP_CHANCE = .1;
export const TASK_START_INTERVAL = 3;
export const TASK_MAX_ACTIVE = 2;
export function taskList(s) {
  s.limitedTasks ??= s.limitedTask ? [s.limitedTask] : [];
  return s.limitedTasks;
}
export const activeTasks = s => taskList(s).filter(t => t.status === 'active');
const alive = s => !s.gameOver && !s.godMode && s.energy > 0 && s.stress < (s.stressMax ?? 100);
export const taskCanFinishEarly = task => task.earlyCompletion ?? TASKS.find(t => t.id === task.id)?.earlyCompletion ?? false;
export function taskGoalsMet(s, task) {
  for (const goal of task.goals.filter(g => g.stat)) goal.progress = Math.max(0, Math.min(goal.target, s[goal.stat] ?? 0));
  return task.goals.every(g => g.progress >= g.target);
}
function complete(s, task, day = s.day) {
  task.status = 'completed'; task.endedDay = day;
  task.actualEffects = applyEffects(s, task.reward, task);
  task.actualReward = task.actualEffects.money ?? 0;
  log(s, `「${task.name}」已完成：${taskEffectText(task.actualEffects)}。`);
}
function settle(s, task) {
  if (taskGoalsMet(s, task)) { complete(s, task, task.deadline); return; }
  task.status = 'expired'; task.endedDay = task.deadline;
  task.actualPenalty = task.penalty ? applyEffects(s, task.penalty, task) : null;
  log(s, `「${task.name}」已到期，${task.penalty ? `逾期影响：${taskEffectText(task.actualPenalty)}` : '未完成不受惩罚'}。`);
}
// Called before advancing the calendar, including the final day and travel skips.
export function settleTaskDay(s) {
  if (!alive(s)) return;
  for (const task of activeTasks(s)) {
    if (s.day < task.deadline) continue;
    settle(s, task);
    if (!alive(s)) break;
  }
}
function expire(s) {
  for (const task of activeTasks(s)) {
    if (s.day <= task.deadline) continue;
    settle(s, task);
    if (!alive(s)) break;
  }
}

export function recordTaskAction(s, action, companyId, taskId) {
  if (!alive(s) || inFirstRunIntro(s)) return;
  expire(s);
  if (!alive(s)) return;
  for (const task of activeTasks(s)) {
    if (s.day < task.startedDay || (action === 'task_prepare' && task.id !== taskId)) continue;
    const goal = task.goals.find(x => x.action === action);
    if (!goal || goal.progress >= goal.target) continue;
    if (action === 'apply' || action === 'reveal') {
      if (!companyId || goal.companies.includes(companyId)) continue;
      goal.companies.push(companyId);
    }
    goal.progress++;
  }
}

export function prepareTask(s, taskId) {
  if (!alive(s) || s.applySession) return false;
  expire(s);
  const task = activeTasks(s).find(t => taskId ? t.id === taskId : t.preparation);
  if (!alive(s) || !task?.preparation || s.actionPoints < 1) return false;
  const goal = task.goals.find(g => g.action === 'task_prepare');
  if (!goal || goal.progress >= goal.target) return false;
  s.actionPoints--;
  applyEnergyDelta(s, -4);
  recordTaskAction(s, 'task_prepare', undefined, task.id);
  log(s, `${task.preparation}：行动点 -1，精力消耗基础值 4。`);
  return true;
}

function taskFitsRemainingDays(def, s) {
  const days = (def.reward?.interview ? s.maxDays - 1 : s.maxDays) - s.day + 1;
  if (days <= 0) return false;
  const goals = def.goalsFor?.(s) ?? def.goals;
  let ap = 0;
  for (const goal of goals) {
    if (goal.action === 'work' && goal.target > days - (s.lastWorkDay === s.day ? 1 : 0)) return false;
    if (goal.action === 'study') ap += goal.target * 2;
    else if (goal.action === 'apply') ap += Math.ceil(goal.target / 5);
    else if (goal.action === 'reveal') ap += 1;
    else if (goal.action) ap += goal.target;
  }
  return ap <= (s.actionPoints ?? 4) + (days - 1) * (s.maxActionPointsPerDay ?? 4);
}
function issueTask(s, random) {
  const eligible = TASKS.filter(t => !s.taskSeen.includes(t.id) && (!t.eligible || t.eligible(s)) && taskFitsRemainingDays(t, s));
  const obligations = eligible.filter(t => t.penalty && !s.taskPenaltyIssued);
  const opportunities = eligible.filter(t => !t.penalty);
  const pool = random() >= .75 && obligations.length ? obligations : opportunities;
  if (!pool.length) return false;
  const def = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  const task = { id: def.id, name: def.name, story: def.story, reward: def.reward,
    penalty: def.penalty, preparation: def.preparation, earlyCompletion: def.earlyCompletion ?? false,
    startedDay: s.day, deadline: Math.min(def.reward?.interview ? s.maxDays - 1 : s.maxDays, s.day + (def.duration ?? 6) - 1), status: 'active', announced: false,
    goals: (def.goalsFor?.(s) ?? def.goals).map(g => ({ ...g, progress: g.stat ? Math.min(g.target, s[g.stat] ?? 0) : 0, companies: [] })) };
  taskList(s).push(task); s.limitedTask = task; // Compatibility alias; gameplay reads the collection.
  s.taskSeen.push(def.id);
  s.taskScheduleUsed = (s.taskScheduleUsed ?? 0) + 1;
  if (def.penalty) s.taskPenaltyIssued = true;
  // One overlap ticket per newly issued task, never one roll per refresh/day.
  s.taskNextPlan = { earliestDay: s.day + TASK_START_INTERVAL, overlap: random() < TASK_OVERLAP_CHANCE, overlapChecked: false, dueDay: null };
  log(s, `「${def.name}」：第 ${task.deadline} 天结束前完成。奖励：${taskEffectText(def.reward)}。${def.penalty ? `逾期影响：${taskEffectText(def.penalty)}。` : '未完成无惩罚。'}`);
  return true;
}

export function syncTasks(s, random = Math.random) {
  if (!alive(s)) return;
  s.taskSeen ??= [];
  s.taskFirstDay ??= s.taskSchedule?.[0] ?? (s.isFirstRun === false ? 1 : (s.isFirstRun === true ? 4 : 3) + Math.floor(random() * 3));
  s.taskSchedule ??= [s.taskFirstDay];
  if (inFirstRunIntro(s)) return;
  expire(s);
  if (!alive(s)) return;
  for (const task of activeTasks(s)) {
    if (!taskGoalsMet(s, task) || !taskCanFinishEarly(task)) continue;
    complete(s, task);
    if (!alive(s)) return;
  }
  if (s.applySession || s.day > s.maxDays) return;
  const all = taskList(s), active = activeTasks(s);
  if (active.length >= TASK_MAX_ACTIVE) return;
  if (!all.length) { if (s.day >= s.taskFirstDay) issueTask(s, random); return; }
  const latest = all.at(-1);
  const plan = s.taskNextPlan ??= { earliestDay: latest.startedDay + TASK_START_INTERVAL, overlap: false, overlapChecked: true, dueDay: null };
  if (s.day < plan.earliestDay) return;
  if (active.length) {
    if (!plan.overlapChecked) {
      plan.overlapChecked = true;
      if (plan.overlap) issueTask(s, random);
    }
    return;
  }
  if (plan.dueDay == null) {
    const endedDay = Math.max(...all.map(t => t.endedDay ?? t.deadline));
    // Gap means full empty calendar days: 0, 1 or 2 after the last task ends.
    plan.dueDay = Math.max(plan.earliestDay, endedDay + 1 + Math.floor(random() * 3));
  }
  if (s.day >= plan.dueDay) issueTask(s, random);
}
