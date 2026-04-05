/**
 * 玩家天赋：每局 2–3 个；稀有度配色 + 权重
 * 稀有度先验（权重合计 100）：金 4.5% / 紫 22% / 蓝 30% / 白 33.5% / 黑 10%
 * 黑较原 +5% 先验；白相应下调。
 */

function rnd() {
  return Math.random();
}

/** 稀有度 → 先验权重（合计 100；金可用小数以保持 1.5×） */
export const RARITY_WEIGHT = {
  gold: 4.5,
  purple: 22,
  blue: 30,
  white: 33.5,
  black: 10,
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
  {
    id: "ddl_warrior",
    name: "DDL 战士",
    rarity: "blue",
    pickWeight: 10,
    desc: "秋招最后 10 个自然日内，简历过筛与面试的通过概率为原来的 1.2 倍。",
  },
  {
    id: "thinner_bolder",
    name: "越薄越勇",
    rarity: "blue",
    pickWeight: 10,
    desc: "按当前简历完整度（绝对值）对简历/面试期望乘算：完整度为 0 时乘区为 0；完整度 1 时为 2 倍、50 时为 1.2 倍，其间线性；超过 50 仍按同斜率延伸（完整度越高乘区越低）。",
  },
  {
    id: "stress_to_power",
    name: "压力即动力",
    rarity: "blue",
    pickWeight: 10,
    desc: "压力上限变为 120；压力大于 80 时学习效率 +50%，小于 80 时学习效率 −80%（恰好 80 时不额外增减）。满压缓冲整场仅一次：首次顶满当日不立刻失败，次日仍满压则失败；该轮若曾降压离开满压，则视为缓冲已用尽，之后再满压将立刻失败。",
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
  {
    id: "frail_body",
    name: "体虚",
    rarity: "black",
    pickWeight: 8,
    desc: "跨日被动精力恢复明显降低（无正面补偿）。",
  },
  {
    id: "stage_fright",
    name: "面试怯场",
    rarity: "black",
    pickWeight: 8,
    desc: "面试期望通过率显著降低（简历不受影响）。",
  },
  {
    id: "resume_red_flag",
    name: "简历疑云",
    rarity: "black",
    pickWeight: 8,
    desc: "简历过筛期望显著降低（面试不受影响）。",
  },
  {
    id: "overthink",
    name: "精神内耗",
    rarity: "black",
    pickWeight: 7,
    desc: "每个新自然日开始时额外增加压力（纯负面）。",
  },
  {
    id: "echo_chamber",
    name: "信息茧房",
    rarity: "black",
    pickWeight: 7,
    desc: "每个新自然日求职匹配分（ELO）略降，岗位池整体更难匹配。",
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

/** 每局随机 2–3 个不重复天赋 */
export function rollPlayerTalents() {
  const count = rnd() < 0.55 ? 2 : 3;
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

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 天赋名为按钮，具体效果在气泡内（非弹窗）。
 * @param {{ id: string, name: string, desc: string, rarity?: string }} talent
 * @param {string} uidSuffix 区分主界面 / 结局等同屏多处
 */
export function talentLineBubbleHtml(talent, uidSuffix) {
  const cls = RARITY_CLASS[talent.rarity] ?? "talent-white";
  const id = `tb-${talent.id}-${uidSuffix}`;
  const safeName = escapeHtml(talent.name);
  const safeDesc = escapeHtml(talent.desc);
  return `<div class="talent-line">
    <button type="button" class="talent-bubble-btn talent-name ${cls}" aria-expanded="false" aria-controls="${id}">${safeName}</button>
    <div id="${id}" class="talent-bubble" role="tooltip" hidden>
      <div class="talent-bubble-inner">${safeDesc}</div>
    </div>
  </div>`;
}

/** 结局页：全局数值摘要同样用气泡展示 */
export function talentNumericSummaryBubbleHtml(lines, uidSuffix) {
  if (!lines?.length) return "";
  const id = `tb-numeric-${uidSuffix}`;
  const inner = lines
    .map((h) => `<p class="talent-bubble-hint-line">${escapeHtml(h)}</p>`)
    .join("");
  return `<div class="talent-line talent-line-numeric">
    <button type="button" class="talent-bubble-btn talent-summary-btn" aria-expanded="false" aria-controls="${id}">本局数值摘要</button>
    <div id="${id}" class="talent-bubble talent-bubble-wide" role="tooltip" hidden>
      <div class="talent-bubble-inner">${inner}</div>
    </div>
  </div>`;
}
