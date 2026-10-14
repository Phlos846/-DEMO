import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS, recordTaskAction, syncTasks, prepareTask, settleTaskDay } from '../js/tasks.js';
import { grantTaskInterviews, resolveTaskReferral } from '../js/task-opportunities.js';
import { expectedInterviewPass } from '../js/match.js';
import { processInterviewsAtDayStart } from '../js/interviews.js';
import { createInitialState } from '../js/state.js';
import { applyDailyAction } from '../js/actions.js';

const fresh = () => ({ isFirstRun: false, day: 3, maxDays: 30, money: 1000, energy: 80, stress: 30,
  stressMax: 100, resumeQuality: 50, log: [], playerTalents: [], transientEffects: [],
  taskSchedule: [3, 12, 21], taskScheduleUsed: 0, taskSeen: [] });

test('task starts with no retroactive credit; distinct companies and one payment', () => {
  const s = fresh(); s.appliedIds = ['old'];
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask.id, 'applications');
  assert.equal(s.limitedTask.goals[0].progress, 0);
  recordTaskAction(s, 'apply', 'company');
  recordTaskAction(s, 'apply', 'company');
  assert.equal(s.limitedTask.goals[0].progress, 1);
  for (let i = 0; i < 7; i++) recordTaskAction(s, 'apply', `new${i}`);
  syncTasks(s); assert.equal(s.money, 1000);
  s.day = s.limitedTask.deadline; settleTaskDay(s); settleTaskDay(s);
  assert.equal(s.money, 1150);
  assert.equal(s.limitedTask.status, 'completed');
});

test('deadline includes the last day; late actions expire without penalties', () => {
  const s = fresh(); syncTasks(s, () => 0);
  const originalTask = s.limitedTask;
  s.day = 8;
  recordTaskAction(s, 'apply', 'last-day');
  assert.equal(s.limitedTask.goals[0].progress, 1);
  s.day = 9;
  recordTaskAction(s, 'apply', 'too-late'); syncTasks(s);
  assert.equal(originalTask.status, 'expired');
  assert.equal(originalTask.goals[0].progress, 1);
  assert.equal(s.money, 1000);
});

test('travel starts at most one current task rather than backfilling missed days', () => {
  const s = fresh(); s.day = 15; syncTasks(s, () => 0);
  assert.equal(s.limitedTasks.length, 1);
  assert.equal(s.limitedTask.startedDay, 15);
  assert.equal(s.limitedTask.deadline, 20);
  s.day = 21; syncTasks(s, () => 0);
  assert.equal(s.limitedTask.deadline, 26);
  const active = s.limitedTask;
  syncTasks(s, () => .9);
  assert.equal(s.limitedTask, active);
  const late = fresh(); late.day = 27; late.taskSchedule = [27];
  syncTasks(late, () => 0);
  assert.equal(late.limitedTask.startedDay, 27);
  assert.equal(late.limitedTask.deadline, 30);
});

test('pool excludes fulfilled study cap and unnecessary state tasks', () => {
  const s = fresh(); s.resumeQuality = 120;
  s.taskSeen = TASKS.filter(t => !['study', 'rest', 'fun'].includes(t.id)).map(t => t.id);
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask, undefined);
});

function pickTask(s, id) {
  s.taskSeen = TASKS.filter(t => t.id !== id).map(t => t.id);
  syncTasks(s, () => TASKS.find(t => t.id === id).penalty ? .8 : 0);
  assert.equal(s.limitedTask.id, id);
}

test('attribute rewards use caps, report actual changes and pay once', () => {
  const s = fresh(); s.resumeQuality = 119; s.hiddenResume = 99;
  pickTask(s, 'portfolio_review');
  recordTaskAction(s, 'study'); recordTaskAction(s, 'study');
  syncTasks(s); assert.equal(s.resumeQuality, 119);
  s.day = s.limitedTask.deadline; settleTaskDay(s); settleTaskDay(s);
  assert.equal(s.resumeQuality, 120); assert.equal(s.hiddenResume, 100);
  assert.deepEqual(s.limitedTask.actualEffects, { resumeQuality: 1, hiddenResume: 1 });
});

