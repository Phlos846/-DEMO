import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { version } = JSON.parse(fs.readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
const load = name => import(`../js/${name}.js?v=${version}`);

test('career lifecycle: locked degrees, unique rewards, purchases, talent weights, relic selection and storage failure', async () => {
  const data = new Map();
  globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const c = await load('career'), { createInitialState } = await load('state');
  const { rollAllTraits } = await load('traits');
  const { strategyUnlocked } = await load('strategy-career');
  const { useMoneyOption } = await load('economy');
  const { applyDailyAction } = await load('actions');
  const { rollPlayerTalents } = await load('talents');
  const originalRandom = Math.random;
  const fresh = () => createInitialState({ playerTalents: [] });
  const win = () => {
    const s = fresh(); s.gameOver = true; s.offers = [{}];
    c.awardCareer(s, { id: 'normal_ok' }); return s;
  };
  const afford = id => {
    const item = c.CAREER_ITEMS.find(x => x.id === id), cost = item.costs[c.careerLevel(id)];
    while (c.getCareer().points < cost) win();
    assert.equal(c.buyCareerItem(id), '');
  };
  try {
    Math.random = () => 0;
    assert.equal(rollAllTraits().extraDegrees.some(x => ['extra_master','extra_phd'].includes(x.id)), false);
    assert.equal(createInitialState({ playerTalents: [{ id: 'genius' }] }).traits.extraDegrees.some(x => x.id === 'extra_master'), false);
    Math.random = originalRandom;
    assert.equal(c.buyCareerItem('master'), '成长点不足');
    const first = win(); assert.equal(c.getCareer().points, 5);
    c.awardCareer(first, { id: 'normal_ok' }); assert.equal(c.getCareer().points, 5);
    delete first.careerReward;
    c.awardCareer(first, { id: 'normal_ok' }); assert.equal(c.getCareer().points, 5);
    win(); assert.equal(c.getCareer().points, 8);
    assert.equal(c.buyCareerItem('phd'), '请先解锁硕士');
    afford('master'); assert.equal(c.getCareer().points, 0);
    Math.random = () => 0;
    assert.equal(rollAllTraits().extraDegrees.some(x => x.id === 'extra_master'), true);
    assert.equal(rollAllTraits().extraDegrees.some(x => x.id === 'extra_phd'), false);
    assert.equal(createInitialState({ playerTalents: [{ id: 'genius' }] }).traits.extraDegrees.some(x => x.id === 'extra_master'), true);
    Math.random = originalRandom;
    afford('phd');
    Math.random = () => 0;
    assert.equal(rollAllTraits().extraDegrees.some(x => x.id === 'extra_phd'), true);
    Math.random = originalRandom;
    const beforeCheat = c.getCareer().points;
    const cheat = fresh(); cheat.gameOver = true; cheat.godMode = true; cheat.offers = [{}];
    c.awardCareer(cheat, { id: 'premium_salary' }); assert.equal(c.getCareer().points, beforeCheat);
    const loss = fresh(); loss.gameOver = true;
    c.awardCareer(loss, { id: 'burnout' }); assert.equal(c.getCareer().points, beforeCheat + 2);
    afford('strategy_work'); assert.equal(strategyUnlocked('work'), true);
    const worker = fresh(); worker.strategies = ['work','portfolio','efficient']; worker.energy = 70;
    const moneyBefore = worker.money;
    assert.equal(useMoneyOption(worker, 'work').ok, true);
    assert.equal(worker.money, moneyBefore + 300);
    assert.equal(worker.energy, 58);
    assert.equal(useMoneyOption(worker, 'work').ok, false);
    afford('relic_notes'); assert.equal(c.selectRelic('relic_notes'), true);
    assert.equal(fresh().carriedRelic, 'relic_notes');
    assert.equal(c.selectRelic('relic_letter'), false);
    afford('genius'); assert.equal(c.careerLevel('genius'), 1);
    // Sample a fixed position in the gold pool, then verify its increased weight is used.
    const samples = [0, 0, .45, 0, 0];
    Math.random = () => samples.shift() ?? 0;
    assert.ok(rollPlayerTalents().some(x => x.id === 'genius'));
    Math.random = originalRandom;
    const student = fresh(); student.strategies = ['rhythm','deep','invest','practice','rebate']; student.money = 900;
    applyDailyAction(student, 'rest'); assert.equal(student.strategyRhythm, 1);
    assert.equal(useMoneyOption(student, 'coach').ok, true); assert.equal(student.coachedStudies, 3);
    for (let i = 0; i < 3; i++) { student.energy = 80; applyDailyAction(student, 'study'); }
    assert.equal(student.strategyRhythm, 0); assert.equal(student.coachedStudies, 0); assert.equal(student.money, 450);
    while (c.getCareer().points < 4) win();
    const pointsBefore = c.getCareer().points, realSave = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('quota'); };
    assert.match(c.buyCareerItem('savings'), /无法保存/);
    assert.equal(c.getCareer().points, pointsBefore); assert.equal(c.careerLevel('savings'), 0);
    localStorage.setItem = realSave;
    afford('savings');
    const funded = fresh(); assert.ok(funded.money > 4800);
  } finally { Math.random = originalRandom; delete globalThis.localStorage; }
});
