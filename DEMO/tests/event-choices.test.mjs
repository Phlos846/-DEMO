import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { EVENT_DEFS, beginEvent, resolveEvent, planEventsForCurrentDay, tryStudyOverloadEvent, tryStudyBreakthroughEvent } from '../js/events.js';
import { getEventInteraction, FOLLOW_UP_EVENTS } from '../js/eventChoices.js';
const fresh = () => Object.assign(createInitialState({playerTalents: []}), {day:8, actionPoints:4, money:5000, debt:0, energy:80, stress:30, hiddenInterview:45, resumeQuality:50, transientEffects:[]});
const event = id => ({ ...[...EVENT_DEFS, ...FOLLOW_UP_EVENTS].find(e => e.id === id) });

test('catalog uses factual notices or authored decisions; every branch settles', () => {
  let notices = 0, decisions = 0;
  for (const def of [...EVENT_DEFS, ...FOLLOW_UP_EVENTS]) {
    const view = getEventInteraction(def);
    const choices = view.mode === 'notice' ? [null] : view.choices.map(c => c.id);
    if (view.mode === 'notice') { notices++; assert.deepEqual(view.choices, []); } else { decisions++; assert.ok(choices.length >= 2); }
    for (const id of choices) {
      const s = fresh(), e = {...def};
      const result = resolveEvent(s, e, id);
      assert.equal(result.ok, true, def.id + '/' + id);
      assert.equal(s.eventsByDay[8], def.skipRecordEvent ? undefined : 1);
      for (const k of ['money','energy','stress','actionPoints','resumeQuality']) assert.ok(Number.isFinite(s[k]) && s[k] >= 0, def.id + '/' + k);
      const before = JSON.stringify(s);
      assert.equal(resolveEvent(s, e, id).ok, false);
      assert.equal(JSON.stringify(s), before);
    }
  }
  assert.ok(notices > decisions);
  assert.ok(decisions >= 12);
});

test('notice applies once on display and cannot be declined', () => {
  const s=fresh(), e=event('evt_lottery_jackpot');
  const shown=beginEvent(s,e);
  assert.equal(shown.mode,'notice'); assert.equal(shown.result.immediateSettle,true);
  assert.equal(s.money,93888); assert.equal(s.lotteryJackpot,true);
  beginEvent(s,e); assert.equal(s.money,93888);
  assert.equal(resolveEvent(s,e,'continue').ok,false);
});

test('illness happens before a decision; rest cannot erase its penalty', () => {
  const s=fresh(), e=event('evt_ill');
  beginEvent(s,e); assert.equal(s.energy,68); assert.equal(s.stress,36);
  assert.equal(s.transientEffects.length,1);
  resolveEvent(s,e,'rest'); assert.equal(s.energy,78); assert.equal(s.actionPoints,3);
  assert.equal(s.transientEffects.length,1); assert.equal(s.eventsByDay[8],1);
});

test('unaffordable care cannot charge or undo already-applied facts', () => {
  const s=fresh(), e=event('evt_ill'); s.money=119;
  beginEvent(s,e); const before=JSON.stringify(s);
  assert.equal(resolveEvent(s,e,'care').ok,false);
  assert.equal(resolveEvent(s,e,'missing').ok,false);
  assert.equal(JSON.stringify(s),before);
  assert.equal(resolveEvent(s,e,'original').ok,true);
});

test('fatal illness cannot be rescued by choosing a later healing option', () => {
  const s=fresh(), e=event('evt_ill'); s.energy=5;
  const shown=beginEvent(s,e); assert.equal(shown.terminal,true);
  assert.equal(s.gameOver,true); assert.equal(s.energy,0);
  assert.equal(resolveEvent(s,e,'care').ok,false);
});

test('declining an opportunity grants no free recovery or other rewards', () => {
  for (const id of ['evt_network','evt_side','evt_ent_farm']) {
    const s=fresh(), e=event(id); const before=[s.money,s.energy,s.stress,s.day,s.actionPoints];
    resolveEvent(s,e,id === 'evt_ent_farm' ? 'skip' : 'decline');
    assert.deepEqual([s.money,s.energy,s.stress,s.day,s.actionPoints], before);
  }
});

test('paid work produces a single delayed decision and final-day delivery is not lost', () => {
  const s=fresh(); resolveEvent(s,event('evt_side'),'paid');
  assert.equal(s.money,5100); assert.equal(s.eventFollowups[0].dueDay,10);
  s.day=9; assert.ok(!planEventsForCurrentDay(s).some(e=>e.id==='evt_side_revision'));
  s.day=10; const q=planEventsForCurrentDay(s);
  const next=q.find(e=>e.id==='evt_side_revision'); assert.ok(next);
  assert.equal(s.eventFollowups.length,0); assert.equal(planEventsForCurrentDay(s),q);
  resolveEvent(s,next,'finish'); assert.equal(s.money,5350);
  const last=fresh(); last.day=30; resolveEvent(last,event('evt_side'),'paid');
  assert.equal(last.eventFollowups.length,0); assert.equal(last.eventModalQueue[0].id,'evt_side_revision');
});

test('network review pays its cost now and delivers benefits after two days', () => {
  const s=fresh(); resolveEvent(s,event('evt_network'),'review');
  assert.equal(s.resumeQuality,50); assert.equal(s.energy,72);
  s.day=10; const followup=planEventsForCurrentDay(s).find(e=>e.id==='evt_network_feedback');
  beginEvent(s,followup); assert.equal(s.resumeQuality,56); assert.equal(s.hiddenInterview,47);
});

test('negotiation success and failure have different explicit payouts', () => {
  const originalRandom=Math.random;
  try {
    for (const [roll,money,stress] of [[.1,5400,30],[.9,5000,36]]) {
      const s=fresh(); Math.random=()=>roll;
      resolveEvent(s,event('evt_side_revision'),'negotiate');
      assert.equal(s.money,money); assert.equal(s.stress,stress);
    }
  } finally { Math.random=originalRandom; }
});

test('genuine life decisions keep endings on the selected branch', () => {
  for (const id of ['evt_credit_email','evt_immigration_spam','evt_headhunter_rush']) {
    const s=fresh(), e=event(id), alt=getEventInteraction(e).choices[1];
    assert.equal(resolveEvent(s,e,alt.id).immediateSettle,false);
    assert.equal(s.eventImmediateEnding,null);
    assert.equal(resolveEvent(fresh(),event(id),'original').immediateSettle,true);
  }
});

test('study status events are notices and keep their separate counting rules', () => {
  const s=fresh(); s.studyByDay={4:1,5:1,6:1,7:1,8:1};
  const overload=tryStudyOverloadEvent(s); beginEvent(s,overload);
  assert.equal(getEventInteraction(overload).mode,'notice'); assert.equal(s.studyOverloadDebuffUntilDay,10);
  s.studyCountWhileOverloadDebuff=4; const breakthrough=tryStudyBreakthroughEvent(s); beginEvent(s,breakthrough);
  assert.equal(s.studyOverloadDebuffUntilDay,null); assert.equal(s.studyRecoveryBuffUntilDay,10);
  assert.equal(s.eventsByDay[8],undefined);
});
