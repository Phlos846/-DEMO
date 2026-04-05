import { createInitialState, addLog } from "./state.js";
import { educationTagClass } from "./eduTags.js";
import { formatRolledTraitsLog, rollAllTraits } from "./traits.js";
import {
  formatTalentsLog,
  talentLineBubbleHtml,
  talentNumericSummaryBubbleHtml,
  escapeHtml,
} from "./talents.js";
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
  getEndingTalentNumericHints,
  applyBlackTalentMorning,
  applyEnergyDelta,
} from "./talentRuntime.js";
import {
  applyDailyAction,
  minCashForFunAction,
  STUDY_OVERLOAD_GAIN_MULT,
  STUDY_RECOVERY_BUFF_MULT,
} from "./actions.js";
import {
  planEventsForCurrentDay,
  resolveEvent,
  pickRandomEntertainmentEvent,
  tryStudyOverloadEvent,
  tryStudyBreakthroughEvent,
  industrySalaryBuffLabelZh,
} from "./events.js";
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
import {
  computeEnding,
  endingSummaryLines,
  buildEndingShareText,
  getEndingEmoji,
  getBestOffer,
  shouldPromptPlayerOfferChoice,
} from "./endings.js";
import { pruneExpiredTransientEffects } from "./transientEffects.js";

let state = null;
let pendingEvent = null;
/** 最近一次结算结局，供分享文案使用 */
let lastEndingForShare = null;
/** 开局界面预览用（与正式开局同一引用，天才天赋会在开局时改写学历） */
let previewRolled = rollAllTraits();

const $ = (id) => document.getElementById(id);

function showScreen(id) {
  ["screen-start", "screen-main", "screen-apply", "screen-offer-pick", "screen-end"].forEach((sid) => {
    const el = $(sid);
    if (el) el.classList.toggle("hidden", sid !== id);
  });
  updateVitalFx();
}

