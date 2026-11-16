/* ==========================================================================
   知时课表 · Teacher Timetable PWA — Main Application Controller
   ========================================================================== */

import {
  CLASS_PALETTES,
  DEFAULT_PERIODS_40,
  DEFAULT_PERIODS_45,
  WEEKDAY_LABELS,
  computeFocusState,
  createInitialSchedule,
  ensureClassColors,
  formatDateISO,
  getClassPalette,
  getMondayOfWeek,
  getVisiblePeriods,
  getWeekNumber,
  pad2,
  parseMinutes,
  resolveDayLessons
} from "./data.js";

const STORAGE_KEY = "teacher_timetable_v1";
const SYNC_KEY = "teacher_timetable_sync_code";
const VISION_CFG_KEY = "teacher_timetable_vision_cfg";
const THEME_KEY = "teacher_timetable_theme";

const state = {
  schedule: loadLocalSchedule(),
  syncCode: (localStorage.getItem(SYNC_KEY) || "").toUpperCase(),
  weekOffset: 0,
  simMode: "live", // "live" | "morning" | "afterschool"
  selectedMobileDateISO: null, // null = smart Today->Tomorrow mode
  spotlightClass: null,
  editingSlot: null, // { day, periodId, dateISO }
  pendingDrag: null, // { fromDay, fromPeriodId, fromDateISO, toDay, toPeriodId, toDateISO }
  ocrDraftLessons: [],
  ocrDraftMeta: {},
  wsimMode: "tomorrow_check", // "today" | "tomorrow"
  wsimDark: false,
  notifiedKeys: new Set()
};

function loadLocalSchedule() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.periods) && Array.isArray(parsed.lessons)) {
        ensureClassColors(parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse saved schedule:", e);
  }
  return createInitialSchedule();
}

function saveSchedule({ skipCloud = false } = {}) {
  state.schedule.updatedAt = Date.now();
  ensureClassColors(state.schedule);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.schedule));
  renderAll();
  if (!skipCloud && state.syncCode) {
    pushToCloud(state.syncCode, true);
  }
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

function getEffectiveNow() {
  const real = new Date();
  // If today in real life is Saturday/Sunday and user clicks simulation modes, anchor to Monday so demo is vivid
  if (state.simMode === "morning") {
    const base = (real.getDay() === 0 || real.getDay() === 6) ? getMondayOfWeek(real) : real;
    return { date: base, simMinutes: 8 * 60 + 20 };
  }
  if (state.simMode === "afterschool") {
    const base = (real.getDay() === 0 || real.getDay() === 6) ? getMondayOfWeek(real) : real;
    return { date: base, simMinutes: 20 * 60 + 30 };
  }
  return { date: real, simMinutes: null };
}

/* ==========================================================================
   Rendering: Header, Focus Card (Today ⇄ Tomorrow), Class Chips, Weekly Grid
   ========================================================================== */

function renderHeader() {
  const { date } = getEffectiveNow();
  const viewedMonday = getMondayOfWeek(date);
  viewedMonday.setDate(viewedMonday.getDate() + state.weekOffset * 7);
  const weekNo = getWeekNumber(viewedMonday, state.schedule.semesterStart);
  const tName = state.schedule.teacherName || "老师";
  const subj = state.schedule.defaultSubject ? ` · ${state.schedule.defaultSubject}` : "";
  const totalWeekly = (state.schedule.lessons || []).length;

  document.getElementById("header-subtitle").textContent =
    `${tName}${subj} · 第 ${weekNo} 周 · 本周共 ${totalWeekly} 节常规课`;

  const pillText = document.getElementById("sync-pill-text");
  if (state.syncCode) {
    pillText.textContent = `同步码 ${state.syncCode}`;
  } else {
    pillText.textContent = "本地离线 · 点此同步";
  }

  document.getElementById("toggle-morning-read").classList.toggle("on", state.schedule.showMorningRead !== false);
  document.getElementById("toggle-evening").classList.toggle("on", state.schedule.showEvening !== false);
  document.getElementById("toggle-weekend").classList.toggle("on", Boolean(state.schedule.showWeekend));

  const suffix = state.weekOffset === 0 ? "（本周）" : (state.weekOffset > 0 ? `（+${state.weekOffset}周）` : `（${state.weekOffset}周）`);
  document.getElementById("week-nav-label").textContent = `第 ${weekNo} 周 ${suffix}`;
}

function renderMobileDayStrip() {
  const wrap = document.getElementById("mobile-day-strip");
  const { date: today } = getEffectiveNow();
  const monday = getMondayOfWeek(today);
  monday.setDate(monday.getDate() + state.weekOffset * 7);
  const todayISO = formatDateISO(today);

  let html = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const iso = formatDateISO(d);
    const selected = state.selectedMobileDateISO ? state.selectedMobileDateISO === iso : iso === todayISO;
    const count = resolveDayLessons(state.schedule, d).length;
    html += `
      <button type="button" class="day-chip ${selected ? "selected" : ""}" data-pick-date="${iso}">
        <span>${WEEKDAY_LABELS[i + 1].replace("周", "")}</span>
        <span class="d-num">${d.getMonth() + 1}/${d.getDate()}</span>
        <span class="d-num">${count > 0 ? `${count}节` : "休"}</span>
      </button>
    `;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll("[data-pick-date]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const clickedISO = btn.getAttribute("data-pick-date");
      state.selectedMobileDateISO = clickedISO === todayISO ? null : clickedISO;
      renderMobileDayStrip();
      renderFocusCard();
    });
  });
}

