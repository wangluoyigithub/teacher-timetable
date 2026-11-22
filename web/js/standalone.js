/* ==========================================================================
   知时课表 · Pure-Frontend Standalone Engine (GitHub Pages / Serverless Ready)
   Provides client-side .ics Apple Calendar generation, Scriptable iOS Widget
   generation, Vision LLM direct browser call, Text/Excel parser, and URL sync.
   ========================================================================== */

import {
  CLASS_PALETTES,
  formatDateISO,
  getSemesterDateRange,
  pad2,
  resolveDayLessons
} from "./data.js";

export const DEMO_SAMPLE_RESULT = {
  teacherName: "林知夏",
  defaultSubject: "数学",
  source: "demo_sample",
  lessons: [
    { id: "les_1_morning_read", day: 1, periodId: "morning_read", className: "高一(3)班", subject: "早读巡班", room: "致远楼 303", weekType: "all", memo: "" },
    { id: "les_1_p1", day: 1, periodId: "p1", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "函数的概念与图象" },
    { id: "les_1_p3", day: 1, periodId: "p3", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },
    { id: "les_1_p6", day: 1, periodId: "p6", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "" },
    { id: "les_2_p2", day: 2, periodId: "p2", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },
    { id: "les_2_p4", day: 2, periodId: "p4", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "" },
    { id: "les_2_p7", day: 2, periodId: "p7", className: "数学教研组", subject: "集体备课", room: "行政楼 401", weekType: "all", memo: "期中命题研讨" },
    { id: "les_2_p9", day: 2, periodId: "p9", className: "高一(3)班", subject: "晚自习答疑", room: "致远楼 303", weekType: "all", memo: "" },
    { id: "les_3_morning_read", day: 3, periodId: "morning_read", className: "高一(5)班", subject: "早读巡班", room: "致远楼 305", weekType: "all", memo: "" },
    { id: "les_3_p1", day: 3, periodId: "p1", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "" },
    { id: "les_3_p2", day: 3, periodId: "p2", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "" },
    { id: "les_3_p5", day: 3, periodId: "p5", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },
    { id: "les_4_p2", day: 4, periodId: "p2", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "" },
    { id: "les_4_p3", day: 4, periodId: "p3", className: "高一(3)班", subject: "数学", room: "致远楼 303", weekType: "all", memo: "" },
    { id: "les_4_p6", day: 4, periodId: "p6", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "" },
    { id: "les_4_p9", day: 4, periodId: "p9", className: "高一(5)班", subject: "晚自习答疑", room: "致远楼 305", weekType: "all", memo: "" },
    { id: "les_5_p1", day: 5, periodId: "p1", className: "高一(5)班", subject: "数学", room: "致远楼 305", weekType: "all", memo: "收本周错题本" },
    { id: "les_5_p3", day: 5, periodId: "p3", className: "高一(8)班", subject: "数学", room: "博雅楼 202", weekType: "all", memo: "随堂小测" },
    { id: "les_5_p5", day: 5, periodId: "p5", className: "高一(3)班", subject: "班会/周结", room: "致远楼 303", weekType: "all", memo: "" }
  ]
};

const DAY_MAP = {
  "1": 1, "一": 1, "周一": 1, "星期一": 1, "mon": 1,
  "2": 2, "二": 2, "周二": 2, "星期二": 2, "tue": 2,
  "3": 3, "三": 3, "周三": 3, "星期三": 3, "wed": 3,
  "4": 4, "四": 4, "周四": 4, "星期四": 4, "thu": 4,
  "5": 5, "五": 5, "周五": 5, "星期五": 5, "fri": 5,
  "6": 6, "六": 6, "周六": 6, "星期六": 6, "sat": 6,
  "7": 7, "日": 7, "天": 7, "周日": 7, "星期日": 7, "星期天": 7, "sun": 7
};

