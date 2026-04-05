/**
 * 图鉴：localStorage 持久化已解锁的性格 / 其他词条 / 天赋 / 事件 / 结局
 */
import { PERSONALITIES, OTHER_TRAITS } from "./traits.js";
import { TALENTS, RARITY_CLASS, escapeHtml } from "./talents.js";
import { EVENT_DEFS } from "./events.js";
import { ENDING_CATALOG, getEndingEmoji } from "./endings.js";

const STORAGE_KEY = "ar_codex_v1";

/** 与 EVENT_DEFS 并列计入事件图鉴总数（学习衍生弹窗） */
export const CODEX_EXTRA_EVENTS = [
  {
    id: "evt_study_overload",
    emoji: "🧠",
    title: "用脑过度",
    desc: "滚动五日内学习次数过多时触发：接下来三个自然日「学习」增益下降；坚持学习有机会触发「咬牙顿悟」。",
  },
  {
    id: "evt_study_breakthrough",
    emoji: "💡",
    title: "咬牙顿悟",
    desc: "在「用脑过度」减益下坚持学习超过三次可触发：解除过劳并获短期学习效率增益。",
  },
];

const PERSONALITY_DESC =
  "性格词条会影响部分行动的消耗与效果（具体数值见本局行动结算与状态栏）。";

function emptySets() {
  return {
    p: new Set(),
    o: new Set(),
    t: new Set(),
    e: new Set(),
    end: new Set(),
  };
}

let cache = null;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySets();
    const j = JSON.parse(raw);
    return {
      p: new Set(j.p ?? []),
      o: new Set(j.o ?? []),
      t: new Set(j.t ?? []),
      e: new Set(j.e ?? []),
      end: new Set(j.end ?? []),
    };
  } catch {
    return emptySets();
  }
}

function getData() {
  if (!cache) cache = load();
  return cache;
}

function persist() {
  const d = getData();
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        p: [...d.p],
        o: [...d.o],
        t: [...d.t],
        e: [...d.e],
        end: [...d.end],
      }),
    );
  } catch {
    /* ignore */
  }
}

export function unlockPersonality(id) {
  if (!id) return;
  getData().p.add(id);
  persist();
}

export function unlockOtherTrait(id) {
  if (!id) return;
  getData().o.add(id);
  persist();
}

export function unlockTalent(id) {
  if (!id) return;
  getData().t.add(id);
  persist();
}

export function unlockEvent(id) {
  if (!id) return;
  getData().e.add(id);
  persist();
}

export function unlockEnding(id) {
  if (!id) return;
  getData().end.add(id);
  persist();
}

export function unlockFromRolledTraits(rolled) {
  if (!rolled) return;
  for (const x of rolled.personalities ?? []) unlockPersonality(x.id);
  for (const x of rolled.other ?? []) unlockOtherTrait(x.id);
}

export function unlockTalentsFromState(talents) {
  for (const x of talents ?? []) unlockTalent(x.id);
}

function formatOtherEffects(effects) {
  if (!effects || typeof effects !== "object") return "";
  const labels = {
    resumeQuality: "简历完整度",
    hiddenResume: "简历过筛",
    hiddenInterview: "面试发挥",
    salaryTierBonus: "薪资档位加成",
    stress: "压力",
  };
  const parts = [];
  for (const [k, v] of Object.entries(effects)) {
    const lab = labels[k] ?? k;
    parts.push(`${lab}${typeof v === "number" && v > 0 ? "+" : ""}${v}`);
  }
  return parts.join(" · ");
}

function allEventsSorted() {
  return [...EVENT_DEFS, ...CODEX_EXTRA_EVENTS].sort((a, b) => a.id.localeCompare(b.id));
}

function counts(tab) {
  const d = getData();
  const totalP = PERSONALITIES.length;
  const totalO = OTHER_TRAITS.length;
  const totalT = TALENTS.length;
  const evList = allEventsSorted();
  const totalE = evList.length;
  const totalEnd = ENDING_CATALOG.length;

  if (tab === "personality") {
    const u = PERSONALITIES.filter((x) => d.p.has(x.id)).length;
    return { unlocked: u, total: totalP, locked: totalP - u };
  }
  if (tab === "other") {
    const u = OTHER_TRAITS.filter((x) => d.o.has(x.id)).length;
    return { unlocked: u, total: totalO, locked: totalO - u };
  }
  if (tab === "talent") {
    const u = TALENTS.filter((x) => d.t.has(x.id)).length;
    return { unlocked: u, total: totalT, locked: totalT - u };
  }
  if (tab === "event") {
    const u = evList.filter((x) => d.e.has(x.id)).length;
    return { unlocked: u, total: totalE, locked: totalE - u };
  }
  if (tab === "ending") {
    const u = ENDING_CATALOG.filter((x) => d.end.has(x.id)).length;
    return { unlocked: u, total: totalEnd, locked: totalEnd - u };
  }
  return { unlocked: 0, total: 0, locked: 0 };
}