function renderFocusCard() {
  const container = document.getElementById("focus-card-container");
  const { date: baseToday, simMinutes } = getEffectiveNow();

  // If user manually selected another date on the mobile day strip
  if (state.selectedMobileDateISO) {
    const [y, m, d] = state.selectedMobileDateISO.split("-").map(Number);
    const customDate = new Date(y, m - 1, d);
    const isoDay = customDate.getDay() === 0 ? 7 : customDate.getDay();
    const list = resolveDayLessons(state.schedule, customDate);

    container.innerHTML = `
      <div class="focus-header">
        <div class="focus-title-group">
          <span class="focus-eyebrow">${state.selectedMobileDateISO}</span>
          <h2 class="focus-heading">${WEEKDAY_LABELS[isoDay]}课程安排</h2>
        </div>
        <button type="button" class="btn btn-sm" id="btn-back-smart-focus">返回今日/明日</button>
      </div>
      ${renderTimelineHTML(list, customDate, -1)}
    `;
    document.getElementById("btn-back-smart-focus")?.addEventListener("click", () => {
      state.selectedMobileDateISO = null;
      renderMobileDayStrip();
      renderFocusCard();
    });
    bindTimelineClicks(container);
    return;
  }

  const focus = computeFocusState(state.schedule, baseToday, simMinutes);
  const todayIsoDay = baseToday.getDay() === 0 ? 7 : baseToday.getDay();
  const tmrIsoDay = focus.tomorrowDate.getDay() === 0 ? 7 : focus.tomorrowDate.getDay();

  if (!focus.switchedToTomorrow) {
    const heroItem = focus.ongoing || focus.nextUp;
    const palIdx = Number((state.schedule.classColors || {})[heroItem.className] ?? 0) % CLASS_PALETTES.length;
    const pal = CLASS_PALETTES[palIdx];
    const isOngoing = Boolean(focus.ongoing);
    const heroStatus = isOngoing
      ? `🟢 正在上课 · 剩余 ${heroItem.remainMin} 分钟`
      : `⏳ 下一节 · ${heroItem.untilMin >= 60 ? `${Math.floor(heroItem.untilMin / 60)}小时${heroItem.untilMin % 60}分` : `${heroItem.untilMin} 分钟`}后开始`;

    container.innerHTML = `
      <div class="focus-header">
        <div class="focus-title-group">
          <span class="focus-eyebrow">${formatDateISO(baseToday)} · ${WEEKDAY_LABELS[todayIsoDay]}</span>
          <h2 class="focus-heading">今日授课进度</h2>
        </div>
        <span class="status-tag today">${esc(focus.reasonLabel)}</span>
      </div>

      <div class="hero-next-box pal-${palIdx}" data-open-slot="${heroItem.day}|${heroItem.periodId}|${formatDateISO(baseToday)}" style="cursor:pointer;">
        <div class="hero-next-meta">
          <span>${esc(heroStatus)}</span>
          <span>${esc(heroItem.period.label)} ${esc(heroItem.period.start)}-${esc(heroItem.period.end)}</span>
        </div>
        <div class="hero-next-class">
          ${esc(heroItem.className)}
          ${heroItem.overrideType === "swap" ? " [调]" : (heroItem.overrideType === "substitute" ? " [代]" : "")}
        </div>
        <div class="hero-next-sub">
          <span>📘 ${esc(heroItem.subject || state.schedule.defaultSubject || "授课")}</span>
          ${heroItem.room ? `<span>📍 ${esc(heroItem.room)}</span>` : ""}
        </div>
        ${heroItem.memo ? `<div class="hero-memo">📌 备忘：${esc(heroItem.memo)}</div>` : ""}
        ${isOngoing ? `<div class="progress-track"><div class="progress-fill" style="width:${heroItem.progressPct}%; background:${pal.bar};"></div></div>` : ""}
      </div>

      ${renderTimelineHTML(focus.todayLessons, baseToday, focus.nowMin)}

      <details style="margin-top:12px; border-top:1px solid var(--border-hairline); padding-top:10px;">
        <summary style="cursor:pointer; font-size:12px; font-weight:700; color:var(--ink-secondary);">
          👀 提前查看明日预告（${WEEKDAY_LABELS[tmrIsoDay]} · 共 ${focus.tomorrowLessons.length} 节）
        </summary>
        <div style="margin-top:8px;">
          ${renderTimelineHTML(focus.tomorrowLessons, focus.tomorrowDate, -1)}
        </div>
      </details>
    `;
  } else {
    // Automatically switched to TOMORROW!
    container.innerHTML = `
      <div class="focus-header">
        <div class="focus-title-group">
          <span class="focus-eyebrow">明日 ${formatDateISO(focus.tomorrowDate)} · ${WEEKDAY_LABELS[tmrIsoDay]}</span>
          <h2 class="focus-heading">明日课程预告</h2>
        </div>
        <span class="status-tag tomorrow">${esc(focus.reasonLabel)}</span>
      </div>

      <div style="font-size:12px; color:var(--ink-secondary); margin-bottom:10px; padding:8px 10px; border-radius:var(--radius-sm); background:var(--amber-soft); color:var(--amber-ink);">
        ✨ 今日课程已全部完成（共 ${focus.todayLessons.length} 节），已为您自动切换展示明天（${WEEKDAY_LABELS[tmrIsoDay]}）的课表：
      </div>

      ${renderTimelineHTML(focus.tomorrowLessons, focus.tomorrowDate, -1)}

      ${focus.todayLessons.length > 0 ? `
        <details style="margin-top:12px; border-top:1px solid var(--border-hairline); padding-top:10px;">
          <summary style="cursor:pointer; font-size:12px; color:var(--ink-muted);">
            回顾今日已上完的 ${focus.todayLessons.length} 节课
          </summary>
          <div style="margin-top:8px;">
            ${renderTimelineHTML(focus.todayLessons, baseToday, 23 * 60 + 59)}
          </div>
        </details>
      ` : ""}
    `;
  }

  bindTimelineClicks(container);
}

function renderTimelineHTML(lessons, dateObj, nowMin) {
  const dateISO = formatDateISO(dateObj);
  if (!lessons || lessons.length === 0) {
    return `
      <div class="empty-day-state">
        <strong>☕ 当天没有排课</strong>
        <span>可以安心备课或休息，点击右侧课表空白格可随时排课</span>
      </div>
    `;
  }
  return `
    <div class="day-timeline">
      ${lessons.map((item) => {
        const st = parseMinutes(item.period.start);
        const ed = parseMinutes(item.period.end);
        const isDone = nowMin >= 0 && nowMin >= ed;
        const isActive = nowMin >= 0 && nowMin >= st && nowMin < ed;
        const pal = getClassPalette(state.schedule, item.className);
        const badge = item.overrideType === "swap"
          ? `<span class="status-tag tomorrow" style="padding:1px 6px;font-size:10px;">调</span>`
          : item.overrideType === "substitute"
          ? `<span class="status-tag tomorrow" style="padding:1px 6px;font-size:10px;">代</span>`
          : "";
        return `
          <div class="timeline-item ${isDone ? "done" : ""} ${isActive ? "active" : ""}" data-open-slot="${item.day}|${item.periodId}|${dateISO}">
            <div class="tl-time">
              <span>${esc(item.period.start)}</span>
              <span class="tl-period">${esc(item.period.label)}</span>
            </div>
            <div class="tl-body">
              <div class="tl-class-row">
                <span class="tl-swatch" style="background:${pal.bar};"></span>
                <span>${esc(item.className)}</span>
                ${badge}
              </div>
              <div class="tl-sub">
                ${esc(item.subject || state.schedule.defaultSubject || "")}
                ${item.room ? ` · ${esc(item.room)}` : ""}
              </div>
              ${item.memo ? `<div class="tl-memo">📌 ${esc(item.memo)}</div>` : ""}
            </div>
            <div style="font-size:11px; color:var(--ink-muted);">
              ${isDone ? "已上完" : (isActive ? "上课中" : "编辑 ›")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function bindTimelineClicks(rootEl) {
  rootEl.querySelectorAll("[data-open-slot]").forEach((el) => {
    el.addEventListener("click", () => {
      const [dayStr, periodId, dateISO] = el.getAttribute("data-open-slot").split("|");
      openLessonModal(Number(dayStr), periodId, dateISO);
    });
  });
}

function renderClassChips() {
  const wrap = document.getElementById("class-chips-wrap");
  const clearBtn = document.getElementById("btn-clear-spotlight");
  const counts = new Map();
  for (const l of state.schedule.lessons || []) {
    if (!l.className) continue;
    counts.set(l.className, (counts.get(l.className) || 0) + 1);
  }

  clearBtn.style.display = state.spotlightClass ? "inline-flex" : "none";

  if (counts.size === 0) {
    wrap.innerHTML = `<span style="font-size:12px;color:var(--ink-muted);">添加课程后将按授课班级自动生成色标</span>`;
    return;
  }

  let html = "";
  for (const [clsName, cnt] of counts.entries()) {
    const palIdx = Number((state.schedule.classColors || {})[clsName] ?? 0) % CLASS_PALETTES.length;
    const isSelected = state.spotlightClass === clsName;
    const isDimmed = state.spotlightClass && !isSelected;
    html += `
      <button type="button"
        class="class-filter-chip pal-${palIdx} ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""}"
        data-cls-chip="${esc(clsName)}"
        title="点击高亮筛选该班课表；按住 Shift 点击可切换该班颜色">
        <span>${esc(clsName)}</span>
        <span style="opacity:0.72;font-weight:500;">${cnt}节</span>
      </button>
    `;
  }
  wrap.innerHTML = html;

  wrap.querySelectorAll("[data-cls-chip]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      const cls = btn.getAttribute("data-cls-chip");
      if (ev.shiftKey) {
        state.schedule.classColors[cls] = ((state.schedule.classColors[cls] || 0) + 1) % CLASS_PALETTES.length;
        saveSchedule();
        return;
      }
      state.spotlightClass = state.spotlightClass === cls ? null : cls;
      renderClassChips();
      renderWeeklyGrid();
    });
  });
}