const CN_NUM_ORDERED = [
  ["二十", 20], ["十九", 19], ["十八", 18], ["十七", 17], ["十六", 16],
  ["十五", 15], ["十四", 14], ["十三", 13], ["十二", 12], ["十一", 11],
  ["十", 10], ["九", 9], ["八", 8], ["七", 7], ["六", 6],
  ["五", 5], ["四", 4], ["三", 3], ["二", 2], ["一", 1]
];

export function clientBuildAiPrompt(periods, defaultSubject = "") {
  const periodDesc = (periods || [])
    .map((p) => `- periodId="${p.id}": ${p.label || p.num} (${p.start}-${p.end})`)
    .join("\n");
  const hint = defaultSubject ? `（该老师默认任教学科为「${defaultSubject}」，若格子中未写学科名请自动填入「${defaultSubject}」）` : "";
  return `你是一个专业的「中国中小学/职校教师课程表」结构化识别助手。请仔细识别这张教师课表图片中的所有课程格子（注意分辨表头方向、合并单元格、早读/午休/晚自习分隔行）${hint}。

当前系统已配置的节次列表如下：
${periodDesc}
（注：如果图片中的课表节数多于上方列表，例如还有第9节、第10节、第11节、第12节或晚自习三，请直接输出 "p9"、"p10"、"p11"、"p12" 或 "eve3"，系统会自动扩展课表节次！）

请严格只输出如下格式的 JSON（不要添加多余解释）：
\`\`\`json
{
  "teacherName": "识别到的教师姓名（若无则留空）",
  "defaultSubject": "识别到的主要任教学科（若无则留空）",
  "lessons": [
    {
      "day": 1,
      "periodId": "p1",
      "className": "高一(3)班",
      "subject": "数学",
      "room": "致远楼303",
      "weekType": "all",
      "memo": ""
    }
  ]
}
\`\`\`
字段规则：day 为 1~7（1=周一..7=周日）；periodId 优先对应上方列表，超出节次用 p8/p9/p10...（如连堂 1-2 节请拆为 p1 和 p2 两条）；className 填授课班级名称！`;
}

function normalizeDay(raw) {
  if (typeof raw === "number" && raw >= 1 && raw <= 7) return raw;
  const s = String(raw || "").trim().toLowerCase();
  if (DAY_MAP[s]) return DAY_MAP[s];
  for (const [k, v] of Object.entries(DAY_MAP)) {
    if (k.length >= 2 && s.includes(k)) return v;
  }
  return null;
}

function normalizePeriodIds(raw, periods) {
  const valid = new Set((periods || []).map((p) => p.id));
  const s = String(raw || "").trim();
  if (!s) return [];
  if (valid.has(s)) return [s];
  // Match by custom period label/num first
  for (const p of periods || []) {
    if (p.label === s || p.num === s) return [p.id];
  }
  if (/^p\d{1,2}$/i.test(s) || /^eve\d$/i.test(s)) return [s.toLowerCase()];
  if (s.includes("早")) return ["morning_read"];
  if (s.includes("晚")) {
    if (s.includes("3") || s.includes("三")) return valid.has("eve3") ? ["eve3"] : ["eve3"];
    if (s.includes("2") || s.includes("二")) return valid.has("p10") ? ["p10"] : (valid.has("eve2") ? ["eve2"] : ["eve2"]);
    return valid.has("p9") ? ["p9"] : (valid.has("eve1") ? ["eve1"] : ["eve1"]);
  }
  const range = s.match(/(\d+)\s*[-~至到、,，]\s*(\d+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b >= a && b <= 20) {
      const out = [];
      for (let i = a; i <= b; i++) out.push(`p${i}`);
      return out;
    }
  }
  const num = s.match(/(\d+)/);
  if (num) {
    const n = Number(num[1]);
    if (n >= 1 && n <= 20) return [`p${n}`];
  }
  for (const [cn, v] of CN_NUM_ORDERED) {
    if (s.includes(cn)) return [`p${v}`];
  }
  return [];
}

