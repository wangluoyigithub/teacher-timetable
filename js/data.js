/* ==========================================================================
   知时课表 · Data Model, Presets & Pure Schedule Resolution Engine
   ========================================================================== */

export const CLASS_PALETTES = [
  { idx: 0, bgLight: "#E6F4EE", bgDark: "#18362B", inkLight: "#154A33", inkDark: "#95E4BE", bar: "#2E7D5B" },
  { idx: 1, bgLight: "#FDF0E6", bgDark: "#3A2517", inkLight: "#6E320F", inkDark: "#F7BE97", bar: "#C86428" },
  { idx: 2, bgLight: "#E8F0FA", bgDark: "#192C40", inkLight: "#173A63", inkDark: "#9DC6F7", bar: "#2E629E" },
  { idx: 3, bgLight: "#F7EBF2", bgDark: "#381D2E", inkLight: "#5E1D41", inkDark: "#F2AAD1", bar: "#A34178" },
  { idx: 4, bgLight: "#EEF3E4", bgDark: "#27321A", inkLight: "#324711", inkDark: "#C3E38C", bar: "#5C7A29" },
  { idx: 5, bgLight: "#F5EFE4", bgDark: "#352B1D", inkLight: "#4F3914", inkDark: "#E8CB9A", bar: "#8C6830" },
  { idx: 6, bgLight: "#E5F3F5", bgDark: "#163136", inkLight: "#11464F", inkDark: "#90DCE8", bar: "#237887" },
  { idx: 7, bgLight: "#FCECEB", bgDark: "#3B1C1A", inkLight: "#661D1A", inkDark: "#F7A8A4", bar: "#B8433E" }
];

export const DEFAULT_PERIODS_45 = [
  { id: "morning_read", num: "早", label: "早读", section: "morning_read", start: "07:30", end: "07:55" },
  { id: "p1", num: "1", label: "第一节", section: "am", start: "08:05", end: "08:50" },
  { id: "p2", num: "2", label: "第二节", section: "am", start: "09:00", end: "09:45" },
  { id: "p3", num: "3", label: "第三节", section: "am", start: "10:05", end: "10:50" },
  { id: "p4", num: "4", label: "第四节", section: "am", start: "11:00", end: "11:45" },
  { id: "p5", num: "5", label: "第五节", section: "pm", start: "14:15", end: "15:00" },
  { id: "p6", num: "6", label: "第六节", section: "pm", start: "15:10", end: "15:55" },
  { id: "p7", num: "7", label: "第七节", section: "pm", start: "16:10", end: "16:55" },
  { id: "p8", num: "8", label: "第八节", section: "pm", start: "17:05", end: "17:50" },
  { id: "p9", num: "晚1", label: "晚自习一", section: "evening", start: "19:00", end: "19:50" },
  { id: "p10", num: "晚2", label: "晚自习二", section: "evening", start: "20:00", end: "20:50" }
];

export const DEFAULT_PERIODS_40 = [
  { id: "morning_read", num: "早", label: "早读", section: "morning_read", start: "07:50", end: "08:15" },
  { id: "p1", num: "1", label: "第一节", section: "am", start: "08:25", end: "09:05" },
  { id: "p2", num: "2", label: "第二节", section: "am", start: "09:15", end: "09:55" },
  { id: "p3", num: "3", label: "第三节", section: "am", start: "10:15", end: "10:55" },
  { id: "p4", num: "4", label: "第四节", section: "am", start: "11:05", end: "11:45" },
  { id: "p5", num: "5", label: "第五节", section: "pm", start: "14:00", end: "14:40" },
  { id: "p6", num: "6", label: "第六节", section: "pm", start: "14:55", end: "15:35" },
  { id: "p7", num: "7", label: "第七节", section: "pm", start: "15:50", end: "16:30" },
  { id: "p8", num: "8", label: "课后服务", section: "pm", start: "16:40", end: "17:30" }
];