function renderWeeklyGrid() {
  const thead = document.getElementById("weekly-thead");
  const tbody = document.getElementById("weekly-tbody");
  const { date: today } = getEffectiveNow();
  const todayISO = formatDateISO(today);

  const monday = getMondayOfWeek(today);
  monday.setDate(monday.getDate() + state.weekOffset * 7);

  const dayCount = state.schedule.showWeekend ? 7 : 5;
  const weekDates = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    weekDates.push({ day: i + 1, dateObj: d, dateISO: formatDateISO(d) });
  }

  thead.innerHTML = `
    <tr>
      <th class="col-period">节次</th>
      ${weekDates.map((wd) => `
        <th class="${wd.dateISO === todayISO ? "is-today" : ""}">
          <span>${WEEKDAY_LABELS[wd.day]}</span>
          <span class="th-date">${wd.dateObj.getMonth() + 1}/${pad2(wd.dateObj.getDate())}</span>
        </th>
      `).join("")}
    </tr>
  `;

  // Pre-resolve every displayed day's lessons (including canceled overrides so teacher sees dashed slot)
  const daySlotMaps = new Map();
  for (const wd of weekDates) {
    const resolved = resolveDayLessons(state.schedule, wd.dateObj, { includeCanceled: true });
    const byPid = new Map(resolved.map((item) => [item.periodId, item]));
    daySlotMaps.set(wd.day, byPid);
  }

  const visiblePeriods = getVisiblePeriods(state.schedule);
  let rowsHTML = "";
  let prevSection = null;

  for (const period of visiblePeriods) {
    if (prevSection === "am" && period.section === "pm") {
      rowsHTML += `<tr class="section-divider-row"><td colspan="${dayCount + 1}">☀️ 午 间 休 息</td></tr>`;
    } else if (prevSection && prevSection !== "evening" && period.section === "evening") {
      rowsHTML += `<tr class="section-divider-row"><td colspan="${dayCount + 1}">🌙 晚 自 习 时 段</td></tr>`;
    }
    prevSection = period.section;

    rowsHTML += `<tr>
      <td class="period-cell">
        <div class="period-num">${esc(period.label)}</div>
        <div class="period-time">${esc(period.start)}<br/>${esc(period.end)}</div>
      </td>
      ${weekDates.map((wd) => {
        const slot = daySlotMaps.get(wd.day)?.get(period.id);
        const isTodayCol = wd.dateISO === todayISO;
        if (!slot) {
          return `
            <td class="slot-td ${isTodayCol ? "is-today-col" : ""}"
                data-drop-slot="${wd.day}|${period.id}|${wd.dateISO}">
              <button type="button" class="empty-slot-btn"
                      data-add-slot="${wd.day}|${period.id}|${wd.dateISO}"
                      aria-label="添加${WEEKDAY_LABELS[wd.day]}${period.label}课程">+</button>
            </td>
          `;
        }

        const palIdx = Number((state.schedule.classColors || {})[slot.className] ?? 0) % CLASS_PALETTES.length;
        const dim = state.spotlightClass && state.spotlightClass !== slot.className;
        let badgeHTML = "";
        if (slot.isCanceled) badgeHTML = `<span class="lc-badge">停</span>`;
        else if (slot.overrideType === "swap") badgeHTML = `<span class="lc-badge">调</span>`;
        else if (slot.overrideType === "substitute") badgeHTML = `<span class="lc-badge">代</span>`;
        else if (slot.weekType === "odd") badgeHTML = `<span class="lc-badge">单周</span>`;
        else if (slot.weekType === "even") badgeHTML = `<span class="lc-badge">双周</span>`;

        const metaParts = [slot.subject, slot.room].filter(Boolean).join(" · ");

        return `
          <td class="slot-td ${isTodayCol ? "is-today-col" : ""}"
              data-drop-slot="${wd.day}|${period.id}|${wd.dateISO}">
            <div class="lesson-card pal-${palIdx} ${dim ? "spotlight-dim" : ""} ${slot.isCanceled ? "is-canceled" : ""}"
                 draggable="${!slot.isCanceled}"
                 data-drag-source="${wd.day}|${period.id}|${wd.dateISO}"
                 data-edit-slot="${wd.day}|${period.id}|${wd.dateISO}">
              <div class="lc-top">
                <span class="lc-class">${esc(slot.className)}</span>
                ${badgeHTML}
              </div>
              ${metaParts ? `<div class="lc-meta">${esc(metaParts)}</div>` : ""}
              ${slot.memo ? `<div class="lc-memo">📌 ${esc(slot.memo)}</div>` : ""}
            </div>
          </td>
        `;
      }).join("")}
    </tr>`;
  }

  tbody.innerHTML = rowsHTML;

  // Bind click events for empty slots & existing cards
  tbody.querySelectorAll("[data-add-slot], [data-edit-slot]").forEach((el) => {
    el.addEventListener("click", () => {
      const raw = el.getAttribute("data-add-slot") || el.getAttribute("data-edit-slot");
      const [dayStr, periodId, dateISO] = raw.split("|");
      openLessonModal(Number(dayStr), periodId, dateISO);
    });
  });

  // Bind HTML5 Drag & Drop for instant lesson swapping
  tbody.querySelectorAll("[data-drag-source]").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", card.getAttribute("data-drag-source"));
      e.dataTransfer.effectAllowed = "move";
    });
  });

  tbody.querySelectorAll("[data-drop-slot]").forEach((td) => {
    td.addEventListener("dragover", (e) => {
      e.preventDefault();
      td.classList.add("drag-over");
    });
    td.addEventListener("dragleave", () => td.classList.remove("drag-over"));
    td.addEventListener("drop", (e) => {
      e.preventDefault();
      td.classList.remove("drag-over");
      const src = e.dataTransfer.getData("text/plain");
      const dst = td.getAttribute("data-drop-slot");
      if (!src || !dst || src === dst) return;
      const [fromDay, fromPid, fromISO] = src.split("|");
      const [toDay, toPid, toISO] = dst.split("|");
      promptDragSwap({
        fromDay: Number(fromDay),
        fromPeriodId: fromPid,
        fromDateISO: fromISO,
        toDay: Number(toDay),
        toPeriodId: toPid,
        toDateISO: toISO
      });
    });
  });
}

function renderAll() {
  renderHeader();
  renderMobileDayStrip();
  renderFocusCard();
  renderClassChips();
  renderWeeklyGrid();
}

/* ==========================================================================
   Modal Helpers & Lesson / Override / Memo Editor
   ========================================================================== */

function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}

function switchLessonModalTab(mode) {
  const isReg = mode === "regular";
  document.getElementById("tab-edit-regular").classList.toggle("active", isReg);
  document.getElementById("tab-edit-override").classList.toggle("active", !isReg);
  document.getElementById("form-lesson-regular").style.display = isReg ? "block" : "none";
  document.getElementById("form-lesson-override").style.display = isReg ? "none" : "block";
}