function globalSummaryHtml() {
  const tabs = ["personality", "other", "talent", "event", "ending"];
  const labels = {
    personality: "性格",
    other: "其他",
    talent: "天赋",
    event: "事件",
    ending: "结局",
  };
  const parts = tabs.map((t) => {
    const c = counts(t);
    return `${labels[t]} ${c.unlocked}/${c.total}`;
  });
  return `<p class="codex-global-line muted">${parts.join(" · ")}</p>`;
}

function tabSummaryLine(tab) {
  const c = counts(tab);
  const label =
    tab === "personality"
      ? "性格"
      : tab === "other"
        ? "其他词条"
        : tab === "talent"
          ? "天赋"
          : tab === "event"
            ? "随机事件"
            : "结局";
  return `${label}：已解锁 ${c.unlocked} / ${c.total} · 未解锁 ${c.locked}`;
}

function renderLockedEntry() {
  return `<div class="codex-entry codex-entry--locked">
  <div class="codex-entry-head"><span class="codex-entry-title">???</span></div>
  <p class="codex-entry-desc muted">未解锁。在本局游戏中随到或达成对应条件后可解锁图鉴。</p>
</div>`;
}

function renderPersonalityPanel() {
  const d = getData();
  const bits = [];
  for (const p of PERSONALITIES) {
    if (d.p.has(p.id)) {
      bits.push(`<div class="codex-entry">
  <div class="codex-entry-head"><span class="codex-entry-title">${escapeHtml(p.name)}</span></div>
  <p class="codex-entry-desc">${escapeHtml(PERSONALITY_DESC)}</p>
</div>`);
    } else {
      bits.push(renderLockedEntry());
    }
  }
  return bits.join("");
}

function renderOtherPanel() {
  const d = getData();
  const bits = [];
  for (const o of OTHER_TRAITS) {
    if (d.o.has(o.id)) {
      const fx = formatOtherEffects(o.effects);
      bits.push(`<div class="codex-entry">
  <div class="codex-entry-head"><span class="codex-entry-title">${escapeHtml(o.name)}</span></div>
  <p class="codex-entry-desc">${fx ? escapeHtml(fx) : "（无固定数值描述）"}</p>
</div>`);
    } else {
      bits.push(renderLockedEntry());
    }
  }
  return bits.join("");
}

function renderTalentPanel() {
  const d = getData();
  const bits = [];
  for (const t of TALENTS) {
    if (d.t.has(t.id)) {
      const rc = RARITY_CLASS[t.rarity] ?? "talent-white";
      bits.push(`<div class="codex-entry">
  <div class="codex-entry-head"><span class="codex-entry-title ${rc}">${escapeHtml(t.name)}</span><span class="codex-rarity-tag muted">${escapeHtml(t.rarity)}</span></div>
  <p class="codex-entry-desc">${escapeHtml(t.desc)}</p>
</div>`);
    } else {
      bits.push(renderLockedEntry());
    }
  }
  return bits.join("");
}

function renderEventPanel() {
  const d = getData();
  const bits = [];
  for (const ev of allEventsSorted()) {
    if (d.e.has(ev.id)) {
      const emo = ev.emoji ?? "📋";
      bits.push(`<div class="codex-entry">
  <div class="codex-entry-head"><span class="codex-entry-emoji" aria-hidden="true">${emo}</span> <span class="codex-entry-title">${escapeHtml(ev.title)}</span></div>
  <p class="codex-entry-desc">${escapeHtml(ev.desc)}</p>
</div>`);
    } else {
      bits.push(renderLockedEntry());
    }
  }
  return bits.join("");
}

function renderEndingPanel() {
  const d = getData();
  const bits = [];
  for (const en of ENDING_CATALOG) {
    if (d.end.has(en.id)) {
      const emo = getEndingEmoji(en.id);
      bits.push(`<div class="codex-entry">
  <div class="codex-entry-head"><span class="codex-entry-emoji" aria-hidden="true">${emo}</span> <span class="codex-entry-title">${escapeHtml(en.title)}</span></div>
  <p class="codex-entry-desc">${escapeHtml(en.body)}</p>
</div>`);
    } else {
      bits.push(renderLockedEntry());
    }
  }
  return bits.join("");
}

/**
 * @param {HTMLElement} root
 * @param {"personality"|"other"|"talent"|"event"|"ending"} tab
 */
export function renderCodex(root, tab) {
  if (!root) return;
  const summaryEl = root.querySelector("#codex-summary");
  const tabLine = root.querySelector("#codex-tab-line");
  const panel = root.querySelector("#codex-panel");
  if (summaryEl) summaryEl.innerHTML = globalSummaryHtml();
  if (tabLine) tabLine.textContent = tabSummaryLine(tab);

  root.querySelectorAll("[data-codex-tab]").forEach((btn) => {
    const active = btn.getAttribute("data-codex-tab") === tab;
    btn.classList.toggle("codex-tab--active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (!panel) return;
  if (tab === "personality") panel.innerHTML = renderPersonalityPanel();
  else if (tab === "other") panel.innerHTML = renderOtherPanel();
  else if (tab === "talent") panel.innerHTML = renderTalentPanel();
  else if (tab === "event") panel.innerHTML = renderEventPanel();
  else panel.innerHTML = renderEndingPanel();
}
