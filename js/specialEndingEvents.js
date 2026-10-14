import { applyEnergyDelta, applyStressDelta, applyMoneyDelta } from './talentRuntime.js?v=1.1.42';
import { SPECIAL_ENDINGS } from './specialEndingContent.js?v=1.1.42';

function log(s, msg) { s.log.unshift({ day: s.day, msg }); if (s.log.length > 80) s.log.pop(); }
function quality(s, n) { s.resumeQuality = Math.min(s.resumeQualityMax ?? 120, s.resumeQuality + n); }
function later(s, id, days) {
  s.eventFollowups ??= [];
  const dueDay = Math.min(s.day + days, s.maxDays ?? 30);
  if (dueDay <= s.day) {
    s.eventModalQueue ??= [];
    s.eventModalQueue.push({ ...SPECIAL_FOLLOWUPS.find(e => e.id === id) });
    log(s, '临近秋招截止，对方当天给出了后续回复。');
  } else {
    s.eventFollowups.push({ id, dueDay });
    log(s, `约定第 ${dueDay} 天处理后续。`);
  }
}
const option = (id, label, hint = '', apply = () => {}, requires = {}, immediateSettle = false) => ({ id, label, hint, apply, requires, immediateSettle });
const finish = (s, id) => { s.eventImmediateEnding = { ...SPECIAL_ENDINGS.find(e => e.id === id) }; };
function event(id, title, emoji, prompt, choices, extra = {}) {
  return { id, title, emoji, desc: prompt, weight: .75, maxPerRun: 1,
    interaction: { mode: 'choice', prompt, choices }, apply() {}, ...extra };
}

export const SPECIAL_FOLLOWUPS = [
  event('evt_indie_first_customer', '第一位用户发来付款截图', '💳',
    '你发布的小工具真的有人愿意付费。对方还带来了几条需求：接下来把它当成职业尝试，还是保留为求职作品？', [
      option('launch', '给独立开发一个试运营期，结束本局', '收到首批订阅款 600 元；进入「独立开发」结局。这不是稳定收入保证。', s => {
        applyMoneyDelta(s, 600); finish(s, 'event_indie_maker');
      }, {}, true),
      option('portfolio', '保留副业，把反馈整理进作品集', '保留客户关系，继续秋招；这笔订阅款仍会到账。', s => {
        applyMoneyDelta(s, 600); quality(s, 4); log(s, '用户的真实反馈，成了作品集中最有说服力的一页。');
      }),
    ], { skipRecordEvent: true }),
  event('evt_shop_trial_ledger', '试营业后的账本', '🧾',
    '试营业结束，你和朋友一起算完了流水。朋友愿意长期合作，但正式开店还需要你补一笔筹备费。', [
      option('open', '投入筹备费，一起经营小店，结束本局', '支付 800 元筹备费，进入「街角小店」结局。', s => {
        applyMoneyDelta(s, -800); finish(s, 'event_corner_shop');
      }, { money: 800 }, true),
      option('settle', '只做这次短期帮忙，结清后继续求职', '收到约定的 350 元结算款，继续秋招。', s => { applyMoneyDelta(s, 350); applyStressDelta(s, -4, 'event'); }),
      option('notes', '将这次经营经历整理成项目案例', '放弃本次结算款，换取案例使用与整理时间。', s => { quality(s, 6); applyEnergyDelta(s, -4); }),
    ], { skipRecordEvent: true }),
  event('evt_remote_contract', '远程团队寄来的合同', '📄',
    '试作已经验收。团队把薪资、协作时间和试用安排写进了正式合同，并询问你是否愿意加入。', [
      option('sign', '接受远程岗位，结束本局', '取得年薪 14万—18万的远程岗位 Offer，进入「远程入职」结局。', s => {
        s.offers.push({ companyId: 'special_remote_team', name: '像素桥远程协作团队', logo: '🌐',
          salaryTier: '年薪14万-18万', tags: ['远程协作', '双休', '项目交付'], industry: 'internet', isPyramidTrap: false });
        s.playerChosenOffer = s.offers[s.offers.length - 1];
        finish(s, 'event_remote_team');
      }, {}, true),
      option('decline', '结清试作费用，继续寻找合适岗位', '收取 180 元试作报酬，暂不接受录用；继续秋招。', s => { applyMoneyDelta(s, 180); }),
      option('refer', '谢绝岗位，把机会转给朋友', '不收试作报酬，也不获得 Offer；留下这次合作经验。', s => { quality(s, 3); applyStressDelta(s, -5, 'event'); }),
    ], { skipRecordEvent: true }),
];