function splitCellText(text, defaultSubject = "") {
  const cleaned = String(text || "").trim().replace(/\s+/g, " ");
  if (!cleaned || ["-", "—", "/", "无", "休息", "午休", "空"].includes(cleaned)) return ["", "", ""];
  const parts = cleaned.split(/[\s/｜|·,，]+/).filter(Boolean);
  let className = "";
  let subject = "";
  let room = "";
  for (const t of parts) {
    if (!className && /(班|级|届|\d+\(\d+\))/.test(t)) className = t;
    else if (!room && /(楼|室|机房|实验室|阶梯|馆|操场|[A-Za-z]?\d{3,4})/.test(t) && t !== className) room = t.replace(/^@/, "");
    else if (!subject) subject = t;
  }
  if (!className) {
    className = parts[0] || "";
    if (parts.length >= 2 && subject === parts[0]) subject = parts[1];
  }
  if (!subject) subject = defaultSubject;
  return [className, subject, room];
}

function normalizeLessonsList(items, periods, defaultSubject = "") {
  const map = new Map();
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    const day = normalizeDay(item.day ?? item.weekday);
    if (!day) continue;
    const pids = normalizePeriodIds(item.periodId ?? item.period ?? item.slot, periods);
    if (!pids.length) continue;
    let className = String(item.className || item.class || item.grade || "").trim();
    const subject = String(item.subject || item.course || item.name || defaultSubject || "").trim();
    const room = String(item.room || item.location || "").trim();
    const memo = String(item.memo || item.note || "").trim();
    if (!className && !subject) continue;
    if (!className) className = subject;
    for (const pid of pids) {
      map.set(`${day}__${pid}`, {
        id: `les_${day}_${pid}`,
        day,
        periodId: pid,
        className,
        subject,
        room,
        weekType: ["odd", "even"].includes(item.weekType) ? item.weekType : "all",
        memo
      });
    }
  }
  return [...map.values()];
}

export function clientParseText(rawText, periods, defaultSubject = "") {
  const txt = String(rawText || "").trim();
  if (!txt) return { ok: true, lessons: [] };

  // Try JSON or fenced JSON
  const fence = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonCand = fence ? fence[1].trim() : (txt.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)?.[1] || "");
  if (jsonCand) {
    try {
      const parsed = JSON.parse(jsonCand);
      if (Array.isArray(parsed)) {
        return { ok: true, lessons: normalizeLessonsList(parsed, periods, defaultSubject) };
      }
      const subj = String(parsed.defaultSubject || defaultSubject || "").trim();
      return {
        ok: true,
        teacherName: String(parsed.teacherName || "").trim(),
        defaultSubject: subj,
        lessons: normalizeLessonsList(parsed.lessons || parsed.courses || [], periods, subj)
      };
    } catch (e) {}
  }

  const lines = txt.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim());
  // Check TSV table header
  let headerIdx = -1;
  const colDays = new Map();
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const cols = lines[i].trim().split(/\t+|\s{2,}/);
    const m = new Map();
    cols.forEach((c, ci) => {
      const d = normalizeDay(c);
      if (d) m.set(ci, d);
    });
    if (m.size >= 2) {
      headerIdx = i;
      m.forEach((v, k) => colDays.set(k, v));
      break;
    }
  }

  const rawItems = [];
  if (headerIdx >= 0) {
    for (const row of lines.slice(headerIdx + 1)) {
      const cols = row.trim().split(/\t+|\s{2,}/);
      const pids = normalizePeriodIds(cols[0], periods);
      if (!pids.length) continue;
      for (const [ci, day] of colDays.entries()) {
        if (ci < cols.length) {
          const [className, subject, room] = splitCellText(cols[ci], defaultSubject);
          if (className) {
            for (const pid of pids) rawItems.push({ day, periodId: pid, className, subject, room });
          }
        }
      }
    }
    return { ok: true, lessons: normalizeLessonsList(rawItems, periods, defaultSubject) };
  }

  let curDay = null;
  for (const ln of lines) {
    const tokens = ln.trim().split(/\s+/);
    const d = normalizeDay(tokens[0]);
    if (d && tokens.length === 1) { curDay = d; continue; }
    const rest = d ? ((curDay = d), tokens.slice(1)) : tokens;
    if (!curDay || !rest.length) continue;
    const pids = normalizePeriodIds(rest[0], periods);
    if (!pids.length) continue;
    const [className, subject, room] = splitCellText(rest.slice(1).join(" "), defaultSubject);
    if (className) {
      for (const pid of pids) rawItems.push({ day: curDay, periodId: pid, className, subject, room });
    }
  }
  return { ok: true, lessons: normalizeLessonsList(rawItems, periods, defaultSubject) };
}

