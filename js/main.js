import { createInitialState, addLog } from "./state.js";
import { formatRolledTraitsLog, rollAllTraits, educationTagClass } from "./traits.js";
import { formatTalentsLog, RARITY_CLASS } from "./talents.js";
import {
  rollExeGlitchForDay,
  computeMaxActionPointsForDay,
  applyDailyMoneyTick,
  maybePinhaofanHospital,
  applyNoOfferAnxiety,
  applyPassiveDayRecovery,
  tryNepotismOffer,
  talentRevealEnergyCost,
  checkInstantFail,
} from "./talentRuntime.js";
import { applyDailyAction, minCashForFunAction } from "./actions.js";
import { planEventsForCurrentDay, resolveEvent } from "./events.js";
import {
  startApplySession,
  getCurrentCompany,
  canReveal,
  revealHidden,
  submitCurrentCompany,
  skipCurrentCompany,
  applySessionComplete,
  endApplySession,
} from "./applications.js";
import { processInterviewsAtDayStart, processPendingResumeFeedback } from "./interviews.js";
import { computeEnding, endingSummaryLines, getEndingEmoji, getBestOffer } from "./endings.js";

let state = null;
let pendingEvent = null;
/** 开局界面预览用（与正式开局同一引用，天才天赋会在开局时改写学历） */
let previewRolled = rollAllTraits();

const $ = (id) => document.getElementById(id);

function showScreen(id) {
  ["screen-start", "screen-main", "screen-apply", "screen-end"].forEach((sid) => {
    const el = $(sid);
    if (el) el.classList.toggle("hidden", sid !== id);
  });
}

function renderStartTraitPreview() {
  const el = $("start-trait-preview");
  if (!el) return;
  const t = previewRolled;
  const extras = t.extraDegrees.length ? `（${t.extraDegrees.map((e) => e.name).join("、")}）` : "";
  const other = t.other.length ? t.other.map((o) => o.name).join("、") : "无";
  el.innerHTML = `
    <p><strong>学历</strong>：<span class="${educationTagClass(t.education.id)}">${t.education.name}</span>${extras}</p>
    <p><strong>专业</strong>：${t.major.name}</p>
    <p><strong>性格</strong>：${t.personalities.map((p) => p.name).join("、")}</p>
    <p><strong>其他</strong>：${other}</p>
    <p class="muted">正式开局后若随到「天才」天赋，学历可能被天赋覆盖。</p>
  `;
}

function renderTraitPanel() {
  const el = $("trait-panel");
  if (!el || !state?.traits) return;
  const t = state.traits;
  const extras = t.extraDegrees.length ? `（${t.extraDegrees.map((e) => e.name).join("、")}）` : "";
  const other = t.other.length ? t.other.map((o) => o.name).join("、") : "无";
  const tal = state.playerTalents ?? [];
  const talentLines = tal
    .map((x) => {
      const cls = RARITY_CLASS[x.rarity] ?? "talent-white";
      return `<div class="talent-line"><span class="talent-name ${cls}">${x.name}</span><span class="muted">${x.desc}</span></div>`;
    })
    .join("");
  el.innerHTML = `
    <h2>本局词条</h2>
    <p><strong>学历</strong>：<span class="${educationTagClass(t.education.id)}">${t.education.name}</span>${extras}</p>
    <p><strong>专业</strong>：${t.major.name}</p>
    <p><strong>性格</strong>：${t.personalities.map((p) => p.name).join("、")}</p>
    <p><strong>其他</strong>：${other}</p>
    <div class="talent-block"><strong>天赋</strong>（1–2 个）${talentLines}</div>
  `;
}