export function createInitialSchedule() {
  const base = {
    version: "1.0.0",
    teacherName: "林知夏",
    defaultSubject: "数学",
    semesterStart: "2026-09-07",
    showMorningRead: true,
    showEvening: true,
    showWeekend: false,
    reminderMinutes: 15,
    updatedAt: Date.now(),
    periods: structuredClone(DEFAULT_PERIODS_45),
    classColors: {},
    lessons: [
      { id: "les_1_morning_read", day: 1, periodId: "morning_read", className: "高一(3)班", subject: "早读巡班", room: "致远楼 303", weekType: "all", memo: "" },
      { id: "les_1_p1", day: 1, periodId: "p1", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "讲评周末立体几何测验" },
      { id: "les_1_p3", day: 1, periodId: "p3", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "收周末作业本" },
      { id: "les_1_p6", day: 1, periodId: "p6", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "" },

      { id: "les_2_p2", day: 2, periodId: "p2", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "带三角板教具" },
      { id: "les_2_p4", day: 2, periodId: "p4", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "" },
      { id: "les_2_p7", day: 2, periodId: "p7", className: "数学教研组", subject: "集体备课", room: "行政楼 401", weekType: "all", memo: "期中质量分析" },
      { id: "les_2_p9", day: 2, periodId: "p9", className: "高一(3)班", subject: "晚自习答疑", room: "致远楼 303", weekType: "all", memo: "" },

      { id: "les_3_morning_read", day: 3, periodId: "morning_read", className: "高一(5)班", subject: "早读巡班", room: "致远楼 305", weekType: "all", memo: "" },
      { id: "les_3_p1", day: 3, periodId: "p1", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "" },
      { id: "les_3_p2", day: 3, periodId: "p2", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "" },
      { id: "les_3_p5", day: 3, periodId: "p5", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },

      { id: "les_4_p2", day: 4, periodId: "p2", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "" },
      { id: "les_4_p3", day: 4, periodId: "p3", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "" },
      { id: "les_4_p6", day: 4, periodId: "p6", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },
      { id: "les_4_p9", day: 4, periodId: "p9", className: "高一(5)班", subject: "晚自习答疑", room: "致远楼 305", weekType: "all", memo: "" },

      { id: "les_5_p1", day: 5, periodId: "p1", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },
      { id: "les_5_p3", day: 5, periodId: "p3", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "随堂15分钟小测" },
      { id: "les_5_p5", day: 5, periodId: "p5", className: "高一(3)班", subject: "班会/周结", room: "致远楼 303", weekType: "all", memo: "" }
    ],
    overrides: {}
  };
  ensureClassColors(base);
  return base;
}

export function ensureClassColors(schedule) {
  if (!schedule.classColors) schedule.classColors = {};
  const usedNames = new Set();
  for (const l of schedule.lessons || []) {
    if (l.className) usedNames.add(l.className.trim());
  }
  for (const ov of Object.values(schedule.overrides || {})) {
    if (ov && ov.className) usedNames.add(ov.className.trim());
  }
  let nextIdx = Object.keys(schedule.classColors).length;
  for (const name of usedNames) {
    if (schedule.classColors[name] === undefined) {
      schedule.classColors[name] = nextIdx % CLASS_PALETTES.length;
      nextIdx++;
    }
  }
  return schedule.classColors;
}

export function getClassPalette(schedule, className) {
  const idx = Number((schedule.classColors || {})[className] ?? 0) % CLASS_PALETTES.length;
  return CLASS_PALETTES[idx];
}