/** 压力 > 80：红雾 + 画面轻微横向抖动；精力 < 20：冷色压暗 + 轻微下沉感；可同时叠加 */
function updateVitalFx() {
  const fx = $("vital-fx");
  const body = document.body;
  if (!fx) return;
  if (!state || state.gameOver) {
    fx.classList.add("hidden");
    fx.classList.remove("vital-fx--stress", "vital-fx--energy");
    body.classList.remove("vital-stress-active", "vital-energy-active");
    return;
  }
  if (!$("screen-start")?.classList.contains("hidden")) {
    fx.classList.add("hidden");
    fx.classList.remove("vital-fx--stress", "vital-fx--energy");
    body.classList.remove("vital-stress-active", "vital-energy-active");
    return;
  }
  const stressHigh = (state.stress ?? 0) > 80;
  const energyLow = (state.energy ?? 100) < 20;
  if (!stressHigh && !energyLow) {
    fx.classList.add("hidden");
    fx.classList.remove("vital-fx--stress", "vital-fx--energy");
    body.classList.remove("vital-stress-active", "vital-energy-active");
    return;
  }
  fx.classList.remove("hidden");
  fx.classList.toggle("vital-fx--stress", stressHigh);
  fx.classList.toggle("vital-fx--energy", energyLow);
  body.classList.toggle("vital-stress-active", stressHigh);
  body.classList.toggle("vital-energy-active", energyLow);
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
  const talentLines = tal.map((x) => talentLineBubbleHtml(x, "main")).join("");
  el.innerHTML = `
    <h2>本局词条</h2>
    <p><strong>学历</strong>：<span class="${educationTagClass(t.education.id)}">${t.education.name}</span>${extras}</p>
    <p><strong>专业</strong>：${t.major.name}</p>
    <p><strong>性格</strong>：${t.personalities.map((p) => p.name).join("、")}</p>
    <p><strong>其他</strong>：${other}</p>
    <div class="talent-block"><strong>天赋</strong>（2–3 个，点击名称查看效果）${talentLines}</div>
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

function naturalDaysRemaining(untilDay) {
  if (untilDay == null || !state) return 0;
  return Math.max(0, untilDay - state.day + 1);
}

function renderStatusEffects() {
  const wrap = $("status-effects-bar");
  const list = $("status-effects-list");
  if (!wrap || !list || !state) return;
  const d = state.day;
  const rows = [];
  if (state.studyOverloadDebuffUntilDay != null && d <= state.studyOverloadDebuffUntilDay) {
    rows.push({
      cls: "debuff",
      text: `用脑过度：学习效率约 ×${STUDY_OVERLOAD_GAIN_MULT}（剩余 ${naturalDaysRemaining(state.studyOverloadDebuffUntilDay)} 个自然日）`,
    });
  }
  if (state.studyRecoveryBuffUntilDay != null && d <= state.studyRecoveryBuffUntilDay) {
    rows.push({
      cls: "buff",
      text: `顿悟：学习效率约 ×${STUDY_RECOVERY_BUFF_MULT}（剩余 ${naturalDaysRemaining(state.studyRecoveryBuffUntilDay)} 个自然日）`,
    });
  }
  const ib = state.industrySalaryBuff;
  if (ib && ib.untilDay >= d) {
    const pct = Math.round((ib.mult - 1) * 100);
    rows.push({
      cls: "buff",
      text: `行业风向：${industrySalaryBuffLabelZh(ib.industry)} 赛道薪资展示 +${pct}%（至第 ${ib.untilDay} 天）`,
    });
  }
  for (const fx of state.transientEffects ?? []) {
    if (fx.untilDay < d) continue;
    const k = fx.kind === "debuff" ? "debuff" : "buff";
    rows.push({
      cls: k,
      text: `${fx.label}（剩余 ${naturalDaysRemaining(fx.untilDay)} 个自然日）`,
    });
  }
  wrap.classList.toggle("hidden", rows.length === 0);
  list.innerHTML = "";
  for (const r of rows) {
    const li = document.createElement("li");
    li.className = `status-effect status-effect--${r.cls}`;
    li.textContent = r.text;
    list.appendChild(li);
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
  const smax = $("res-stress-max");
  if (smax) smax.textContent = String(state.stressMax ?? 100);
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

  const od = $("btn-overdraft");
  if (od) {
    const canOverdraft =
      state.actionPoints <= 0 &&
      !state.gameOver &&
      !state.overdraftUsedToday;
    od.classList.toggle("hidden", !canOverdraft);
    od.disabled = !canOverdraft;
  }

  const earlyHint = document.querySelector(".early-settle-hint");
  if (earlyHint) {
    const showEarly = state.offers.length > 0 && !state.gameOver;
    earlyHint.classList.toggle("hidden", !showEarly);
  }

  checkInstantFail(state);
  if (state.gameOver && !(state.interviewModalQueue?.length > 0)) tryGameOver();

  const applyScr = $("screen-apply");
  if (applyScr && !applyScr.classList.contains("hidden") && state.applySession) {
    const ae = $("apply-energy");
    const aem = $("apply-energy-max");
    if (ae) ae.textContent = String(Math.round(state.energy));
    if (aem) aem.textContent = String(state.energyMax ?? 100);
    renderApplyScreen();
  }

  updateVitalFx();
  renderStatusEffects();
}

function runMorningPhase() {
  if (!state || state.gameOver) return;
  applyBlackTalentMorning(state);
  const nep = tryNepotismOffer(state);
  if (nep) addLog(state, nep);
  const isFinalDay = state.day === state.maxDays;
  if (
    isFinalDay &&
    ((state.resumePending?.length ?? 0) > 0 || (state.interviewQueue?.length ?? 0) > 0)
  ) {
    addLog(state, `第 ${state.day} 天：秋招截止日统一结算待反馈简历与剩余面试（不消耗行动点）。`);
  }
  const resumeMsgs = processPendingResumeFeedback(state, { forceFinalDay: isFinalDay });
  const intvMsgs = processInterviewsAtDayStart(state, { noApCost: isFinalDay });
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
  if (state.interviewModalQueue?.length) {
    showNextInterviewResultModal();
  } else if (state.eventModalQueue?.length) {
    openFirstEventModalFromQueue();
  }
}

function openFirstEventModalFromQueue() {
  if (!state?.eventModalQueue?.length) return;
  pendingEvent = state.eventModalQueue.shift();
  $("event-title").textContent = pendingEvent.title;
  $("event-desc").textContent = pendingEvent.desc;
  const emo = $("event-emoji");
  if (emo) emo.textContent = pendingEvent.emoji ?? "📋";
  $("modal-event").classList.remove("hidden");
}

function showNextInterviewResultModal() {
  const q = state?.interviewModalQueue;
  if (!q || q.length === 0) {
    $("modal-interview-result")?.classList.add("hidden");
    if (state?.gameOver) tryGameOver();
    openFirstEventModalFromQueue();
    return;
  }
  const item = q.shift();
  const em = $("interview-result-emoji");
  if (em) em.textContent = item.emoji ?? "📋";
  $("interview-result-title").textContent = item.title;
  $("interview-result-desc").textContent = item.body;
  $("modal-interview-result").classList.remove("hidden");
}

function closeEventModal() {
  if (pendingEvent && state) {
    const settleNow = pendingEvent.immediateSettle;
    resolveEvent(state, pendingEvent);
    pendingEvent = null;
    if (settleNow) {
      state.gameOver = true;
      state.eventModalQueue = [];
    }
    refreshMain();
    tryGameOver();
    if (state?.gameOver) {
      $("modal-event").classList.add("hidden");
      return;
    }
  }
  if (state?.eventModalQueue?.length) {
    openFirstEventModalFromQueue();
    refreshMain();
    return;
  }
  $("modal-event").classList.add("hidden");
}

function renderEndScreen(end) {
  lastEndingForShare = end;
  const endEmoji = $("end-emoji");
  if (endEmoji) endEmoji.textContent = getEndingEmoji(end.id);
  $("end-title").textContent = end.title;
  $("end-body").textContent = end.body;

  const endEarly = $("end-early-day");
  if (endEarly) {
    if (end.id === "early_settle") {
      endEarly.classList.remove("hidden");
      endEarly.textContent = `本局提前结束于第 ${state.day} 天。`;
    } else {
      endEarly.classList.add("hidden");
      endEarly.textContent = "";
    }
  }

  const endTalentsEl = $("end-talents");
  if (endTalentsEl) {
    const tal = state.playerTalents ?? [];
    const talentLines = tal.map((x) => talentLineBubbleHtml(x, "end")).join("");
    const hints = getEndingTalentNumericHints(state);
    const numericBubble = talentNumericSummaryBubbleHtml(hints, "end");
    const hintLine =
      hints.length > 0
        ? '<p class="end-talents-hint muted">点击天赋名称或「本局数值摘要」查看详情</p>'
        : '<p class="end-talents-hint muted">点击天赋名称查看效果</p>';
    endTalentsEl.innerHTML = `
      <h3 class="end-talents-title">本局天赋</h3>
      ${hintLine}
      <div class="end-talents-inner">${talentLines || '<p class="muted">无</p>'}${numericBubble}</div>
    `;
  }

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

function renderOfferPickScreen() {
  const list = $("offer-pick-list");
  const btn = $("btn-offer-pick-confirm");
  if (!list || !state?.offers?.length) return;
  const offers = state.offers;
  list.innerHTML = offers
    .map((o, i) => {
      const trap = o.isPyramidTrap
        ? ' <span class="offer-pick-trap" title="隐藏标签为传销陷阱">（传销陷阱）</span>'
        : "";
      return `<label class="offer-pick-row">
  <input type="radio" name="offer-pick" value="${i}" />
  <span class="offer-pick-main"><span class="offer-pick-logo" aria-hidden="true">${o.logo ?? "💼"}</span>
  <span class="offer-pick-name">${escapeHtml(o.name ?? "")}</span>
  <span class="offer-pick-tier muted">${escapeHtml(o.salaryTier ?? "薪资面议")}</span>${trap}</span>
</label>`;
    })
    .join("");
  if (btn) btn.disabled = true;
  list.querySelectorAll('input[name="offer-pick"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (btn) btn.disabled = false;
    });
  });
}

function tryGameOver() {
  if (!state) return;
  const shouldEnd = state.day > state.maxDays || state.gameOver;
  if (!shouldEnd) return;
  const pickScr = $("screen-offer-pick");
  if (pickScr && !pickScr.classList.contains("hidden")) return;
  const endEl = $("screen-end");
  if (endEl && !endEl.classList.contains("hidden")) return;
  state.gameOver = true;
  try {
    localStorage.setItem("ar_ngplus_unlock", "1");
  } catch (e) {
    /* ignore */
  }

  const preliminary = computeEnding(state, { skipPyramidCheck: true });

  if ((state.offers?.length ?? 0) === 1) {
    state.playerChosenOffer = state.offers[0];
  }

  if (
    (state.offers?.length ?? 0) >= 2 &&
    shouldPromptPlayerOfferChoice(preliminary.id)
  ) {
    renderOfferPickScreen();
    showScreen("screen-offer-pick");
    return;
  }

  if (preliminary.id === "postgrad_tv" || preliminary.id === "civil_tv") {
    renderEndScreen(preliminary);
    return;
  }

  const end = computeEnding(state);
  renderEndScreen(end);
}

function advanceDay() {
  state.day += 1;
  pruneExpiredTransientEffects(state);
  state.overdraftUsedToday = false;
  rollExeGlitchForDay(state);
  applyDailyMoneyTick(state);
  const hosp = maybePinhaofanHospital(state);
  if (hosp) addLog(state, hosp);
  applyNoOfferAnxiety(state);

  const debt = state.overdraftPendingPenalty;
  if (debt) {
    state.overdraftPendingPenalty = false;
  }
  if (state.godMode) {
    applyPassiveDayRecovery(state);
  } else if (debt) {
    applyEnergyDelta(state, -15);
  } else {
    applyPassiveDayRecovery(state);
  }

  state.maxActionPointsPerDay = computeMaxActionPointsForDay(state);
  state.actionPoints = state.maxActionPointsPerDay;
  if (debt && !state.godMode) {
    addLog(
      state,
      `进入第 ${state.day} 天。透支后遗症：未获得跨日精力恢复，并额外失去 15 点精力。`,
    );
  } else {
    addLog(state, `进入第 ${state.day} 天。`);
  }
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
        let apDed = 1;
        if (state.funNextActionFree) {
          state.funNextActionFree = false;
          apDed = 0;
        }
        state.actionPoints -= apDed;
        addLog(state, `第 ${state.day} 天：${note}`);
        refreshMain();
        renderApplyScreen();
        showScreen("screen-apply");
        return;
      }

      if (action === "fun") {
        const note = applyDailyAction(state, "fun");
        let apDed = 1;
        if (state.funNextActionFree) {
          state.funNextActionFree = false;
          apDed = 0;
        }
        state.actionPoints -= apDed;
        addLog(state, `第 ${state.day} 天：${note}`);
        refreshMain();
        if (Math.random() < 0.2 && !state.gameOver) {
          const bonus = pickRandomEntertainmentEvent(state);
          if (bonus) {
            pendingEvent = bonus;
            $("event-title").textContent = bonus.title;
            $("event-desc").textContent = bonus.desc;
            const emo = $("event-emoji");
            if (emo) emo.textContent = bonus.emoji ?? "🎮";
            $("modal-event").classList.remove("hidden");
          }
        }
        return;
      }

      const note = applyDailyAction(state, action);
      let apDed = 1;
      if (state.funNextActionFree) {
        state.funNextActionFree = false;
        apDed = 0;
      }
      state.actionPoints -= apDed;
      addLog(state, `第 ${state.day} 天：${note}`);
      refreshMain();
      if (action === "study" && !state.gameOver) {
        const breakthrough = tryStudyBreakthroughEvent(state);
        const ev = breakthrough ?? tryStudyOverloadEvent(state);
        if (ev) {
          pendingEvent = ev;
          $("event-title").textContent = ev.title;
          $("event-desc").textContent = ev.desc;
          const emoEv = $("event-emoji");
          if (emoEv) emoEv.textContent = ev.emoji ?? "📋";
          $("modal-event").classList.remove("hidden");
        }
      }
    });
  });

  $("btn-end-day").addEventListener("click", () => {
    if (!state || state.actionPoints > 0) return;
    advanceDay();
  });

  const btnOd = $("btn-overdraft");
  if (btnOd) {
    btnOd.addEventListener("click", () => {
      if (!state || state.gameOver || state.actionPoints > 0) return;
      if (state.overdraftUsedToday) return;
      state.actionPoints = 1;
      state.overdraftUsedToday = true;
      state.overdraftPendingPenalty = true;
      addLog(
        state,
        `第 ${state.day} 天：透支一次额外行动；结束本日后进入下一日时将不恢复精力并额外失去 15 点精力。`,
      );
      refreshMain();
    });
  }

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
  const view = $("company-view");
  const btnApply = $("btn-apply-co");
  const btnNext = $("btn-next-co");
  const btnLeave = $("btn-leave-apply");
  const btnSide = $("btn-side-ask");

  if (!co || s.submitted >= s.target || applySessionComplete(state)) {
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

  updateVitalFx();
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

function bindShareEnd() {
  const btn = $("btn-share-end");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    if (!state || !lastEndingForShare) return;
    const pageUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const text = buildEndingShareText(state, lastEndingForShare, { pageUrl });
    const shareTitle = `【秋招模拟器】${lastEndingForShare.title}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text,
          url: pageUrl,
        });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      alert("已复制到剪贴板，可粘贴到微信、QQ、微博等。");
    } catch (e) {
      window.prompt("复制失败，请手动全选复制：", text);
    }
  });
}

