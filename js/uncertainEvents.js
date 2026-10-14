import { applyEnergyDelta, applyStressDelta, applyMoneyDelta } from './talentRuntime.js?v=1.1.42';

// Only known costs are previewed. Outcomes are narrated after resolution.
const result = narrative => ({ narrative });
const option = (id, label, hint, apply, requires = {}) => ({ id, label, hint, apply, requires });
const quality = (s, n) => { s.resumeQuality = Math.min(s.resumeQualityMax ?? 120, s.resumeQuality + n); };
const leave = label => option('leave', label, '不再投入时间，继续自己的安排。', () => result('你离开了现场，继续原来的安排'));
function event(id, title, emoji, prompt, choices, extra = {}) {
  return { id, title, emoji, desc: prompt, weight: 1.1, maxPerRun: 1, apply() {},
    interaction: { mode: 'choice', prompt, choices }, ...extra };
}

export function createQueueEvent(round = 0) {
  const prompt = round
    ? `已经等过 ${round} 轮，工作人员仍没叫到你。前面似乎有人离开了，但也有人拿着体验券走出来。还要继续吗？`
    : '街区的品牌体验活动排起了长队，听说完成体验会有答谢。队尾的人也说不准还要等多久。';
  return event('evt_uncertain_queue', round ? '队伍还没轮到你' : '看不到尽头的队伍', '🚶', prompt, [
    option('wait', '再等一轮', '消耗 1 行动点。可能轮到，也可能继续等待；行动点耗尽会空手结束排队。', s => {
      s.actionPoints--;
      // Exhaustion wins even if this round would otherwise have drawn a reward.
      if (s.actionPoints <= 0) return result('最后一点空闲时间用完了，你不得不离开队伍。这次没有拿到答谢');
      if (Math.random() < .4) {
        applyMoneyDelta(s, 150);
        applyStressDelta(s, -4, 'event');
        return result('终于轮到你了！体验很顺利，工作人员把答谢金转给了你');
      }
      s.eventModalQueue ??= [];
      s.eventModalQueue.unshift(createQueueEvent(round + 1));
      return result('队伍只向前挪了一小段，还没轮到你。你可以继续等，也可以现在离开');
    }, { actionPoints: 1 }),
    leave('不等了，提前离开'),
  ], { skipRecordEvent: round > 0, eligible: s => s.actionPoints >= 1 });
}

