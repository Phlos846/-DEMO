/**
 * 词条系统：随机学历、专业、性格（1–3）、其他（0–2）
 * 数值可整体调参
 */

function rnd() {
  return Math.random();
}

/** 按权重抽取一项，返回 { id, item } */
function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = rnd() * total;
  for (const x of items) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return items[items.length - 1];
}

/** 学历（概率之和 100%） */
export const EDUCATION = [
  { id: "edu_qingbei", name: "清北", weight: 2, tier: 6 },
  { id: "edu_985", name: "985", weight: 7, tier: 5 },
  { id: "edu_haigui", name: "海归", weight: 7, tier: 5 },
  { id: "edu_211", name: "211", weight: 10, tier: 4 },
  { id: "edu_puben", name: "普本", weight: 34, tier: 3 },
  { id: "edu_yeji", name: "野鸡大学", weight: 25, tier: 1 },
  { id: "edu_dazhuan", name: "大专", weight: 15, tier: 0 },
];

/** 普本及以上可附带：研究生 / 博士 / 双学位（独立判定） */
const ELIGIBLE_EXTRA = new Set(["edu_puben", "edu_211", "edu_985", "edu_qingbei", "edu_haigui"]);

export const EXTRA_DEGREES = [
  { id: "extra_master", name: "硕士研究生", p: 0.34, effects: { resumeQuality: 6, hiddenResume: 5, hiddenInterview: 4, salaryTierBonus: 1 } },
  { id: "extra_phd", name: "博士研究生", p: 0.05, effects: { resumeQuality: 10, hiddenResume: 8, hiddenInterview: 8, salaryTierBonus: 1 } },
  { id: "extra_double", name: "双学位", p: 0.05, effects: { resumeQuality: 4, hiddenResume: 4, hiddenInterview: 3, salaryTierBonus: 0 } },
];

/** 专业（概率之和 100%） */
export const MAJORS = [
  { id: "major_cutting", name: "前沿工科", weight: 26, tier: 3 },
  { id: "major_trad", name: "传统工科", weight: 32, tier: 2 },
  { id: "major_sci", name: "理科", weight: 10, tier: 2 },
  { id: "major_arts", name: "文科", weight: 24, tier: 0 },
  { id: "major_other", name: "其他", weight: 8, tier: 0 },
];

/** 性格：效果在 computePersonalityActionMods 中实现 */
export const PERSONALITIES = [
  { id: "per_opt", name: "乐观" },
  { id: "per_gen", name: "豪爽" },
  { id: "per_calm", name: "沉稳" },
  { id: "per_open", name: "豁达" },
  { id: "per_strict", name: "严谨" },
  { id: "per_quick", name: "机敏" },
  { id: "per_obsess", name: "偏执" },
  { id: "per_ideal", name: "理想主义" },
  { id: "per_self", name: "自私" },
  { id: "per_low", name: "自卑" },
  { id: "per_lone", name: "孤僻" },
];

/** 其他词条池：实习 25%、大厂 5% 等 */
export const OTHER_TRAITS = [
  { id: "oth_intern", name: "实习经历", weight: 25, effects: { resumeQuality: 5, hiddenInterview: 3 } },
  { id: "oth_bigtech", name: "大厂实习经历", weight: 5, effects: { resumeQuality: 10, hiddenResume: 8, hiddenInterview: 5, salaryTierBonus: 1 } },
  { id: "oth_contest", name: "竞赛获奖", weight: 12, effects: { hiddenResume: 4, resumeQuality: 3 } },
  { id: "oth_english", name: "英语六级", weight: 15, effects: { hiddenResume: 3, hiddenInterview: 2 } },
  { id: "oth_leader", name: "学生干部经历", weight: 10, effects: { hiddenInterview: 3, resumeQuality: 2 } },
  { id: "oth_research", name: "科研项目经历", weight: 8, effects: { hiddenResume: 5, resumeQuality: 3 } },
  { id: "oth_cert", name: "专业证书收割", weight: 5, effects: { resumeQuality: 4, hiddenResume: 2 } },
  { id: "oth_vol", name: "志愿服务经历", weight: 6, effects: { stress: -3, hiddenInterview: 1 } },
  { id: "oth_startup", name: "创业/项目孵化", weight: 4, effects: { resumeQuality: 3, hiddenInterview: 2, stress: 2 } },
];