function bindTalentBubbleDismiss() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".talent-bubble-btn");
    if (btn) {
      const line = btn.closest(".talent-line");
      const bubble = line?.querySelector(".talent-bubble");
      if (!bubble) return;
      const opening = !bubble.classList.contains("is-open");
      document.querySelectorAll(".talent-bubble.is-open").forEach((el) => {
        el.classList.remove("is-open");
        el.setAttribute("hidden", "");
      });
      document.querySelectorAll('.talent-bubble-btn[aria-expanded="true"]').forEach((b) => {
        b.setAttribute("aria-expanded", "false");
      });
      if (opening) {
        bubble.classList.add("is-open");
        bubble.removeAttribute("hidden");
        btn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    if (!e.target.closest(".talent-bubble")) {
      document.querySelectorAll(".talent-bubble.is-open").forEach((el) => {
        el.classList.remove("is-open");
        el.setAttribute("hidden", "");
      });
      document.querySelectorAll('.talent-bubble-btn[aria-expanded="true"]').forEach((b) => {
        b.setAttribute("aria-expanded", "false");
      });
    }
  });
}

function bindEarlySettle() {
  const btn = $("btn-early-settle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!state || state.gameOver) return;
    if (!state.offers?.length) return;
    if (
      !confirm(
        `确定提前结束秋招并进入结算？\n当前为第 ${state.day} 天，持有 ${state.offers.length} 份 Offer。`,
      )
    ) {
      return;
    }
    state.voluntaryEarlyEnd = true;
    state.gameOver = true;
    addLog(state, `第 ${state.day} 天：选择提前结算本局。`);
    tryGameOver();
  });
}

function bindOfferPick() {
  const btn = $("btn-offer-pick-confirm");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!state) return;
    const sel = document.querySelector('input[name="offer-pick"]:checked');
    if (!sel) return;
    const idx = parseInt(sel.value, 10);
    const o = state.offers?.[idx];
    if (!o) return;
    state.playerChosenOffer = o;
    const end = computeEnding(state);
    renderEndScreen(end);
  });
}

bindStart();
bindMainActions();
bindApplyScreen();
bindRestart();
bindShareEnd();
bindTalentBubbleDismiss();
bindOfferPick();
bindEarlySettle();
bindInterviewResultModal();
renderStartTraitPreview();

function bindInterviewResultModal() {
  const btn = $("btn-interview-result-ok");
  if (!btn) return;
  btn.addEventListener("click", () => {
    showNextInterviewResultModal();
  });
}