test('counselor requires current quality and new preparation before interview request', () => {
  const s = fresh(); s.resumeQuality = 58;
  pickTask(s, 'counselor');
  assert.equal(s.limitedTask.goals[0].target, 60);
  recordTaskAction(s, 'study'); syncTasks(s);
  assert.equal(s.taskInterviewRequests, undefined);
  s.resumeQuality = 60; syncTasks(s); syncTasks(s);
  assert.equal(s.taskInterviewRequests.length, 1);
  assert.equal(s.limitedTask.status, 'completed');
});

test('referral produces a real interview, once, with ordinary AP and failure rules', () => {
  const s = createInitialState({ playerTalents: [] });
  s.taskInterviewRequests = [{ taskId: 'counselor', taskName: '辅导员推荐面试' }];
  s.actionPoints = 4;
  grantTaskInterviews(s); grantTaskInterviews(s);
  assert.equal(s.interviewQueue.length, 0);
  assert.equal(s.taskInterviewRequests[0].company.isStretchRole, true);
  assert.equal(resolveTaskReferral(s, s.taskInterviewRequests[0], true), true);
  assert.equal(resolveTaskReferral(s, s.taskInterviewRequests[0], true), false);
  assert.equal(s.interviewQueue.length, 1);
  assert.notEqual(s.interviewQueue[0].company.hiddenTag?.id, 'hid_pyramid');
  assert.ok(s.interviewQueue[0].company.tags.salary);
  const saved = Math.random;
  try { Math.random = () => .999; processInterviewsAtDayStart(s); }
  finally { Math.random = saved; }
  assert.equal(s.actionPoints, 3);
  assert.equal(s.offers.length, 0);
});

test('declining referral retains immediate ability reward and grants cash once', () => {
  const s = Object.assign(createInitialState({ playerTalents: [] }), fresh());
  s.resumeQuality = 58; s.hiddenInterview = 45;
  pickTask(s, 'counselor'); recordTaskAction(s, 'study');
  s.resumeQuality = 60; syncTasks(s); grantTaskInterviews(s);
  assert.equal(s.hiddenInterview, 47);
  const request = s.taskInterviewRequests[0];
  assert.equal(resolveTaskReferral(s, request, false), true);
  assert.equal(resolveTaskReferral(s, request, false), false);
  assert.equal(resolveTaskReferral(s, request, true), false);
  assert.equal(s.money, 1100); assert.equal(s.hiddenInterview, 47);
  assert.equal(s.interviewQueue.length, 0);
});

test('referral bonus adds fifteen points before energy penalty and keeps cap', () => {
  const s = Object.assign(createInitialState({ playerTalents: [] }), fresh());
  s.traits.education = { id: 'edu_puben', tier: 3 };
  s.hiddenInterview = 45; s.resumeQuality = 60;
  s.taskInterviewRequests = [{ taskId: 'counselor', taskName: '辅导员推荐面试' }];
  grantTaskInterviews(s);
  const company = s.taskInterviewRequests[0].company;
  const ordinary = expectedInterviewPass(s, { ...company, taskInterviewBonus: 0 }, false);
  const boosted = expectedInterviewPass(s, company, false);
  assert.ok(ordinary > .025 && ordinary < .77);
  assert.ok(Math.abs(boosted - ordinary - .15) < 1e-8);
  s.energy = 10;
  assert.ok(Math.abs(expectedInterviewPass(s, company, false) - boosted * .55) < 1e-8);
  s.energy = 100; company.taskInterviewBonus = 10;
  assert.equal(expectedInterviewPass(s, company, false), .92);
});

