import { applyEnergyDelta, applyStressDelta, applyMoneyDelta } from './talentRuntime.js';
import { clampResumeToCap, addLog } from './state.js';

const resume = (s, n) => { s.resumeQuality = clampResumeToCap(s, s.resumeQuality + n); };
const interview = (s, n) => { s.hiddenInterview = Math.max(0, Math.min(100, s.hiddenInterview + n)); };
const stress = (s, n) => applyStressDelta(s, n, 'event');
const choice = (id, label, hint, apply, requires = {}) => ({ id, label, hint, apply, requires, immediateSettle: false });
const original = (event, label) => ({ id: 'original', label, hint: event.desc, apply: event.apply, immediateSettle: !!event.immediateSettle });
const decline = (label = '这次先不参加') => choice('decline', label, '保持原来的安排，不获得额外奖励。', () => {});

function schedule(s, id, delay) {
  s.eventFollowups ??= [];
  const dueDay = Math.min(s.day + delay, s.maxDays ?? 30);
  if (dueDay <= s.day) {
    s.eventModalQueue.push({ ...FOLLOW_UP_EVENTS.find(e => e.id === id) });
    addLog(s, '临近秋招截止，对方当天回复，接着处理后续。');
  } else {
    s.eventFollowups.push({ id, dueDay });
    addLog(s, `约定第 ${dueDay} 天收到后续回复。`);
  }
}

export const FOLLOW_UP_EVENTS = [
  { id: 'evt_network_feedback', title: '学长发回批注版简历', emoji: '📨', skipRecordEvent: true,
    desc: '两天前发给学长的简历回来了。批注指出了项目描述的漏洞，还附了一份面试提纲。综合素质 +6，面试发挥 +2。',
    apply(s) { resume(s, 6); interview(s, 2); } },
  { id: 'evt_side_revision', title: '尾款前的最后一次修改', emoji: '🧾', skipRecordEvent: true,
    desc: '小项目已经交付，对方却在支付尾款前要求额外加一页。定金已经到账，你要怎样回应？', apply() {} },
];

export function takeDueFollowups(s) {
  const due = [], remaining = [];
  for (const item of s.eventFollowups ?? []) {
    if (item.dueDay > s.day) { remaining.push(item); continue; }
    const definition = FOLLOW_UP_EVENTS.find(e => e.id === item.id);
    if (definition) due.push({ ...definition });
  }
  s.eventFollowups = remaining;
  return due;
}