function bindStart() {
  const btn = $("btn-start");
  if (!btn) return;
  btn.addEventListener("click", () => {
    try {
      const cheatEl = $("cheat-code");
      const cheatRaw = (cheatEl?.value ?? "").trim();
      const godMode = cheatRaw === "114514";

      state = createInitialState({ rolledTraits: previewRolled, godMode });
      for (const line of formatRolledTraitsLog(state.traits)) {
        addLog(state, line);
      }
      for (const line of formatTalentsLog(state.playerTalents ?? [])) {
        addLog(state, line);
      }
      if (godMode) {
        addLog(state, "【作弊模式】顶配岗位池、简历/面试必过；压力不涨、精力不减；娱乐仍花钱。拿到第一份 Offer 即强制结算，结局判定与通常模式相同。");
      }
      addLog(state, "秋招开始。");
      showScreen("screen-main");
      refreshMain();
      renderTraitPanel();
      runMorningPhase();
    } catch (e) {
      console.error(e);
      alert(`开局出错：${e?.message ?? e}\n请按 F12 打开控制台查看详情。`);
    }
  });

  const reroll = $("btn-reroll-traits");
  if (reroll) {
    reroll.addEventListener("click", () => {
      try {
        if (!localStorage.getItem("ar_ngplus_unlock")) {
          alert("需先完整打完至少一局（任意结局）后，才可使用「重随词条」。");
          return;
        }
        previewRolled = rollAllTraits();
        renderStartTraitPreview();
      } catch (e) {
        console.error(e);
      }
    });
  }
}

function refreshMain() {
  if (!state) return;
  $("day-num").textContent = String(state.day);
  $("ap").textContent = `${state.actionPoints} / ${state.maxActionPointsPerDay}`;
  $("res-ap").textContent = String(state.actionPoints);
  const rm = $("res-money");
  if (rm) rm.textContent = String(Math.round(state.money ?? 0));
  const debt = state.debt ?? 0;
  const dw = $("res-debt-wrap");
  if (dw) dw.classList.toggle("hidden", debt <= 0);
  const rd = $("res-debt");
  if (rd) rd.textContent = String(Math.round(debt));
  $("res-stress").textContent = Number(state.stress ?? 0).toFixed(1);
  $("res-energy").textContent = String(Math.round(state.energy));
  const em = $("res-energy-max");
  if (em) em.textContent = String(state.energyMax ?? 100);
  $("res-resume").textContent = String(Math.round(state.resumeQuality));
  const rmax = $("res-resume-max");
  if (rmax) rmax.textContent = String(state.resumeQualityMax ?? 120);
  const mr = $("match-rating");
  if (mr) mr.textContent = String(Math.round(state.jobSearchRating ?? 1500));
  $("hid-resume").textContent = String(Math.round(state.hiddenResume));
  $("hid-interview").textContent = String(Math.round(state.hiddenInterview));

  renderTraitPanel();

  if (state.pendingTalentLog) {
    addLog(state, state.pendingTalentLog);
    state.pendingTalentLog = null;
  }

  const logEl = $("game-log");
  logEl.innerHTML = "";
  for (const row of state.log.slice(0, 40)) {
    const li = document.createElement("li");
    li.textContent = `[第${row.day}天] ${row.msg}`;
    logEl.appendChild(li);
  }

  const offers = $("offer-list");
  const empty = $("offer-empty");
  offers.innerHTML = "";
  if (state.offers.length === 0) {
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    for (const o of state.offers) {
      const li = document.createElement("li");
      const bump = o.salaryDisplayMultiplier && o.salaryDisplayMultiplier > 1 ? " · 虚张声势展示+20%" : "";
      const buff = state.industrySalaryBuff;
      const indOk =
        buff && buff.untilDay >= state.day && o.industry && buff.industry === o.industry;
      const wind = indOk ? " · 行业风向+20%展示" : "";
      const lg = o.logo ?? "💼";
      li.textContent = `${lg} ${o.name} · ${o.salaryTier}${bump}${wind} · ${o.tags.join(" · ")}`;
      offers.appendChild(li);
    }
  }

  const canAct = state.actionPoints > 0 && !state.gameOver;
  document.querySelectorAll(".action-btn").forEach((btn) => {
    const act = btn.dataset.action;
    let dis = !canAct;
    if (act === "apply") dis = dis || state.energy < 10;
    if (act === "fun") dis = dis || (state.money ?? 0) < minCashForFunAction(state);
    if (act === "path_startup") dis = dis || state.energy < 18;
    btn.disabled = dis;
  });
  $("btn-end-day").disabled = state.actionPoints > 0 || state.gameOver;

  checkInstantFail(state);
  if (state.gameOver) tryGameOver();

  const applyScr = $("screen-apply");
  if (applyScr && !applyScr.classList.contains("hidden") && state.applySession) {
    const ae = $("apply-energy");
    const aem = $("apply-energy-max");
    if (ae) ae.textContent = String(Math.round(state.energy));
    if (aem) aem.textContent = String(state.energyMax ?? 100);
    renderApplyScreen();
  }
}

