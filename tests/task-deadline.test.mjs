import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {version}=JSON.parse(fs.readFileSync(new URL('../version.json',import.meta.url),'utf8'));
const {syncTasks,settleTaskDay,recordTaskAction,TASKS,taskCanFinishEarly}=await import(`../js/tasks.js?v=${version}`);
const {simulateForwardNaturalDays}=await import(`../js/events.js?v=${version}`);
const {createInitialState}=await import(`../js/state.js?v=${version}`);
const fresh=()=>Object.assign(createInitialState({playerTalents:[]}),{isFirstRun:false,day:4,energy:80,stress:20,money:1000,personalityActionMods:{},taskSeen:TASKS.map(t=>t.id)});
const task=(patch={})=>({id:'study',name:'准备练习',startedDay:4,deadline:9,status:'active',reward:120,goals:[{action:'study',target:2,progress:2,companies:[]}],...patch});
test('13 tasks wait for deadline; only referrals and material checks allow immediate completion',()=>{
 assert.equal(TASKS.filter(taskCanFinishEarly).length,3);
 assert.deepEqual(TASKS.filter(taskCanFinishEarly).map(t=>t.id),['counselor','alumni_interview','graduation_materials']);
});
test('meeting goals and repeated deadline-day refreshes cannot award early; day end pays once',()=>{
 const s=fresh(); const t=task();s.limitedTasks=[t];
 syncTasks(s);assert.equal(t.status,'active');assert.equal(s.money,1000);
 s.day=9;syncTasks(s);syncTasks(s);assert.equal(t.status,'active');
 settleTaskDay(s);settleTaskDay(s);assert.equal(t.status,'completed');assert.equal(t.endedDay,9);assert.equal(s.money,1120);
});
test('last-day actions qualify and unmet obligations penalize at day end only once',()=>{
 const s=fresh();s.day=9;const t=task({goals:[{action:'study',target:2,progress:1,companies:[]}],penalty:{money:-60}});s.limitedTasks=[t];
 recordTaskAction(s,'study');settleTaskDay(s);assert.equal(t.status,'completed');assert.equal(s.money,1120);
 const unmet=fresh();unmet.day=9;unmet.limitedTasks=[task({goals:[{action:'study',target:2,progress:1}],penalty:{money:-60}})];
 settleTaskDay(unmet);settleTaskDay(unmet);assert.equal(unmet.money,940);assert.equal(unmet.limitedTasks[0].status,'expired');
});
test('calendar skips settle each deadline and include final-day rewards before ending',()=>{
 const s=fresh();s.day=8;s.limitedTasks=[task()];simulateForwardNaturalDays(s,2);assert.equal(s.limitedTasks[0].status,'completed');assert.equal(s.limitedTasks[0].endedDay,9);
 const final=fresh();final.day=30;final.limitedTasks=[task({deadline:30,reward:{hiddenResume:3}})];const before=final.hiddenResume;simulateForwardNaturalDays(final,1);assert.equal(final.hiddenResume,before+3);assert.equal(final.limitedTasks[0].status,'completed');assert.equal(final.gameOver,true);
});
test('fallback sync settles elapsed deadlines instead of discarding completed goals',()=>{
 const s=fresh();s.day=10;s.limitedTasks=[task()];syncTasks(s);syncTasks(s);assert.equal(s.money,1120);assert.equal(s.limitedTasks[0].endedDay,9);
});
