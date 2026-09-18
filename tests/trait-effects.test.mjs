import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../js/state.js';
import { PERSONALITIES, computePersonalityActionMods, personalityMechanics } from '../js/traits.js';
import { TALENTS } from '../js/talents.js';
import { applyDailyAction } from '../js/actions.js';
import { endApplySession } from '../js/applications.js';
import { personalityDetailsHtml } from '../js/personality-ui.js';
import { applyPassiveDayRecovery, computeMaxActionPointsForDay, applyDailyMoneyTick, applyStressDelta, talentApplyEnergyDiscount, talentPassBonus } from '../js/talentRuntime.js';
const fresh = (ids=[]) => Object.assign(createInitialState({rolledTraits:{education:{id:'edu_puben'},major:{id:'major_sci'},extraDegrees:[],other:[],personalities:[]},playerTalents:ids.map(id=>({id}))}),{energy:50,stress:30,money:5000,resumeQuality:50,hiddenResume:50,hiddenInterview:45});
function fixed(run) { const old=Math.random;try {Math.random=()=>.5;run();} finally {Math.random=old;} }

test('all personality action modifiers reach the actual resource calculation', () => fixed(() => {
  for(const p of PERSONALITIES) {
    assert.ok(personalityMechanics(p.id).length>0);
    const html=personalityDetailsHtml(p);assert.ok(html.includes('class="talent-bubble-btn') && html.includes(p.name));
    for(const [action,mods] of Object.entries(computePersonalityActionMods([p.id]))) {
      const normal=fresh(), changed=fresh();normal.stress=50;changed.stress=50;changed.personalityActionMods=computePersonalityActionMods([p.id]);
      applyDailyAction(normal,action);applyDailyAction(changed,action);
      for(const [key,value] of Object.entries(mods)) {
        if(key==='stress') assert.ok(Math.abs(changed.stress-normal.stress-value*(normal.stress>50?1.2:1))<1e-8,p.id);
        else if(key==='energy') assert.equal(changed.energy-normal.energy,value,p.id);
        else {const base=key==='hiddenInterview'?1:key==='hiddenResume'?2:3;assert.equal(changed[key]-normal[key],Math.round((base+value)*.9)-Math.round(base*.9),p.id);}
      }
    }
  }
}));
test('all 36 talents keep action resources and probability bonuses finite', () => fixed(() => {
  for(const talent of TALENTS) {
    const s=fresh([talent.id]);
    for(const action of ['study','rest','fun','apply'])applyDailyAction(s,action);
    applyDailyMoneyTick(s);applyPassiveDayRecovery(s);
    for(const key of ['energy','stress','money','resumeQuality','hiddenResume','hiddenInterview'])assert.ok(Number.isFinite(s[key]) && s[key]>=0,talent.id+'/'+key);
    const bonus=talentPassBonus(s);assert.ok(Number.isFinite(bonus.resume) && Number.isFinite(bonus.interview));
  }
}));
test('resume tailor rewards submitted rounds once, with no reward for empty rounds', () => fixed(() => {
  const a=fresh(),b=fresh(['resume_tailor']);
  a.applySession={submitted:1};b.applySession={submitted:1};
  endApplySession(a);endApplySession(b);assert.equal(b.resumeQuality-a.resumeQuality,1);
  const value=b.resumeQuality;endApplySession(b);assert.equal(b.resumeQuality,value);
  b.applySession={submitted:0};endApplySession(b);assert.equal(b.resumeQuality,value);
  assert.equal(talentApplyEnergyDiscount(b),2);
}));
test('study talents stack before efficiency and rounding', () => fixed(() => {
  const s=fresh(['love_study','ppt_weaver']);applyDailyAction(s,'study');assert.equal(s.resumeQuality,57);
}));
test('coffee affects passive recovery, night owl penalizes even-day recovery only', () => {
  const coffee=fresh(['coffee_life']);applyPassiveDayRecovery(coffee);assert.equal(coffee.energy,68);
  const odd=fresh(['night_owl']);odd.day=3;applyPassiveDayRecovery(odd);assert.equal(odd.energy,64);assert.equal(computeMaxActionPointsForDay(odd),5);
  const even=fresh(['night_owl']);even.day=4;applyPassiveDayRecovery(even);assert.equal(even.energy,59);assert.equal(computeMaxActionPointsForDay(even),4);
});
test('clear eyed reduces stress gain but does not reduce relief', () => {
  const s=fresh(['clear_eyed']);applyStressDelta(s,10,'event');assert.ok(Math.abs(s.stress-41.04)<1e-8);
  applyStressDelta(s,-10,'action');assert.ok(Math.abs(s.stress-31.04)<1e-8);
});