function runMorningPhase() {
  if (!state || state.gameOver) return;
  const nep = tryNepotismOffer(state);
  if (nep) addLog(state, nep);
  const resumeMsgs = processPendingResumeFeedback(state);
  const intvMsgs = processInterviewsAtDayStart(state);
  const msgs = [...resumeMsgs, ...intvMsgs];
  refreshMain();

  const ban = $("interview-banner");
  if (msgs.length) {
    ban.classList.remove("hidden");
    ban.textContent = msgs.join(" ");
  } else {
    ban.classList.add("hidden");
  }

  if (state.actionPoints <= 0 && state.interviewQueue.length > 0) {
    addLog(state, "本日行动点已在面试中耗尽，请结束本日进入下一天。");
  }

  planEventsForCurrentDay(state);
  if (state.eventModalQueue?.length) {
    pendingEvent = state.eventModalQueue.shift();
    $("event-title").textContent = pendingEvent.title;
    $("event-desc").textContent = pendingEvent.desc;
    const emo = $("event-emoji");
    if (emo) emo.textContent = pendingEvent.emoji ?? "📋";
    $("modal-event").classList.remove("hidden");
  }
}

function closeEventModal() {
  if (pendingEvent && state) {
    resolveEvent(state, pendingEvent);
    pendingEvent = null;
    refreshMain();
    tryGameOver();
    if (state?.gameOver) {
      $("modal-event").classList.add("hidden");
      return;
    }
  }
  if (state?.eventModalQueue?.length) {
    pendingEvent = state.eventModalQueue.shift();
    $("event-title").textContent = pendingEvent.title;
    $("event-desc").textContent = pendingEvent.desc;
    const emo = $("event-emoji");
    if (emo) emo.textContent = pendingEvent.emoji ?? "📋";
    $("modal-event").classList.remove("hidden");
    refreshMain();
    return;
  }
  $("modal-event").classList.add("hidden");
}

function tryGameOver() {
  if (!state) return;
  const shouldEnd = state.day > state.maxDays || state.gameOver;
  if (!shouldEnd) return;
  const endEl = $("screen-end");
  if (endEl && !endEl.classList.contains("hidden")) return;
  state.gameOver = true;
  try {
    localStorage.setItem("ar_ngplus_unlock", "1");
  } catch (e) {
    /* ignore */
  }
  const end = computeEnding(state);
  const endEmoji = $("end-emoji");
  if (endEmoji) endEmoji.textContent = getEndingEmoji(end.id);
  $("end-title").textContent = end.title;
  $("end-body").textContent = end.body;

  const bestOfferEl = $("end-best-offer");
  const best = getBestOffer(state);
  if (bestOfferEl) {
    if (best) {
      bestOfferEl.classList.remove("hidden");
      const lg = $("end-best-logo");
      if (lg) lg.textContent = best.logo ?? "💼";
      const nm = $("end-best-name");
      if (nm) nm.textContent = best.name ?? "";
      const sal = $("end-best-salary");
      if (sal) {
        let line = best.salaryTier ?? "薪资面议";
        if (best.salaryDisplayMultiplier && best.salaryDisplayMultiplier > 1) {
          line += " · 虚张声势展示+20%";
        }
        const buff = state.industrySalaryBuff;
        if (buff && buff.untilDay >= state.day && best.industry && buff.industry === best.industry) {
          line += " · 行业风向+20%展示";
        }
        sal.textContent = line;
      }
      const tg = $("end-best-tags");
      if (tg) tg.textContent = Array.isArray(best.tags) && best.tags.length ? best.tags.join(" · ") : "（无标签展示）";
    } else {
      bestOfferEl.classList.add("hidden");
    }
  }

  const ul = $("end-stats");
  ul.innerHTML = "";
  for (const line of endingSummaryLines(state)) {
    const li = document.createElement("li");
    if (line && typeof line === "object" && "html" in line) {
      li.innerHTML = line.html;
    } else {
      li.textContent = line;
    }
    ul.appendChild(li);
  }
  showScreen("screen-end");
}

