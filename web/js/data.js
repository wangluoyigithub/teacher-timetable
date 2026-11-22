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

export const SECTION_LABELS = {
  morning_read: "早读/晨会",
  am: "上午",
  noon: "午间",
  pm: "下午",
  evening: "晚间/晚自习"
};

export const DEFAULT_TOTAL_WEEKS = 20;

const CN_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function toChineseNum(n) {
  const num = Math.max(1, Math.floor(Number(n) || 1));
  if (num < 10) return CN_DIGITS[num];
  if (num === 10) return "十";
  if (num < 20) return `十${CN_DIGITS[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const rem = num % 10;
    return `${CN_DIGITS[tens]}十${rem ? CN_DIGITS[rem] : ""}`;
  }
  return String(num);
}

export function parseChineseNum(str) {
  const s = String(str || "").trim();
  const arab = s.match(/(\d+)/);
  if (arab) return parseInt(arab[1], 10);
  for (let i = 30; i >= 1; i--) {
    if (s.includes(toChineseNum(i))) return i;
  }
  return null;
}

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
  { id: "p6", num: "6", label: "第六节", section: "pm", start: "14:50", end: "15:30" },
  { id: "p7", num: "7", label: "第七节", section: "pm", start: "15:45", end: "16:25" },
  { id: "p8", num: "8", label: "第八节", section: "pm", start: "16:35", end: "17:15" },
  { id: "after_service", num: "拓", label: "课后服务", section: "pm", start: "17:25", end: "18:10" }
];

export const DEFAULT_PERIODS_HIGH = [
  { id: "morning_read", num: "早", label: "早读", section: "morning_read", start: "07:20", end: "07:50" },
  { id: "p1", num: "1", label: "第一节", section: "am", start: "08:00", end: "08:45" },
  { id: "p2", num: "2", label: "第二节", section: "am", start: "08:55", end: "09:40" },
  { id: "p3", num: "3", label: "第三节", section: "am", start: "10:00", end: "10:45" },
  { id: "p4", num: "4", label: "第四节", section: "am", start: "10:55", end: "11:40" },
  { id: "p5", num: "5", label: "第五节", section: "am", start: "11:50", end: "12:30" },
  { id: "p6", num: "6", label: "第六节", section: "pm", start: "14:10", end: "14:55" },
  { id: "p7", num: "7", label: "第七节", section: "pm", start: "15:05", end: "15:50" },
  { id: "p8", num: "8", label: "第八节", section: "pm", start: "16:05", end: "16:50" },
  { id: "p9", num: "9", label: "第九节", section: "pm", start: "17:00", end: "17:45" },
  { id: "p10", num: "10", label: "第十节", section: "pm", start: "17:55", end: "18:35" },
  { id: "eve1", num: "晚1", label: "晚自习一", section: "evening", start: "19:10", end: "20:00" },
  { id: "eve2", num: "晚2", label: "晚自习二", section: "evening", start: "20:10", end: "21:00" },
  { id: "eve3", num: "晚3", label: "晚自习三", section: "evening", start: "21:10", end: "22:00" }
];

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

function getRegularPeriodNumber(period) {
  if (!period) return null;
  if (period.section === "morning_read" || period.section === "evening") return null;
  const label = String(period.label || "");
  const mLabel = label.match(/^第([一二三四五六七八九十\d]+)节$/);
  if (mLabel) return parseChineseNum(mLabel[1]);
  const mId = String(period.id || "").match(/^p(\d+)$/);
  if (mId && !label.includes("晚") && !label.includes("服务")) return parseInt(mId[1], 10);
  return null;
}

/**
 * Generate a full custom period list from teacher-specified counts & lesson duration.
 */
export function generateCustomPeriods({
  hasMorningRead = true,
  amCount = 4,
  pmCount = 4,
  eveningCount = 2,
  durationMin = 45,
  breakMin = 10,
  amStart = "08:05",
  pmStart = "14:15",
  eveningStart = "19:00"
} = {}) {
  const amN = Math.max(0, Math.min(10, parseInt(amCount, 10) || 0));
  const pmN = Math.max(0, Math.min(10, parseInt(pmCount, 10) || 0));
  const evN = Math.max(0, Math.min(6, parseInt(eveningCount, 10) || 0));
  const dur = Math.max(20, Math.min(150, parseInt(durationMin, 10) || 45));
  const brk = Math.max(0, Math.min(40, parseInt(breakMin, 10) || 10));

  const list = [];
  if (hasMorningRead) {
    const mrEnd = Math.max(360, parseMinutes(amStart) - 10);
    const mrStart = Math.max(330, mrEnd - 25);
    list.push({
      id: "morning_read",
      num: "早",
      label: "早读",
      section: "morning_read",
      start: minutesToHHMM(mrStart),
      end: minutesToHHMM(mrEnd)
    });
  }

  let lessonCounter = 0;
  let curMin = parseMinutes(amStart);
  for (let i = 0; i < amN; i++) {
    lessonCounter++;
    const st = curMin;
    const ed = st + dur;
    list.push({
      id: `p${lessonCounter}`,
      num: String(lessonCounter),
      label: `第${toChineseNum(lessonCounter)}节`,
      section: "am",
      start: minutesToHHMM(st),
      end: minutesToHHMM(ed)
    });
    // Give a 20-min recess after period 2 in the morning when amN >= 3
    curMin = ed + (i === 1 && amN >= 3 ? Math.max(brk, 20) : brk);
  }

  curMin = parseMinutes(pmStart);
  for (let i = 0; i < pmN; i++) {
    lessonCounter++;
    const st = curMin;
    const ed = st + dur;
    list.push({
      id: `p${lessonCounter}`,
      num: String(lessonCounter),
      label: `第${toChineseNum(lessonCounter)}节`,
      section: "pm",
      start: minutesToHHMM(st),
      end: minutesToHHMM(ed)
    });
    curMin = ed + (i === 1 && pmN >= 3 ? Math.max(brk, 15) : brk);
  }

  curMin = parseMinutes(eveningStart);
  const eveDur = Math.max(dur, 45);
  for (let i = 1; i <= evN; i++) {
    const st = curMin;
    const ed = st + eveDur;
    // Preserve legacy p9/p10 IDs when total daytime lessons <= 8 so default evening lessons keep working
    const legacyId = lessonCounter <= 8 && i <= 2 ? `p${8 + i}` : `eve${i}`;
    list.push({
      id: legacyId,
      num: `晚${i}`,
      label: `晚自习${toChineseNum(i)}`,
      section: "evening",
      start: minutesToHHMM(st),
      end: minutesToHHMM(ed)
    });
    curMin = ed + brk;
  }

  return list;
}

/**
 * Smartly add a new period into an existing period array (in-place clone returned),
 * auto-computing its Chinese ordinal name, start/end times, and nudging any overlapping
 * later slots in the same section.
 */
export function addSmartPeriod(periods, { kind = "regular", afterIndex = null, breakMin = 10 } = {}) {
  const next = structuredClone(periods || []);
  const usedIds = new Set(next.map((p) => p.id));

  const uniqueId = (preferred) => {
    if (!usedIds.has(preferred)) return preferred;
    let suffix = 2;
    while (usedIds.has(`${preferred}_${suffix}`)) suffix++;
    return `${preferred}_${suffix}`;
  };

  let maxRegNum = 0;
  let lastRegIdx = -1;
  next.forEach((p, idx) => {
    const n = getRegularPeriodNumber(p);
    if (n !== null) {
      if (n > maxRegNum) maxRegNum = n;
      lastRegIdx = idx;
    }
  });

  if (kind === "evening") {
    const eveList = next.filter((p) => p.section === "evening");
    const eveNum = eveList.length + 1;
    const ref = eveList[eveList.length - 1];
    const dur = ref ? Math.max(30, parseMinutes(ref.end) - parseMinutes(ref.start)) : 50;
    const st = ref ? parseMinutes(ref.end) + breakMin : 19 * 60;
    const newPeriod = {
      id: uniqueId(`eve${eveNum}`),
      num: `晚${eveNum}`,
      label: `晚自习${toChineseNum(eveNum)}`,
      section: "evening",
      start: minutesToHHMM(st),
      end: minutesToHHMM(st + dur)
    };
    next.push(newPeriod);
    return { periods: next, created: newPeriod, index: next.length - 1 };
  }

  // Insert after a specific row or after the last regular lesson
  const targetAfterIdx =
    afterIndex !== null && afterIndex >= 0 && afterIndex < next.length
      ? afterIndex
      : (lastRegIdx >= 0 ? lastRegIdx : next.length - 1);

  const ref = next[targetAfterIdx] || null;
  const inferredDur = ref
    ? Math.max(25, Math.min(120, parseMinutes(ref.end) - parseMinutes(ref.start) || 45))
    : 45;

  let section = ref ? ref.section : "pm";
  if (kind === "regular" && (section === "morning_read" || section === "evening")) {
    section = "pm";
  }

  const nextNum = maxRegNum + 1;
  const isInsertingMiddle =
    afterIndex !== null && lastRegIdx >= 0 && afterIndex < lastRegIdx && ref?.section !== "evening";

  const label = isInsertingMiddle
    ? `加课(${SECTION_LABELS[section] || "时段"})`
    : `第${toChineseNum(nextNum)}节`;
  const preferredId = isInsertingMiddle ? `slot_${next.length + 1}` : `p${nextNum}`;

  let startMin = 16 * 60 + 35;
  if (ref && ref.section === section) {
    startMin = parseMinutes(ref.end) + breakMin;
  } else if (section === "am") {
    startMin = 8 * 60;
  } else if (section === "pm") {
    startMin = 14 * 60;
  }

  const newPeriod = {
    id: uniqueId(preferredId),
    num: isInsertingMiddle ? "加" : String(nextNum),
    label,
    section,
    start: minutesToHHMM(startMin),
    end: minutesToHHMM(startMin + inferredDur)
  };

  const insertPos = targetAfterIdx >= 0 ? targetAfterIdx + 1 : next.length;
  next.splice(insertPos, 0, newPeriod);

  // Nudge immediately following periods in the SAME section if they now overlap
  let prevEnd = parseMinutes(newPeriod.end);
  for (let i = insertPos + 1; i < next.length; i++) {
    if (next[i].section !== section) break;
    const curSt = parseMinutes(next[i].start);
    const curDur = Math.max(25, parseMinutes(next[i].end) - curSt || inferredDur);
    if (curSt < prevEnd + 5) {
      const shiftedSt = prevEnd + breakMin;
      next[i].start = minutesToHHMM(shiftedSt);
      next[i].end = minutesToHHMM(shiftedSt + curDur);
      prevEnd = shiftedSt + curDur;
    } else {
      break;
    }
  }

  return { periods: next, created: newPeriod, index: insertPos };
}

/**
 * Recalculate start/end times sequentially within each section while preserving
 * each section's first period start time and each period's duration.
 */
export function cascadeSectionTimes(periods, breakMin = 10) {
  const next = structuredClone(periods || []);
  const brk = Math.max(0, Math.min(40, parseInt(breakMin, 10) || 10));
  let curSection = null;
  let prevEnd = 0;

  for (const p of next) {
    const st = parseMinutes(p.start);
    const ed = parseMinutes(p.end);
    const dur = ed > st ? ed - st : 45;
    if (p.section !== curSection) {
      curSection = p.section;
      p.start = minutesToHHMM(st);
      p.end = minutesToHHMM(st + dur);
      prevEnd = st + dur;
    } else {
      const newSt = prevEnd + brk;
      p.start = minutesToHHMM(newSt);
      p.end = minutesToHHMM(newSt + dur);
      prevEnd = newSt + dur;
    }
  }
  return next;
}

/**
 * Ensure schedule.periods contains definitions for all periodIds referenced in lessons
 * (e.g. when importing a 10- or 12-period timetable onto a 7- or 8-period schedule).
 */
export function ensurePeriodsCoverLessons(schedule, lessons = null) {
  if (!Array.isArray(schedule.periods) || schedule.periods.length === 0) {
    schedule.periods = structuredClone(DEFAULT_PERIODS_45);
  }
  const targetLessons = lessons || schedule.lessons || [];
  const existingIds = new Set(schedule.periods.map((p) => p.id));
  const missingIds = [];

  for (const l of targetLessons) {
    if (l?.periodId && !existingIds.has(l.periodId)) {
      existingIds.add(l.periodId);
      missingIds.push(l.periodId);
    }
  }
  if (!missingIds.length) return schedule.periods;

  // Sort missing IDs so p8, p9, p10... are added in ascending order
  missingIds.sort((a, b) => {
    const na = parseInt((a.match(/\d+/) || ["99"])[0], 10);
    const nb = parseInt((b.match(/\d+/) || ["99"])[0], 10);
    return na - nb;
  });

  for (const pid of missingIds) {
    if (pid === "morning_read") {
      schedule.periods.unshift({
        id: "morning_read",
        num: "早",
        label: "早读",
        section: "morning_read",
        start: "07:30",
        end: "07:55"
      });
      schedule.showMorningRead = true;
      continue;
    }
    const eveMatch = pid.match(/^eve(\d+)$/i);
    if (eveMatch) {
      const res = addSmartPeriod(schedule.periods, { kind: "evening" });
      res.created.id = pid;
      res.created.num = `晚${eveMatch[1]}`;
      res.created.label = `晚自习${toChineseNum(Number(eveMatch[1]))}`;
      schedule.periods = res.periods;
      schedule.showEvening = true;
      continue;
    }
    const pMatch = pid.match(/^p(\d+)$/i);
    if (pMatch) {
      const num = parseInt(pMatch[1], 10);
      // Fill any intermediate regular lessons up to `num` so the table has no missing gaps!
      let guard = 0;
      while (!schedule.periods.some((p) => p.id === pid) && guard < 20) {
        guard++;
        const res = addSmartPeriod(schedule.periods, { kind: "regular" });
        const createdNum = getRegularPeriodNumber(res.created);
        if (createdNum === num) {
          res.created.id = pid;
        }
        schedule.periods = res.periods;
        if (createdNum && createdNum >= num) break;
      }
      if (!schedule.periods.some((p) => p.id === pid)) {
        const res = addSmartPeriod(schedule.periods, { kind: "regular" });
        res.created.id = pid;
        res.created.num = String(num);
        res.created.label = `第${toChineseNum(num)}节`;
        schedule.periods = res.periods;
      }
      continue;
    }
    // Generic custom period ID
    const res = addSmartPeriod(schedule.periods, { kind: "regular" });
    res.created.id = pid;
    res.created.label = pid;
    schedule.periods = res.periods;
  }

  return schedule.periods;
}

export function createInitialSchedule() {
  const base = {
    version: "1.3.0",
    teacherName: "林知夏",
    defaultSubject: "数学",
    semesterStart: "2026-09-07",
    totalWeeks: DEFAULT_TOTAL_WEEKS,
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

export function getMondayOfWeek(dateObj) {
  const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const jsDay = d.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  d.setDate(d.getDate() + diff);
  return d;
}

export function getTotalWeeks(schedule) {
  const n = parseInt(schedule?.totalWeeks, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_TOTAL_WEEKS;
  return Math.min(52, Math.max(1, n));
}

export function getRawWeekNumber(dateObj, semesterStartStr) {
  if (!semesterStartStr) return 1;
  const parts = String(semesterStartStr).split("-").map(Number);
  if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) return 1;
  const start = new Date(parts[0], parts[1] - 1, parts[2]);
  const mStart = getMondayOfWeek(start);
  const mCur = getMondayOfWeek(dateObj);
  return Math.round((mCur - mStart) / (7 * 86400000)) + 1;
}

export function getWeekNumber(dateObj, semesterStartStr, totalWeeks = null) {
  const raw = getRawWeekNumber(dateObj, semesterStartStr);
  if (totalWeeks !== null && totalWeeks !== undefined) {
    const maxW = Math.min(52, Math.max(1, parseInt(totalWeeks, 10) || DEFAULT_TOTAL_WEEKS));
    return Math.min(maxW, Math.max(1, raw));
  }
  return Math.max(1, raw);
}

export function getWeekNavBounds(todayDate, schedule) {
  const totalWeeks = getTotalWeeks(schedule);
  const rawTodayWeek = getRawWeekNumber(todayDate, schedule?.semesterStart);
  const minOffset = 1 - rawTodayWeek;
  const maxOffset = totalWeeks - rawTodayWeek;
  const defaultOffset = Math.min(maxOffset, Math.max(minOffset, 0));
  return { totalWeeks, rawTodayWeek, minOffset, maxOffset, defaultOffset };
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
