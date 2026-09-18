import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState} from '../js/state.js';
import {EVENT_DEFS,beginEvent,tryEntertainmentEvent,countEventsInPrior4Days,sampleEventCountForToday} from '../js/events.js';
import {eventAvailableThisRun} from '../js/eventRecurrence.js';
const fresh=()=>Object.assign(createInitialState({playerTalents:[]}),{day:10,money:5000});
test('seven misses are followed by a guaranteed eighth event and reset',()=>{
  const s=fresh();
  for(let i=1;i<=7;i++){assert.equal(tryEntertainmentEvent(s,()=>.99),null);assert.equal(s.entertainmentMisses,i);}
  assert.ok(tryEntertainmentEvent(s,()=>.99));assert.equal(s.entertainmentMisses,0);
  assert.equal(tryEntertainmentEvent(s,()=>.99),null);assert.equal(s.entertainmentMisses,1);
});
test('ordinary success also resets pity; new runs and ended runs do not inherit it',()=>{
  const s=fresh();s.entertainmentMisses=4;assert.ok(tryEntertainmentEvent(s,()=>0));assert.equal(s.entertainmentMisses,0);
  s.gameOver=true;assert.equal(tryEntertainmentEvent(s,()=>0),null);assert.equal(s.entertainmentMisses,0);
  assert.equal(fresh().entertainmentMisses,0);
});
test('empty pools preserve pity without bypassing cooldowns or reservations',()=>{
  const s=fresh();s.entertainmentMisses=7;
  for(const e of EVENT_DEFS)s.eventHistory[e.id]={count:1,lastDay:10};
  assert.equal(tryEntertainmentEvent(s,()=>.99),null);assert.equal(s.entertainmentMisses,7);
  s.day=15;s.eventModalQueue=EVENT_DEFS.filter(e=>e.tags?.includes('entertainment'));
  assert.equal(tryEntertainmentEvent(s,()=>.99),null);assert.equal(s.entertainmentMisses,7);
  s.eventModalQueue=[];assert.ok(tryEntertainmentEvent(s,()=>.99));assert.equal(s.entertainmentMisses,0);
});
test('entertainment retains history but never consumes the ordinary rolling quota',()=>{
  const s=fresh();s.day=9;
  for(const id of ['evt_new_boardgame','evt_new_movie','evt_new_walk']) {
    const e={...EVENT_DEFS.find(x=>x.id===id)};beginEvent(s,e);beginEvent(s,e);
  }
  assert.equal(s.eventsByDay[9],3);assert.equal(s.entertainmentEventsByDay[9],3);
  s.day=10;assert.equal(countEventsInPrior4Days(s,10),0);assert.ok(sampleEventCountForToday(s)>=1);
  s.eventsByDay[9]+=3;assert.equal(countEventsInPrior4Days(s,10),3);assert.equal(sampleEventCountForToday(s),0);
});
test('daily entertainment choices repeat after five days while unique events stay unique',()=>{
  const s=fresh(),e=EVENT_DEFS.find(x=>x.id==='evt_new_boardgame');
  s.eventHistory[e.id]={count:1,lastDay:10};s.day=14;assert.equal(eventAvailableThisRun(e,s),false);
  s.day=15;assert.equal(eventAvailableThisRun(e,s),true);
  const unique=EVENT_DEFS.find(x=>x.id==='evt_offer_withdrawn');s.eventHistory[unique.id]={count:1,lastDay:1};assert.equal(eventAvailableThisRun(unique,s),false);
});
