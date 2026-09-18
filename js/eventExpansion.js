import { applyEnergyDelta, applyStressDelta, applyMoneyDelta } from './talentRuntime.js?v=1.1.19';
import { clampResumeToCap, addLog } from './state.js?v=1.1.19';

// Shared numeric settlement only; prompts and decisions are authored per situation.
function effect(s, values) {
  for (const [key, value] of Object.entries(values)) {
    if (key === 'energy') applyEnergyDelta(s, value);
    if (key === 'stress') applyStressDelta(s, value, 'event');
    if (key === 'money') applyMoneyDelta(s, value);
    if (key === 'ap') s.actionPoints += value;
    if (key === 'resume') s.resumeQuality = clampResumeToCap(s, s.resumeQuality + value);
    if (key === 'interview') s.hiddenInterview = Math.max(0, Math.min(100, s.hiddenInterview + value));
  }
}
const labels = {energy:'精力',stress:'压力',money:'现金',ap:'行动点',resume:'综合素质',interview:'面试发挥'};
const describe = values => Object.entries(values).map(([k,v]) => `${labels[k]} ${v > 0 ? '+' : ''}${v}`).join('，') || '不改变资源';
function option(id, label, values, extra = '') {
  return { id, label, hint: describe(values) + (extra ? `；${extra}` : '。'),
    requires: { money: Math.max(0, -(values.money ?? 0)), actionPoints: Math.max(0, -(values.ap ?? 0)) },
    apply: s => effect(s, values), immediateSettle: false };
}
function gamble(id,label,cost,p,win,lose,success,failure) {
  const c = option(id,label,cost);
  c.hint = `${describe(cost)}；${Math.round(p*100)}% 概率：${describe(win)}；否则：${describe(lose)}。`;
  c.apply = s => { effect(s,cost); const passed = Math.random() < p; effect(s,passed ? win : lose); addLog(s,passed ? success : failure); };
  return c;
}
const pass = label => option('pass',label,{});
function decision(id,title,desc,choices,entertainment=false) {
  return { id:`evt_new_${id}`,title,desc,emoji:entertainment?'🎈':'📌',weight:1,maxPerRun:entertainment ? Infinity : 1,
    ...(entertainment ? {tags:['entertainment']} : {}),
    interaction:{mode:'choice',prompt:desc,choices},apply() {} };
}