test('pending referral survives later task; deadline and game over prevent decisions', () => {
  const s = Object.assign(createInitialState({ playerTalents: [] }), fresh());
  s.taskInterviewRequests = [{ taskId: 'counselor', taskName: '辅导员推荐面试' }];
  grantTaskInterviews(s);
  const request = s.taskInterviewRequests[0];
  s.limitedTask = { id: 'another' }; grantTaskInterviews(s);
  assert.equal(request.status, 'pending');
  s.gameOver = true; assert.equal(resolveTaskReferral(s, request, false), false);
  s.gameOver = false; s.day = 30; grantTaskInterviews(s);
  assert.equal(request.status, 'expired');
  assert.equal(resolveTaskReferral(s, request, false), false);
  assert.equal(s.money, 1000);
});

test('preparation consumes AP and energy once; expired obligations penalize once', () => {
  const s = fresh(); s.actionPoints = 1;
  pickTask(s, 'graduation_materials');
  assert.equal(s.limitedTask.deadline, 5);
  assert.equal(prepareTask(s), true);
  assert.equal(prepareTask(s), false);
  assert.equal(s.actionPoints, 0); assert.equal(s.energy, 76);
  syncTasks(s); s.day = 6; syncTasks(s);
  assert.equal(s.limitedTask.status, 'completed');
  const late = fresh(); late.actionPoints = 0;
  pickTask(late, 'graduation_materials');
  assert.equal(prepareTask(late), false);
  late.day = 6; syncTasks(late); const after = late.stress; syncTasks(late);
  assert.equal(late.stress, after); assert.ok(after > 30);
  assert.equal(late.limitedTask.status, 'expired');
});

test('cash penalty becomes debt when funds are insufficient and is visible', () => {
  const s = fresh(); s.money = 0; s.debt = 0;
  pickTask(s, 'bill_buffer');
  s.day = 7; syncTasks(s); syncTasks(s);
  assert.equal(s.money, 0); assert.equal(s.debt, 60);
  assert.equal(s.limitedTask.actualPenalty.debt, 60);
});

test('a run receives at most one obligation; later windows stay optional', () => {
  const s = fresh(); pickTask(s, 'graduation_materials');
  s.day = 6; syncTasks(s);
  s.taskSeen = ['graduation_materials'];
  s.day = 12; syncTasks(s, () => .99);
  assert.equal(s.limitedTask.penalty, undefined);
});

test('finished and cheat runs do not incur penalties through preparation handler', () => {
  for (const flag of ['gameOver', 'godMode']) {
    const s = fresh(); pickTask(s, 'graduation_materials');
    s.day = 6; s[flag] = true;
    assert.equal(prepareTask(s), false);
    assert.equal(s.stress, 30);
  }
});

test('completed mixed goal needs both actions; all task IDs differ across a run', () => {
  const s = fresh(); s.taskSeen = ['applications', 'study'];
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask.id, 'balanced');
  recordTaskAction(s, 'study'); recordTaskAction(s, 'study');
  syncTasks(s);
  assert.equal(s.limitedTask.status, 'active');
  for (let i = 0; i < 4; i++) recordTaskAction(s, 'apply', `co${i}`);
  syncTasks(s); assert.equal(s.money, 1000);
  s.day = s.limitedTask.deadline; settleTaskDay(s);
  assert.equal(s.money, 1180);
  s.day = 12; syncTasks(s, () => 0);
  assert.equal(s.limitedTask.id, 'research');
});

test('no task rewards after game over, cheating or a fatal action', () => {
  for (const patch of [{ gameOver: true }, { godMode: true }, { energy: 0 }, { stress: 100 }]) {
    const s = fresh(); syncTasks(s, () => 0);
    s.limitedTask.goals[0].progress = 8;
    Object.assign(s, patch); syncTasks(s);
    assert.equal(s.money, 1000);
  }
});

test('real daily actions feed the task without relying on owned strategies', () => {
  const s = Object.assign(createInitialState({ playerTalents: [] }), fresh(), {
    personalityActionMods: {}, strategies: [] });
  s.taskSeen = ['applications']; syncTasks(s, () => 0);
  assert.equal(s.limitedTask.id, 'study');
  applyDailyAction(s, 'rest');
  assert.equal(s.limitedTask.goals[0].progress, 0);
  applyDailyAction(s, 'study');
  assert.equal(s.limitedTask.goals[0].progress, 1);
});
