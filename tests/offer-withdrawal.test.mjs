import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_DEFS, beginEvent, resolveEvent } from '../js/events.js';
import { createInitialState } from '../js/state.js';
import { eventAvailableThisRun } from '../js/eventRecurrence.js';
import { applyStressDelta } from '../js/talentRuntime.js';
const fresh = () => Object.assign(createInitialState({playerTalents:[]}), {day:10,stress:30});
const event = () => ({...EVENT_DEFS.find(e => e.id === 'evt_offer_withdrawn')});
test('withdrawal is an immediate notice, removes one offer, and is limited to once per run', () => {
  const s=fresh(),e=event();
  s.offers=[{companyId:'a',name:'甲公司'},{companyId:'b',name:'乙公司'}];
  const expected=structuredClone(s);applyStressDelta(expected,12,'event');
  const result=beginEvent(s,e);
  assert.equal(result.mode,'notice');
  assert.equal(s.offers.length,1);
  assert.ok(result.summary.includes('撤回 Offer'));
  assert.equal(s.stress,expected.stress);
  const snapshot=JSON.stringify(s);
  beginEvent(s,e);resolveEvent(s,e);
  assert.equal(JSON.stringify(s),snapshot);
  assert.equal(eventAvailableThisRun(event(),s),false);
  assert.equal(e.requires.offersMin,1);
});
test('last offer and stale chosen offer are removed without forcing a game ending', () => {
  const s=fresh();s.offers=[{companyId:'a',name:'甲公司'}];s.playerChosenOffer=s.offers[0];
  beginEvent(s,event());
  assert.equal(s.offers.length,0);assert.equal(s.playerChosenOffer,null);assert.equal(s.gameOver,false);
});
test('a stale queued event with no remaining offers causes no penalty', () => {
  const s=fresh();beginEvent(s,event());assert.equal(s.stress,30);assert.equal(s.offers.length,0);
});