export async function clientParseImageDirect({ dataUrl, periods, defaultSubject, apiBase, apiKey, model }) {
  const key = String(apiKey || "").trim();
  if (!key) {
    return {
      ok: false,
      code: "NO_API_KEY",
      message: "纯静态版需在下方展开「视觉大模型设置」填入您的 API Key（如阿里云通义千问 VL / 硅基流动 / 智谱 GLM-4V），或直接切换至「粘贴Excel/免Key提示词」配合豆包免费转换！"
    };
  }
  const base = (apiBase || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const mdl = (model || "qwen-vl-max-latest").trim();
  const prompt = clientBuildAiPrompt(periods, defaultSubject);

  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: mdl,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: prompt }
          ]
        }
      ]
    })
  });

  if (!resp.ok) {
    const errTxt = await resp.text();
    return { ok: false, message: `模型接口返回 HTTP ${resp.status}: ${errTxt.slice(0, 180)}` };
  }
  const data = await resp.json();
  let content = data?.choices?.[0]?.message?.content || "";
  if (Array.isArray(content)) content = content.map((c) => c.text || "").join("\n");
  return clientParseText(content, periods, defaultSubject);
}

/* ==========================================================================
   Client-Side RFC 5545 Apple Calendar (.ics) Builder
   ========================================================================== */

