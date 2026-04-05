/**
 * 梗公司：投递轮次中以 2% 概率替换池内随机一席；标签与薪资档刻意贴近现实刻板印象，仅供娱乐。
 */

/**
 * @typedef {Object} NetaCompanyPreset
 * @property {string} id
 * @property {string} name
 * @property {string} logo
 * @property {string} industry 与 match 中 industry 池一致
 * @property {string} salaryBandId 对应 SALARY_BANDS_META.id，如 sal_22_23
 * @property {string} treatmentId TREATMENT_TAGS.id
 * @property {string[]} reputationIds REPUTATION_TAGS.id，1–5 条
 * @property {boolean} hasHidden
 * @property {string} [hiddenId] HIDDEN_POOL.id，hasHidden 为真时可选固定隐藏
 */

/** @type {NetaCompanyPreset[]} */
export const NETA_COMPANY_PRESETS = [
  {
    id: "neta_mhy",
    name: "马和鱼网络科技",
    logo: "🐟",
    industry: "game",
    salaryBandId: "sal_22_23",
    treatmentId: "tr_985",
    reputationIds: ["rep_leader", "rep_stable"],
    hasHidden: false,
  },
  {
    id: "neta_byte",
    name: "跳动字节科技",
    logo: "🎵",
    industry: "internet",
    salaryBandId: "sal_25_26",
    treatmentId: "tr_996",
    reputationIds: ["rep_unicorn", "rep_ot", "rep_flat"],
    hasHidden: false,
  },
  {
    id: "neta_penguin",
    name: "南极鹅厂互娱",
    logo: "🐧",
    industry: "game",
    salaryBandId: "sal_24_25",
    treatmentId: "tr_weekend",
    reputationIds: ["rep_leader", "rep_stable"],
    hasHidden: true,
    hiddenId: "hid_core",
  },
  {
    id: "neta_ali",
    name: "里巴巴控股集团",
    logo: "🛒",
    industry: "internet",
    salaryBandId: "sal_23_24",
    treatmentId: "tr_985",
    reputationIds: ["rep_leader", "rep_maimai"],
    hasHidden: true,
    hiddenId: "hid_pay",
  },
  {
    id: "neta_pdd",
    name: "拼少少电商",
    logo: "🍊",
    industry: "internet",
    salaryBandId: "sal_26_27",
    treatmentId: "tr_996",
    reputationIds: ["rep_unicorn", "rep_ot"],
    hasHidden: false,
  },
  {
    id: "neta_bili",
    name: "干杯视频科技",
    logo: "📺",
    industry: "anime",
    salaryBandId: "sal_18_19",
    treatmentId: "tr_flex",
    reputationIds: ["rep_startup", "rep_flat", "rep_ot"],
    hasHidden: false,
  },
  {
    id: "neta_meituan",
    name: "开水团本地生活",
    logo: "🥡",
    industry: "internet",
    salaryBandId: "sal_20_21",
    treatmentId: "tr_ot_pay",
    reputationIds: ["rep_unicorn", "rep_ot"],
    hasHidden: true,
    hiddenId: "hid_unstable",
  },
];

export function getNetaPresetById(id) {
  return NETA_COMPANY_PRESETS.find((p) => p.id === id) ?? null;
}

export function createNetaShell(batchId, preset, slotIndex, seed) {
  return {
    id: `co_b${batchId}_neta_${preset.id}_${slotIndex}`,
    name: preset.name,
    logo: preset.logo,
    baseSeed: (seed + slotIndex * 7919 + 4242) >>> 0,
    isNetaRef: true,
    netaPresetId: preset.id,
  };
}