function advanceDay() {
  state.day += 1;
  rollExeGlitchForDay(state);
  applyDailyMoneyTick(state);
  const hosp = maybePinhaofanHospital(state);
  if (hosp) addLog(state, hosp);
  applyNoOfferAnxiety(state);
  applyPassiveDayRecovery(state);
  state.maxActionPointsPerDay = computeMaxActionPointsForDay(state);
  state.actionPoints = state.maxActionPointsPerDay;
  addLog(state, `进入第 ${state.day} 天。`);
  tryGameOver();
  if (state.gameOver) return;
  runMorningPhase();
}

function bindMainActions() {
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (!state || state.gameOver || state.actionPoints <= 0) return;

      if (action === "apply") {
        if (state.energy < 10) return;
        const r = startApplySession(state);
        if (!r.ok) {
          alert(r.reason);
          return;
        }
        const note = applyDailyAction(state, "apply");
        state.actionPoints -= 1;
        addLog(state, `第 ${state.day} 天：${note}`);
        refreshMain();
        renderApplyScreen();
        showScreen("screen-apply");
        return;
      }

      const note = applyDailyAction(state, action);
      state.actionPoints -= 1;
      addLog(state, `第 ${state.day} 天：${note}`);
      refreshMain();
    });
  });

  $("btn-end-day").addEventListener("click", () => {
    if (!state || state.actionPoints > 0) return;
    advanceDay();
  });

  $("btn-event-ok").addEventListener("click", closeEventModal);
}

function qualityLabel(q) {
  if (q === "bad") return "坏";
  if (q === "good") return "好";
  return "一般";
}

