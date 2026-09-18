import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { computeEnding } from '../js/endings.js';

function fresh(degrees = []) {
  const s = createInitialState({ playerTalents: [] });
  s.traits = { ...s.traits, extraDegrees: degrees.map(id => ({ id })) };
  return Object.assign(s, { stress: 20, energy: 80, debt: 0, offers: [], studyPivotHidden: 42 });
}

test('masters and doctoral degrees exclude postgrad without rerolling; double degrees remain eligible', () => {
  const original = Math.random;
  try {
    Math.random = () => 0;
    for (const degrees of [['extra_master'], ['extra_phd'], ['extra_master', 'extra_phd']]) {
      const s = fresh(degrees);
      assert.notEqual(computeEnding(s).id, 'postgrad_tv');
      assert.equal(s.studyPivotBranch, null);
      assert.notEqual(computeEnding(s).id, 'civil_tv');
    }
    for (const degrees of [[], ['extra_double']]) assert.equal(computeEnding(fresh(degrees)).id, 'postgrad_tv');
  } finally { Math.random = original; }
});

test('graduate degrees keep the civil branch and invalidate cached postgrad results', () => {
  const original = Math.random;
  try {
    Math.random = () => 0.75;
    for (const id of ['extra_master', 'extra_phd']) {
      const s = fresh([id]);
      assert.equal(computeEnding(s).id, 'civil_tv');
      s.studyPivotBranch = 'postgrad';
      assert.notEqual(computeEnding(s).id, 'postgrad_tv');
      assert.equal(s.studyPivotBranch, null);
    }
  } finally { Math.random = original; }
});
