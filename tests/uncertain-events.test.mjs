import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { beginEvent, resolveEvent } from '../js/events.js';
import { createQueueEvent, UNCERTAIN_EVENTS } from '../js/uncertainEvents.js';

const fresh = () => Object.assign(createInitialState({ playerTalents: [] }), {
  day: 8, actionPoints: 4, money: 5000, energy: 80, stress: 30,
  resumeQuality: 50, hiddenInterview: 45, transientEffects: [],
  eventModalQueue: [], eventHistory: {}, eventsByDay: {},
});
function roll(value, fn) {
  const saved = Math.random;
  try { Math.random = () => value; return fn(); } finally { Math.random = saved; }
}
const event = id => ({ ...UNCERTAIN_EVENTS.find(e => e.id === id) });

test('queue continuation consumes time without repeating appearance counts or rewards', () => {
  const s = fresh(), first = createQueueEvent();
  const r = roll(.9, () => resolveEvent(s, first, 'wait'));
  assert.equal(s.actionPoints, 3);
  assert.equal(s.money, 5000);
  assert.match(r.summary, /还没轮到/);
  assert.equal(resolveEvent(s, first, 'wait').ok, false);
  assert.equal(s.eventModalQueue.length, 1);
  const next = s.eventModalQueue.shift();
  assert.notEqual(next, first);
  assert.equal(next.skipRecordEvent, true);
  roll(0, () => resolveEvent(s, next, 'wait'));
  assert.equal(s.actionPoints, 2);
  assert.equal(s.money, 5150);
  assert.equal(s.eventHistory[first.id].count, 1);
  assert.equal(s.eventsByDay[8], 1);
  assert.equal(s.eventModalQueue.length, 0);
});

test('queue exhausting the last action point gives no reward even on a winning roll', () => {
  const s = fresh(); s.actionPoints = 1;
  const r = roll(0, () => resolveEvent(s, createQueueEvent(), 'wait'));
  assert.equal(s.actionPoints, 0);
  assert.equal(s.money, 5000);
  assert.equal(s.stress, 30);
  assert.equal(s.eventModalQueue.length, 0);
  assert.equal(s.day, 8);
  assert.equal(s.gameOver, false);
  assert.match(r.summary, /没有拿到/);
});

test('queue can be left between rounds and waiting cannot spend unavailable action points', () => {
  const s = fresh();
  roll(.9, () => resolveEvent(s, createQueueEvent(), 'wait'));
  resolveEvent(s, s.eventModalQueue.shift(), 'leave');
  assert.equal(s.actionPoints, 3);
  assert.equal(s.money, 5000);
  assert.equal(s.eventModalQueue.length, 0);
  s.actionPoints = 0;
  const e = createQueueEvent(); beginEvent(s, e);
  assert.equal(resolveEvent(s, e, 'wait').ok, false);
  assert.equal(s.actionPoints, 0);
  assert.equal(resolveEvent(s, e, 'leave').ok, true);
});

test('stranger help has three different outcomes and narrates the selected result', () => {
  for (const [random, money, energy, stress, words] of [
    [0, 5180, 76, 30, /感谢金/],
    [.6, 5000, 71, 36, /推销/],
    [.95, 5000, 77, 26, /没有报酬/],
  ]) {
    const s = fresh(), e = event('evt_uncertain_stranger');
    const r = roll(random, () => resolveEvent(s, e, 'help'));
    assert.deepEqual([s.money, s.energy, s.stress], [money, energy, stress]);
    assert.match(r.summary, words);
    assert.equal(resolveEvent(s, e, 'help').ok, false);
  }
});

test('book purchase validates cost and branches between useful and obsolete material', () => {
  for (const [random, quality, energy] of [[0, 54, 80], [.9, 50, 75]]) {
    const s = fresh(); roll(random, () => resolveEvent(s, event('evt_uncertain_bookstall'), 'buy'));
    assert.deepEqual([s.money, s.resumeQuality, s.energy], [4950, quality, energy]);
  }
  const s = fresh(); s.money = 49;
  assert.equal(resolveEvent(s, event('evt_uncertain_bookstall'), 'buy').ok, false);
  assert.equal(s.money, 49);
});

test('new event previews never disclose numeric rewards', () => {
  for (const e of UNCERTAIN_EVENTS) {
    assert.equal(e.interaction.mode, 'choice');
    assert.doesNotMatch(e.interaction.prompt, /[+＋]\s*\d/);
    for (const c of e.interaction.choices) assert.doesNotMatch(c.previewHint ?? c.hint, /[+＋]\s*\d|\d+\s*%/);
  }
});

