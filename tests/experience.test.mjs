import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceSnapshot, resourceChangeText, nextDayInterviewPreview } from '../js/experience.js';

test('feedback reflects actual clipped gains, costs and debt changes', () => {
  const s = { actionPoints: 4, money: 20, debt: 80, energy: 98, stress: 40, resumeQuality: 120, hiddenResume: 100, hiddenInterview: 100 };
  const before = resourceSnapshot(s);
  Object.assign(s, { actionPoints: 3, energy: 100, stress: 27.5, debt: 0, money: 40 });
  const text = resourceChangeText(s, before, ['energy', 'resumeQuality']);
  assert.match(text, /行动点 -1/);
  assert.match(text, /现金 \+20/);
  assert.match(text, /负债 -80/);
  assert.match(text, /精力 \+2（已达上限）/);
  assert.match(text, /压力 -12.5/);
  assert.match(text, /综合素质已达上限/);
});

test('next-day preview caps ordinary interviews at two and includes pending feedback without leaking results', () => {
  const s = { day: 10, maxDays: 30, interviewQueue: [{}, {}, {}, {}], resumePending: [{ notifyDay: 11, passed: false }, { notifyDay: 12, passed: true }] };
  assert.match(nextDayInterviewPreview(s), /4 场.*2 场、占用 2 行动点.*其余顺延/);
  assert.match(nextDayInterviewPreview(s), /1 份简历/);
  s.resumePending[0].passed = true;
  assert.match(nextDayInterviewPreview(s), /1 份简历/);
});

test('final-day preview includes all pending resumes and no action-point cost', () => {
  const s = { day: 29, maxDays: 30, interviewQueue: [{}, {}, {}], resumePending: [{ notifyDay: 31 }] };
  assert.match(nextDayInterviewPreview(s), /明日统一结算，不消耗行动点/);
  assert.match(nextDayInterviewPreview(s), /1 份简历/);
  s.gameOver = true;
  assert.equal(nextDayInterviewPreview(s), '');
});