export const SPECIAL_ROUTE_EVENTS = [
  event('evt_indie_tool', '凌晨写出的小工具', '🛠️',
    '你解决了一个自己反复遇到的小麻烦。有人建议把工具公开，让真正的用户试试看；上线需要一点现金和维护时间。', [
      option('publish', '付费部署，开放第一批试用', '现金 -300、精力 -10；约 3 天后收到用户反馈，届时再决定是否转向独立开发。', s => {
        applyMoneyDelta(s, -300); applyEnergyDelta(s, -10); later(s, 'evt_indie_first_customer', 3);
      }, { money: 300 }),
      option('local', '先作为个人作品继续打磨', '暂不上线，不开启独立开发后续。', s => { applyEnergyDelta(s, -5); quality(s, 2); }),
      option('shelve', '先搁置，继续投递'),
    ], { requires: { dayMin: 8, energyMin: 18 }, eligible: s => (s.studyCount ?? 0) >= 5 || (s.pathStartup ?? 0) >= 1 }),
  event('evt_shop_trial', '朋友的小店缺一个帮手', '☕',
    '朋友想试营业一家街角小店，邀请你一起试两天。可以分担物料、亲自参与，也可以只帮忙看一眼宣传文案。', [
      option('trial', '分担物料，参与试营业', '现金 -200、精力 -8；约 2 天后一起结算账目。此时不会结束秋招。', s => {
        applyMoneyDelta(s, -200); applyEnergyDelta(s, -8); later(s, 'evt_shop_trial_ledger', 2);
      }, { money: 200 }),
      option('copy', '只帮忙润色宣传文案', '保留这段短暂的协作经历，不参加试营业。', s => { applyEnergyDelta(s, -3); quality(s, 1); }),
      option('pass', '婉拒，先顾好自己的求职'),
    ], { requires: { dayMin: 7, energyMin: 16 } }),
  event('evt_remote_trial', '开源仓库里的合作邀请', '🌐',
    '一个远程团队看到了你的项目。他们没有要求你立即承诺入职，而是邀请你先完成一份小型试作，看看彼此的协作方式。', [
      option('trial', '完成试作，看看是否合拍', '精力 -12；约 3 天后回复验收与合同。收到合同后仍可拒绝。', s => {
        applyEnergyDelta(s, -12); later(s, 'evt_remote_contract', 3);
      }),
      option('discuss', '只交流项目，暂不参加试作', '交换一次技术经验，继续原来的求职计划。', s => { applyEnergyDelta(s, -4); s.hiddenInterview = Math.min(100, s.hiddenInterview + 2); }),
      option('pass', '目前更想找线下岗位'),
    ], { requires: { dayMin: 10, studyMin: 4, energyMin: 20 } }),
  event('evt_planned_pause', '给自己留一段空白', '🌿',
    '最近的招聘消息让你越来越紧绷。家人愿意让你回去住一阵；你也可以保留秋招计划，只把今天剩下的安排放轻一点。', [
      option('pause', '写下休整计划，主动结束本局', '进入「主动暂停」结局；这是主动转向，不属于成功求职奖励。', s => finish(s, 'event_planned_pause'), {}, true),
      option('call', '打个电话，继续这一季秋招', '先把近况说出来，接受一点支持。', s => applyStressDelta(s, -8, 'event')),
      option('continue', '今天先不决定，继续手头安排'),
    ], { requires: { dayMin: 15, stressMin: 75 }, eligible: s => s.offers.length === 0 }),
];