function educationStaticEffects(eduId) {
  const map = {
    edu_qingbei: { resumeQuality: 25, hiddenResume: 18, hiddenInterview: 15, salaryTierBonus: 3, stress: -5 },
    edu_985: { resumeQuality: 15, hiddenResume: 12, hiddenInterview: 10, salaryTierBonus: 2, stress: -3 },
    edu_haigui: { resumeQuality: 12, hiddenResume: 10, hiddenInterview: 12, salaryTierBonus: 2, stress: -2 },
    edu_211: { resumeQuality: 8, hiddenResume: 6, hiddenInterview: 6, salaryTierBonus: 1, stress: 0 },
    edu_puben: { resumeQuality: 2, hiddenResume: 2, hiddenInterview: 2, salaryTierBonus: 0, stress: 2 },
    edu_yeji: { resumeQuality: -6, hiddenResume: -6, hiddenInterview: -5, salaryTierBonus: -1, stress: 6 },
    edu_dazhuan: { resumeQuality: -12, hiddenResume: -10, hiddenInterview: -8, salaryTierBonus: -2, stress: 8 },
  };
  return { ...map[eduId] };
}

function majorStaticEffects(majorId) {
  const map = {
    major_cutting: { resumeQuality: 12, hiddenResume: 10, hiddenInterview: 10, salaryTierBonus: 2 },
    major_trad: { resumeQuality: 6, hiddenResume: 5, hiddenInterview: 5, salaryTierBonus: 1 },
    major_sci: { resumeQuality: 5, hiddenResume: 5, hiddenInterview: 5, salaryTierBonus: 1 },
    major_arts: { resumeQuality: -2, hiddenResume: -2, hiddenInterview: 0, salaryTierBonus: -1 },
    major_other: { resumeQuality: -4, hiddenResume: -3, hiddenInterview: -2, salaryTierBonus: -1 },
  };
  return { ...map[majorId] };
}

function mergeNumericEffects(...parts) {
  const keys = new Set();
  for (const p of parts) {
    if (!p) continue;
    for (const k of Object.keys(p)) keys.add(k);
  }
  const out = {};
  for (const k of keys) {
    out[k] = parts.reduce((s, p) => s + (p?.[k] ?? 0), 0);
  }
  return out;
}

/** 随机 1–3 个不重复性格 */
function rollPersonalities() {
  const countRoll = rnd();
  const count = countRoll < 0.38 ? 1 : countRoll < 0.83 ? 2 : 3;
  const pool = [...PERSONALITIES];
  const picked = [];
  for (let i = 0; i < count; i++) {
    const j = Math.floor(rnd() * pool.length);
    picked.push(pool.splice(j, 1)[0]);
  }
  return picked;
}