function openLessonModal(day = 1, periodId = "p1", dateISO = null) {
  if (!dateISO) {
    const { date } = getEffectiveNow();
    const m = getMondayOfWeek(date);
    m.setDate(m.getDate() + state.weekOffset * 7 + (day - 1));
    dateISO = formatDateISO(m);
  }
  state.editingSlot = { day, periodId, dateISO };

  // Populate day & period selects
  const daySel = document.getElementById("inp-les-day");
  daySel.innerHTML = [1, 2, 3, 4, 5, 6, 7]
    .map((d) => `<option value="${d}" ${d === day ? "selected" : ""}>${WEEKDAY_LABELS[d]}</option>`)
    .join("");

  const pSel = document.getElementById("inp-les-period");
  pSel.innerHTML = (state.schedule.periods || [])
    .map((p) => `<option value="${p.id}" ${p.id === periodId ? "selected" : ""}>${esc(p.label)} (${p.start}-${p.end})</option>`)
    .join("");

  const periodObj = (state.schedule.periods || []).find((p) => p.id === periodId) || { label: periodId, start: "", end: "" };
  document.getElementById("modal-lesson-subtitle").textContent =
    `${dateISO} (${WEEKDAY_LABELS[day]}) · ${periodObj.label} ${periodObj.start}-${periodObj.end}`;

  // Existing regular lesson
  const regLesson = (state.schedule.lessons || []).find((l) => Number(l.day) === day && l.periodId === periodId);
  document.getElementById("inp-les-class").value = regLesson?.className || "";
  document.getElementById("inp-les-subject").value = regLesson?.subject || state.schedule.defaultSubject || "";
  document.getElementById("inp-les-room").value = regLesson?.room || "";
  document.getElementById("inp-les-weektype").value = regLesson?.weekType || "all";
  document.getElementById("inp-les-memo").value = regLesson?.memo || "";
  document.getElementById("btn-delete-lesson").style.display = regLesson ? "inline-flex" : "none";

  // Quick class suggestion tags
  const existingClasses = [...new Set((state.schedule.lessons || []).map((l) => l.className).filter(Boolean))];
  const qWrap = document.getElementById("quick-class-tags");
  qWrap.innerHTML = existingClasses
    .map((c) => `<button type="button" class="quick-tag" data-fill-cls="${esc(c)}">${esc(c)}</button>`)
    .join("");
  qWrap.querySelectorAll("[data-fill-cls]").forEach((b) => {
    b.addEventListener("click", () => {
      document.getElementById("inp-les-class").value = b.getAttribute("data-fill-cls");
    });
  });

  // Override tab fields
  const ovKey = `${dateISO}__${periodId}`;
  const ov = (state.schedule.overrides || {})[ovKey];
  document.getElementById("ov-target-date-label").textContent = `${dateISO} ${WEEKDAY_LABELS[day]}`;
  document.getElementById("inp-ov-type").value = ov?.type || (regLesson ? "swap" : "substitute");
  document.getElementById("inp-ov-class").value = ov?.className ?? regLesson?.className ?? "";
  document.getElementById("inp-ov-subject").value = ov?.subject ?? regLesson?.subject ?? state.schedule.defaultSubject ?? "";
  document.getElementById("inp-ov-room").value = ov?.room ?? regLesson?.room ?? "";
  document.getElementById("inp-ov-reason").value = ov?.reason || "";
  document.getElementById("inp-ov-memo").value = ov?.memo ?? regLesson?.memo ?? "";
  document.getElementById("btn-clear-override").style.display = ov ? "inline-flex" : "none";
  updateOverrideFieldsVisibility();

  switchLessonModalTab(ov ? "override" : "regular");
  openModal("modal-lesson");
}

function updateOverrideFieldsVisibility() {
  const t = document.getElementById("inp-ov-type").value;
  const isCancel = t === "cancel";
  const isMemoOnly = t === "memo_only";
  document.getElementById("ov-field-class").style.display = (isCancel || isMemoOnly) ? "none" : "flex";
  document.getElementById("ov-field-subject").style.display = (isCancel || isMemoOnly) ? "none" : "flex";
  document.getElementById("ov-field-room").style.display = (isCancel || isMemoOnly) ? "none" : "flex";
  document.getElementById("ov-field-memo").style.display = isCancel ? "none" : "flex";
}

function promptDragSwap(dragInfo) {
  state.pendingDrag = dragInfo;
  const pMap = new Map((state.schedule.periods || []).map((p) => [p.id, p.label]));
  document.getElementById("drag-swap-desc").textContent =
    `${WEEKDAY_LABELS[dragInfo.fromDay]} ${pMap.get(dragInfo.fromPeriodId)} ⇄ ${WEEKDAY_LABELS[dragInfo.toDay]} ${pMap.get(dragInfo.toPeriodId)}`;
  openModal("modal-drag-swap");
}

function executeDragSwap(thisWeekOnly) {
  const d = state.pendingDrag;
  if (!d) return;
  closeModal("modal-drag-swap");

  const [fy, fm, fd] = d.fromDateISO.split("-").map(Number);
  const [ty, tm, td] = d.toDateISO.split("-").map(Number);
  const fromResolved = resolveDayLessons(state.schedule, new Date(fy, fm - 1, fd)).find((x) => x.periodId === d.fromPeriodId);
  const toResolved = resolveDayLessons(state.schedule, new Date(ty, tm - 1, td)).find((x) => x.periodId === d.toPeriodId);

  if (!fromResolved) return;

  if (thisWeekOnly) {
    if (!state.schedule.overrides) state.schedule.overrides = {};
    const fromKey = `${d.fromDateISO}__${d.fromPeriodId}`;
    const toKey = `${d.toDateISO}__${d.toPeriodId}`;

    state.schedule.overrides[toKey] = {
      date: d.toDateISO,
      periodId: d.toPeriodId,
      type: "swap",
      className: fromResolved.className,
      subject: fromResolved.subject,
      room: fromResolved.room,
      memo: fromResolved.memo,
      reason: `从 ${d.fromDateISO} 调入`
    };

    if (toResolved) {
      state.schedule.overrides[fromKey] = {
        date: d.fromDateISO,
        periodId: d.fromPeriodId,
        type: "swap",
        className: toResolved.className,
        subject: toResolved.subject,
        room: toResolved.room,
        memo: toResolved.memo,
        reason: `与 ${d.toDateISO} 互换`
      };
    } else {
      state.schedule.overrides[fromKey] = {
        date: d.fromDateISO,
        periodId: d.fromPeriodId,
        type: "cancel",
        reason: `已调至 ${d.toDateISO}`
      };
    }
    saveSchedule();
    showToast("已完成本周临时调课（不影响其他周）");
  } else {
    const lessons = state.schedule.lessons || [];
    const idxA = lessons.findIndex((l) => Number(l.day) === d.fromDay && l.periodId === d.fromPeriodId);
    const idxB = lessons.findIndex((l) => Number(l.day) === d.toDay && l.periodId === d.toPeriodId);
    if (idxA >= 0 && idxB >= 0) {
      lessons[idxA].day = d.toDay;
      lessons[idxA].periodId = d.toPeriodId;
      lessons[idxA].id = `les_${d.toDay}_${d.toPeriodId}`;
      lessons[idxB].day = d.fromDay;
      lessons[idxB].periodId = d.fromPeriodId;
      lessons[idxB].id = `les_${d.fromDay}_${d.fromPeriodId}`;
    } else if (idxA >= 0) {
      lessons[idxA].day = d.toDay;
      lessons[idxA].periodId = d.toPeriodId;
      lessons[idxA].id = `les_${d.toDay}_${d.toPeriodId}`;
    }
    if (d.toDay >= 6) state.schedule.showWeekend = true;
    saveSchedule();
    showToast("已永久更新每周固定课表");
  }
}

/* ==========================================================================
   Photo OCR Recognition & Visual Grid Proofreader
   ========================================================================== */

async function compressImageFile(file, maxWidth = 1560) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function runImageOcr({ dataUrl, isDemoSample = false }) {
  document.getElementById("ocr-photo-img").src = dataUrl || "/sample-timetable.png";
  document.getElementById("ocr-photo-preview-wrap").style.display = "block";
  showToast(isDemoSample ? "正在识别示例课表照片..." : "正在调用 AI 视觉模型解析课表...");

  const savedCfg = JSON.parse(localStorage.getItem(VISION_CFG_KEY) || "{}");
  const apiBase = document.getElementById("inp-vision-base").value.trim() || savedCfg.apiBase || "";
  const apiModel = document.getElementById("inp-vision-model").value.trim() || savedCfg.apiModel || "";
  const apiKey = document.getElementById("inp-vision-key").value.trim() || savedCfg.apiKey || "";

  if (apiBase || apiModel || apiKey) {
    localStorage.setItem(VISION_CFG_KEY, JSON.stringify({ apiBase, apiModel, apiKey }));
  }

  try {
    const resp = await fetch("/api/ocr/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: dataUrl || "",
        mimeType: "image/jpeg",
        periods: state.schedule.periods,
        defaultSubject: state.schedule.defaultSubject,
        apiBase,
        apiKey,
        model: apiModel,
        isDemoSample
      })
    });
    const res = await resp.json();
    if (!res.ok) {
      showToast(res.message || "未能自动识别，请配置 API Key 或使用提示词粘贴模式");
      if (res.code === "NO_API_KEY") {
        // Switch user gently to see API key details or prompt tab
        document.querySelector("#ocr-panel-photo details").open = true;
      }
      return;
    }
    state.ocrDraftLessons = res.lessons || [];
    state.ocrDraftMeta = {
      teacherName: res.teacherName || "",
      defaultSubject: res.defaultSubject || ""
    };
    renderOcrProofGrid();
    document.getElementById("ocr-proof-section").style.display = "block";
    showToast(`识别成功！共提取 ${state.ocrDraftLessons.length} 节课程，请核对右侧网格`);
  } catch (err) {
    showToast("网络或服务异常，可使用「粘贴Excel/文本」离线解析");
  }
}