function icsEsc(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function clientBuildIcs(schedule, alarmMinutes = 15, futureDays = null) {
  const teacher = (schedule.teacherName || "教师").trim();
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TeacherTimetablePWA//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEsc(teacher + "的课程表")}`,
    "X-WR-TIMEZONE:Asia/Shanghai",
    "X-APPLE-CALENDAR-COLOR:#2E6F5E",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Shanghai",
    "X-LIC-LOCATION:Asia/Shanghai",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0800",
    "TZOFFSETTO:+0800",
    "TZNAME:CST",
    "DTSTART:19700101T000000",
    "END:STANDARD",
    "END:VTIMEZONE"
  ];

  const semRange = getSemesterDateRange(schedule);
  let startDay;
  let endDay;
  if (futureDays === null && semRange) {
    startDay = semRange.startMonday;
    endDay = semRange.endSunday;
  } else {
    const span = futureDays === null ? 110 : Number(futureDays);
    startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3);
    endDay = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + span);
    if (semRange) {
      if (startDay < semRange.startMonday) startDay = semRange.startMonday;
      if (endDay > semRange.endSunday) endDay = semRange.endSunday;
    }
  }

  const totalDays = Math.round((endDay - startDay) / 86400000);
  for (let offset = 0; offset <= totalDays; offset++) {
    const d = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + offset);
    const isoDay = d.getDay() === 0 ? 7 : d.getDay();
    if (!schedule.showWeekend && (isoDay === 6 || isoDay === 7)) {
      const prefix = `${formatDateISO(d)}__`;
      const hasOv = Object.keys(schedule.overrides || {}).some((k) => k.startsWith(prefix));
      if (!hasOv) continue;
    }

    const dayLessons = resolveDayLessons(schedule, d, { includeCanceled: false });
    const ymd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

    for (const item of dayLessons) {
      const [sh, sm] = String(item.period.start || "08:00").split(":");
      const [eh, em] = String(item.period.end || "08:45").split(":");
      const dtStart = `${ymd}T${pad2(Number(sh))}${pad2(Number(sm))}00`;
      const dtEnd = `${ymd}T${pad2(Number(eh))}${pad2(Number(em))}00`;

      const badge = item.overrideType === "swap" ? " [调课]" : (item.overrideType === "substitute" ? " [代课]" : "");
      const summary = `${item.className} · ${item.subject || schedule.defaultSubject || "授课"}${badge}`;
      const descParts = [`节次：${item.period.label} (${item.period.start}-${item.period.end})`];
      if (item.room) descParts.push(`教室：${item.room}`);
      if (item.memo) descParts.push(`📌 随堂备忘：${item.memo}`);

      lines.push(
        "BEGIN:VEVENT",
        `UID:tt-${ymd}-${item.periodId}@teacher-timetable.pwa`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Shanghai:${dtStart}`,
        `DTEND;TZID=Asia/Shanghai:${dtEnd}`,
        `SUMMARY:${icsEsc(summary)}`
      );
      if (item.room) lines.push(`LOCATION:${icsEsc(item.room)}`);
      lines.push(`DESCRIPTION:${icsEsc(descParts.join("\n"))}`);

      if (alarmMinutes > 0) {
        const alertMsg = `即将上课：${summary}${item.room ? ` (${item.room})` : ""}${item.memo ? ` | 备忘：${item.memo}` : ""}`;
        lines.push(
          "BEGIN:VALARM",
          `TRIGGER:-PT${Number(alarmMinutes)}M`,
          "ACTION:DISPLAY",
          `DESCRIPTION:${icsEsc(alertMsg)}`,
          "END:VALARM"
        );
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/* ==========================================================================
   Client-Side iOS Scriptable Desktop Widget Generator
   ========================================================================== */

export function clientBuildScriptableJs(appBaseUrl, syncCode, schedule) {
  const cleanBase = String(appBaseUrl || window.location.href.split("?")[0].split("#")[0]).replace(/\/+$/, "");
  const codeStr = String(syncCode || "LOCAL").toUpperCase();
  const paletteExport = CLASS_PALETTES.map((p) => ({
    bgLight: p.bgLight,
    bgDark: p.bgDark,
    accent: p.bar,
    textLight: p.inkLight,
    textDark: p.inkDark
  }));
  const embeddedPayload = JSON.stringify({
    syncCode: codeStr,
    palette: paletteExport,
    schedule
  });

  return `// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: chalkboard-teacher;
/**
 * 知时课表 · 教师专属 iOS 桌面小组件 (Scriptable)
 * - 白天还有课时：展示「今日课程」，高亮正在上课与下一节 + 班级色标 + 随堂备忘
 * - 今日课程全部上完（或当天无课）时：自动无缝切换为「明日预告」！
 * - 内置完整离线课表数据，断网或无服务器（GitHub Pages 纯静态版）也可 100% 独立运行！
 */
const APP_URL = "${cleanBase}/";
const WIDGET_API = "${codeStr !== "LOCAL" ? `${cleanBase}/api/widget/${codeStr}.json` : ""}";
const EMBEDDED_DATA = ${embeddedPayload};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), "teacher_timetable_widget_cache.json");

async function loadData() {
  if (WIDGET_API) {
    try {
      const req = new Request(WIDGET_API);
      req.timeoutInterval = 5;
      const remote = await req.loadJSON();
      if (remote && remote.schedule) {
        fm.writeString(cachePath, JSON.stringify(remote));
        return remote;
      }
    } catch (e) {}
  }
  if (fm.fileExists(cachePath) && WIDGET_API) {
    try { return JSON.parse(fm.readString(cachePath)); } catch (e) {}
  }
  return EMBEDDED_DATA;
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function dateISO(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function toMin(s) { const p = (s || "08:00").split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1] || "0", 10); }