export function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDateISO(dateObj) {
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth() + 1)}-${pad2(dateObj.getDate())}`;
}

export function parseMinutes(hhmm) {
  const [h, m] = String(hhmm || "08:00").split(":");
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
}

export function minutesToHHMM(totalMin) {
  const clamped = ((totalMin % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export function getMondayOfWeek(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const jsDay = d.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getWeekNumber(dateObj, semesterStartStr) {
  if (!semesterStartStr) return 1;
  const parts = semesterStartStr.split("-").map(Number);
  if (parts.length !== 3) return 1;
  const start = new Date(parts[0], parts[1] - 1, parts[2]);
  const mStart = getMondayOfWeek(start);
  const mCur = getMondayOfWeek(dateObj);
  const weeks = Math.floor((mCur - mStart) / (7 * 86400000)) + 1;
  return Math.max(1, weeks);
}

export function getVisiblePeriods(schedule) {
  return (schedule.periods || []).filter((p) => {
    if (schedule.showMorningRead === false && p.section === "morning_read") return false;
    if (schedule.showEvening === false && p.section === "evening") return false;
    return true;
  });
}

/**
 * Resolve effective slot state on a specific Date (incorporating weekly lessons + single-date overrides).
 * If includeCanceled=true, canceled slots are returned with isCanceled=true (useful for Weekly Grid).
 */
export function resolveDayLessons(schedule, dateObj, { includeCanceled = false } = {}) {
  const jsDay = dateObj.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const dateISO = formatDateISO(dateObj);
  const weekNo = getWeekNumber(dateObj, schedule.semesterStart);
  const isOdd = weekNo % 2 === 1;

  const visiblePeriods = getVisiblePeriods(schedule);
  const pMap = new Map(visiblePeriods.map((p) => [p.id, p]));

  const baseByPid = new Map();
  for (const les of schedule.lessons || []) {
    if (Number(les.day) !== isoDay) continue;
    if (!pMap.has(les.periodId)) continue;
    if (les.weekType === "odd" && !isOdd) continue;
    if (les.weekType === "even" && isOdd) continue;
    baseByPid.set(les.periodId, les);
  }

  const overrides = schedule.overrides || {};
  const result = [];

  for (const period of visiblePeriods) {
    const ovKey = `${dateISO}__${period.id}`;
    const ov = overrides[ovKey];
    const base = baseByPid.get(period.id);

    if (ov) {
      if (ov.type === "cancel") {
        if (includeCanceled && base) {
          result.push({
            ...base,
            period,
            dateISO,
            overrideKey: ovKey,
            overrideType: "cancel",
            reason: ov.reason || "本周停课/调走",
            isCanceled: true
          });
        }
        continue;
      }
      if (ov.type === "memo_only" && base) {
        result.push({
          ...base,
          memo: ov.memo ?? base.memo ?? "",
          period,
          dateISO,
          overrideKey: ovKey,
          overrideType: "memo_only",
          isCanceled: false
        });
        continue;
      }
      if (ov.className || ov.subject) {
        result.push({
          id: `ov_${ovKey}`,
          day: isoDay,
          periodId: period.id,
          className: ov.className || base?.className || "未命名班级",
          subject: ov.subject || base?.subject || schedule.defaultSubject || "",
          room: ov.room !== undefined ? ov.room : (base?.room || ""),
          memo: ov.memo !== undefined ? ov.memo : (base?.memo || ""),
          period,
          dateISO,
          overrideKey: ovKey,
          overrideType: ov.type || "swap",
          reason: ov.reason || "",
          baseLesson: base || null,
          isCanceled: false
        });
        continue;
      }
    }

    if (base) {
      result.push({
        ...base,
        period,
        dateISO,
        overrideKey: null,
        overrideType: null,
        isCanceled: false
      });
    }
  }

  return result;
}

export const WEEKDAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

/**
 * Core Smart Switcher:
 * - While today still has ongoing or upcoming classes: primaryFocus = "today"
 * - Once today's classes finish (or today has 0 classes): primaryFocus = "tomorrow"
 */
export function computeFocusState(schedule, nowDateObj, customNowMinutes = null) {
  const nowMin = customNowMinutes !== null
    ? customNowMinutes
    : nowDateObj.getHours() * 60 + nowDateObj.getMinutes();

  const tomorrowDate = new Date(nowDateObj.getFullYear(), nowDateObj.getMonth(), nowDateObj.getDate() + 1);
  const todayLessons = resolveDayLessons(schedule, nowDateObj, { includeCanceled: false });
  const tomorrowLessons = resolveDayLessons(schedule, tomorrowDate, { includeCanceled: false });

  let ongoing = null;
  let nextUp = null;
  const remainingToday = [];

  for (const item of todayLessons) {
    const st = parseMinutes(item.period.start);
    const ed = parseMinutes(item.period.end);
    if (nowMin >= st && nowMin < ed) {
      ongoing = { ...item, remainMin: ed - nowMin, progressPct: Math.round(((nowMin - st) / Math.max(1, ed - st)) * 100) };
      remainingToday.push({ ...item, state: "ongoing" });
    } else if (nowMin < st) {
      if (!nextUp) {
        nextUp = { ...item, untilMin: st - nowMin };
      }
      remainingToday.push({ ...item, state: "upcoming" });
    }
  }

  const switchedToTomorrow = remainingToday.length === 0;
  return {
    nowMin,
    todayDate: nowDateObj,
    tomorrowDate,
    todayLessons,
    tomorrowLessons,
    ongoing,
    nextUp,
    remainingToday,
    switchedToTomorrow,
    reasonLabel: switchedToTomorrow
      ? (todayLessons.length > 0 ? "今日已结课 · 自动预览明日" : "今日无课 · 自动预览明日")
      : `今日剩余 ${remainingToday.length} / ${todayLessons.length} 节`
  };
}