function renderOcrProofGrid() {
  const table = document.getElementById("ocr-proof-table");
  const summary = document.getElementById("ocr-proof-summary");
  summary.textContent = `✅ 已识别出 ${state.ocrDraftLessons.length} 节课程`;

  const draftMap = new Map();
  for (const item of state.ocrDraftLessons) {
    draftMap.set(`${item.day}__${item.periodId}`, item);
  }

  const maxDay = state.ocrDraftLessons.some((l) => l.day >= 6) ? 7 : 5;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  let html = `<thead><tr><th style="width:68px;">节次</th>${days.map((d) => `<th>${WEEKDAY_LABELS[d]}</th>`).join("")}</tr></thead><tbody>`;
  for (const p of state.schedule.periods) {
    html += `<tr>
      <td style="font-weight:700;">${esc(p.label)}</td>
      ${days.map((d) => {
        const cell = draftMap.get(`${d}__${p.id}`);
        if (cell) {
          return `<td>
            <div class="proof-cell parsed" data-proof-cell="${d}|${p.id}">
              <span>${esc(cell.className)}</span>
              <span style="font-weight:400;font-size:10px;opacity:0.85;">${esc([cell.subject, cell.room].filter(Boolean).join("·"))}</span>
            </div>
          </td>`;
        }
        return `<td><div class="proof-cell empty" data-proof-cell="${d}|${p.id}">+</div></td>`;
      }).join("")}
    </tr>`;
  }
  html += `</tbody>`;
  table.innerHTML = html;

  table.querySelectorAll("[data-proof-cell]").forEach((el) => {
    el.addEventListener("click", () => {
      const [dStr, pid] = el.getAttribute("data-proof-cell").split("|");
      const day = Number(dStr);
      const existingIdx = state.ocrDraftLessons.findIndex((x) => x.day === day && x.periodId === pid);
      const cur = existingIdx >= 0 ? state.ocrDraftLessons[existingIdx] : null;
      const defaultStr = cur ? [cur.className, cur.subject, cur.room].filter(Boolean).join(" ") : "";
      const input = window.prompt(
        `校对【${WEEKDAY_LABELS[day]} · ${pid}】\n格式：班级 科目 教室（留空则删除该格）：`,
        defaultStr
      );
      if (input === null) return;
      const trimmed = input.trim();
      if (!trimmed) {
        if (existingIdx >= 0) state.ocrDraftLessons.splice(existingIdx, 1);
      } else {
        const parts = trimmed.split(/\s+/);
        const updated = {
          id: `les_${day}_${pid}`,
          day,
          periodId: pid,
          className: parts[0] || "未命名班级",
          subject: parts[1] || state.schedule.defaultSubject || "",
          room: parts.slice(2).join(" ") || "",
          weekType: "all",
          memo: cur?.memo || ""
        };
        if (existingIdx >= 0) state.ocrDraftLessons[existingIdx] = updated;
        else state.ocrDraftLessons.push(updated);
      }
      renderOcrProofGrid();
    });
  });
}

/* ==========================================================================
   6-Digit Cloud Sync + Apple Calendar (.ics) + iOS Scriptable Widget Center
   ========================================================================== */

async function ensureSyncCodeCreated() {
  if (state.syncCode) return state.syncCode;
  const resp = await fetch("/api/sync/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule: state.schedule })
  });
  const data = await resp.json();
  if (data.ok && data.syncCode) {
    state.syncCode = data.syncCode;
    localStorage.setItem(SYNC_KEY, state.syncCode);
    renderHeader();
    updateIosModalLinks();
    return state.syncCode;
  }
  throw new Error(data.message || "生成同步码失败");
}