export const EXPANSION_EVENTS = [
  decision('booth','宣讲会的最后十分钟','宣讲会快结束了，HR 身边排着队，旁边的技术负责人正收电脑。你只能赶上一边。',[
    option('hr','排 HR 的队，核对岗位要求',{energy:-5,resume:3}),
    option('tech','找技术负责人聊项目',{energy:-8,interview:4}),
    pass('回去准备明天的投递')]),
  decision('portfolio','作品集链接打不开','朋友测试了你的作品集：校园网能开，外网却不稳定。投递前要怎样处理？',[
    option('pdf','做一份离线 PDF 备用',{ap:-1,energy:-4,resume:5}),
    option('host','付费迁移到稳定托管',{money:-80,energy:-3,resume:3}),
    option('trim','删掉失效链接，保留文字说明',{resume:-1})]),
  decision('whiteboard','白板练习搭子','同学愿意陪你练一小时白板题，但他也想让你帮忙检查项目介绍。',[
    option('exchange','互相当面试官',{ap:-1,energy:-8,interview:6}),
    option('review','只交换项目介绍做批注',{energy:-5,resume:3}),
    pass('今天先不约')]),
  decision('salary','招聘群的薪资小调查','群里有人整理薪资区间，邀请大家补充信息。你可以花时间核实，也可以只听听。',[
    option('research','查招聘页，核对口径',{energy:-6,interview:3}),
    gamble('chat','私聊陌生群友问细节',{energy:-3},.55,{interview:4},{stress:3},'对方解释了总包与基本工资的区别。','聊到最后，对方只想卖课程。'),
    pass('先收藏，不参与讨论')]),
  decision('alumni','校友茶话会的空位','校友会临时空出一个名额，需要自己承担餐费。另一位同学可以替你带问题。',[
    option('go','到场，带着具体问题交流',{money:-90,energy:-7,interview:5}),
    option('question','写一份问题清单托同学转交',{energy:-3,resume:2}),
    pass('把名额让给别人')]),
  decision('certificate','证书冲刺班广告','广告承诺三天速成，但你的秋招日程已经很满。比起买承诺，你还有别的准备方式。',[
    option('sample','用公开样题查漏补缺',{ap:-1,energy:-6,interview:4}),
    option('materials','购买练习材料自行准备',{money:-60,energy:-4,resume:2}),
    pass('不增加新的学习任务')]),
  decision('group','群面练习里的抢话者','练习群面时有人不断打断别人。这次没有招聘结果，但正适合练习应对。',[
    option('moderate','提议按顺序发言，主持讨论',{energy:-8,stress:2,interview:5}),
    option('notes','记录分歧，最后做总结',{energy:-5,interview:3}),
    option('leave','提前离场，结束这次练习',{stress:2})]),
  decision('photo','证件照重拍优惠','照相馆给毕业生打折；室友说用手机和白墙也能拍。你更想花钱还是花时间？',[
    option('studio','去照相馆拍一套',{money:-99,resume:2}),
    option('roommate','和室友互拍，再做简单裁切',{energy:-6,resume:2}),
    pass('沿用现有照片')]),
  decision('project','旧项目还能讲清楚吗','翻到去年做的项目，你发现自己已经忘记当时为什么选择那种方案。',[
    option('rebuild','重新运行项目，补一份复盘',{ap:-1,energy:-10,resume:4,interview:3}),
    option('read','只梳理技术选型与取舍',{energy:-5,interview:3}),
    option('remove','从简历移除讲不清的部分',{resume:-2,stress:-2})]),
  decision('hackathon','周末小型挑战赛','一个半天的挑战赛正在招队友。奖品不高，但可以留下一个完整的小作品。',[
    option('build','参加并负责实现',{ap:-1,energy:-12,resume:6}),
    option('pitch','帮助队伍整理展示稿',{energy:-6,interview:3}),
    pass('不临时增加日程')]),
  decision('mentor','老师愿意看一次简历','老师说今晚有空，但希望你带一个明确问题过去，不能把整份简历丢给他。',[
    option('story','请教如何解释项目贡献',{energy:-6,resume:4}),
    option('direction','请教自己适合什么岗位',{energy:-4,interview:2,stress:-2}),
    pass('等自己整理好问题再说')]),
  decision('reference','同学请你互写项目评价','一起做过项目的同学希望交换真实评价。回忆细节需要时间，但能发现各自忽略的贡献。',[
    option('detail','认真列举彼此做过的工作',{energy:-7,resume:4}),
    option('call','语音聊十分钟，核对分工',{energy:-3,interview:2}),
    pass('没有把握，婉拒这次互评')]),
  decision('printing','打印店排起长队','明天要带纸质简历，校内打印店排队很长。你还没确认是不是必须彩印。',[
    option('queue','等一会儿，普通黑白打印',{money:-8,energy:-5}),
    option('express','去校外加急打印',{money:-35,energy:-2}),
    option('digital','联系主办方确认电子版要求',{energy:-3,interview:1})]),
  decision('room','自习室预约撞车','小组讨论和你的个人准备撞上了同一间自习室。双方都不太想换地方。',[
    option('share','协商分时使用',{energy:-4,interview:2}),
    option('cafe','换到安静咖啡店继续整理',{money:-28,resume:2}),
    option('library','走远一点去另一栋图书馆',{energy:-6,stress:-2})]),
  decision('budget','本月订阅即将续费','简历工具、网盘和题库订阅快同时扣款了。你可以趁现在整理一下。',[
    option('cancel','导出资料，取消不常用订阅',{energy:-5,money:40},'结算此前多付的可退订阅余额'),
    option('keep','只续真正用得上的题库',{money:-30,interview:2}),
    pass('先关闭自动续费，暂不续订')]),
  decision('commute','线下分享会突然改地址','你还没出门，主办方就发来新地址。继续赶过去要多花一笔交通费。',[
    option('taxi','拼车去现场提问',{money:-55,energy:-4,interview:4}),
    option('online','改看线上直播并整理笔记',{energy:-5,resume:2}),
    pass('退掉免费预约，保留时间')]),
  decision('pitch','一分钟自我介绍挑战','同学开了个练习房间，每人只有一分钟介绍自己，其他人只提一个最困惑的问题。',[
    option('live','直接开麦，练临场表达',{energy:-5,stress:2,interview:4}),
    option('record','先录音再听，删掉空话',{energy:-7,interview:4,resume:1}),
    pass('这次只看活动介绍')]),
  decision('bug','演示前发现小 Bug','个人项目的演示页有个边缘问题，不影响主要流程，但细问起来很尴尬。',[
    option('fix','定位并修复，补上说明',{ap:-1,energy:-8,resume:5}),
    option('explain','保留问题，准备解释与改进方案',{energy:-5,interview:3}),
    option('hide','撤掉这一段演示',{resume:-2})]),
  decision('boardgame','桌游缺一位主持人','桌游局缺主持人，朋友问你愿不愿意带新手。免费入场，但要多说很多话。',[
    option('host','主持规则讲解',{energy:-9,stress:-6,interview:2}),
    option('play','付费坐下当普通玩家',{money:-35,energy:-5,stress:-9}),
    pass('今晚不进局')],true),
  decision('movie','散场后的小讨论','朋友想在电影散场后聊聊剧情，你明天还有准备任务。',[
    option('talk','留下讨论，但约定半小时散场',{energy:-4,stress:-6,interview:1}),
    option('snack','请大家吃点东西再回去',{money:-32,energy:-2,stress:-8}),
    pass('道别回去，不续摊')],true),
  decision('walk','散步路线分岔','前面一条路通向热闹夜市，另一条绕湖回宿舍。你还可以直接折返。',[
    option('market','去夜市买点吃的',{money:-25,energy:-6,stress:-10}),
    option('lake','绕湖走一圈',{energy:-9,stress:-8}),
    pass('直接回宿舍，结束散步')],true),
  decision('music','朋友递来一把吉他','聚会时有人让你弹一首。你只会一点点，可以选熟悉的，也可以硬试新歌。',[
    option('familiar','弹一首熟悉的简单曲子',{energy:-3,stress:-5}),
    gamble('new','试试刚学的新歌',{energy:-5},.6,{stress:-12},{stress:4},'磕磕绊绊弹完，大家还是给你鼓了掌。','中间忘谱了，有点尴尬，朋友接过了吉他。'),
    pass('把吉他递给更熟练的朋友')],true),
  decision('sports','球场最后一局','队友想再打一局，你已经有些累了。可以继续打，也可以转去帮忙记分。',[
    option('play','再打一局就收工',{energy:-12,stress:-12}),
    option('score','留在场边记分聊天',{energy:-3,stress:-4}),
    pass('道别离场')],true),
  decision('cooking','合租厨房的晚饭邀约','室友准备一起做饭。你可以负责买菜、掌勺，或者各吃各的。',[
    option('shop','买菜，交给室友做',{money:-35,energy:6,stress:-4}),
    option('cook','用现有食材掌勺',{energy:-7,stress:-7}),
    pass('今天各自安排晚饭')],true),
  ...[
    ['weather','雨停了','出门时雨刚停，今天的通勤比想象中顺利。',{stress:-3}],
    ['maintenance','招聘网站临时维护','查询页面突然维护，只能晚些时候再看反馈。',{stress:3}],
    ['refund','交通退款到账','此前取消行程的交通退款到账了。',{money:25}],
    ['thanks','收到一条感谢消息','曾经帮过的同学发来感谢，你发现自己的经验确实有用。',{stress:-4}],
  ].map(([id,title,desc,values]) => ({id:`evt_new_${id}`,title,desc:`${desc}${describe(values)}。`,emoji:'📮',weight:.8,maxPerRun:1,apply:s=>effect(s,values)})),
];
