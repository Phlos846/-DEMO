import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTasks, activeTasks, recordTaskAction, prepareTask, settleTaskDay } from '../js/tasks.js';

const fresh = () => ({ isFirstRun: false, day: 1, maxDays: 30, actionPoints: 4, maxActionPointsPerDay: 4,
  money: 1000, energy: 80, stress: 30, resumeQuality: 50, hiddenResume: 45, hiddenInterview: 45,
  log: [], playerTalents: [], transientEffects: [] });
const rollSequence = (...values) => () => values.shift() ?? .5;

test('one 10% overlap ticket per task, minimum three-day separation, maximum two active', () => {
  const s = fresh(); syncTasks(s, rollSequence(0, 0, .099));
  const first = s.limitedTask;
  s.day = 3; syncTasks(s, () => 0); assert.equal(activeTasks(s).length, 1);
  s.day = 4; syncTasks(s, rollSequence(0, 0, 0));
  assert.equal(activeTasks(s).length, 2);
  assert.equal(s.limitedTask.startedDay - first.startedDay, 3);
  for (let i = 0; i < 20; i++) syncTasks(s, () => 0);
  assert.equal(s.limitedTasks.length, 2);
  s.day = 7; syncTasks(s, () => 0);
  assert.equal(first.status, 'expired');
  assert.equal(activeTasks(s).length, 2);
  assert.equal(s.limitedTask.startedDay, 7);
});

test('failed overlap is never rerolled by refresh or later day', () => {
  const s = fresh(); syncTasks(s, rollSequence(0, 0, .1));
  s.day = 4; syncTasks(s, () => 0);
  assert.equal(s.taskNextPlan.overlapChecked, true);
  for (let i = 0; i < 10; i++) syncTasks(s, () => 0);
  s.day = 5; syncTasks(s, () => 0);
  assert.equal(activeTasks(s).length, 1);
});

test('deadline settlement leaves zero to two empty days; early exceptions obey start spacing', () => {
  for (const gapRoll of [0, .5, .99]) {
    const s = fresh(); syncTasks(s, rollSequence(0, 0, .5));
    s.day = 6; s.limitedTask.goals[0].progress = 8; settleTaskDay(s);
    syncTasks(s, rollSequence(gapRoll));
    const due = s.taskNextPlan.dueDay;
    assert.equal(due, 7 + Math.floor(gapRoll * 3));
    s.day = due; syncTasks(s, () => .5);
    assert.equal(s.limitedTask.startedDay, due);
  }
  const s = fresh(); syncTasks(s, rollSequence(0, 0, .5));
  s.limitedTask.earlyCompletion = true; s.limitedTask.goals[0].progress = 8; syncTasks(s, () => 0);
  s.day = 3; syncTasks(s, () => 0); assert.equal(activeTasks(s).length, 0);
  s.day = 4; syncTasks(s, () => 0); assert.equal(s.limitedTask.startedDay, 4);
});

test('shared actions advance both tasks; dedicated preparation only advances the selected task', () => {
  const s = fresh();
  const make = id => ({ id, name: id, startedDay: 1, deadline: 6, status: 'active', preparation: '材料准备',
    reward: { money: 10 }, goals: [{ action: 'study', target: 1, progress: 0, companies: [] }, { action: 'task_prepare', target: 1, progress: 0, companies: [] }] });
  s.limitedTasks = [make('a'), make('b')]; s.limitedTask = s.limitedTasks[1];
  recordTaskAction(s, 'study'); assert.deepEqual(s.limitedTasks.map(t => t.goals[0].progress), [1, 1]);
  assert.equal(prepareTask(s, 'a'), true);
  assert.deepEqual(s.limitedTasks.map(t => t.goals[1].progress), [1, 0]);
  assert.equal(prepareTask(s, 'a'), false);
  assert.equal(prepareTask(s, 'b'), true);
  const before = s.money; syncTasks(s, () => .5); assert.equal(s.money, before);
  s.day = 6; settleTaskDay(s); settleTaskDay(s);
  assert.equal(s.money, before + 20);
});

test('simultaneous recommendation rewards retain the correct task identity and pay only once', () => {
  const s = fresh();
  s.limitedTasks = ['a', 'b'].map(id => ({ id, name: id, startedDay: 1, deadline: 6, status: 'active',
    earlyCompletion: true, reward: { interview: 1, hiddenInterview: 2 }, goals: [{ action: 'study', target: 1, progress: 1 }] }));
  s.limitedTask = s.limitedTasks[1];
  syncTasks(s, () => .5); syncTasks(s, () => .5);
  assert.equal(s.hiddenInterview, 49);
  assert.deepEqual(s.taskInterviewRequests.map(r => r.taskId), ['a', 'b']);
});

test('simultaneous expired penalties apply independently, once', () => {
  const s = fresh(); s.day = 5;
  s.limitedTasks = ['a', 'b'].map(id => ({ id, name: id, startedDay: 1, deadline: 4, status: 'active',
    penalty: { money: -10 }, goals: [{ action: 'study', target: 1, progress: 0 }] }));
  syncTasks(s, () => .5); syncTasks(s, () => .5);
  assert.equal(s.money, 980);
  assert.deepEqual(s.limitedTasks.slice(0, 2).map(t => t.actualPenalty.money), [-10, -10]);
});

test('seeded overlap tickets stay close to 10%, independent of repeated refreshes', () => {
  let seed = 1729, overlaps = 0;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 3000; i++) {
    const s = fresh(); syncTasks(s, random);
    s.day = 4; syncTasks(s, random);
    if (activeTasks(s).length === 2) overlaps++;
  }
  assert.ok(overlaps / 3000 > .08 && overlaps / 3000 < .12, `${overlaps}/3000`);
});

test('full calendar simulations respect spacing, two-task cap and maximum two empty days', () => {
  let seed = 41;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let run = 0; run < 300; run++) {
    const s = fresh(); let empty = 0;
    for (s.day = 1; s.day <= 30; s.day++) {
      syncTasks(s, random);
      const active = activeTasks(s);
      assert.ok(active.length <= 2);
      empty = active.length ? 0 : empty + 1;
      assert.ok(empty <= 2, `run ${run}, day ${s.day}, gap ${empty}`);
    }
    for (let i = 1; i < s.limitedTasks.length; i++) assert.ok(s.limitedTasks[i].startedDay - s.limitedTasks[i - 1].startedDay >= 3);
  }
});

test('end-of-run tasks require available time and recommendations finish before confirmation closes', () => {
  const s = fresh(); s.day = 30; s.actionPoints = 0;
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask, undefined);
  s.actionPoints = 4; syncTasks(s, () => 0);
  assert.equal(s.limitedTask.deadline, 30);
  const referral = fresh(); referral.day = 28; referral.taskSeen = ['applications', 'study', 'balanced', 'research', 'work', 'rest', 'fun'];
  syncTasks(referral, () => 0);
  assert.equal(referral.limitedTask.id, 'counselor');
  assert.equal(referral.limitedTask.deadline, 29);
});
