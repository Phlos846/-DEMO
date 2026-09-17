import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { EVENT_DEFS, planEventsForCurrentDay, pickRandomEntertainmentEvent, resolveEvent } from '../js/events.js';
import { eventAvailableThisRun, eventRepeatMultiplier, recordEventAppearance } from '../js/eventRecurrence.js';

const fresh = () => Object.assign(createInitialState({ playerTalents: [] }), { day: 2 });
const definition = id => EVENT_DEFS.find(e => e.id === id);

test('five-day cooldown has exact boundary; repeated weights are 1, .3, .1', () => {
  const s = fresh(), e = definition('evt_ill');
  assert.equal(eventRepeatMultiplier(e, s), 1);
  recordEventAppearance(s, { ...e });
  s.day = 6; assert.equal(eventAvailableThisRun(e, s), false);
  s.day = 7; assert.equal(eventAvailableThisRun(e, s), true);
  assert.equal(eventRepeatMultiplier(e, s), .3);
  recordEventAppearance(s, { ...e });
  s.day = 12; assert.equal(eventRepeatMultiplier(e, s), .1);
  recordEventAppearance(s, { ...e });
  assert.equal(eventRepeatMultiplier(e, s), .1);
});

test('unique opportunities stay spent after declining; another run starts empty', () => {
  const s = fresh(), e = { ...definition('evt_side') };
  recordEventAppearance(s, e);
  assert.equal(resolveEvent(s, e, 'decline').ok, true);
  assert.equal(s.eventHistory[e.id].count, 1);
  s.day = 30; assert.equal(eventAvailableThisRun(e, s), false);
  assert.equal(eventAvailableThisRun(e, fresh()), true);
});

test('daily queue reserves IDs without counting unseen events', () => {
  const originalRandom = Math.random;
  Math.random = () => .999;
  try {
    const s = fresh(), q = planEventsForCurrentDay(s);
    assert.equal(q.length, 3);
    assert.equal(new Set(q.map(e => e.id)).size, 3);
    assert.deepEqual(s.eventHistory, {});
    assert.equal(planEventsForCurrentDay(s), q);
    recordEventAppearance(s, q[0]); recordEventAppearance(s, q[0]);
    assert.equal(s.eventHistory[q[0].id].count, 1);
    assert.equal(Object.keys(s.eventHistory).length, 1);
  } finally { Math.random = originalRandom; }
});

test('empty eligible pool stays empty, including special talent path', () => {
  const s = fresh();
  s.playerTalents = [{ id: 'clear_eyed' }];
  for (const e of EVENT_DEFS) s.eventHistory[e.id] = { count: 1, lastDay: s.day };
  const originalRandom = Math.random; Math.random = () => 0;
  try {
    assert.deepEqual(planEventsForCurrentDay(s), []);
    assert.equal(pickRandomEntertainmentEvent(s), null);
  } finally { Math.random = originalRandom; }
});

test('entertainment shares history and respects queued reservations', () => {
  const s = fresh();
  const remaining = definition('evt_ent_scratch');
  for (const e of EVENT_DEFS) {
    if (e.id !== remaining.id) s.eventHistory[e.id] = { count: 1, lastDay: s.day };
  }
  s.eventModalQueue = [{ ...remaining }];
  assert.equal(pickRandomEntertainmentEvent(s), null);
  s.eventModalQueue = [];
  const picked = pickRandomEntertainmentEvent(s);
  assert.equal(picked.id, remaining.id);
  recordEventAppearance(s, picked);
  resolveEvent(s, picked, 'leave');
  assert.equal(s.eventHistory[picked.id].count, 1);
  assert.equal(pickRandomEntertainmentEvent(s), null);
});

test('30-day seeded runs obey limits across both event sources', () => {
  const originalRandom = Math.random;
  try {
    for (let seed = 1; seed <= 80; seed++) {
      let rng = seed;
      Math.random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
      const s = fresh(), lastSeen = new Map();
      for (s.day = 2; s.day <= 30; s.day++) {
        const q = planEventsForCurrentDay(s);
        for (const e of [...q, pickRandomEntertainmentEvent(s)].filter(Boolean)) {
          if (lastSeen.has(e.id)) assert.ok(s.day - lastSeen.get(e.id) >= 5);
          recordEventAppearance(s, e); lastSeen.set(e.id, s.day);
          assert.ok(s.eventHistory[e.id].count <= (e.maxPerRun ?? Infinity));
        }
      }
    }
  } finally { Math.random = originalRandom; }
});
