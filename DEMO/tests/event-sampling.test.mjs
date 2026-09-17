import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleEventPool, isInteractiveEvent } from '../js/eventSampling.js';
import { EVENT_DEFS, beginEvent, planEventsForCurrentDay, recordEventResolved } from '../js/events.js';
import { EXPANSION_EVENTS } from '../js/eventExpansion.js';
import { recordEventAppearance } from '../js/eventRecurrence.js';
import { createInitialState } from '../js/state.js';
const c = EXPANSION_EVENTS[0];
const n = EXPANSION_EVENTS.at(-1);

test('28 unique additions include 24 decisions; no duplicate catalog IDs', () => {
  assert.equal(EXPANSION_EVENTS.length,28);
  assert.equal(EXPANSION_EVENTS.filter(isInteractiveEvent).length,24);
  assert.equal(new Set(EVENT_DEFS.map(e=>e.id)).size,EVENT_DEFS.length);
});

test('first random event and two-notice protection select interaction when eligible', () => {
  assert.equal(sampleEventPool([n,c],{},undefined,()=>.99).id,c.id);
  const pacing={notices:0};
  assert.equal(sampleEventPool([n,c],{},pacing,()=>.99).id,n.id);
  assert.equal(sampleEventPool([n,c],{},pacing,()=>.99).id,n.id);
  assert.equal(sampleEventPool([n,c],{},pacing,()=>.99).id,c.id);
  assert.equal(pacing.notices,0);
  assert.equal(sampleEventPool([n],{},undefined,()=>.99).id,n.id);
  assert.equal(sampleEventPool([],{}),null);
});

test('display updates pacing only once, not when a queued event is merely selected', () => {
  const s=createInitialState({playerTalents:[]});s.eventNoticeStreak=0;
  const notice={...n}; beginEvent(s,notice); beginEvent(s,notice);
  assert.equal(s.eventNoticeStreak,1);
  sampleEventPool([n,c],s);assert.equal(s.eventNoticeStreak,1);
  beginEvent(s,{...c});assert.equal(s.eventNoticeStreak,0);
});

test('200 seeded 30-day scheduling simulations expose decisions consistently', () => {
  const saved=Math.random; let total=0, decisions=0, min=Infinity, max=0;
  try {
    for(let seed=1;seed<=200;seed++) {
      let r=seed;Math.random=()=>((r=(Math.imul(r,1664525)+1013904223)>>>0)/4294967296);
      const s=createInitialState({playerTalents:[]});let count=0, first=true;
      for(s.day=2;s.day<=30;s.day++) {
        const queue=planEventsForCurrentDay(s);
        for(const e of queue) {
          const interactive=isInteractiveEvent(e);
          if(first) { assert.equal(interactive,true);first=false; }
          if(interactive) { count++;decisions++; }
          total++;
          recordEventAppearance(s,e);recordEventResolved(s,s.day);
          s.eventNoticeStreak=interactive ? 0 : s.eventNoticeStreak+1;
        }
      }
      assert.ok(count>0);min=Math.min(min,count);max=Math.max(max,count);
    }
  } finally { Math.random=saved; }
  assert.ok(decisions/total>.65 && decisions/total<.95);
  console.log(JSON.stringify({simulations:200,events:total,interactive:decisions,interactiveShare:Math.round(decisions/total*100)+'%',minPerRun:min,maxPerRun:max,meanPerRun:decisions/200}));
});
