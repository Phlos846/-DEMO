import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedResumePass, expectedInterviewPass, materializeCompany } from '../js/match.js';
import { getRecruitmentProfile, recruitmentModifier, interviewConditionModifier } from '../js/recruitment.js';
import { createInitialState } from '../js/state.js';

const state = () => ({playerTalents:[],traits:{education:{id:'edu_985',tier:5}},resumeQuality:60,resumeQualityMax:120,energy:80,stress:30,hiddenResume:50,hiddenInterview:45});
const company = quality => ({baseSeed:123,recruitment:{requirement:1,competition:1},tags:{salary:{tier:14,quality,label:'年薪20万-21万'},treatment:{quality},reputation:[{quality}]}});
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-10, `${a} != ${b}`);

test('company quality no longer directly changes either pass rate', () => {
  for(const calculate of [expectedResumePass,expectedInterviewPass]) near(calculate(state(),company('good'),false),calculate(state(),company('bad'),false));
});
test('requirements and competition independently lower pass rates', () => {
  for(const field of ['requirement','competition']) {
    const c=company('normal'), values=[];
    for(let i=0;i<3;i++){c.recruitment[field]=i;values.push(recruitmentModifier(c));}
    assert.ok(values[0]>values[1] && values[1]>values[2]);
  }
});
test('recruitment profile is deterministic and survives materialization', () => {
  const s=createInitialState({playerTalents:[]});
  for(let seed=1;seed<=50;seed++) {
    const c={id:`test${seed}`,name:'测试公司',baseSeed:seed};
    const before=getRecruitmentProfile(c);
    materializeCompany(s,c);
    assert.deepEqual(c.recruitment,before);
    assert.deepEqual(getRecruitmentProfile({...c,tags:company('bad').tags}),before);
  }
});
test('healthy range has no penalty and thresholds are continuous', () => {
  for(const energy of [20,50,100])for(const stress of [0,50,80])assert.equal(interviewConditionModifier({energy,stress}),1);
  assert.ok(interviewConditionModifier({energy:19.999,stress:80})>.999);
  assert.ok(interviewConditionModifier({energy:20,stress:80.001})>.999);
});
test('extreme penalties compound and affect interviews only', () => {
  const s=state(),c=company('normal'),baseline=expectedInterviewPass(s,c,false),resume=expectedResumePass(s,c,false);
  s.energy=10; near(expectedInterviewPass(s,c,false),baseline*.55);
  s.stress=90; near(expectedInterviewPass(s,c,false),baseline*.3025);
  near(expectedResumePass(s,c,false),resume);
  s.energy=0;s.stress=120;near(expectedInterviewPass(s,c,false),baseline*.16);
  s.godMode=true;assert.equal(expectedInterviewPass(s,c,false),1);
});
