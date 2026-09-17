/** 公司名与 tag 词库；完整 tag 由 match.js 按匹配分动态生成 */

import { NETA_COMPANY_PRESETS, createNetaShell } from "./netaCompanies.js";

export function hashSeed(seed) {
  let h = seed >>> 0;
  h = (h * 1664525 + 1013904223) >>> 0;
  return h;
}

export function pickSeeded(arr, seed) {
  const h = hashSeed(seed);
  return arr[h % arr.length];
}

/** 投递页公司头像：按种子稳定选取 */
const COMPANY_LOGO_EMOJIS = [
  "🎯",
  "🚀",
  "💼",
  "📊",
  "🧩",
  "⚡",
  "🌟",
  "🔷",
  "🛠",
  "📈",
  "🦾",
  "🧠",
  "💡",
  "🌐",
  "🔔",
  "📱",
  "🎮",
  "🏭",
  "🧪",
  "✨",
  "🔮",
  "🎪",
  "🗺",
  "⛵",
  "🦋",
  "🍀",
  "🔑",
  "🎖",
  "📦",
  "🪐",
  "🌿",
  "🔭",
  "🧿",
  "🎲",
  "🪄",
  "🛰",
];

export function pickCompanyLogo(seed) {
  return pickSeeded(COMPANY_LOGO_EMOJIS, seed + 901);
}

const NAME_A = [
  "星澜",
  "云杉",
  "蓝海",
  "极客",
  "晨曦",
  "方舟",
  "量子",
  "青藤",
  "琥珀",
  "北风",
  "潮汐",
  "山岳",
  "萤火",
  "远航",
  "松间",
  "锦程",
  "雨声",
  "赤焰",
  "月港",
  "静湖",
  "长风",
  "墨川",
  "凌宇",
  "瀚海",
  "微光",
];

const NAME_B = [
  "科技",
  "数据",
  "互娱",
  "工场",
  "金融",
  "物流",
  "芯微",
  "教育",
  "医疗",
  "游戏",
  "电商",
  "咨询",
  "设计",
  "制造",
  "文创",
  "证券",
  "软件",
  "能源",
  "外贸",
  "研究院",
  "网络",
  "智能",
  "信息",
  "数字",
  "创新",
];

const NAME_SUFFIX = ["有限公司", "科技", "网络", "信息", "数字科技", "集团", "控股"];

function rnd() {
  return Math.random();
}

/** 程序化随机公司名 */
export function generateCompanyName(seed) {
  const a = pickSeeded(NAME_A, seed);
  const b = pickSeeded(NAME_B, seed + 17);
  const suf = pickSeeded(NAME_SUFFIX, seed + 33);
  const n = (hashSeed(seed + 99) % 9) + 1;
  if (rnd() < 0.35) {
    return `${a}${b}${suf}`;
  }
  if (rnd() < 0.5) {
    return `${a}${b}（${n}号项目组）`;
  }
  return `${a}${b}${suf}`;
}

/** 薪资档：4.5-6 万起，每 1w 一阶，直至 30-32w 封顶 */
export function buildSalaryBands() {
  const bands = [];
  bands.push({ id: "sal_45_6", label: "年薪4.5万-6万", tier: 0 });
  for (let low = 6; low < 28; low++) {
    bands.push({
      id: `sal_${low}_${low + 1}`,
      label: `年薪${low}万-${low + 1}万`,
      tier: low - 5,
    });
  }
  bands.push({ id: "sal_28_30", label: "年薪28万-30万", tier: 24 });
  bands.push({ id: "sal_30_32", label: "年薪30万-32万", tier: 25 });
  return bands;
}

export const SALARY_BANDS_META = buildSalaryBands();