// Only these situations ask for decisions. All other events remain factual notices.
const SCENARIOS = {
  evt_network: {
    prompt: '学长说今晚可以帮你递简历，但你觉得项目描述还不够清楚。要赶这一次，还是请他先帮忙把关？',
    choices: e => [original(e, '先投出去，接受这次内推'),
      choice('review', '请学长先批改，等回复再完善', '精力 -8；两天后收到批注，综合素质 +6、面试发挥 +2。临近截止则提前回复。', s => { applyEnergyDelta(s, -8); schedule(s, 'evt_network_feedback', 2); }),
      decline('暂时不麻烦学长')],
  },
  evt_ill: {
    mode: 'response', before: e => e.apply,
    prompt: '你已经感冒了，精力下降和感冒未愈状态已经发生。接下来的安排还可以调整，但不能把生病当作没发生。',
    choices: () => [choice('original', '保留今天的安排', '不额外消耗资源，带着感冒状态继续。', () => {}),
      choice('care', '买药、吃饭，腾出一段时间休养', '现金 -120，行动点 -1，精力 +6；本次感冒减益仍保留，持续期缩短一天。', s => { applyMoneyDelta(s, -120); s.actionPoints--; applyEnergyDelta(s, 6); const fx = [...s.transientEffects].reverse().find(f => f.label.startsWith('感冒未愈')); if (fx) fx.untilDay = Math.max(s.day, fx.untilDay - 1); }, { money: 120, actionPoints: 1 }),
      choice('rest', '取消一段准备时间，回宿舍睡觉', '行动点 -1，精力 +10；感冒减益仍按原期限持续。', s => { s.actionPoints--; applyEnergyDelta(s, 10); }, { actionPoints: 1 })],
  },
  evt_mock: {
    prompt: '模拟面试还有一个上台名额。老师也愿意留下来做深度点评，不过会占用你的准备时间。',
    choices: e => [original(e, '上台完整练一轮'),
      choice('coach', '留下来复盘回答中的漏洞', '行动点 -1，精力 -10，面试发挥 +8；不获得普通模拟面试的临时增益。', s => { s.actionPoints--; applyEnergyDelta(s, -10); interview(s, 8); }, { actionPoints: 1 }),
      choice('observe', '只旁听，记下常见问题', '精力 -2，面试发挥 +1。', s => { applyEnergyDelta(s, -2); interview(s, 1); })],
  },
  evt_rumor: {
    prompt: '群里转发了一张裁员截图，没有来源。你正在准备这个行业的岗位，要花时间确认吗？',
    choices: () => [choice('verify', '向从业的校友核实', '精力 -6；60% 概率获得有用建议，综合素质 +3；否则消息仍无法确认，压力 +3。', s => { applyEnergyDelta(s, -6); if (Math.random() < .6) { resume(s, 3); addLog(s, '校友提醒你避开收缩中的业务，项目描述有了调整方向。'); } else { stress(s, 3); addLog(s, '校友也没有确切消息，这次查证没有结果。'); } }),
      choice('mute', '不转发，继续准备现有岗位', '不改变当前资源，也不附加行业焦虑状态。', () => {})],
  },
  evt_side: {
    prompt: '有人找你做一个小项目。可以只拿作品集授权，也可以谈报酬：先付定金，交付后再结尾款。',
    choices: e => [original(e, '只做能放进作品集的部分'),
      choice('paid', '接付费单，先收定金', '行动点 -1，精力 -12，定金 +100；两天后处理交付与尾款。临近截止则提前处理。', s => { s.actionPoints--; applyEnergyDelta(s, -12); applyMoneyDelta(s, 100); schedule(s, 'evt_side_revision', 2); }, { actionPoints: 1 }),
      decline('不接单，留出求职时间')],
  },
  evt_side_revision: {
    prompt: '对方拖着 250 元尾款，说“再加一页就付款”。定金已经收下，你可以让步，也可以重新谈范围。',
    choices: () => [choice('finish', '做完加页，尽快结清', '精力 -10，现金 +250，综合素质 +3。', s => { applyEnergyDelta(s, -10); applyMoneyDelta(s, 250); resume(s, 3); }),
      choice('negotiate', '加需求要加钱', '精力 -4；65% 概率拿到尾款及加价共 400 元，否则只保留此前定金、压力 +5。', s => { applyEnergyDelta(s, -4); if (Math.random() < .65) { applyMoneyDelta(s, 400); addLog(s, '对方接受加价，尾款到账。'); } else { stress(s, 5); addLog(s, '对方拒绝加价，合作终止；此前定金保留。'); } }),
      choice('close', '按原范围结项，协商折价收尾', '现金 +120；放弃剩余尾款，不再消耗精力。', s => applyMoneyDelta(s, 120))],
  },
  evt_client_change: {
    prompt: '甲方发来“微调一下”，附件却像是整包重做。你得先把修改范围说清楚。',
    choices: () => [choice('redo', '帮这一次，换作品展示授权', '精力 -12，压力 +4，综合素质 +5。', s => { applyEnergyDelta(s, -12); stress(s, 4); resume(s, 5); }),
      choice('scope', '逐项确认，只改约定范围', '精力 -4，面试发挥 +2：练习解释方案和边界。', s => { applyEnergyDelta(s, -4); interview(s, 2); }),
      choice('refuse', '拒绝新增需求，结束合作', '压力 +3；保留今天的时间。', s => stress(s, 3))],
  },
  evt_exam: {
    prompt: '明天还有一门考试，今晚的复习必须与秋招准备争时间。',
    choices: () => [choice('study', '空出两段时间系统复习', '行动点 -2，精力 -5；简历进度不倒退。', s => { s.actionPoints -= 2; applyEnergyDelta(s, -5); }, { actionPoints: 2 }),
      choice('cram', '熬夜突击，保住白天安排', '精力 -18，压力 +8。', s => { applyEnergyDelta(s, -18); stress(s, 8); }),
      choice('notes', '找同学借重点，压缩准备范围', '现金 -30 请客，精力 -8，压力 +4。', s => { applyMoneyDelta(s, -30); applyEnergyDelta(s, -8); stress(s, 4); }, { money: 30 })],
  },
  evt_fx_peer_offer: {
    mode: 'response', before: () => s => stress(s, 4),
    prompt: '室友晒了 Offer，你还是有些焦虑（压力已 +4）。晚饭时，他主动问你最近投得怎么样。',
    choices: () => [choice('ask', '请他讲讲面试中被追问的项目', '精力 -5，面试发挥 +3。', s => { applyEnergyDelta(s, -5); interview(s, 3); }),
      choice('practice', '约他帮忙模拟一轮', '行动点 -1，精力 -8，面试发挥 +6。', s => { s.actionPoints--; applyEnergyDelta(s, -8); interview(s, 6); }, { actionPoints: 1 }),
      decline('祝贺他，今晚先按自己的节奏来')],
  },
  evt_ent_scratch: {
    prompt: '柜台还有一张 20 元刮刮乐，要不要试试？',
    choices: e => [{ ...original(e, '买一张'), hint: '现金 -20，压力 -3；8% 概率额外获得 80 元。', requires: { money: 20 } },
      choice('leave', '结账离开', '不购买，不改变资源。', () => {})],
  },
  evt_ent_farm: {
    prompt: '朋友邀请你去农家乐待两天。要暂时离开招聘消息，还是只去吃一顿饭？',
    choices: e => [{ ...original(e, '住一晚，暂别秋招'), requires: { money: 220 } },
      choice('meal', '只参加聚餐，当天回来', '现金 -60，精力 -4，压力 -6；不跳过日期。', s => { applyMoneyDelta(s, -60); applyEnergyDelta(s, -4); stress(s, -6); }, { money: 60 }),
      choice('skip', '婉拒，保持原来的日程', '不花钱、不跳日，也不额外恢复精力。', () => {})],
  },
  evt_immigration_spam: {
    prompt: '中介来电提出另一条路线。你真的打算暂停这一季秋招吗？',
    choices: e => [original(e, '暂停秋招，准备留学材料'), choice('block', '屏蔽推销电话，继续求职', '不改变资源，不进入分叉结局。', () => {})],
  },
  evt_credit_email: {
    prompt: '学分预警需要处理。你可以暂停求职，也可以立刻腾出时间核对补修计划。',
    choices: e => [original(e, '先解决毕业问题，结束本局'),
      choice('repair', '联系教务，安排补修', '行动点 -2，精力 -15，压力 +6；继续秋招。', s => { s.actionPoints -= 2; applyEnergyDelta(s, -15); stress(s, 6); }, { actionPoints: 2 })],
  },
  evt_headhunter_rush: {
    prompt: '猎头只给出口头承诺，还在催你立即答应。你准备在没有正式材料时结束求职吗？',
    choices: e => [original(e, '接受口头意向，结束本局'),
      choice('wait', '要求正式材料，继续投递', '不新增 Offer、不改变资源；口头意向不算正式录用。', () => {})],
  },
};

export function getEventInteraction(event) {
  if (event.interaction) return event.interaction;
  const scenario = SCENARIOS[event.id];
  if (!scenario) return { mode: 'notice', prompt: event.desc, choices: [] };
  return { mode: scenario.mode ?? 'choice', prompt: scenario.prompt, choices: scenario.choices(event), before: scenario.before?.(event) };
}

export function eventChoiceUnavailable(state, selected) {
  if ((state.money ?? 0) < (selected.requires?.money ?? 0)) return '现金不足';
  if ((state.actionPoints ?? 0) < (selected.requires?.actionPoints ?? 0)) return '行动点不足';
  return '';
}
