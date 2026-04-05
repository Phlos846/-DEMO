/**
 * 玩家天赋：每局 1–2 个；稀有度配色 + 权重
 * 稀有度先验（权重合计 100）：金 4.5% / 紫 22% / 蓝 30% / 白 38.5% / 黑 5%
 * 金为原 1.5×；蓝紫不变；白略降。
 */

function rnd() {
  return Math.random();
}

/** 稀有度 → 先验权重（合计 100；金可用小数以保持 1.5×） */
export const RARITY_WEIGHT = {
  gold: 4.5,
  purple: 22,
  blue: 30,
  white: 38.5,
  black: 5,
};

export const RARITY_CLASS = {
  gold: "talent-gold",
  purple: "talent-purple",
  blue: "talent-blue",
  white: "talent-white",
  black: "talent-black",
};

/**
 * pickWeight：同稀有度池内相对权重
 */
export const TALENTS = [
  // —— 金色 ——
  {
    id: "big_heart",
    name: "大心脏",
    rarity: "gold",
    pickWeight: 10,
    desc: "事件与「零 Offer 焦虑」带来的压力增长大幅降低。",
  },
  {
    id: "efficient",
    name: "高效率",
    rarity: "gold",
    pickWeight: 10,
    desc: "每日行动点 +1。",
  },
  {
    id: "genius",
    name: "天才",
    rarity: "gold",
    pickWeight: 8,
    desc: "初始属性大幅提升，并固定附赠高学历（985/清北/海归档）+ 研究生词条。",
  },
  {
    id: "bluff",
    name: "虚张声势",
    rarity: "gold",
    pickWeight: 9,
    desc: "每份 Offer 显示薪资 +20%；简历/面试通过概率小幅提升。",
  },
  {
    id: "connection",
    name: "家里有关系",
    rarity: "gold",
    pickWeight: 7,
    desc: "每个新自然日有小概率直接拿到一份高薪「关系 Offer」。",
  },
  {
    id: "golden_touch",
    name: "点石成金手",
    rarity: "gold",
    pickWeight: 6,
    desc: "每日生活费以外，额外获得少量现金（蚊子腿也是肉）。",
  },
  // —— 紫色 ——
  {
    id: "frugal",
    name: "省吃俭用",
    rarity: "purple",
    pickWeight: 12,
    desc: "每个自然日生活费（金钱消耗）-50%。",
  },
  {
    id: "mind_strong",
    name: "心理强大",
    rarity: "purple",
    pickWeight: 12,
    desc: "所有来源的压力增加值减少。",
  },
  {
    id: "pressure_king",
    name: "耐压王",
    rarity: "purple",
    pickWeight: 10,
    desc: "压力首次达到 79 后，7 个自然日内压力不再上升（每局限 1 次）。",
  },
  {
    id: "love_study",
    name: "爱学习",
    rarity: "purple",
    pickWeight: 11,
    desc: "「学习」行动收益提高。",
  },
  {
    id: "maimai_lurker",
    name: "脉脉潜水员",
    rarity: "purple",
    pickWeight: 9,
    desc: "侧面打听消耗精力额外 -2（不低于全局下限）。",
  },
  {
    id: "resume_tailor",
    name: "简历裁缝",
    rarity: "purple",
    pickWeight: 10,
    desc: "投递准备阶段精力消耗略降，简历完整度微增。",
  },
  // —— 蓝色 ——
  {
    id: "otaku_pro",
    name: "冻鳗高手",
    rarity: "blue",
    pickWeight: 12,
    desc: "被游戏/动画相关岗位捞起的概率提高（标签匹配）。",
  },
  {
    id: "worker_king",
    name: "打工王",
    rarity: "blue",
    pickWeight: 12,
    desc: "每个自然日开始时额外获得现金，不消耗行动点。",
  },
  {
    id: "cattle",
    name: "天生牛马",
    rarity: "blue",
    pickWeight: 11,
    desc: "精力上限与休息恢复提高；获得 Offer 概率小幅提高。",
  },
  {
    id: "ppt_weaver",
    name: "PPT 纺织匠",
    rarity: "blue",
    pickWeight: 10,
    desc: "学习时简历完整度额外提升（排版魂觉醒）。",
  },
  {
    id: "coffee_life",
    name: "咖啡续命",
    rarity: "blue",
    pickWeight: 9,
    desc: "每日生活费 +10，但休息恢复的精力略多。",
  },
  // —— 白色 ——
  {
    id: "normal_human",
    name: "正常人",
    rarity: "white",
    pickWeight: 14,
    desc: "神人辈出的年代，普通反而稳：全属性微幅正向修正。",
  },
  {
    id: "parttime",
    name: "兼职",
    rarity: "white",
    pickWeight: 12,
    desc: "偶数日最大行动点 -1，但获得额外现金；Offer 概率微升。",
  },
  {
    id: "night_owl",
    name: "熬夜冠军",
    rarity: "white",
    pickWeight: 11,
    desc: "奇数日最大行动点 +1；跨日时被动精力恢复下降。",
  },
  {
    id: "pinhaofan",
    name: "拼好饭",
    rarity: "white",
    pickWeight: 10,
    desc: "每日生活费 -50%，但小概率吃坏肚子进医院（扣钱扣精力）。",
  },
  {
    id: "clear_eyed",
    name: "清澈大学生",
    rarity: "white",
    pickWeight: 10,
    desc: "随机事件里「踩坑」概率略高，但心态意外地好（压力波动变小）。",
  },
  {
    id: "offer_hunter",
    name: "海投练习生",
    rarity: "white",
    pickWeight: 9,
    desc: "单次投递精力 -1，但更容易手滑多投（简历过筛微幅波动）。",
  },
  // —— 黑色 ——
  {
    id: "david",
    name: "大卫带",
    rarity: "black",
    pickWeight: 12,
    desc: "每日生活费 +50%（消费升级，钱包降级）。",
  },
  {
    id: "corn",
    name: "玉米蒸",
    rarity: "black",
    pickWeight: 11,
    desc: "压力更容易上涨，且初始压力更高。",
  },
  {
    id: "rent",
    name: "租房",
    rarity: "black",
    pickWeight: 10,
    desc: "开局 -200 现金；每满 10 个自然日再付房租 -200。",
  },
  {
    id: "exe_not_responding",
    name: "秋招.exe 未响应",
    rarity: "black",
    pickWeight: 9,
    desc: "每个新自然日有 12% 概率当天最大行动点临时 -1（人生卡顿）。",
  },
  {
    id: "boss_is_watching",
    name: "已读不回模拟器",
    rarity: "black",
    pickWeight: 8,
    desc: "零 Offer 时额外焦虑（压力）更明显；但一旦上岸，减压也更快。",
  },
];