/** 待遇 tag：含坏/一般/好 */
export const TREATMENT_TAGS = [
  { id: "tr_996", label: "996", quality: "bad" },
  { id: "tr_985", label: "大小周", quality: "normal" },
  { id: "tr_weekend", label: "双休", quality: "good" },
  { id: "tr_paid", label: "带薪年假", quality: "good" },
  { id: "tr_flex", label: "弹性打卡", quality: "normal" },
  { id: "tr_remote", label: "远程混合办公", quality: "good" },
  { id: "tr_meal", label: "包三餐/餐补", quality: "good" },
  { id: "tr_ins", label: "五险一金顶格", quality: "good" },
  { id: "tr_ot_pay", label: "加班有补贴", quality: "normal" },
  { id: "tr_night", label: "夜班补贴", quality: "normal" },
  { id: "tr_stock", label: "期权/股权激励", quality: "good" },
  { id: "tr_shuttle", label: "班车/交通补贴", quality: "normal" },
];

/** 社会风评 tag */
export const REPUTATION_TAGS = [
  { id: "rep_startup", label: "初创公司", quality: "normal" },
  { id: "rep_black", label: "黑心公司", quality: "bad" },
  { id: "rep_leader", label: "行业龙头", quality: "good" },
  { id: "rep_unicorn", label: "独角兽", quality: "good" },
  { id: "rep_layoff", label: "裁员传闻", quality: "bad" },
  { id: "rep_stable", label: "风评稳健", quality: "good" },
  { id: "rep_ot", label: "加班文化重", quality: "bad" },
  { id: "rep_flat", label: "扁平管理口碑", quality: "good" },
  { id: "rep_maimai", label: "脉脉差评偏多", quality: "bad" },
  { id: "rep_glass", label: "Glassdoor 评分一般", quality: "normal" },
  { id: "rep_gov", label: "国资背景", quality: "normal" },
  { id: "rep_founder", label: "创始人风评两极", quality: "normal" },
];

/** 隐藏信息池 */
export const HIDDEN_POOL = [
  { id: "hid_pua", label: "实际加班远超描述", applyMod: -7, endingWeight: "grind", quality: "bad" },
  { id: "hid_flat", label: "团队氛围比预期好", applyMod: 4, endingWeight: "nice", quality: "good" },
  { id: "hid_unstable", label: "业务线频繁调整", applyMod: -5, endingWeight: "risk", quality: "bad" },
  { id: "hid_core", label: "核心项目盈利强", applyMod: 6, endingWeight: "money", quality: "good" },
  { id: "hid_layoff", label: "近期裁员传闻属实", applyMod: -9, endingWeight: "risk", quality: "bad" },
  { id: "hid_wlb", label: "WLB 口碑被低估", applyMod: 5, endingWeight: "balance", quality: "good" },
  { id: "hid_pay", label: "绩效薪资打折风险", applyMod: -4, endingWeight: "risk", quality: "bad" },
  { id: "hid_mentor", label: "导师带教资源充足", applyMod: 3, endingWeight: "nice", quality: "good" },
  {
    id: "hid_pyramid",
    label: "入职先囤货/发展下线（疑似传销话术）",
    applyMod: -18,
    endingWeight: "pyramid",
    quality: "bad",
  },
];

export function qualityScore(q) {
  if (q === "excellent") return 3;
  if (q === "good") return 2;
  if (q === "bad") return -2;
  return 0;
}

export function computeBaseApplyBonusFromTags(tags, salaryTier) {
  let s = 10 + Math.min(18, Math.floor(salaryTier * 0.6));
  s += qualityScore(tags.salary.quality);
  s += qualityScore(tags.treatment.quality);
  for (const r of tags.reputation) {
    s += qualityScore(r.quality);
  }
  if (tags.treatment.label.includes("996")) s -= 7;
  if (tags.treatment.label.includes("双休")) s += 4;
  return s;
}

export function getFlatTagLabels(company) {
  const t = company.tags;
  if (!t) return company.visibleTags ?? [];
  const reps = t.reputation.map((r) => r.label);
  return [t.salary.label, t.treatment.label, ...reps];
}

/**
 * 结算页专用：结构化可见词条 + 隐藏词条（与是否侧面打听无关，始终含隐藏）。
 * @returns {{ parts: { label: string, quality: string }[], hidden: { label: string, quality: string } | null }}
 */
