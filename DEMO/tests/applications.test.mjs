import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { startApplySession, getCurrentCompany, skipCurrentCompany, submitCurrentCompany, applySessionComplete, endApplySession } from '../js/applications.js';
const fresh = () => { const s=createInitialState({playerTalents:[],godMode:true});startApplySession(s);return s; };

test('view counter includes current company but repeated renders do not increase it', () => {
  const s=fresh();getCurrentCompany(s);getCurrentCompany(s);
  assert.equal(s.applySession.viewedCount,1);
  skipCurrentCompany(s);getCurrentCompany(s);
  assert.equal(s.applySession.viewedCount,2);
  assert.ok(s.applySession.order.length>=15 && s.applySession.order.length<=20);
});

test('early exit preserves pending applications and rewards only once', () => {
  const s=fresh();getCurrentCompany(s);submitCurrentCompany(s);
  const pending=structuredClone(s.resumePending), ap=s.actionPoints, energy=s.energy, quality=s.resumeQuality;
  endApplySession(s);
  assert.equal(s.applySession,null);assert.deepEqual(s.resumePending,pending);
  assert.equal(s.actionPoints,ap);assert.equal(s.energy,energy);
  assert.ok(s.resumeQuality>quality && s.resumeQuality<=quality+2);
  const after=s.resumeQuality;endApplySession(s);assert.equal(s.resumeQuality,after);
});

test('exit without submitting gives no growth and a new round resets the view counter', () => {
  const s=fresh(),quality=s.resumeQuality;
  getCurrentCompany(s);skipCurrentCompany(s);endApplySession(s);
  assert.equal(s.resumeQuality,quality);assert.equal(s.resumePending.length,0);
  startApplySession(s);getCurrentCompany(s);assert.equal(s.applySession.viewedCount,1);
});

test('players may inspect the full pool even when ten submissions are no longer possible', () => {
  const s=fresh(),total=s.applySession.order.length;
  for(let i=0;i<total;i++) {
    assert.equal(applySessionComplete(s),false);
    getCurrentCompany(s);skipCurrentCompany(s);
  }
  assert.equal(applySessionComplete(s),true);
  assert.equal(s.applySession.viewedCount,total);
});

test('ten submissions still finish a round without counting an unseen company', () => {
  const s=fresh();
  for(let i=0;i<10;i++) {getCurrentCompany(s);submitCurrentCompany(s);}
  assert.equal(applySessionComplete(s),true);
  getCurrentCompany(s);assert.equal(s.applySession.viewedCount,10);
});