function getDayList(schedule, d, palettes) {
  const isoDay = d.getDay() === 0 ? 7 : d.getDay();
  const periods = (schedule.periods || []).filter((p) => {
    if (schedule.showMorningRead === false && p.section === "morning_read") return false;
    if (schedule.showEvening === false && p.section === "evening") return false;
    return true;
  });
  const baseMap = {};
  (schedule.lessons || []).forEach((l) => { if (Number(l.day) === isoDay) baseMap[l.periodId] = l; });
  const ovs = schedule.overrides || {};
  const dKey = dateISO(d);
  const colors = schedule.classColors || {};
  const out = [];

  periods.forEach((p) => {
    const ov = ovs[dKey + "__" + p.id];
    const base = baseMap[p.id];
    let item = null;
    if (ov) {
      if (ov.type === "cancel") return;
      if (ov.type === "memo_only" && base) item = Object.assign({}, base, { memo: ov.memo || base.memo || "" });
      else if (ov.className || ov.subject) item = { className: ov.className || (base ? base.className : ""), subject: ov.subject || (base ? base.subject : ""), room: ov.room ?? (base ? base.room : ""), memo: ov.memo ?? (base ? base.memo : ""), overrideType: ov.type };
    } else if (base) {
      item = base;
    }
    if (item) {
      const cIdx = Number(colors[item.className] || 0) % palettes.length;
      out.push({ start: p.start, end: p.end, label: p.label, num: p.num, className: item.className, subject: item.subject || schedule.defaultSubject || "", room: item.room || "", memo: item.memo || "", overrideType: item.overrideType, pal: palettes[cIdx] });
    }
  });
  return out;
}

const WK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

