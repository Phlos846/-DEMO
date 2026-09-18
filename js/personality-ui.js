import { personalityMechanics } from './traits.js?v=1.1.19';
import { talentLineBubbleHtml } from './talents.js?v=1.1.19';

export function personalityDetailsHtml(personality, scope = 'personality') {
  const desc = personalityMechanics(personality.id).join('\n') + '\n数值为基础修正，可叠加；最终效果受天赋、状态、浮动与上限影响。投递准备每轮计算一次。';
  return talentLineBubbleHtml({ id: personality.id, name: personality.name, desc }, scope);
}
