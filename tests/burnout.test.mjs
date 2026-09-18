import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { finishHighStressDay } from '../js/burnout.js';
import { computeEnding } from '../js/endings.js';
import { simulateForwardNaturalDays } from '../js/events.js';

const fresh = () => Object.assign(createInitialState({ playerTalents: [] }), {
  day: 1, energy: 80, stress: 85, debt: 0, offers: [],
});

test('three consecutive high-pressure day ends trigger burnout, once per day', () => {
  const s = fresh();
  assert.equal(finishHighStressDay(s), false);
  assert.equal(finishHighStressDay(s), false);
  assert.equal(s.highStressDays, 1);
  s.day++;
  assert.equal(finishHighStressDay(s), false);
  s.day++;
  assert.equal(finishHighStressDay(s), true);
  assert.equal(s.gameOver, true);
  assert.equal(computeEnding(s).id, 'burnout');
  s.stress = 0;
  assert.equal(computeEnding(s).id, 'burnout');
});

test('pressure below 85 at day end resets the streak; unsampled gaps break it', () => {
  const s = fresh();
  finishHighStressDay(s);
  s.day++; s.stress = 84.9;
  finishHighStressDay(s);
  assert.equal(s.highStressDays, 0);
  s.day++; s.stress = 85;
  finishHighStressDay(s);
  assert.equal(s.highStressDays, 1);
  s.day += 2;
  finishHighStressDay(s);
  assert.equal(s.highStressDays, 1);
});

test('settlement threshold is 85 even without an early-ending streak', () => {
  const s = fresh();
  assert.equal(computeEnding(s).id, 'burnout');
  s.stress = 84.9;
  assert.notEqual(computeEnding(s).id, 'burnout');
});

test('instant resource failures take precedence; god mode ignores early burnout', () => {
  for (const [patch, ending] of [[{ energy: 0 }, 'vital_energy'], [{ stress: 100 }, 'vital_stress']]) {
    const s = Object.assign(fresh(), { day: 3, burnoutCheckedDay: 2, highStressDays: 2 }, patch);
    assert.equal(finishHighStressDay(s), true);
    assert.equal(computeEnding(s).id, ending);
    assert.equal(s.burnoutEarlyEnd, false);
  }
  const s = Object.assign(fresh(), { godMode: true });
  for (s.day = 1; s.day <= 5; s.day++) assert.equal(finishHighStressDay(s), false);
  assert.equal(s.gameOver, false);
});

test('event time jumps stop immediately at the third high-pressure day end', () => {
  const s = Object.assign(fresh(), { day: 10, burnoutCheckedDay: 9, highStressDays: 2 });
  simulateForwardNaturalDays(s, 3);
  assert.equal(s.day, 10);
  assert.equal(s.highStressDays, 3);
  assert.equal(s.gameOver, true);
  assert.equal(computeEnding(s).id, 'burnout');
});