export const UNCERTAIN_EVENTS = [
  createQueueEvent(),
  event('evt_uncertain_stranger', '路口的求助声', '🙋',
    '一位陌生人拦住你，想请你帮忙去街角取点东西。他看起来很着急，但你并不知道真实情况。', [
      option('help', '跟过去帮一把', '可能是真正的求助，也可能被缠着推销；结果到了才知道。', s => {
        const roll = Math.random();
        if (roll < .45) {
          applyEnergyDelta(s, -4); applyMoneyDelta(s, 180);
          return result('对方搬着东西腾不出手。你帮忙送到门口后，他坚持给了你一笔感谢金');
        }
        if (roll < .8) {
          applyEnergyDelta(s, -9); applyStressDelta(s, 5, 'event');
          return result('所谓帮忙只是把你领进推销会场。你听了一通广告才脱身，身心都有些疲惫');
        }
        applyEnergyDelta(s, -3); applyStressDelta(s, -4, 'event');
        return result('对方确实需要搭把手，最后认真向你道谢。没有报酬，但这声谢谢让心情轻松了一点');
      }),
      option('ask', '先问清楚，只在路口帮忙', '先确认需要做什么，不跟着离开；可能只能提供一点有限的帮助。', s => {
        applyEnergyDelta(s, -2);
        if (Math.random() < .5) {
          applyMoneyDelta(s, 60);
          return result('原来只是不会操作取件页面。你当场帮他处理好，他发来一份小小的谢礼');
        }
        return result('你追问具体情况，对方却一直想带你去附近的店。你婉拒了，没有继续纠缠');
      }),
      leave('礼貌婉拒'),
    ], { maxPerRun: 2, cooldownDays: 7 }),
  event('evt_uncertain_bookstall', '旧书摊上的面试笔记', '📚',
    '摊主指着一本写满批注的旧笔记：“上一任主人靠它拿过好几个 Offer。”封面旧得看不出年份，内容到底有没有用只能自己判断。', [
      option('buy', '花钱买下，回去研究', '支付 50 元；可能发现有用思路，也可能买到过时资料。', s => {
        applyMoneyDelta(s, -50);
        if (Math.random() < .55) {
          quality(s, 4); s.hiddenInterview = Math.min(100, (s.hiddenInterview ?? 45) + 2);
          return result('批注里的项目复盘很有启发，你重新理清了自己的经历，也准备好了几个回答');
        }
        applyEnergyDelta(s, -5);
        return result('里面大半是已经过时的题库。你翻了半天，只好承认这次看走了眼');
      }, { money: 50 }),
      option('browse', '站在摊边先翻一翻', '消耗 3 精力；只浏览几页，不买下整本。', s => {
        applyEnergyDelta(s, -3);
        if (Math.random() < .35) {
          quality(s, 2); return result('一条批注恰好点醒了你。记下自己的想法后，你把笔记放回摊位');
        }
        return result('翻到的几页都没什么新东西。你放回笔记，决定继续用自己的资料');
      }),
      leave('不买，继续走'),
    ]),
  event('evt_uncertain_openmic', '临时空出来的麦克风', '🎤',
    '社区活动的分享嘉宾临时缺席，主持人问有没有人愿意上台聊聊最近的经历。观众还坐在下面，现场有点冷。', [
      option('speak', '上台讲讲自己的秋招', '消耗 1 行动点；可能获得认可，也可能遭遇冷场。', s => {
        s.actionPoints--;
        if (Math.random() < .5) {
          s.hiddenInterview = Math.min(100, (s.hiddenInterview ?? 45) + 3);
          applyMoneyDelta(s, 120); applyStressDelta(s, -6, 'event');
          return result('你坦诚的讲述引来共鸣，主持人还补上了一份串场酬谢。讲完后，你没那么害怕开口了');
        }
        applyEnergyDelta(s, -4); applyStressDelta(s, 8, 'event');
        return result('准备不足让你越讲越乱，台下反应寥寥。你提前结束分享，带着一点懊恼走下台');
      }, { actionPoints: 1 }),
      option('backstage', '不上台，帮主持人整理提纲', '消耗 5 精力；在幕后试着把活动接下去。', s => {
        applyEnergyDelta(s, -5);
        if (Math.random() < .5) {
          applyMoneyDelta(s, 60); return result('主持人用你的提纲顺利接住了场面，活动结束后给了你一份帮忙的酬谢');
        }
        s.hiddenInterview = Math.min(100, (s.hiddenInterview ?? 45) + 2);
        return result('活动总算继续了。虽然没有酬谢，你却从整理别人的讲述中学会了如何抓住重点');
      }),
      leave('留在台下，不参与'),
    ]),
];