export function buildSettlementTagParts(company) {
  const t = company.tags;
  const hidden =
    company.hasHidden && company.hiddenTag
      ? { label: company.hiddenTag.label, quality: company.hiddenTag.quality ?? "normal" }
      : null;
  if (!t) {
    return { parts: [], hidden };
  }
  const parts = [
    { label: t.salary.label, quality: t.salary.quality },
    { label: t.treatment.label, quality: t.treatment.quality },
    ...t.reputation.map((r) => ({ label: r.label, quality: r.quality })),
  ];
  return { parts, hidden };
}

/** 从「年薪X万-…」文案解析下限（万）；含展示后缀时只取第一段 */
export function salaryLowWanFromTierLabel(label) {
  const head = (label ?? "").split(" · ")[0].trim();
  const m = head.match(/年薪([\d.]+)万/);
  return m ? parseFloat(m[1]) : 0;
}

function baseStarsFromSalaryQuality(quality) {
  if (quality === "bad") return 1;
  if (quality === "excellent") return 4;
  if (quality === "good") return 3;
  return 2;
}

function baseStarsFromLowWan(lowWan) {
  if (lowWan < 12) return 1;
  if (lowWan < 18) return 2;
  if (lowWan < 25) return 3;
  return 4;
}

/**
 * 结算页公司评分：年薪档 1–4 星（差/一般/高/极高对应坏/一般/好/极好），年薪以外每个绿 tag +1、红 tag -1；传销 Offer 固定 0 星。
 * stars 可为负；结算 UI 用红色星显示负分的绝对值。
 * @returns {{ stars: number, colorful: boolean, isPyramid: boolean }}
 */
export function computeEndOfferStarRating(offer) {
  if (!offer) return { stars: 0, colorful: false, isPyramid: false };
  if (offer.isPyramidTrap) {
    return { stars: 0, colorful: false, isPyramid: true };
  }
  const st = offer.settlementTags;
  let base = 2;
  if (st?.parts?.length) {
    base = baseStarsFromSalaryQuality(st.parts[0].quality ?? "normal");
  } else {
    const low = salaryLowWanFromTierLabel(offer.salaryTier);
    base = low > 0 ? baseStarsFromLowWan(low) : 2;
  }
  let tagDelta = 0;
  if (st?.parts?.length > 1) {
    for (let i = 1; i < st.parts.length; i++) {
      const q = st.parts[i].quality ?? "normal";
      if (q === "good" || q === "excellent") tagDelta += 1;
      else if (q === "bad") tagDelta -= 1;
    }
  }
  if (st?.hidden) {
    const q = st.hidden.quality ?? "normal";
    if (q === "good" || q === "excellent") tagDelta += 1;
    else if (q === "bad") tagDelta -= 1;
  }
  const stars = base + tagDelta;
  return { stars, colorful: stars >= 6, isPyramid: false };
}

/** 仅生成外壳；tags 在投递流程中由 match.materializeCompany 填充 */
export function buildCompanyShell(index, seed) {
  const nameSeed = seed + index * 977;
  return {
    id: `co_${index}`,
    name: generateCompanyName(nameSeed),
    baseSeed: seed + index * 7919,
    logo: pickCompanyLogo(nameSeed),
  };
}

export function buildCompanies() {
  const seed = Math.floor(Math.random() * 1e9);
  return Array.from({ length: 20 }, (_, i) => buildCompanyShell(i, seed + i * 17));
}

/** 单次「投递简历」轮次专用：每轮随机 15–20 家，id 带批次号避免冲突 */
export function buildCompaniesForApplySession(batchId) {
  const seed = Math.floor(Math.random() * 1e9);
  const n = 15 + Math.floor(Math.random() * 6);
  const arr = Array.from({ length: n }, (_, i) => {
    const shell = buildCompanyShell(i, seed + i * 17);
    shell.id = `co_b${batchId}_i${i}`;
    return shell;
  });
  /** 梗公司：每轮池子刷新时 2% 概率随机替换其中一席 */
  if (Math.random() < 0.02 && NETA_COMPANY_PRESETS.length > 0 && arr.length > 0) {
    const preset =
      NETA_COMPANY_PRESETS[Math.floor(Math.random() * NETA_COMPANY_PRESETS.length)];
    const slot = Math.floor(Math.random() * arr.length);
    arr[slot] = createNetaShell(batchId, preset, slot, seed);
  }
  return arr;
}