export function talentById(id) {
  return TALENTS.find((t) => t.id === id);
}

export function hasTalent(state, id) {
  return state.playerTalents?.some((t) => t.id === id);
}

function pickWeightedPool(items, weightKey = "pickWeight") {
  const total = items.reduce((s, x) => s + x[weightKey], 0);
  let r = rnd() * total;
  for (const x of items) {
    r -= x[weightKey];
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

function pickRarity() {
  const entries = Object.entries(RARITY_WEIGHT);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return "white";
}

/** 每局随机 1–2 个不重复天赋 */
export function rollPlayerTalents() {
  const count = rnd() < 0.52 ? 1 : 2;
  const picked = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const rarity = pickRarity();
    const pool = TALENTS.filter((t) => t.rarity === rarity && !used.has(t.id));
    if (pool.length === 0) {
      const fallback = TALENTS.filter((t) => !used.has(t.id));
      if (!fallback.length) break;
      const t = pickWeightedPool(fallback);
      picked.push({ ...t });
      used.add(t.id);
      continue;
    }
    const t = pickWeightedPool(pool);
    picked.push({ ...t });
    used.add(t.id);
  }
  return picked;
}

export function formatTalentsLog(talents) {
  return talents.map((t) => `天赋[${t.name}]：${t.desc}`);
}