UNCERTAIN_EVENTS.push(
  event('evt_uncertain_badge', '座椅上落下的参会证', '🎫',
    '招聘会散场时，你发现座椅上落着一本夹有参会证的笔记。服务台快关门了，证件上的公司还在另一栋楼。', [
      option('deliver', '绕去另一栋楼，亲手交还', '消耗 1 行动点；也许能找到失主，也可能白跑一趟。', s => {
        s.actionPoints--;
        const r = Math.random();
        if (r < .4) { applyMoneyDelta(s, 100); return result('失主正急着找笔记，接过后坚持报销了你的跑腿费'); }
        if (r < .75) { quality(s, 3); return result('失主是来分享经验的校友。他没有招聘名额，却顺手帮你梳理了项目介绍'); }
        applyEnergyDelta(s, -6); return result('楼里的活动已经结束。你只好把笔记交给保安，绕路也让你更累了');
      }, { actionPoints: 1 }),
      option('desk', '交给就近服务台', '交给工作人员处理，不再绕路寻找。', s => {
        if (Math.random() < .3) { applyStressDelta(s, -3, 'event'); return result('工作人员立刻联系到了失主，转达了一声郑重的谢谢，你放心地离开了'); }
        return result('工作人员登记了物品，你把寻找失主的事交给他们，继续自己的安排');
      }),
    ]),
  event('evt_uncertain_umbrella', '雨棚下借伞的人', '☂️',
    '大雨挡住了去路。旁边的人问能不能借你的伞去街对面拿东西，说马上就回来。你暂时看不清对面的招牌。', [
      option('lend', '把伞借出去，在原地等', '消耗 1 行动点；对方可能及时归还，也可能让你等得很狼狈。', s => {
        s.actionPoints--;
        if (Math.random() < .65) { applyEnergyDelta(s, 7); applyStressDelta(s, -4, 'event'); return result('对方很快带着伞回来，还捎了一杯热饮。你歇了一会儿，身上暖和了起来'); }
        applyEnergyDelta(s, -8); applyStressDelta(s, 4, 'event'); return result('等了很久，对方才从另一条街绕回来。雨没停，你接过伞时已经又冷又累');
      }, { actionPoints: 1 }),
      option('together', '不借出去，撑伞陪他走一趟', '消耗 5 精力；伞始终在自己手里，但这一趟未必有回报。', s => {
        applyEnergyDelta(s, -5);
        if (Math.random() < .4) { applyMoneyDelta(s, 50); return result('对方取到东西后，为耽误你的路程发来了一份谢礼'); }
        return result('到了街对面，对方向你道谢后匆匆走开。你也收好伞，继续赶路');
      }),
      leave('自己也赶时间，婉拒'),
    ], { maxPerRun: 2, cooldownDays: 8 }),
  event('evt_uncertain_socket', '咖啡馆最后一个插座', '🔌',
    '电脑快没电了，咖啡馆唯一带插座的桌子被人占着。店员说买杯饮料可以留下等，但对方什么时候走并不确定。', [
      option('wait', '买杯饮料，等座位空出来', '支付 25 元、消耗 1 行动点；也可能等完仍没能处理材料。', s => {
        applyMoneyDelta(s, -25); s.actionPoints--;
        if (Math.random() < .6) { quality(s, 4); return result('座位很快空了出来。你接上电，把一直拖着的项目介绍认真改完了'); }
        applyStressDelta(s, 4, 'event'); return result('饮料喝完了，对方还没有离开的意思。你的电脑彻底关机，只能改天再处理');
      }, { money: 25, actionPoints: 1 }),
      option('share', '问问能否轮流充电', '可能顺利协商，也可能被拒绝；不先购买饮料。', s => {
        if (Math.random() < .45) { quality(s, 2); return result('对方刚好快充满，腾出插座让你救急。你趁这点电把简历里的几处错字改掉了'); }
        applyStressDelta(s, 3, 'event'); return result('对方也急着交作业，没法让出插座。你有点失落，决定换个地方');
      }),
      leave('先收起电脑，换个地方'),
    ]),
  event('evt_uncertain_projector', '宣讲开始前的黑屏', '📽️',
    '宣讲会的投影突然黑了，工作人员忙得满头大汗。你似乎见过类似故障，但也不敢保证这次能解决。', [
      option('repair', '主动试着排查设备', '消耗 1 行动点；修好可能获得感谢，修不好也会耽误自己的时间。', s => {
        s.actionPoints--;
        if (Math.random() < .55) { applyMoneyDelta(s, 120); quality(s, 2); return result('你找到了松动的接口，让宣讲顺利开始。主办方补了一份劳务酬谢，你也多了一次解决实际问题的经历'); }
        applyEnergyDelta(s, -7); applyStressDelta(s, 3, 'event'); return result('问题出在设备内部，你没能修好。专业人员赶来接手，你只好疲惫地回到座位');
      }, { actionPoints: 1 }),
      option('coordinate', '帮忙联系场馆技术人员', '消耗 3 精力；把故障交给专业人员，自己负责协调。', s => {
        applyEnergyDelta(s, -3);
        if (Math.random() < .65) { s.hiddenInterview = Math.min(100, (s.hiddenInterview ?? 45) + 2); return result('你把故障现象说得很清楚，技术人员带着正确的线材赶到。临场沟通比你想象中顺利'); }
        return result('电话转了几次才找到负责的人。事情交接完，你回到座位，没有额外收获');
      }),
      leave('留在座位，等工作人员处理'),
    ]),
  event('evt_uncertain_resume_swap', '候场区的热心点评', '📝',
    '一位同样在等面试的人主动帮你看简历，语气很笃定：“这样写肯定更好。”建议听起来很新鲜，却未必适合你的经历。', [
      option('rewrite', '照着建议大幅修改', '消耗 1 行动点；可能补上短板，也可能越改越偏。', s => {
        s.actionPoints--;
        if (Math.random() < .55) { quality(s, 5); return result('他的建议正好指出了你忽略的问题。你把职责写成了具体成果，材料终于清楚起来'); }
        s.hiddenResume = Math.max(0, (s.hiddenResume ?? 50) - 3); applyStressDelta(s, 4, 'event');
        return result('你把原本真实的经历改成了空泛套话。重新读完才发现不对劲，只好准备再修一遍');
      }, { actionPoints: 1 }),
      option('question', '请他解释理由，只记下能用的部分', '消耗 5 精力；先核对建议与自己的经历是否吻合。', s => {
        applyEnergyDelta(s, -5);
        if (Math.random() < .65) { quality(s, 2); return result('一问一答后，你挑出了一条真正适用的建议，其余部分保持原样'); }
        return result('追问之后，对方也承认只是听别人这么说。你没有改动简历，结束了这次讨论');
      }),
      leave('感谢好意，保留自己的版本'),
    ], { requires: { dayMin: 5 } }),
  event('evt_uncertain_puzzle', '广场上的限时挑战', '🧩',
    '社区活动摆出一道限时谜题，答对的人可以领取奖品。有人已经解到一半，也有人说题目藏着文字陷阱。', [
      option('solo', '自己完整推一遍', '消耗 1 行动点；可能解开谜题，也可能在时限前走进死胡同。', s => {
        s.actionPoints--;
        if (Math.random() < .4) { applyMoneyDelta(s, 100); quality(s, 2); return result('你检查了题目的每个限定条件，赶在结束前给出答案，领到了活动奖金'); }
        applyEnergyDelta(s, -4); return result('直到主持人宣布答案，你才发现漏掉了一个条件。今天的奖品与你无缘');
      }, { actionPoints: 1 }),
      option('team', '和旁边的人一起拆题', '消耗 6 精力；也许能互相补足思路，但奖品需要分享。', s => {
        applyEnergyDelta(s, -6);
        if (Math.random() < .65) { applyMoneyDelta(s, 50); applyStressDelta(s, -3, 'event'); return result('你们从不同角度补齐了答案，平分奖金后又聊了几句，合作的过程颇为轻松'); }
        return result('你们一直没能统一对题意的理解，挑战结束时仍没有答案。各自道别后继续赶路');
      }),
      leave('看看热闹，不参加挑战'),
    ], { tags: ['entertainment'], maxPerRun: 2, cooldownDays: 7 }),
  event('evt_uncertain_portrait', '路边的求职照优惠', '📷',
    '临时摄影摊挂着“求职照当场交付”的牌子。样片看起来不错，旁边也有几位顾客对着修好的照片皱眉。', [
      option('pay', '花钱拍一组试试', '支付 60 元；成片可能合适，也可能修得不像自己。', s => {
        applyMoneyDelta(s, -60);
        if (Math.random() < .6) { s.hiddenResume = Math.min(100, (s.hiddenResume ?? 50) + 3); applyStressDelta(s, -3, 'event'); return result('照片干净自然，刚好替换掉旧简历上那张模糊的头像。看着新版本，你多了一点信心'); }
        applyStressDelta(s, 4, 'event'); return result('修图把五官改得太夸张，你最终没有使用这组照片，钱却已经付出去了');
      }, { money: 60 }),
      option('friend', '找同伴用手机互拍', '消耗 5 精力；省下费用，但光线和效果不一定理想。', s => {
        applyEnergyDelta(s, -5);
        if (Math.random() < .5) { s.hiddenResume = Math.min(100, (s.hiddenResume ?? 50) + 2); return result('你们找到了光线柔和的墙边，反复试了几个角度，终于拍到一张能用的'); }
        return result('反光和背景始终处理不好。你们看了看照片，决定这次还是先用旧照');
      }),
      leave('现在的照片够用，不换'),
    ]),
  event('evt_uncertain_translation', '展台前的临时翻译', '🌐',
    '一位外地参观者和展台工作人员聊不明白，希望有人帮忙转述。日常交流你还应付得来，产品里却夹着不少专业词。', [
      option('translate', '试着把整段介绍翻译完', '消耗 1 行动点；可能顺利帮上忙，也可能卡在专业词汇上。', s => {
        s.actionPoints--;
        if (Math.random() < .5) { applyMoneyDelta(s, 140); s.hiddenInterview = Math.min(100, (s.hiddenInterview ?? 45) + 2); return result('你用例子绕开了难懂的术语，双方终于谈清楚。展台负责人给了你一份临时协助的酬谢'); }
        applyEnergyDelta(s, -6); applyStressDelta(s, 4, 'event'); return result('一个术语把对话带偏了，你意识到不能继续硬译，只好请工作人员另找翻译');
      }, { actionPoints: 1 }),
      option('guide', '只帮他们找到双语资料', '消耗 3 精力；提供有限帮助，不接下整场翻译。', s => {
        applyEnergyDelta(s, -3);
        if (Math.random() < .6) { quality(s, 2); return result('翻找资料时，你也读懂了一段原本不熟悉的行业介绍，记下了几个值得继续了解的方向'); }
        return result('你找到资料二维码，把后续交流交还给双方，没有再留下来');
      }),
      leave('说明自己不熟悉，婉拒'),
    ]),
);
