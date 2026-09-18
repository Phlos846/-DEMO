import { canGrantStrategyChoice, grantStrategyChoice } from './strategies.js';

export const STRATEGY_EVENTS = [
  {
    id: 'evt_strategy_workshop', title: '校友成长工作坊', emoji: '🧩', weight: .9,
    maxPerRun: 1, requires: { dayMin: 3 },
    eligible: s => canGrantStrategyChoice(s, 'growth'),
    desc: '校友用你的求职经历做了一次针对性复盘。额外选择一次当前流派的成长 buff，计入选满 3 项的进度，不消耗常规名额。关闭事件后选择。',
    apply(s) { grantStrategyChoice(s, 'growth'); },
  },
  {
    id: 'evt_strategy_breakthrough', title: '复盘中的突破', emoji: '💡', weight: .7,
    maxPerRun: 1, requires: { dayMin: 8, studyMin: 3 },
    eligible: s => canGrantStrategyChoice(s, 'growth'),
    desc: '你把最近几次尝试串了起来，终于理解了下一步该怎样改进。额外选择一次当前流派的成长 buff，计入 3 项成长进度，不消耗常规名额。',
    apply(s) { grantStrategyChoice(s, 'growth'); },
  },
  {
    id: 'evt_strategy_new_path', title: '另一条求职路线', emoji: '🧭', weight: .65,
    maxPerRun: 1, requires: { dayMin: 8 },
    eligible: s => canGrantStrategyChoice(s, 'core'),
    desc: '一位前辈介绍了另一套求职方法。获得一个额外流派名额；当前流派选满 3 项成长后即可领取，不消耗常规名额，也不会绕过局外解锁。',
    apply(s) { grantStrategyChoice(s, 'core'); },
  },
];
