import { applyEnergyDelta, applyStressDelta } from './talentRuntime.js?v=1.1.19';
import { addTransientEffect } from './transientEffects.js?v=1.1.19';
import { eventAvailableThisRun } from './eventRecurrence.js?v=1.1.19';

const recentStudy = s => Array.from({length:5}, (_,i) => s.studyByDay?.[s.day-i] ?? 0).reduce((a,b)=>a+b,0);
function effect(s, id, label, kind, values) {
  addTransientEffect(s,{id, label, kind, untilDay:s.day+1,...values});
}
const anxietyBefore = s => {
  applyEnergyDelta(s,-8);
  effect(s,'fx_cond_anxiety','焦虑余波：压力增长 ×1.15','debuff',{stressGainMult:1.15});
};
const anxietyPrompt = '投出的简历迟迟没有带来 Offer，你反复刷新消息，越看越难集中注意。精力 −8，今明两天压力增长 ×1.15。接下来怎样安排？';
export const CONDITIONAL_EVENTS = [
  { id:'evt_cond_anxiety',title:'焦虑袭来',emoji:'💭',tags:['conditional'],chance:.25,cooldownDays:7,maxPerRun:2,
    eligible:s=>s.day>=8 && s.stress>80 && s.energy<=40 && s.offers.length===0 && s.appliedIds.length>=10,
    desc:anxietyPrompt,apply:anxietyBefore,
    interaction:{mode:'response',prompt:anxietyPrompt,before:anxietyBefore,choices:[
      {id:'pause',label:'暂时关闭招聘消息，休息一会儿',hint:'行动点 −1，精力 +8；焦虑余波仍保留。',requires:{actionPoints:1},apply:s=>{s.actionPoints--;applyEnergyDelta(s,8);}},
      {id:'talk',label:'找信任的人聊聊近况',hint:'行动点 −1，压力 −10；焦虑余波仍保留。',requires:{actionPoints:1},apply:s=>{s.actionPoints--;applyStressDelta(s,-10,'event');}},
      {id:'continue',label:'先记下感受，按原计划继续',hint:'无额外消耗，保留已发生的影响。',apply(){}},
    ]}},
  { id:'evt_cond_exhaustion',title:'身体按下暂停键',emoji:'🔋',tags:['conditional'],chance:.25,cooldownDays:7,maxPerRun:2,
    eligible:s=>s.energy<20 && recentStudy(s)>=4,
    desc:'最近反复学习，眼前的字开始打转。精力 −6；今明两天精力消耗 ×1.1。',
    apply(s){applyEnergyDelta(s,-6);effect(s,'fx_cond_exhaustion','身体透支：精力消耗 ×1.1','debuff',{energyDrainMult:1.1});}},
  { id:'evt_cond_budget',title:'余额提醒撞上还款日',emoji:'🧾',tags:['conditional'],chance:.2,cooldownDays:6,maxPerRun:2,
    eligible:s=>s.money<300 && s.debt>=500 && s.stress>=60,
    desc:'余额已经见底，未还的账单还挂在那里。你重新算了一遍开销，压力 +5。',
    apply(s){applyStressDelta(s,5,'event');}},
  { id:'evt_cond_rhythm',title:'终于找回节奏',emoji:'🌤️',tags:['conditional'],chance:.15,cooldownDays:7,maxPerRun:2,
    eligible:s=>s.day>=8 && s.energy>=60 && s.stress<40 && s.studyCount>=5,
    desc:'此前的准备慢慢串了起来，今天也有余力面对新任务。压力 −5；今明两天主动休息等带来的精力恢复 ×1.1。',
    apply(s){applyStressDelta(s,-5,'event');effect(s,'fx_cond_rhythm','找回节奏：主动精力恢复 ×1.1','buff',{energyRecoverMult:1.1});}},
];

/** One draw per day, at most one result; failed rolls do not consume recurrence limits. */
export function takeConditionalEvent(state, random=Math.random) {
  if(state.gameOver || state.day<=1 || state.conditionalCheckDay===state.day)return null;
  state.conditionalCheckDay=state.day;
  const reserved=new Set((state.eventModalQueue??[]).map(e=>e.id));
  const triggered=CONDITIONAL_EVENTS.filter(e=>eventAvailableThisRun(e,state,reserved) && e.eligible(state) && random()<e.chance);
  if(!triggered.length)return null;
  return {...triggered[Math.floor(random()*triggered.length)]};
}
