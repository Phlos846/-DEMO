import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState} from '../js/state.js';
import {CONDITIONAL_EVENTS,takeConditionalEvent} from '../js/conditionalEvents.js';
import {beginEvent,resolveEvent,countEventsInPrior4Days,planEventsForCurrentDay} from '../js/events.js';
const fresh=()=>Object.assign(createInitialState({playerTalents:[]}),{day:10,energy:30,stress:81,appliedIds:Array.from({length:10},(_,i)=>i),offers:[]});
test('compound conditions enforce exact thresholds',()=>{
 const s=fresh(),[anxiety,exhaustion,budget,rhythm]=CONDITIONAL_EVENTS;
 assert.equal(anxiety.eligible(s),true);
 for(const patch of [{stress:80},{energy:41},{day:7},{offers:[{}]},{appliedIds:[]}])assert.equal(anxiety.eligible({...s,...patch}),false);
 assert.equal(exhaustion.eligible({...s,energy:19,studyByDay:{6:4}}),true);
 assert.equal(exhaustion.eligible({...s,energy:20,studyByDay:{6:4}}),false);
 assert.equal(exhaustion.eligible({...s,energy:19,studyByDay:{5:4}}),false);
 assert.equal(budget.eligible({...s,money:299,debt:500}),true);
 assert.equal(budget.eligible({...s,money:300,debt:500}),false);
 assert.equal(rhythm.eligible({...s,energy:60,stress:39,studyCount:5}),true);
 assert.equal(rhythm.eligible({...s,energy:60,stress:40,studyCount:5}),false);
});
test('one daily roll, failed rolls do not spend appearances, cooldown and run cap apply',()=>{
 const s=fresh();assert.equal(takeConditionalEvent(s,()=>.25),null);
 assert.equal(takeConditionalEvent(s,()=>0),null);assert.deepEqual(s.eventHistory,{});
 s.day++;const e=takeConditionalEvent(s,()=>0);assert.equal(e.id,'evt_cond_anxiety');beginEvent(s,e);
 assert.equal(takeConditionalEvent(s,()=>0),null);
 s.day=17;assert.equal(takeConditionalEvent(s,()=>0),null);
 s.day=18;const again=takeConditionalEvent(s,()=>0);assert.ok(again);beginEvent(s,again);
 s.day=25;assert.equal(takeConditionalEvent(s,()=>0),null);
});
test('anxiety applies before choices once; extra event does not consume daily quota',()=>{
 const s=fresh();s.actionPoints=1;
 const e=takeConditionalEvent(s,()=>0),start=beginEvent(s,e);
 assert.equal(start.mode,'response');assert.equal(s.energy,22);
 beginEvent(s,e);assert.equal(s.energy,22);assert.equal(s.transientEffects.filter(x=>x.id==='fx_cond_anxiety').length,1);
 assert.equal(resolveEvent(s,e,'pause').ok,true);assert.equal(s.actionPoints,0);assert.equal(s.energy,30);
 assert.equal(countEventsInPrior4Days(s,11),0);
});
test('conditional event can appear even with full ordinary quota; daily planning is idempotent',()=>{
 const s=fresh();s.eventsByDay[9]=3;
 const old=Math.random;try{Math.random=()=>0;const q=planEventsForCurrentDay(s);assert.equal(q.length,1);assert.equal(q[0].id,'evt_cond_anxiety');assert.equal(planEventsForCurrentDay(s),q);}finally{Math.random=old;}
});
