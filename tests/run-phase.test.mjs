import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTasks } from '../js/tasks.js';
import { planEventsForCurrentDay, sampleEventCountForToday, tryEntertainmentEvent, pickRandomEntertainmentEvent, tryStudyOverloadEvent, tryStudyBreakthroughEvent } from '../js/events.js';

const fresh = first => ({ isFirstRun: first, day: 1, maxDays: 30, actionPoints: 4, money: 1000,
  energy: 80, stress: 30, resumeQuality: 50, hiddenInterview: 45, log: [], playerTalents: [], transientEffects: [],
  eventsByDay: {}, eventModalQueue: [], studyByDay: { 1: 6 }, entertainmentMisses: 7 });

test('first-run days 1 through 3 suppress all random event entry points and preserve entertainment pity', () => {
  const s = fresh(true);
  for (s.day = 1; s.day <= 3; s.day++) {
    assert.equal(sampleEventCountForToday(s), 0);
    assert.deepEqual(planEventsForCurrentDay(s), []);
    assert.equal(tryEntertainmentEvent(s, () => 0), null);
    assert.equal(pickRandomEntertainmentEvent(s), null);
    assert.equal(tryStudyOverloadEvent(s), null);
    assert.equal(s.studyOverloadDebuffUntilDay, undefined);
    s.studyOverloadDebuffUntilDay = 6; s.studyCountWhileOverloadDebuff = 4;
    assert.equal(tryStudyBreakthroughEvent(s), null);
    s.studyOverloadDebuffUntilDay = undefined;
    assert.equal(s.entertainmentMisses, 7);
    syncTasks(s, () => 0);
    assert.equal(s.limitedTask, undefined);
  }
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask.startedDay, 4);
  assert.equal(s.limitedTask.deadline, 9);
  assert.equal(s.limitedTask.announced, false);
  assert.ok(sampleEventCountForToday(s) >= 1);
});

test('repeat runs issue an opening task on day 1 even at the latest random schedule roll', () => {
  const s = fresh(false);
  syncTasks(s, () => .99);
  assert.equal(s.taskSchedule[0], 1);
  assert.equal(s.limitedTask.startedDay, 1);
  const task = s.limitedTask;
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask, task);
  assert.equal(s.taskSeen.length, 1);
});

test('without an overlap ticket an active task waits, then the next task follows within two empty days', () => {
  const s = fresh(false); syncTasks(s, () => 0);
  s.taskNextPlan.overlap = false;
  const task = s.limitedTask;
  task.deadline = 15; s.day = 12;
  syncTasks(s, () => 0);
  assert.equal(s.limitedTask, task);
  assert.equal(s.taskScheduleUsed, 1);
  s.day = 16; syncTasks(s, () => 0);
  assert.equal(task.status, 'expired');
  assert.notEqual(s.limitedTask, task);
  assert.equal(s.taskSeen.length, 2);
  assert.equal(s.limitedTask.startedDay, 16);
});
