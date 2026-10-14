import test from 'node:test';
import assert from 'node:assert/strict';
import { startApplySession } from '../js/applications.js';
import { materializeCompany } from '../js/match.js';
import { SALARY_BANDS_META } from '../js/companies.js';
const state = () => ({strategies:[],playerTalents:[],traits:{education:{id:'edu_211',tier:4},major:{id:'major_sci'}},resumeQuality:60,resumeQualityMax:120,jobSearchRating:1500});
test('each batch contains exactly two ordinary stretch roles', () => {
  for(let i=0;i<30;i++) {
    const s=state();startApplySession(s);
    const roles=s.applySession.order.filter(c=>c.isStretchRole);
    assert.equal(roles.length,2);
    assert.ok(roles.every(c=>!c.isNetaRef));
    assert.ok(s.applySession.order.length>=15&&s.applySession.order.length<=20);
  }
});
test('stretch salary is 3 to 5 bands above center and never a pyramid', () => {
  // 211, rating 1500, quality 60: mu = 13.6924, ceil(mu) = 14.
  for(let i=0;i<100;i++) {
    const c={baseSeed:i*7919,isStretchRole:true};materializeCompany(state(),c);
    const idx=SALARY_BANDS_META.findIndex(b=>b.id===c.tags.salary.id);
    assert.ok(idx>=17&&idx<=19);
    assert.notEqual(c.hiddenTag?.id,'hid_pyramid');
  }
});
test('211 science uses the same salary sampling as other majors', () => {
  const saved=Math.random;
  try {
    Math.random=()=>.5;
    for(const seed of [1,9999,999999,123456789]) {
      const s=state(),a={baseSeed:seed},b={baseSeed:seed};
      materializeCompany(s,a);s.traits.major.id='major_arts';materializeCompany(s,b);
      assert.deepEqual(a.tags.salary,b.tags.salary);
    }
  } finally {Math.random=saved;}
});