async function buildWidget() {
  const data = await loadData();
  const schedule = data.schedule || {};
  const palettes = data.palette || EMBEDDED_DATA.palette;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todayAll = getDayList(schedule, now, palettes);
  const todayRem = todayAll.filter((x) => toMin(x.end) > nowMin);
  const tmrAll = getDayList(schedule, tmr, palettes);

  const showTmr = todayRem.length === 0;
  const list = showTmr ? tmrAll : todayRem;
  const dayName = WK[showTmr ? tmr.getDay() : now.getDay()];
  const fam = config.widgetFamily || "medium";
  const maxRows = fam === "small" ? 2 : (fam === "large" ? 6 : 3);

  const w = new ListWidget();
  w.url = APP_URL;
  w.backgroundColor = Color.dynamic(new Color("#FAF8F4"), new Color("#181B20"));
  w.setPadding(12, 14, 12, 14);

  const head = w.addStack();
  head.centerAlignContent();
  const title = head.addText((showTmr ? "明日预告 · " : "今日课程 · ") + dayName);
  title.font = Font.boldSystemFont(fam === "small" ? 13 : 14);
  title.textColor = Color.dynamic(new Color("#1C2421"), new Color("#F2F4F3"));
  head.addSpacer();

  if (fam !== "small") {
    const b = head.addStack();
    b.setPadding(2, 7, 2, 7);
    b.cornerRadius = 6;
    b.backgroundColor = showTmr ? Color.dynamic(new Color("#FDF0E6"), new Color("#3D2718")) : Color.dynamic(new Color("#E6F4EE"), new Color("#19382D"));
    const bt = b.addText(showTmr ? (todayAll.length > 0 ? "今日已结课 · 明日" + tmrAll.length + "节" : "今日无课 · 明日" + tmrAll.length + "节") : "剩余 " + todayRem.length + "/" + todayAll.length + " 节");
    bt.font = Font.mediumSystemFont(10);
    bt.textColor = showTmr ? Color.dynamic(new Color("#B5531B"), new Color("#F7B98E")) : Color.dynamic(new Color("#216347"), new Color("#8CE0B8"));
  }
  w.addSpacer(8);

  if (list.length === 0) {
    w.addSpacer();
    const et = w.addText("🎉 今明两天都没有课");
    et.font = Font.boldSystemFont(14);
    et.textColor = Color.dynamic(new Color("#2E7D5B"), new Color("#8CE0B8"));
    const es = w.addText("安心休息，点击查看完整周课表");
    es.font = Font.systemFont(11);
    es.textColor = Color.dynamic(new Color("#737B78"), new Color("#8E9693"));
    w.addSpacer();
    return w;
  }

  list.slice(0, maxRows).forEach((it, i) => {
    if (i > 0) w.addSpacer(5);
    const r = w.addStack();
    r.centerAlignContent();
    r.setPadding(6, 8, 6, 8);
    r.cornerRadius = 8;
    r.backgroundColor = Color.dynamic(new Color(it.pal.bgLight), new Color(it.pal.bgDark));

    const bar = r.addStack();
    bar.size = new Size(3, 28);
    bar.cornerRadius = 2;
    bar.backgroundColor = new Color(it.pal.accent);
    r.addSpacer(7);

    const tc = r.addStack();
    tc.layoutVertically();
    const ts = tc.addText(it.start);
    ts.font = Font.boldMonospacedSystemFont(11);
    ts.textColor = Color.dynamic(new Color(it.pal.textLight), new Color(it.pal.textDark));
    const tl = tc.addText(fam === "small" ? it.num : it.label);
    tl.font = Font.systemFont(9);
    tl.textColor = Color.dynamic(new Color("#68736F"), new Color("#9BA6A2"));
    r.addSpacer(8);

    const ic = r.addStack();
    ic.layoutVertically();
    const top = ic.addStack();
    top.centerAlignContent();
    const cn = top.addText(it.className + (it.overrideType === "swap" ? " [调]" : (it.overrideType === "substitute" ? " [代]" : "")));
    cn.font = Font.boldSystemFont(fam === "small" ? 12 : 13);
    cn.textColor = Color.dynamic(new Color("#18201D"), new Color("#F3F6F4"));
    cn.lineLimit = 1;

    if (fam !== "small" && (it.subject || it.room)) {
      top.addSpacer(6);
      const mt = top.addText([it.subject, it.room].filter(Boolean).join(" · "));
      mt.font = Font.systemFont(11);
      mt.textColor = Color.dynamic(new Color("#56615D"), new Color("#A9B4B0"));
      mt.lineLimit = 1;
    }
    if (it.memo && fam !== "small") {
      const mm = ic.addText("📌 " + it.memo);
      mm.font = Font.systemFont(10);
      mm.textColor = Color.dynamic(new Color("#9E501D"), new Color("#F5B88E"));
      mm.lineLimit = 1;
    }
    r.addSpacer();
  });
  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
`;
}

/* ==========================================================================
   Serverless Cross-Device Share Link (#s=...) via Web CompressionStream
   ========================================================================== */

function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url) {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeScheduleShareUrl(schedule) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(schedule));
  const baseUrl = window.location.href.split("?")[0].split("#")[0];
  if (typeof CompressionStream !== "undefined") {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(jsonBytes);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    return `${baseUrl}#s=z.${bytesToBase64Url(new Uint8Array(buf))}`;
  }
  return `${baseUrl}#s=u.${bytesToBase64Url(jsonBytes)}`;
}

export async function decodeScheduleFromHash(hashStr) {
  const m = String(hashStr || "").match(/[#&]s=(z|u)\.([A-Za-z0-9_-]+)/);
  if (!m) return null;
  const mode = m[1];
  const bytes = base64UrlToBytes(m[2]);
  if (mode === "z" && typeof DecompressionStream !== "undefined") {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    const buf = await new Response(ds.readable).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
