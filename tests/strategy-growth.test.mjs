import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { version } = JSON.parse(fs.readFileSync(new URL('../version.json', import.meta.url), 'utf8'));
const mod = name => import(`../js/${name}.js?v=${version}`);
const S = await mod('strategies');
const { createInitialState } = await mod('state');
const { STRATEGY_EVENTS } = await mod('strategy-events');
const { beginEvent } = await mod('events');
const { useMoneyOption } = await mod('economy');
const fresh = () => Object.assign(createInitialState({ playerTalents: [] }), {
  energy: 60, stress: 50, money: 1000, hiddenResume: 40, hiddenInterview: 40,
  resumeQuality: 40, personalityActionMods: {},
});
function select(s, predicate = () => true) {
  const old = Math.random; let seed = 78;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  try {
    for (let i = 0; i < 200; i++) {
      const candidate = S.strategyDraft(s).find(predicate);
      if (candidate) { assert.equal(S.chooseStrategy(s, candidate.id), true); return candidate.id; }
      s.strategyDraft = null;
    }
    assert.fail('No eligible candidate in seeded draws');
  } finally { Math.random = old; }
}

test('six routes each define three exclusive buffs, plus six common buffs', () => {
  const cores = S.STRATEGIES.filter(x => !x.requires && !x.generic);
  assert.equal(cores.length, 6);
  assert.equal(S.STRATEGIES.filter(x => x.generic).length, 6);
  for (const core of cores) assert.equal(S.STRATEGIES.filter(x => x.requires === core.id).length, 3);
  assert.equal(new Set(S.STRATEGIES.map(x => x.id)).size, 30);
  assert.deepEqual(S.STRATEGY_DAYS, [1, 6, 11, 16, 21, 26]);
});

test('opening route draft offers three distinct unlocked candidates and stays cached', () => {
  for (let i = 0; i < 30; i++) {
    const s = fresh();
    const draft = S.strategyDraft(s);
    assert.equal(draft.length, 3);
    assert.equal(new Set(draft.map(x => x.id)).size, 3);
    assert.ok(draft.every(x => !x.requires && !x.generic && !['work', 'invest'].includes(x.id)));
    assert.deepEqual(S.strategyDraft(s), draft);
    const excluded = ['focus', 'volume', 'network', 'rhythm'].find(id => !draft.some(x => x.id === id));
    assert.equal(S.chooseStrategy(s, excluded), false);
  }
});

test('regular choices require three actual growth picks before a second route', () => {
  const s = fresh(); select(s, x => x.id === 'focus');
  s.day = 5; assert.equal(S.strategyDecision(s), null);
  for (const [index, day] of [6, 11, 16].entries()) {
    s.day = day;
    assert.equal(S.strategyDecision(s).kind, 'growth');
    const draft = S.strategyDraft(s);
    assert.deepEqual(S.strategyDraft(s), draft);
    assert.ok(draft.every(x => x.generic || x.requires === 'focus'));
    assert.ok(draft.every(x => x.id !== 'reuse')); // still locked outside this run
    assert.equal(S.chooseStrategy(s, 'volume'), false);
    select(s);
    assert.equal(S.strategyGrowthCount(s, 'focus'), index + 1);
    assert.equal(S.strategyDecision(s), null);
  }
  s.day = 20; assert.equal(S.strategyDecision(s), null);
  s.day = 21; assert.equal(S.strategyDecision(s).kind, 'core'); select(s);
  assert.equal(S.strategyCores(s).length, 2);
  s.day = 26; assert.equal(S.strategyDecision(s).kind, 'growth');
});

test('event growth counts toward the gate and pending route tokens do not bypass it', () => {
  const s = fresh(); select(s, x => x.id === 'focus');
  assert.equal(S.grantStrategyChoice(s, 'core'), true);
  assert.equal(S.strategyDecision(s), null);
  assert.equal(S.grantStrategyChoice(s, 'growth'), true); select(s);
  assert.equal(s.strategyRegularUsed, 1);
  assert.equal(S.strategyGrowthCount(s, 'focus'), 1);
  s.day = 6; select(s);
  S.grantStrategyChoice(s, 'growth'); select(s);
  assert.equal(S.strategyGrowthCount(s, 'focus'), 3);
  assert.equal(S.strategyDecision(s).source, 'strategyBonusCore');
  select(s);
  assert.equal(s.strategyBonusCore, 0);
  assert.equal(s.strategyRegularUsed, 2);
  assert.equal(S.strategyCores(s).length, 2);
});