function renderApplyScreen() {
  const s = state.applySession;
  if (!s) return;
  const co = getCurrentCompany(state);
  const ae = $("apply-energy");
  const aem = $("apply-energy-max");
  if (ae) ae.textContent = String(Math.round(state.energy));
  if (aem) aem.textContent = String(state.energyMax ?? 100);
  $("apply-count").textContent = String(s.submitted);
  const posLine = $("apply-position-line");
  const view = $("company-view");
  const btnApply = $("btn-apply-co");
  const btnNext = $("btn-next-co");
  const btnLeave = $("btn-leave-apply");
  const btnSide = $("btn-side-ask");

  if (!co || s.submitted >= s.target || applySessionComplete(state)) {
    if (posLine) posLine.classList.add("hidden");
    view.innerHTML =
      s.submitted >= s.target
        ? "<p><strong>本轮已投递满 10 份简历。</strong></p>"
        : "<p><strong>无法凑满 10 份投递（跳过过多）。</strong></p>";
    btnApply.classList.add("hidden");
    btnNext.classList.add("hidden");
    btnSide.classList.add("hidden");
    btnLeave.classList.remove("hidden");
    return;
  }

  if (posLine) {
    posLine.classList.remove("hidden");
    const pool = s.order?.length ?? 20;
    const cur = $("apply-cur-idx");
    const tot = $("apply-pool-total");
    if (cur) cur.textContent = String(s.index + 1);
    if (tot) tot.textContent = String(pool);
  }

  btnApply.classList.remove("hidden");
  btnNext.classList.remove("hidden");
  btnLeave.classList.add("hidden");

  const t = co.tags;
  const sal = t.salary;
  const tr = t.treatment;
  const reps = t.reputation
    .map(
      (r) =>
        `<span class="tag">${r.label}<span class="tag-quality tag-q-${r.quality}">${qualityLabel(r.quality)}</span></span>`,
    )
    .join(" ");

  const hidBlock =
    co.hasHidden && co.hiddenTag
      ? s.currentRevealed
        ? `<div class="tag-row hidden-row">侧面打听结果：<span class="tag hidden-tag">${co.hiddenTag.label}<span class="tag-quality tag-q-${co.hiddenTag.quality ?? "normal"}">${qualityLabel(co.hiddenTag.quality ?? "normal")}</span></span></div>`
        : `<p class="muted">传闻该公司另有隐情（可使用<strong>侧面打听</strong>消耗精力获知）。</p>`
      : `<p class="muted">暂无需要侧面打听的信息。</p>`;

  const logo = co.logo ?? "🏢";
  view.innerHTML = `
    <div class="company-header">
      <span class="company-logo" aria-hidden="true">${logo}</span>
      <h3 class="company-title">${co.name}</h3>
    </div>
    <div class="tag-block"><span class="tag-label">薪资</span> <span class="tag">${sal.label}<span class="tag-quality tag-q-${sal.quality}">${qualityLabel(sal.quality)}</span></span></div>
    <div class="tag-block"><span class="tag-label">待遇</span> <span class="tag">${tr.label}<span class="tag-quality tag-q-${tr.quality}">${qualityLabel(tr.quality)}</span></span></div>
    <div class="tag-block"><span class="tag-label">社会风评</span> ${reps}</div>
    ${hidBlock}
    <p class="muted">基础投递加成（内部）：${co.baseApplyBonus}</p>
  `;

  if (co.hasHidden && co.hiddenTag && !s.currentRevealed) {
    btnSide.classList.remove("hidden");
    const c = talentRevealEnergyCost(state);
    btnSide.textContent = `侧面打听（消耗${c}精力）`;
    const lowE = state.energy < 15;
    btnSide.disabled = !canReveal(state);
    if (lowE) {
      btnSide.title = "精力低于 15 时无法侧面打听";
    } else {
      btnSide.removeAttribute("title");
    }
  } else {
    btnSide.classList.add("hidden");
  }
}

function bindApplyScreen() {
  $("btn-side-ask").addEventListener("click", () => {
    if (revealHidden(state)) {
      addLog(state, `第 ${state.day} 天：侧面打听，获知隐藏信息。`);
      renderApplyScreen();
      refreshMain();
    }
  });

  $("btn-apply-co").addEventListener("click", () => {
    submitCurrentCompany(state);
    if (state.applySession && (state.applySession.submitted >= 10 || applySessionComplete(state))) {
      endApplySession(state);
      showScreen("screen-main");
      refreshMain();
      return;
    }
    renderApplyScreen();
    refreshMain();
  });

  $("btn-next-co").addEventListener("click", () => {
    skipCurrentCompany(state);
    if (applySessionComplete(state) && state.applySession.submitted < 10) {
      addLog(state, `第 ${state.day} 天：已无法凑满 10 份投递，本轮结束。`);
      endApplySession(state);
      showScreen("screen-main");
      refreshMain();
      return;
    }
    if (state.applySession && state.applySession.submitted >= 10) {
      endApplySession(state);
      showScreen("screen-main");
      refreshMain();
      return;
    }
    renderApplyScreen();
    refreshMain();
  });

  $("btn-leave-apply").addEventListener("click", () => {
    endApplySession(state);
    showScreen("screen-main");
    refreshMain();
  });
}

function bindRestart() {
  $("btn-restart").addEventListener("click", () => {
    window.location.reload();
  });
}

bindStart();
bindMainActions();
bindApplyScreen();
bindRestart();
renderStartTraitPreview();