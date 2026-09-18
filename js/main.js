import { renderCareerShop, renderRelic } from './career-ui.js?v=1.1.19';
import { awardCareer } from './career.js?v=1.1.19';
import { renderStrategies, renderApproaches, renderStrategyCareer } from './strategy-ui.js?v=1.1.19';
import { recordStrategyCareer, getStrategyCareer } from './strategy-career.js?v=1.1.19';
import { STRATEGIES, strategyCores, strategyDraft, skipStrategy } from './strategies.js?v=1.1.19';
import { MONEY_OPTIONS, moneyOptionUnavailable, useMoneyOption, livingBudgetSummary, moneyOptionDetail } from "./economy.js?v=1.1.19";
import { finishHighStressDay } from "./burnout.js?v=1.1.19";
import { personalityDetailsHtml } from "./personality-ui.js?v=1.1.19";
import { recruitmentLabel } from "./recruitment.js?v=1.1.19";
import { createInitialState, addLog } from "./state.js?v=1.1.19";
import { getEventInteraction, eventChoiceUnavailable } from "./eventChoices.js?v=1.1.19";
import { recordEventAppearance } from "./eventRecurrence.js?v=1.1.19";
import { educationTagClass } from "./eduTags.js?v=1.1.19";
import { formatRolledTraitsLog, rollAllTraits } from "./traits.js?v=1.1.19";
import {
  formatTalentsLog,
  talentLineBubbleHtml,
  talentNumericSummaryBubbleHtml,
  escapeHtml,
} from "./talents.js?v=1.1.19";
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
} from "./talentRuntime.js?v=1.1.19";
import {
  applyDailyAction,
  minCashForFunAction,
  STUDY_OVERLOAD_GAIN_MULT,
  STUDY_RECOVERY_BUFF_MULT,
} from "./actions.js?v=1.1.19";
import {
  planEventsForCurrentDay,
  resolveEvent,
  beginEvent,
  tryEntertainmentEvent,
  tryStudyOverloadEvent,
  tryStudyBreakthroughEvent,
  industrySalaryBuffLabelZh,
} from "./events.js?v=1.1.19";
import {
  startApplySession,
  getCurrentCompany,
  canReveal,
  revealHidden,
  submitCurrentCompany,
  skipCurrentCompany,
  applySessionComplete,
  endApplySession,
} from "./applications.js?v=1.1.19";
import { processInterviewsAtDayStart, processPendingResumeFeedback } from "./interviews.js?v=1.1.19";
import {
  computeEnding,
  endingSummaryLines,
  buildEndingShareText,
  getEndingEmoji,
  getBestOffer,
  shouldPromptPlayerOfferChoice,
} from "./endings.js?v=1.1.19";
import { pruneExpiredTransientEffects } from "./transientEffects.js?v=1.1.19";
import { computeEndOfferStarRating } from "./companies.js?v=1.1.19";
import {
  renderCodex,
  unlockFromRolledTraits,
  unlockTalentsFromState,
  unlockEvent,
  unlockEnding,
} from "./codex.js?v=1.1.19";

let state = null;
let pendingEvent = null;
let eventResult = null;
/** 最近一次结算结局，供分享文案使用 */
let lastEndingForShare = null;
/** 开局界面预览用（与正式开局同一引用，天才天赋会在开局时改写学历） */
let previewRolled = rollAllTraits();
/** 图鉴弹窗当前分类 */
let codexTab = "personality";

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
    <div class="personality-block"><strong>性格</strong>${t.personalities.map(p => personalityDetailsHtml(p, "preview")).join("")}</div>
    <p><strong>其他</strong>：${other}</p>
    <p class="muted">「天才」天赋可能改变开局学历。</p>
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
    <div class="personality-block"><strong>性格</strong>${t.personalities.map(p => personalityDetailsHtml(p, "main")).join("")}</div>
    <p><strong>其他</strong>：${other}</p>
    <div class="talent-block"><strong>天赋</strong>${talentLines}</div>
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
      unlockFromRolledTraits(state.traits);
      unlockTalentsFromState(state.playerTalents);
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
    reroll.disabled = getStrategyCareer().runs < 1;
    reroll.addEventListener("click", () => {
      try {
        if (getStrategyCareer().runs < 1) {
          reroll.disabled = true;
          return;
        }
        previewRolled = rollAllTraits();
        unlockFromRolledTraits(previewRolled);
        renderStartTraitPreview();
      } catch (e) {
        console.error(e);
      }
    });
  }
}