async function pushToCloud(code, silent = false) {
  try {
    const resp = await fetch(`/api/sync/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schedule: state.schedule })
    });
    const data = await resp.json();
    if (data.ok && !silent) {
      showToast(`已同步至云端（同步码：${code}）`);
    }
  } catch (e) {
    if (!silent) showToast("当前处于离线状态，更改已安全保存在本地");
  }
}

async function pullFromCloud(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean || clean.length < 4) {
    showToast("请输入有效的 6 位同步码");
    return;
  }
  try {
    const resp = await fetch(`/api/sync/${encodeURIComponent(clean)}`);
    const data = await resp.json();
    if (!data.ok || !data.schedule) {
      showToast(data.message || "未找到该同步码对应的课表");
      return;
    }
    state.syncCode = clean;
    localStorage.setItem(SYNC_KEY, clean);
    state.schedule = data.schedule;
    saveSchedule({ skipCloud: true });
    updateIosModalLinks();
    showToast(`🎉 已成功同步课表（同步码 ${clean}）！`);
  } catch (e) {
    showToast("拉取同步失败，请检查网络连接");
  }
}

function getIcsHttpUrl() {
  const code = state.syncCode || "LOCAL";
  const alarm = state.schedule.reminderMinutes || 15;
  return `${window.location.origin}/api/ics/${code}.ics?alarm=${alarm}`;
}

function updateIosModalLinks() {
  const codeEl = document.getElementById("ios-sync-code-display");
  const hintEl = document.getElementById("ios-sync-status-hint");
  const selRem = document.getElementById("sel-reminder-min");
  selRem.value = String(state.schedule.reminderMinutes || 15);

  if (state.syncCode) {
    codeEl.textContent = state.syncCode;
    hintEl.textContent = "已开启云同步 · 修改课表或备忘将自动更新 iPhone 日历与小组件";
    const httpUrl = getIcsHttpUrl();
    const webcalUrl = httpUrl.replace(/^https?:\/\//i, "webcal://");
    document.getElementById("link-webcal-subscribe").setAttribute("href", webcalUrl);
  } else {
    codeEl.textContent = "未生成";
    hintEl.textContent = "点右侧一键生成 6 位码，即可解锁动态日历订阅与跨设备同步";
    document.getElementById("link-webcal-subscribe").setAttribute("href", "#need-sync");
  }
  renderIosWidgetSimulator();
}

function renderIosWidgetSimulator() {
  const box = document.getElementById("ios-widget-preview-box");
  if (!box) return;
  box.classList.toggle("dark-widget", state.wsimDark);

  const realNow = new Date();
  const baseDate = (realNow.getDay() === 0 || realNow.getDay() === 6) ? getMondayOfWeek(realNow) : realNow;
  const simMin = state.wsimMode === "today" ? (8 * 60 + 20) : (20 * 60 + 30);
  const focus = computeFocusState(state.schedule, baseDate, simMin);

  const showingTomorrow = focus.switchedToTomorrow;
  const list = showingTomorrow ? focus.tomorrowLessons : focus.remainingToday;
  const dayObj = showingTomorrow ? focus.tomorrowDate : baseDate;
  const dayLabel = WEEKDAY_LABELS[dayObj.getDay() === 0 ? 7 : dayObj.getDay()];

  const badgeBg = showingTomorrow
    ? (state.wsimDark ? "#3D2718" : "#FDF0E6")
    : (state.wsimDark ? "#19382D" : "#E6F4EE");
  const badgeInk = showingTomorrow
    ? (state.wsimDark ? "#F7B98E" : "#B5531B")
    : (state.wsimDark ? "#8CE0B8" : "#216347");

  const rowsHTML = list.length === 0
    ? `<div style="padding:16px 4px; text-align:center; font-size:12.5px; opacity:0.8;">🎉 当天没有课程，好好休息！</div>`
    : list.slice(0, 3).map((item, idx) => {
        const pal = getClassPalette(state.schedule, item.className);
        const rowBg = state.wsimDark ? pal.bgDark : pal.bgLight;
        const timeInk = state.wsimDark ? pal.inkDark : pal.inkLight;
        return `
          <div class="ios-w-row" style="background:${rowBg};">
            <div class="ios-w-bar" style="background:${pal.bar};"></div>
            <div style="min-width:44px;">
              <div style="font-family:var(--font-mono); font-weight:800; font-size:11.5px; color:${timeInk};">${esc(item.period.start)}</div>
              <div style="font-size:9.5px; opacity:0.72;">${esc(item.period.label)}</div>
            </div>
            <div style="min-width:0; flex:1;">
              <div style="font-weight:800; font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${esc(item.className)}
                <span style="font-weight:500; font-size:11px; opacity:0.78; margin-left:4px;">${esc([item.subject, item.room].filter(Boolean).join(" · "))}</span>
              </div>
              ${item.memo
                ? `<div style="font-size:10.5px; color:${state.wsimDark ? "#F5B88E" : "#9E501D"}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📌 ${esc(item.memo)}</div>`
                : (!showingTomorrow && idx === 0 ? `<div style="font-size:10px; color:${pal.bar}; font-weight:700;">正在上课 · 剩 30 分钟</div>` : "")}
            </div>
          </div>
        `;
      }).join("");

  box.innerHTML = `
    <div class="ios-w-head">
      <span class="ios-w-title">${showingTomorrow ? `明日预告 · ${dayLabel}` : `今日课程 · ${dayLabel}`}</span>
      <span class="ios-w-badge" style="background:${badgeBg}; color:${badgeInk};">
        ${showingTomorrow ? `今日已结课 · 明日${list.length}节` : `剩余 ${list.length} / ${focus.todayLessons.length} 节`}
      </span>
    </div>
    <div class="ios-w-rows">${rowsHTML}</div>
    ${list.length > 3 ? `<div style="margin-top:6px; font-size:10px; opacity:0.65;">还有 ${list.length - 3} 节课，点击打开完整课表 ›</div>` : ""}
  `;
}

/* ==========================================================================
   Settings & Period Bell Schedule Table
   ========================================================================== */

let draftPeriods = [];

function openSettingsModal() {
  document.getElementById("inp-set-teacher").value = state.schedule.teacherName || "";
  document.getElementById("inp-set-subject").value = state.schedule.defaultSubject || "";
  document.getElementById("inp-set-semstart").value = state.schedule.semesterStart || "2026-09-07";
  draftPeriods = structuredClone(state.schedule.periods || DEFAULT_PERIODS_45);
  renderSettingsPeriodsTable();
  openModal("modal-settings");
}

function renderSettingsPeriodsTable() {
  const tbl = document.getElementById("settings-periods-table");
  tbl.innerHTML = `
    <thead>
      <tr>
        <th>节次名称</th>
        <th>时段分组</th>
        <th>上课时间</th>
        <th>下课时间</th>
      </tr>
    </thead>
    <tbody>
      ${draftPeriods.map((p, idx) => `
        <tr>
          <td><input class="input" style="padding:4px 7px;font-size:12px;" data-p-idx="${idx}" data-p-field="label" value="${esc(p.label)}" /></td>
          <td style="font-size:12px; color:var(--ink-muted);">
            ${p.section === "morning_read" ? "早读" : (p.section === "am" ? "上午" : (p.section === "pm" ? "下午" : "晚自习"))}
          </td>
          <td><input class="input" type="time" style="padding:4px 7px;font-size:12px;" data-p-idx="${idx}" data-p-field="start" value="${esc(p.start)}" /></td>
          <td><input class="input" type="time" style="padding:4px 7px;font-size:12px;" data-p-idx="${idx}" data-p-field="end" value="${esc(p.end)}" /></td>
        </tr>
      `).join("")}
    </tbody>
  `;
  tbl.querySelectorAll("[data-p-idx]").forEach((inp) => {
    inp.addEventListener("change", () => {
      const idx = Number(inp.getAttribute("data-p-idx"));
      const field = inp.getAttribute("data-p-field");
      draftPeriods[idx][field] = inp.value;
    });
  });
}

/* ==========================================================================
   PWA Foreground / Service Worker Notification Loop
   ========================================================================== */

async function triggerNotification(title, body, tag) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && reg.active) {
      reg.active.postMessage({ type: "SHOW_CLASS_NOTIFICATION", title, body, tag });
      return;
    }
  } catch (e) {}
  new Notification(title, { body, icon: "/icons/icon-192.png", tag });
}

function checkUpcomingReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lead = Number(state.schedule.reminderMinutes || 15);
  const dateISO = formatDateISO(now);
  const lessons = resolveDayLessons(state.schedule, now);

  for (const item of lessons) {
    const st = parseMinutes(item.period.start);
    const diff = st - nowMin;
    const key = `${dateISO}__${item.periodId}`;
    if (diff > 0 && diff <= lead && !state.notifiedKeys.has(key)) {
      state.notifiedKeys.add(key);
      const title = `⏰ ${diff}分钟后上课：${item.className}`;
      const parts = [`${item.period.label} (${item.period.start})`, item.subject, item.room].filter(Boolean);
      const body = parts.join(" · ") + (item.memo ? `\n📌 备忘：${item.memo}` : "");
      triggerNotification(title, body, key);
    }
  }
}

/* ==========================================================================
   Theme & Event Wiring
   ========================================================================== */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  document.getElementById("theme-icon").textContent = theme === "dark" ? "☀️" : "🌙";
  document.getElementById("meta-theme-color").setAttribute("content", theme === "dark" ? "#14171A" : "#235E47");
}

function initEvents() {
  // Theme
  const savedTheme = localStorage.getItem(THEME_KEY) ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(savedTheme);

  document.getElementById("btn-theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  // Close modals
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close-modal")));
  });
  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => {
      if (e.target === bd) bd.classList.remove("open");
    });
  });

  // Topbar & Mobile tab actions
  document.getElementById("btn-open-ocr").addEventListener("click", () => openModal("modal-ocr"));
  document.getElementById("btn-open-ios").addEventListener("click", () => {
    updateIosModalLinks();
    openModal("modal-ios");
  });
  document.getElementById("btn-sync-pill").addEventListener("click", () => {
    updateIosModalLinks();
    openModal("modal-ios");
  });
  document.getElementById("btn-open-settings").addEventListener("click", openSettingsModal);
  document.getElementById("btn-print").addEventListener("click", () => window.print());

  document.querySelectorAll("[data-mob-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-mob-tab");
      if (tab === "ocr") {
        openModal("modal-ocr");
        return;
      }
      if (tab === "ios") {
        updateIosModalLinks();
        openModal("modal-ios");
        return;
      }
      document.body.setAttribute("data-mobile-tab", tab);
      document.querySelectorAll("[data-mob-tab]").forEach((b) => b.classList.toggle("active", b === btn));
    });
  });

  // Time simulation pills
  document.querySelectorAll("[data-sim]").forEach((pill) => {
    pill.addEventListener("click", () => {
      state.simMode = pill.getAttribute("data-sim");
      state.selectedMobileDateISO = null;
      document.querySelectorAll("[data-sim]").forEach((p) => p.classList.toggle("active", p === pill));
      renderAll();
    });
  });

  // Spotlight clear
  document.getElementById("btn-clear-spotlight").addEventListener("click", () => {
    state.spotlightClass = null;
    renderClassChips();
    renderWeeklyGrid();
  });

  // Week navigation & toggles
  document.getElementById("btn-prev-week").addEventListener("click", () => {
    state.weekOffset -= 1;
    renderAll();
  });
  document.getElementById("btn-next-week").addEventListener("click", () => {
    state.weekOffset += 1;
    renderAll();
  });
  document.getElementById("btn-reset-week").addEventListener("click", () => {
    state.weekOffset = 0;
    state.selectedMobileDateISO = null;
    renderAll();
  });

  document.getElementById("toggle-morning-read").addEventListener("click", () => {
    state.schedule.showMorningRead = !(state.schedule.showMorningRead !== false);
    saveSchedule();
  });
  document.getElementById("toggle-evening").addEventListener("click", () => {
    state.schedule.showEvening = !(state.schedule.showEvening !== false);
    saveSchedule();
  });
  document.getElementById("toggle-weekend").addEventListener("click", () => {
    state.schedule.showWeekend = !state.schedule.showWeekend;
    saveSchedule();
  });
  document.getElementById("btn-quick-add-lesson").addEventListener("click", () => openLessonModal(1, "p1"));

  // Lesson Modal Events
  document.getElementById("tab-edit-regular").addEventListener("click", () => switchLessonModalTab("regular"));
  document.getElementById("tab-edit-override").addEventListener("click", () => switchLessonModalTab("override"));
  document.getElementById("inp-ov-type").addEventListener("change", updateOverrideFieldsVisibility);

  document.querySelectorAll("[data-memo-fill]").forEach((tag) => {
    tag.addEventListener("click", () => {
      document.getElementById("inp-les-memo").value = tag.getAttribute("data-memo-fill");
    });
  });

  document.getElementById("form-lesson-regular").addEventListener("submit", (e) => {
    e.preventDefault();
    const day = Number(document.getElementById("inp-les-day").value);
    const periodId = document.getElementById("inp-les-period").value;
    const className = document.getElementById("inp-les-class").value.trim();
    if (!className) return;

    const newLesson = {
      id: `les_${day}_${periodId}`,
      day,
      periodId,
      className,
      subject: document.getElementById("inp-les-subject").value.trim(),
      room: document.getElementById("inp-les-room").value.trim(),
      weekType: document.getElementById("inp-les-weektype").value,
      memo: document.getElementById("inp-les-memo").value.trim()
    };

    const list = state.schedule.lessons || [];
    // If moved from editingSlot, remove old slot if different
    if (state.editingSlot && (state.editingSlot.day !== day || state.editingSlot.periodId !== periodId)) {
      const oldIdx = list.findIndex((l) => Number(l.day) === state.editingSlot.day && l.periodId === state.editingSlot.periodId);
      if (oldIdx >= 0) list.splice(oldIdx, 1);
    }
    const existIdx = list.findIndex((l) => Number(l.day) === day && l.periodId === periodId);
    if (existIdx >= 0) list[existIdx] = newLesson;
    else list.push(newLesson);

    if (day >= 6) state.schedule.showWeekend = true;
    saveSchedule();
    closeModal("modal-lesson");
    showToast(`已保存：${WEEKDAY_LABELS[day]} · ${className}`);
  });

  document.getElementById("btn-delete-lesson").addEventListener("click", () => {
    if (!state.editingSlot) return;
    state.schedule.lessons = (state.schedule.lessons || []).filter(
      (l) => !(Number(l.day) === state.editingSlot.day && l.periodId === state.editingSlot.periodId)
    );
    saveSchedule();
    closeModal("modal-lesson");
    showToast("已删除该节常规课");
  });

  document.getElementById("form-lesson-override").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.editingSlot) return;
    const { periodId, dateISO } = state.editingSlot;
    const ovKey = `${dateISO}__${periodId}`;
    const type = document.getElementById("inp-ov-type").value;
    if (!state.schedule.overrides) state.schedule.overrides = {};
    state.schedule.overrides[ovKey] = {
      date: dateISO,
      periodId,
      type,
      className: document.getElementById("inp-ov-class").value.trim(),
      subject: document.getElementById("inp-ov-subject").value.trim(),
      room: document.getElementById("inp-ov-room").value.trim(),
      reason: document.getElementById("inp-ov-reason").value.trim(),
      memo: document.getElementById("inp-ov-memo").value.trim()
    };
    saveSchedule();
    closeModal("modal-lesson");
    showToast(`已记录 ${dateISO} 单次变动（不影响其他周）`);
  });

  document.getElementById("btn-clear-override").addEventListener("click", () => {
    if (!state.editingSlot) return;
    const ovKey = `${state.editingSlot.dateISO}__${state.editingSlot.periodId}`;
    delete state.schedule.overrides[ovKey];
    saveSchedule();
    closeModal("modal-lesson");
    showToast("已恢复为每周常规课程");
  });

  // Drag swap modal buttons
  document.getElementById("btn-swap-this-week").addEventListener("click", () => executeDragSwap(true));
  document.getElementById("btn-swap-permanent").addEventListener("click", () => executeDragSwap(false));

  // OCR Modal Events
  document.getElementById("ocr-tab-photo").addEventListener("click", () => {
    document.getElementById("ocr-tab-photo").classList.add("active");
    document.getElementById("ocr-tab-text").classList.remove("active");
    document.getElementById("ocr-panel-photo").style.display = "block";
    document.getElementById("ocr-panel-text").style.display = "none";
  });
  document.getElementById("ocr-tab-text").addEventListener("click", () => {
    document.getElementById("ocr-tab-text").classList.add("active");
    document.getElementById("ocr-tab-photo").classList.remove("active");
    document.getElementById("ocr-panel-text").style.display = "block";
    document.getElementById("ocr-panel-photo").style.display = "none";
  });

  const fileInp = document.getElementById("inp-ocr-file");
  document.getElementById("btn-pick-photo").addEventListener("click", (e) => {
    e.stopPropagation();
    fileInp.click();
  });
  document.getElementById("ocr-dropzone").addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    fileInp.click();
  });
  fileInp.addEventListener("change", async () => {
    const file = fileInp.files?.[0];
    if (!file) return;
    const compressed = await compressImageFile(file);
    await runImageOcr({ dataUrl: compressed, isDemoSample: false });
    fileInp.value = "";
  });

  const dz = document.getElementById("ocr-dropzone");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", async (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const compressed = await compressImageFile(file);
      await runImageOcr({ dataUrl: compressed, isDemoSample: false });
    }
  });

  document.getElementById("btn-try-demo-photo").addEventListener("click", (e) => {
    e.stopPropagation();
    runImageOcr({ dataUrl: "/sample-timetable.png", isDemoSample: true });
  });

  document.getElementById("btn-copy-ai-prompt").addEventListener("click", async () => {
    const resp = await fetch("/api/ocr/parse-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        promptOnly: true,
        periods: state.schedule.periods,
        defaultSubject: state.schedule.defaultSubject
      })
    });
    const data = await resp.json();
    if (data.prompt) {
      await navigator.clipboard.writeText(data.prompt);
      showToast("📋 已复制专属识图提示词！发给豆包/Kimi 连同课表照片即可");
    }
  });

  document.getElementById("btn-parse-rawtext").addEventListener("click", async () => {
    const text = document.getElementById("inp-ocr-rawtext").value.trim();
    if (!text) {
      showToast("请先粘贴文本、Excel表格或JSON内容");
      return;
    }
    const resp = await fetch("/api/ocr/parse-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        periods: state.schedule.periods,
        defaultSubject: state.schedule.defaultSubject
      })
    });
    const res = await resp.json();
    if (!res.lessons || res.lessons.length === 0) {
      showToast("未能从文本中识别出有效节次，请检查是否包含「周一..周五」与「第1节」等字样");
      return;
    }
    state.ocrDraftLessons = res.lessons;
    state.ocrDraftMeta = { teacherName: res.teacherName || "", defaultSubject: res.defaultSubject || "" };
    document.getElementById("ocr-photo-preview-wrap").style.display = "none";
    renderOcrProofGrid();
    document.getElementById("ocr-proof-section").style.display = "block";
    showToast(`解析成功！提取到 ${res.lessons.length} 节课，请核对网格`);
  });

  document.getElementById("btn-reset-ocr").addEventListener("click", () => {
    document.getElementById("ocr-proof-section").style.display = "none";
  });

  document.getElementById("btn-confirm-ocr-import").addEventListener("click", () => {
    const mode = document.getElementById("sel-import-mode").value;
    if (state.ocrDraftMeta.teacherName) state.schedule.teacherName = state.ocrDraftMeta.teacherName;
    if (state.ocrDraftMeta.defaultSubject) state.schedule.defaultSubject = state.ocrDraftMeta.defaultSubject;

    if (mode === "replace") {
      state.schedule.lessons = structuredClone(state.ocrDraftLessons);
    } else {
      const merged = new Map((state.schedule.lessons || []).map((l) => [`${l.day}__${l.periodId}`, l]));
      for (const item of state.ocrDraftLessons) {
        merged.set(`${item.day}__${item.periodId}`, item);
      }
      state.schedule.lessons = [...merged.values()];
    }
    if (state.schedule.lessons.some((l) => l.day >= 6)) state.schedule.showWeekend = true;
    saveSchedule();
    closeModal("modal-ocr");
    showToast(`🎉 已导入 ${state.ocrDraftLessons.length} 节课程！`);
  });

  // iOS Reminders, Sync & Scriptable Widget Modal Events
  document.getElementById("btn-create-sync-code").addEventListener("click", async () => {
    try {
      state.syncCode = "";
      const code = await ensureSyncCodeCreated();
      showToast(`✨ 已生成您的专属 6 位同步码：${code}`);
    } catch (e) {
      showToast("生成同步码失败，请确认后端服务已运行");
    }
  });

  document.getElementById("btn-pull-sync-code").addEventListener("click", () => {
    pullFromCloud(document.getElementById("inp-join-sync-code").value);
  });

  document.getElementById("sel-reminder-min").addEventListener("change", (e) => {
    state.schedule.reminderMinutes = Number(e.target.value);
    saveSchedule();
    updateIosModalLinks();
  });

  document.getElementById("link-webcal-subscribe").addEventListener("click", async (e) => {
    if (!state.syncCode) {
      e.preventDefault();
      try {
        await ensureSyncCodeCreated();
        const webcalUrl = getIcsHttpUrl().replace(/^https?:\/\//i, "webcal://");
        window.location.href = webcalUrl;
      } catch (err) {
        showToast("无法自动创建同步链接，已为您切换离线 .ics 下载");
      }
    }
  });

  document.getElementById("btn-copy-ics-url").addEventListener("click", async () => {
    await ensureSyncCodeCreated();
    await navigator.clipboard.writeText(getIcsHttpUrl());
    showToast("已复制动态日历订阅链接，可在苹果「日历 → 添加日历订阅」中粘贴");
  });

  document.getElementById("btn-download-ics").addEventListener("click", async () => {
    const resp = await fetch("/api/ics/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule: state.schedule,
        syncCode: state.syncCode || "LOCAL",
        alarmMinutes: state.schedule.reminderMinutes || 15
      })
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `教师课程表-${state.schedule.teacherName || "导出版"}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("已下载 .ics 日历文件，在 iPhone 打开即可导入提醒");
  });

  document.getElementById("btn-enable-pwa-notify").addEventListener("click", async () => {
    if (!("Notification" in window)) {
      showToast("iPhone 请先点 Safari 底部分享 →「添加到主屏幕」后再开启通知，或直接使用上方苹果日历订阅");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      showToast("🔔 已开启 PWA 网页课前提醒！");
    } else {
      showToast("通知权限未授予，推荐使用上方「苹果日历订阅」获得最稳提醒");
    }
  });

  document.getElementById("btn-test-pwa-notify").addEventListener("click", async () => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      showToast("请先点击左侧「开启通知」授权浏览器通知权限");
      return;
    }
    await triggerNotification(
      "⏰ 15分钟后上课：高一(3)班",
      "第一节 (08:05) · 数学 · 致远楼 303\n📌 备忘：讲评周末立体几何测验",
      "test-notify-" + Date.now()
    );
    showToast("已发送测试上课提醒通知！");
  });

  // Widget Simulator toggles
  document.getElementById("wsim-mode-today").addEventListener("click", () => {
    state.wsimMode = "today";
    renderIosWidgetSimulator();
  });
  document.getElementById("wsim-mode-tomorrow").addEventListener("click", () => {
    state.wsimMode = "tomorrow_check";
    renderIosWidgetSimulator();
  });
  document.getElementById("wsim-toggle-dark").addEventListener("click", () => {
    state.wsimDark = !state.wsimDark;
    renderIosWidgetSimulator();
  });

  async function fetchScriptableCode() {
    try {
      await ensureSyncCodeCreated();
    } catch (e) {}
    const resp = await fetch("/api/widget/preview-script", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: window.location.origin,
        syncCode: state.syncCode || "LOCAL",
        schedule: state.schedule
      })
    });
    const data = await resp.json();
    return data.script || "";
  }

  document.getElementById("btn-copy-scriptable").addEventListener("click", async () => {
    const code = await fetchScriptableCode();
    await navigator.clipboard.writeText(code);
    showToast("📋 已复制专属 Scriptable 小组件代码！粘贴到 iPhone Scriptable 即可");
  });

  document.getElementById("btn-download-scriptable").addEventListener("click", async () => {
    const code = await fetchScriptableCode();
    const blob = new Blob([code], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `知时课表小组件-${state.syncCode || "LOCAL"}.js`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("已下载 Scriptable 小组件脚本 (.js)");
  });

  // Settings Modal Events
  document.getElementById("btn-preset-45").addEventListener("click", () => {
    draftPeriods = structuredClone(DEFAULT_PERIODS_45);
    renderSettingsPeriodsTable();
    showToast("已加载初高中 45 分钟标准作息，点击右下角保存生效");
  });
  document.getElementById("btn-preset-40").addEventListener("click", () => {
    draftPeriods = structuredClone(DEFAULT_PERIODS_40);
    renderSettingsPeriodsTable();
    showToast("已加载小学 40 分钟标准作息，点击右下角保存生效");
  });

  document.getElementById("btn-save-settings").addEventListener("click", () => {
    state.schedule.teacherName = document.getElementById("inp-set-teacher").value.trim() || "老师";
    state.schedule.defaultSubject = document.getElementById("inp-set-subject").value.trim();
    state.schedule.semesterStart = document.getElementById("inp-set-semstart").value || "2026-09-07";
    state.schedule.periods = structuredClone(draftPeriods);
    saveSchedule();
    closeModal("modal-settings");
    showToast("已保存学校作息时间与个人设置");
  });

  document.getElementById("btn-export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.schedule, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `知时课表备份-${formatDateISO(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("inp-import-json").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (parsed && Array.isArray(parsed.lessons)) {
        state.schedule = parsed;
        saveSchedule();
        closeModal("modal-settings");
        showToast("已成功恢复课表备份！");
      }
    } catch (err) {
      showToast("JSON 备份文件格式有误");
    }
    e.target.value = "";
  });

  document.getElementById("btn-clear-all-lessons").addEventListener("click", () => {
    if (!window.confirm("确定要清空当前所有课程从零开始排课吗？")) return;
    state.schedule.lessons = [];
    state.schedule.overrides = {};
    state.schedule.classColors = {};
    saveSchedule();
    closeModal("modal-settings");
    showToast("已清空课表，您可以拍照导入或点击格子添加课程");
  });
}

async function bootstrap() {
  initEvents();

  // Restore saved Vision API settings in OCR drawer
  try {
    const cfg = JSON.parse(localStorage.getItem(VISION_CFG_KEY) || "{}");
    if (cfg.apiBase) document.getElementById("inp-vision-base").value = cfg.apiBase;
    if (cfg.apiModel) document.getElementById("inp-vision-model").value = cfg.apiModel;
    if (cfg.apiKey) document.getElementById("inp-vision-key").value = cfg.apiKey;
  } catch (e) {}

  // Register PWA Service Worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  // Handle URL shortcuts (?sync=XXXXXX, ?action=ocr)
  const params = new URLSearchParams(window.location.search);
  const urlSync = params.get("sync");
  if (urlSync) {
    await pullFromCloud(urlSync);
  } else if (state.syncCode) {
    pullFromCloud(state.syncCode);
  }
  if (params.get("action") === "ocr") {
    openModal("modal-ocr");
  }

  renderAll();
  setInterval(() => {
    if (state.simMode === "live") renderFocusCard();
    checkUpcomingReminders();
  }, 30000);
}

bootstrap();