/** 随机 0–2 个其他词条，不重复，按权重无放回抽取 */
function rollOtherTraits() {
  const countRoll = rnd();
  const count = countRoll < 0.36 ? 0 : countRoll < 0.82 ? 1 : 2;
  if (count === 0) return [];
  const pool = OTHER_TRAITS.map((x) => ({ ...x }));
  const out = [];
  for (let i = 0; i < count; i++) {
    const picked = pickWeighted(pool);
    out.push({ id: picked.id, name: picked.name, effects: { ...picked.effects } });
    const idx = pool.findIndex((p) => p.id === picked.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return out;
}

export function rollAllTraits() {
  const eduPick = pickWeighted(EDUCATION.map((e) => ({ ...e, weight: e.weight })));
  const education = { id: eduPick.id, name: eduPick.name, tier: eduPick.tier };

  const extras = [];
  if (ELIGIBLE_EXTRA.has(education.id)) {
    for (const ex of EXTRA_DEGREES) {
      if (rnd() < ex.p) {
        extras.push({ id: ex.id, name: ex.name, effects: { ...ex.effects } });
      }
    }
  }

  const majPick = pickWeighted(MAJORS.map((m) => ({ ...m, weight: m.weight })));
  const major = { id: majPick.id, name: majPick.name, tier: majPick.tier };

  const personalities = rollPersonalities().map((p) => ({ id: p.id, name: p.name }));
  const other = rollOtherTraits();

  return { education, extraDegrees: extras, major, personalities, other };
}

/** 合并静态数值（不含性格对行动的逐条修正，性格在 actions 里处理） */
export function mergeStaticTraitEffects(rolled) {
  const eduFx = educationStaticEffects(rolled.education.id);
  let extraFx = {};
  for (const ex of rolled.extraDegrees) {
    extraFx = mergeNumericEffects(extraFx, ex.effects);
  }
  const majorFx = majorStaticEffects(rolled.major.id);
  let otherFx = {};
  for (const o of rolled.other) {
    otherFx = mergeNumericEffects(otherFx, o.effects);
  }
  return mergeNumericEffects(eduFx, extraFx, majorFx, otherFx);
}

/**
 * 性格对四类行动的增量（在基础 ACTION_COSTS 上叠加）
 * 字段：stress, energy, hiddenResume, hiddenInterview, resumeQuality
 */
export function computePersonalityActionMods(personalityIds) {
  const ids = new Set(personalityIds);
  const add = (action, patch) => {
    if (!mods[action]) mods[action] = {};
    for (const [k, v] of Object.entries(patch)) {
      mods[action][k] = (mods[action][k] ?? 0) + v;
    }
  };
  const mods = {};

  if (ids.has("per_opt")) {
    add("rest", { stress: -3, energy: 2 });
    add("fun", { stress: -3 });
    add("study", { stress: -2 });
  }
  if (ids.has("per_gen")) {
    add("fun", { stress: -4, energy: -4 });
    add("rest", { stress: -2 });
  }
  if (ids.has("per_calm")) {
    add("study", { hiddenInterview: 1, stress: 1 });
    add("apply", { stress: -3 });
  }
  if (ids.has("per_open")) {
    add("rest", { energy: 4, stress: -2 });
    add("fun", { stress: -2 });
  }
  if (ids.has("per_strict")) {
    add("study", { hiddenResume: 2, resumeQuality: 2, energy: -3 });
  }
  if (ids.has("per_quick")) {
    add("apply", { energy: 3, stress: 1 });
    add("fun", { energy: 2 });
  }
  if (ids.has("per_obsess")) {
    add("study", { hiddenResume: 3, stress: 4 });
    add("rest", { stress: 2 });
  }
  if (ids.has("per_ideal")) {
    add("apply", { stress: -4, energy: -3 });
    add("study", { stress: 2 });
  }
  if (ids.has("per_self")) {
    add("fun", { stress: 6 });
    add("rest", { energy: -5 });
  }
  if (ids.has("per_low")) {
    add("rest", { stress: -1, energy: -2 });
    add("study", { stress: 3 });
    add("apply", { stress: 4 });
    add("fun", { stress: 2 });
  }
  if (ids.has("per_lone")) {
    add("fun", { stress: 10, energy: -2 });
    add("study", { energy: -4 });
    add("rest", { stress: 1 });
  }

  return mods;
}

export function formatRolledTraitsLog(rolled) {
  const lines = [];
  lines.push(`学历：${rolled.education.name}`);
  if (rolled.extraDegrees.length) {
    lines.push(`附加学历：${rolled.extraDegrees.map((e) => e.name).join("、")}`);
  }
  lines.push(`专业：${rolled.major.name}`);
  lines.push(`性格：${rolled.personalities.map((p) => p.name).join("、")}`);
  if (rolled.other.length) {
    lines.push(`其他：${rolled.other.map((o) => o.name).join("、")}`);
  } else {
    lines.push("其他：无");
  }
  return lines;
}