function openCodex() {
  const modal = $("modal-codex");
  if (!modal) return;
  modal.classList.remove("hidden");
  renderCodex(modal, codexTab);
}

function bindCodex() {
  const modal = $("modal-codex");
  if (!modal) return;
  const closeBtn = $("btn-codex-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  }
  modal.querySelectorAll("[data-codex-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.getAttribute("data-codex-tab");
      if (!t) return;
      codexTab = t;
      renderCodex(modal, codexTab);
    });
  });
  for (const id of ["btn-codex-start", "btn-codex-end"]) {
    const b = $(id);
    if (b) b.addEventListener("click", () => openCodex());
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
  if (state.highStressDays > 0) rows.push({ cls: "debuff", text: `已连续 ${state.highStressDays} 天以高压力结束；连续 3 天日末压力 ≥85 将身心透支。` });
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
  renderStrategies(state, refreshMain);
  renderRelic(state, refreshMain);
  $("money-budget").textContent = livingBudgetSummary(state);
  $("money-coaching").textContent = state.coachedStudies > 0 ? `辅导剩余 ${state.coachedStudies} 次学习` : '';
  document.querySelectorAll('[data-money-option]').forEach(btn => {
    const reason = moneyOptionUnavailable(state, btn.dataset.moneyOption);
    btn.disabled = !!reason;
    btn.querySelector('.money-reason').textContent = reason;
    btn.querySelector('small').textContent = moneyOptionDetail(state, btn.dataset.moneyOption);
  });
  document.querySelectorAll(".action-btn").forEach((btn) => {
    const act = btn.dataset.action;
    let dis = !!state.gameOver;
    if (act === "study") dis = dis || state.actionPoints < 2;
    else dis = dis || !canAct;
    if (act === "apply") dis = dis || state.energy < 10;
    if (act === "fun") dis = dis || (state.money ?? 0) < minCashForFunAction(state);
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
  scheduleStrategyPrompt();
}

let strategyPromptTimer;
function scheduleStrategyPrompt() {
  clearTimeout(strategyPromptTimer);
  strategyPromptTimer = setTimeout(() => {
    if (!state || state.gameOver || state.applySession || $("screen-main").classList.contains('hidden')) return;
    if (document.querySelector('.modal:not(.hidden), dialog[open]')) return;
    if (strategyDraft(state).length) {
      renderStrategies(state, refreshMain);
      $("strategy-choice-modal").showModal();
    }
  }, 0);
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
  if (!state?.eventModalQueue?.length || state.gameOver) return;
  showEventModal(state.eventModalQueue.shift());
}

function showEventModal(event) {
  recordEventAppearance(state, event);
  pendingEvent = event;
  eventResult = null;
  const interaction = getEventInteraction(event);
  const started = beginEvent(state, event);
  $("event-cost-note")?.classList.toggle("hidden", interaction.mode === "notice" || started.terminal);
  if (event.id) unlockEvent(event.id);
  $("event-title").textContent = pendingEvent.title;
  $("event-desc").textContent = interaction.prompt;
  const emo = $("event-emoji");
  if (emo) emo.textContent = pendingEvent.emoji ?? "📋";
  const choices = $("event-choices");
  choices.replaceChildren();
  choices.classList.remove("hidden");
  $("event-result").classList.add("hidden");
  $("btn-event-ok").classList.add("hidden");
  if (started.summary) {
    $("event-result").textContent = `已发生：${started.summary}。`;
    $("event-result").classList.remove("hidden");
  }
  if (started.result) {
    eventResult = started.result;
    choices.classList.add("hidden");
    $("btn-event-ok").classList.remove("hidden");
    if (eventResult.immediateSettle || started.terminal) {
      $("event-result").textContent += "继续后进入本局结局。";
    }
    $("modal-event").classList.remove("hidden");
    $("btn-event-ok").focus();
    return;
  }
  for (const selected of interaction.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "event-choice secondary";
    const reason = eventChoiceUnavailable(state, selected);
    button.disabled = !!reason;
    const title = document.createElement("strong");
    title.textContent = selected.label + (reason ? `（${reason}）` : "");
    const hint = document.createElement("small");
    hint.textContent = selected.previewHint ?? selected.hint;
    button.append(title, hint);
    button.addEventListener("click", () => {
      if (pendingEvent !== event || eventResult || state.gameOver) return;
      const result = resolveEvent(state, event, selected.id);
      if (!result.ok) return;
      eventResult = result;
      if (event.id) unlockEvent(event.id);
      choices.classList.add("hidden");
      $("event-result").textContent = `${started.summary ? `先前影响：${started.summary}。` : ""}你选择了「${result.label}」。${result.summary}。${result.immediateSettle ? "继续后进入本局结局。" : ""}`;
      $("event-result").classList.remove("hidden");
      $("btn-event-ok").classList.remove("hidden");
      $("btn-event-ok").focus();
    });
    choices.appendChild(button);
  }
  $("modal-event").classList.remove("hidden");
  choices.querySelector("button:not(:disabled)")?.focus();
}

function showNextInterviewResultModal() {
  const q = state?.interviewModalQueue;
  if (!q || q.length === 0) {
    $("modal-interview-result")?.classList.add("hidden");
    if (state?.gameOver) tryGameOver();
    openFirstEventModalFromQueue();
    scheduleStrategyPrompt();
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
  if (!eventResult) return;
  if (pendingEvent && state) {
    const settleNow = eventResult.immediateSettle;
    pendingEvent = null;
    eventResult = null;
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
    return;
  }
  $("modal-event").classList.add("hidden");
  scheduleStrategyPrompt();
}

function renderEndScreen(end) {
  const pointReward = awardCareer(state, end);
  $("end-career-reward").textContent = pointReward.text;
  renderCareerShop(renderStrategyCareer);
  const careerResult = recordStrategyCareer(state);
  $("btn-reroll-traits").disabled = getStrategyCareer().runs < 1;
  const unlockedNames = careerResult.unlocked.map(id => STRATEGIES.find(x => x.id === id).name);
  $("end-strategy-unlocks").textContent = careerResult.cheat ? '作弊局不记录策略成长。'
    : `${unlockedNames.length ? `新解锁策略：${unlockedNames.join('、')}。下局起进入候选池。` : '本局策略成长已记录。'}${careerResult.saved ? '' : '浏览器未能保存进度，刷新后可能丢失。'}`;
  renderStrategyCareer();
  lastEndingForShare = end;
  if (end?.id) unlockEnding(end.id);
  const endEmoji = $("end-emoji");
  if (endEmoji) endEmoji.textContent = getEndingEmoji(end.id);
  $("end-title").textContent = end.title;
  $("end-body").textContent = end.body;
  const selectedStrategies = strategyCores(state).map(core => `${core.name}〔${(state.strategyGrowth?.[core.id] ?? []).map(id => STRATEGIES.find(x => x.id === id).name).join('、') || '尚无成长'}〕`);
  $("end-strategies").textContent = selectedStrategies.length
    ? `本局策略：${selectedStrategies.join(' · ')}。精投 ${state.strategyUses?.focus ?? 0} 次，复盘投递 ${state.strategyUses?.volume ?? 0} 次，内推 ${state.strategyUses?.network ?? 0} 次。`
    : '';

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
    endTalentsEl.innerHTML = `
      <h3 class="end-talents-title">本局天赋</h3>
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
      if (tg) {
        tg.classList.remove("muted");
        tg.innerHTML = buildEndOfferTagsHtml(best);
      }
      renderEndCompanyRating(best);
    } else {
      bestOfferEl.classList.add("hidden");
      $("end-company-rating")?.classList.add("hidden");
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
    .map(
      (o, i) => `<div class="offer-pick-option"><label class="offer-pick-row">
  <input type="radio" name="offer-pick" value="${i}" />
  <span class="offer-pick-main"><span class="offer-pick-logo" aria-hidden="true">${o.logo ?? "💼"}</span>
  <span class="offer-pick-name">${escapeHtml(o.name ?? "")}</span>
  <span class="offer-pick-tier muted">${escapeHtml(o.salaryTier ?? "薪资面议")}</span></span>
</label>
<details class="offer-pick-details">
  <summary>查看「${escapeHtml(o.name ?? "该公司")}」的词条</summary>
  <div class="end-best-tags">${buildEndOfferTagsHtml(o, !!o.hiddenRevealed)}</div>
</details></div>`,
    )
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
  const preliminary = computeEnding(state, { skipPyramidCheck: true });
  if (state.burnoutEarlyEnd) { renderEndScreen(preliminary); return; }

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
  if (finishHighStressDay(state)) { refreshMain(); tryGameOver(); return; }
  const leavingDay = state.day;
  state.day += 1;
  pruneExpiredTransientEffects(state);
  if (
    state.studyRecoveryBuffUntilDay != null &&
    leavingDay <= state.studyRecoveryBuffUntilDay &&
    (state.studyByDay?.[leavingDay] ?? 0) >= 1
  ) {
    state.studyRecoveryBuffUntilDay += 1;
  }
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
  const moneyGrid = $("money-options");
  for (const option of MONEY_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary';
    btn.dataset.moneyOption = option.id;
    btn.innerHTML = `<strong>${option.label}</strong><small>${option.detail}</small><small class="money-reason"></small>`;
    btn.addEventListener('click', () => {
      if (!state) return;
      const result = useMoneyOption(state, option.id);
      if (!result.ok) return;
      addLog(state, `第 ${state.day} 天：${result.note}`);
      refreshMain();
    });
    moneyGrid.appendChild(btn);
  }
  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.dataset.action;
      if (!state || state.gameOver) return;
      if (action === "study") {
        if (state.actionPoints < 2) return;
      } else if (state.actionPoints <= 0) {
        return;
      }

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
        if (!state.gameOver) {
          const bonus = tryEntertainmentEvent(state);
          if (bonus) {
            showEventModal(bonus);
          }
        }
        return;
      }

      const note = applyDailyAction(state, action);
      let apDed = action === "study" ? 2 : 1;
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
          showEventModal(ev);
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
  $("modal-event").addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const buttons = [...$("modal-event").querySelectorAll("button:not(:disabled)")]
      .filter(button => button.offsetParent !== null);
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
}

function qualityLabel(q) {
  if (q === "bad") return "坏";
  if (q === "excellent") return "极好";
  if (q === "good") return "好";
  return "一般";
}

function renderEndCompanyRating(best) {
  const wrap = $("end-company-rating");
  if (!wrap) return;
  const r = computeEndOfferStarRating(best);
  wrap.classList.remove("hidden");
  wrap.classList.toggle("end-company-rating--pyramid", r.isPyramid);
  const n = r.stars;
  const isNeg = !r.isPyramid && n < 0;
  const count = r.isPyramid ? 0 : Math.abs(n);
  wrap.classList.toggle("end-company-rating--colorful", Boolean(r.colorful && !r.isPyramid && n > 0));
  wrap.classList.toggle("end-company-rating--negative", isNeg);
  let starsHtml = "";
  let aria = "";
  if (r.isPyramid) {
    aria = "0 星";
  } else if (isNeg) {
    starsHtml = Array.from({ length: count }, () => '<span class="end-star end-star--red" aria-hidden="true">★</span>').join("");
    aria = `负 ${count} 星`;
  } else if (n > 0) {
    starsHtml = Array.from({ length: n }, () => '<span class="end-star" aria-hidden="true">★</span>').join("");
    aria = `${n} 星`;
  } else {
    aria = "0 星";
  }
  const note = r.isPyramid
    ? '<span class="end-company-rating-note muted">传销公司不参与评分</span>'
    : "";
  wrap.innerHTML = `
    <h4 class="end-company-rating-title">公司评分</h4>
    <div class="end-stars-row" role="img" aria-label="${aria}">${starsHtml || '<span class="end-stars-zero muted">0 星</span>'}</div>
    ${note}
  `;
}

/** 结算页主 Offer：带好坏一般色；含隐藏词条（仅结算展示） */
function buildEndOfferTagsHtml(best, revealHidden = true) {
  const st = best.settlementTags;
  if (!st?.parts?.length && !st?.hidden) {
    return Array.isArray(best.tags) && best.tags.length
      ? escapeHtml(best.tags.join(" · "))
      : "（无标签展示）";
  }
  const bits = [];
  for (const p of st.parts ?? []) {
    const q = p.quality ?? "normal";
    bits.push(
      `<span class="tag end-offer-tag"><span class="end-offer-tag-label">${escapeHtml(p.label)}</span><span class="tag-quality tag-q-${q}">${qualityLabel(q)}</span></span>`,
    );
  }
  if (st.hidden) {
    const q = revealHidden ? st.hidden.quality ?? "normal" : "normal";
    bits.push(
      `<span class="tag end-offer-tag end-offer-tag--hidden"><span class="end-offer-tag-prefix">隐藏</span><span class="end-offer-tag-label">${revealHidden ? escapeHtml(st.hidden.label) : "？（投递前未侧面打听）"}</span>${revealHidden ? `<span class="tag-quality tag-q-${q}">${qualityLabel(q)}</span>` : ""}</span>`,
    );
  }
  return bits.join(" ");
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
  $("apply-viewed").textContent = String(s.viewedCount ?? 0);
  $("apply-total").textContent = String(s.order.length);
  const view = $("company-view");
  const btnApply = $("btn-apply-co");
  const btnNext = $("btn-next-co");
  const btnLeave = $("btn-leave-apply");
  const btnSide = $("btn-side-ask");

  if (!co || s.submitted >= s.target || applySessionComplete(state)) {
    view.innerHTML =
      s.submitted >= s.target
        ? `<p><strong>本轮已投递满 ${s.target} 份简历。</strong></p>`
        : "<p><strong>本轮公司已全部查看。</strong></p>";
    btnApply.classList.add("hidden");
    btnNext.classList.add("hidden");
    btnSide.classList.add("hidden");
    btnLeave.classList.remove("hidden");
    btnLeave.textContent = "返回";
    $("strategy-approaches").replaceChildren();
    return;
  }

  btnApply.classList.remove("hidden");
  btnNext.classList.remove("hidden");
  btnLeave.classList.remove("hidden");
  btnLeave.textContent = "结束本轮投递";
  $("apply-target").textContent = String(s.target);
  $("apply-target-hint").textContent = String(s.target);
  renderApproaches(state, renderApplyScreen);

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
        : `<p class="muted">另有隐情，可<strong>侧面打听</strong>。</p>`
      : `<p class="muted">无额外情报。</p>`;

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
    <p class="muted">招聘情况：${recruitmentLabel(co)}</p>
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
    if (state.applySession && applySessionComplete(state)) {
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
    if (applySessionComplete(state) && state.applySession.submitted < state.applySession.target) {
      addLog(state, `第 ${state.day} 天：本轮公司已全部查看，投递结束。`);
      endApplySession(state);
      showScreen("screen-main");
      refreshMain();
      return;
    }
    if (state.applySession && state.applySession.submitted >= state.applySession.target) {
      endApplySession(state);
      showScreen("screen-main");
      refreshMain();
      return;
    }
    renderApplyScreen();
    refreshMain();
  });

  $("btn-leave-apply").addEventListener("click", () => {
    if (!state?.applySession || state.gameOver) return;
    const session = state.applySession;
    addLog(state, `主动结束本轮：已查看 ${session.viewedCount ?? 0}/${session.order.length} 家公司，已投递 ${session.submitted} 份。已投简历保留并继续等待反馈。`);
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
      alert("已复制，可粘贴分享。");
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

function bindGrowthDialogs() {
  const career = $("career-modal");
  for (const id of ['btn-career-start', 'btn-career-end']) {
    $(id).addEventListener('click', () => {
      renderCareerShop(renderStrategyCareer);
      renderStrategyCareer();
      if (!career.open) career.showModal();
    });
  }
  $("btn-career-close").addEventListener('click', () => career.close());
  career.addEventListener('close', scheduleStrategyPrompt);
  const strategy = $("strategy-choice-modal");
  strategy.addEventListener('cancel', event => event.preventDefault());
  $("btn-strategy-skip").addEventListener('click', () => {
    if (state && skipStrategy(state)) {
      strategy.close();
      refreshMain();
    }
  });
}

bindGrowthDialogs();
bindStart();
bindCodex();
bindMainActions();
bindApplyScreen();
bindRestart();
bindShareEnd();
bindTalentBubbleDismiss();
bindOfferPick();
bindEarlySettle();
bindInterviewResultModal();
renderStartTraitPreview();
unlockFromRolledTraits(previewRolled);

const TUTORIAL_STORAGE_KEY = "ar_tutorial_seen_v1";
/** 新手说明，≤45 字 */
const TUTORIAL_INTRO =
  "秋招模拟器：三十天投简历、刷脸、抗压，Offer随缘——输了重开，反正比真秋招便宜。";

function bindTutorial() {
  const modal = $("modal-tutorial");
  const btn = $("btn-tutorial-ok");
  const body = $("tutorial-body");
  if (!modal || !btn) return;
  if (body) body.textContent = TUTORIAL_INTRO;
  btn.addEventListener("click", () => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
    } catch (e) {
      /* ignore */
    }
    modal.classList.add("hidden");
  });
}

function maybeShowTutorial() {
  try {
    if (localStorage.getItem(TUTORIAL_STORAGE_KEY)) return;
  } catch (e) {
    return;
  }
  const modal = $("modal-tutorial");
  const fail = $("boot-fail");
  if (!modal) return;
  if (fail && !fail.classList.contains("hidden")) return;
  modal.classList.remove("hidden");
}

bindTutorial();
renderStrategyCareer();
renderCareerShop(renderStrategyCareer);
maybeShowTutorial();

function bindInterviewResultModal() {
  const btn = $("btn-interview-result-ok");
  if (!btn) return;
  btn.addEventListener("click", () => {
    showNextInterviewResultModal();
  });
}