test('skips consume only their own ticket and never count as growth; ended and applying runs cannot pick', () => {
  const s = fresh(); assert.equal(S.skipStrategy(s), true);
  assert.equal(S.strategyDecision(s), null);
  s.day = 6; select(s, x => x.id === 'focus');
  S.grantStrategyChoice(s, 'growth'); assert.equal(S.skipStrategy(s), true);
  assert.equal(s.strategyBonusGrowth, 0); assert.equal(s.strategyRegularUsed, 2);
  assert.equal(S.strategyGrowthCount(s, 'focus'), 0);
  s.day = 11; s.applySession = {};
  assert.equal(S.strategyDraft(s).length, 0);
  s.applySession = null; s.gameOver = true;
  assert.equal(S.strategyDraft(s).length, 0);
  assert.equal(S.grantStrategyChoice(s, 'growth'), false);
});

test('common buffs cannot repeat within a route but stack across routes', () => {
  const s = fresh(); select(s, x => x.id === 'focus');
  S.grantStrategyChoice(s, 'growth'); select(s, x => x.id === 'general_rest');
  S.grantStrategyChoice(s, 'growth');
  for (let i = 0; i < 15; i++) {
    s.strategyDraft = null; assert.ok(S.strategyDraft(s).every(x => x.id !== 'general_rest'));
  }
  select(s); S.grantStrategyChoice(s, 'growth'); select(s);
  S.grantStrategyChoice(s, 'core'); select(s, x => x.id === 'volume');
  S.grantStrategyChoice(s, 'growth'); select(s, x => x.id === 'general_rest');
  assert.equal(S.strategyLevel(s, 'general_rest'), 2);
  s.energy = 50; S.onStrategyAction(s, 'rest'); assert.equal(s.energy, 58);
});

test('new exclusive buffs change the intended resources', () => {
  const s = fresh();
  s.strategies = ['focus','targeted']; s.strategyPrep = 2; s.applySession = { strategyApproach: 'focus' };
  assert.equal(S.spendApproach(s, {name:'Sample'}), true); assert.equal(s.stress, 46);
  s.strategies = ['volume','archive'];
  for (let i = 0; i < 3; i++) S.onStrategyRejection(s, {});
  assert.equal(s.money, 1060);
  s.strategies = ['network','reputation']; S.onStrategyAction(s, 'reveal'); assert.equal(s.strategyContacts, 1);
  s.strategies = ['rhythm','breathe']; s.strategyRhythm = 1; S.onStrategyAction(s, 'study'); assert.equal(s.stress, 43);
  s.strategies = ['work','settlement']; S.onStrategyAction(s, 'work'); assert.equal(s.money, 1180);
  s.strategies = ['invest','consolidate']; s.coachedStudies = 1; S.onStrategyAction(s, 'study'); assert.equal(s.resumeQuality, 42);
});

test('all six common buffs have effects, including paid recovery integration', () => {
  const s = fresh(); s.strategies = S.STRATEGIES.filter(x => x.generic).map(x => x.id);
  S.onStrategyAction(s, 'rest'); assert.equal(s.energy, 64);
  S.onStrategyAction(s, 'fun'); assert.equal(s.stress, 47);
  S.onStrategyAction(s, 'study'); assert.equal(s.hiddenResume, 41); assert.equal(s.stress, 46);
  S.onStrategyAction(s, 'work'); assert.equal(s.money, 1030);
  assert.equal(useMoneyOption(s, 'recover').ok, true); assert.equal(s.energy, 86);
});

test('strategy reward events award once per display and expose their token changes', () => {
  const s = fresh(); s.day = 8; select(s, x => x.id === 'focus');
  const e = { ...STRATEGY_EVENTS[0] };
  assert.equal(e.eligible(s), true);
  const result = beginEvent(s, e); assert.match(result.summary, /额外成长名额 \+1/);
  beginEvent(s, e); assert.equal(s.strategyBonusGrowth, 1);
  assert.equal(STRATEGY_EVENTS[2].eligible(s), true);
  beginEvent(s, { ...STRATEGY_EVENTS[2] }); assert.equal(s.strategyBonusCore, 1);
});
