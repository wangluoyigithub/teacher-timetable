"""iOS Scriptable Desktop Widget generator for Teacher Timetable."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from .ics_builder import resolve_day_lessons


CLASS_PALETTE_HEX = [
    {"bgLight": "#E6F4EE", "bgDark": "#19382D", "accent": "#2E7D5B", "textLight": "#164A34", "textDark": "#8CE0B8"},
    {"bgLight": "#FDF0E6", "bgDark": "#3D2718", "accent": "#C86428", "textLight": "#6E320F", "textDark": "#F7B98E"},
    {"bgLight": "#E8F0FA", "bgDark": "#1A2D42", "accent": "#2E629E", "textLight": "#173A63", "textDark": "#96C2F7"},
    {"bgLight": "#F7EBF2", "bgDark": "#3B1E30", "accent": "#A34178", "textLight": "#5E1D41", "textDark": "#F0A5CE"},
    {"bgLight": "#EEF2E6", "bgDark": "#29331B", "accent": "#5C7A29", "textLight": "#344712", "textDark": "#BFE085"},
    {"bgLight": "#F4EFE6", "bgDark": "#362C1E", "accent": "#8C6830", "textLight": "#4F3914", "textDark": "#E6C793"},
    {"bgLight": "#E6F3F5", "bgDark": "#173338", "accent": "#237887", "textLight": "#11464F", "textDark": "#89D7E5"},
    {"bgLight": "#FCECEB", "bgDark": "#3D1D1B", "accent": "#B8433E", "textLight": "#661D1A", "textDark": "#F5A39F"},
]


def build_widget_payload(
    schedule: dict[str, Any],
    sync_code: str = "LOCAL",
    reference_date: dt.date | None = None,
) -> dict[str, Any]:
    today = reference_date or dt.date.today()
    days_preview: dict[str, list[dict[str, Any]]] = {}
    class_colors = schedule.get("classColors") or {}

    for offset in range(0, 8):
        d = today + dt.timedelta(days=offset)
        lessons = resolve_day_lessons(schedule, d)
        serialized = []
        for item in lessons:
            p = item["period"]
            cname = item.get("className") or "未命名班级"
            cidx = int(class_colors.get(cname, 0)) % len(CLASS_PALETTE_HEX)
            serialized.append(
                {
                    "periodId": item["periodId"],
                    "periodNum": p.get("num", ""),
                    "periodLabel": p.get("label", ""),
                    "start": p.get("start", "08:00"),
                    "end": p.get("end", "08:45"),
                    "className": cname,
                    "subject": item.get("subject") or schedule.get("defaultSubject") or "",
                    "room": item.get("room") or "",
                    "memo": item.get("memo") or "",
                    "overrideType": item.get("overrideType"),
                    "palette": CLASS_PALETTE_HEX[cidx],
                }
            )
        days_preview[d.isoformat()] = serialized

    return {
        "syncCode": sync_code,
        "teacherName": schedule.get("teacherName") or "老师",
        "defaultSubject": schedule.get("defaultSubject") or "",
        "updatedAt": schedule.get("updatedAt", 0),
        "palette": CLASS_PALETTE_HEX,
        "schedule": schedule,
        "daysPreview": days_preview,
    }


def build_scriptable_js(
    base_url: str,
    sync_code: str,
    fallback_schedule: dict[str, Any] | None = None,
) -> str:
    clean_url = (base_url or "https://your-domain.example.com").rstrip("/")
    code_str = (sync_code or "LOCAL").strip()
    embedded = json.dumps(
        build_widget_payload(fallback_schedule or {}, code_str),
        ensure_ascii=False,
    )

    return f"""// Variables used by Scriptable.
// icon-color: deep-green; icon-glyph: chalkboard-teacher;
/**
 * 教师极简智能课程表 · iOS 桌面小组件 (Scriptable)
 * 核心特性：
 * 1. 今天还有课时：展示「今日剩余课程」，高亮正在上课 / 下一节倒计时 + 班级色标 + 随堂备忘
 * 2. 今天课程全部结束或当天无课时：自动无缝切换为「明日课程预告」！
 * 3. 自动本地离线缓存：教室信号差或断网也能秒开课表
 */

const SERVER_BASE = "{clean_url}";
const SYNC_CODE = "{code_str}";
const WIDGET_API = `${{SERVER_BASE}}/api/widget/${{SYNC_CODE}}.json`;
const APP_URL = `${{SERVER_BASE}}/?sync=${{SYNC_CODE}}`;

const FALLBACK_DATA = {embedded};

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), `teacher_timetable_${{SYNC_CODE}}.json`);

async function loadPayload() {{
  try {{
    if (SERVER_BASE.startsWith("http") && SYNC_CODE && SYNC_CODE !== "LOCAL") {{
      const req = new Request(WIDGET_API);
      req.timeoutInterval = 6;
      const fresh = await req.loadJSON();
      if (fresh && fresh.schedule) {{
        fm.writeString(cachePath, JSON.stringify(fresh));
        return fresh;
      }}
    }}
  }} catch (e) {{
    console.warn("Using cached schedule: " + e);
  }}
  if (fm.fileExists(cachePath)) {{
    try {{
      return JSON.parse(fm.readString(cachePath));
    }} catch (e) {{}}
  }}
  return FALLBACK_DATA;
}}

function pad2(n) {{
  return n < 10 ? "0" + n : "" + n;
}}

function formatDateKey(d) {{
  return `${{d.getFullYear()}}-${{pad2(d.getMonth() + 1)}}-${{pad2(d.getDate())}}`;
}}

function parseMinutes(hhmm) {{
  const parts = (hhmm || "08:00").split(":");
  return parseInt(parts[0] || "8", 10) * 60 + parseInt(parts[1] || "0", 10);
}}

function resolveLessonsForDate(schedule, dateObj, paletteList) {{
  const jsDay = dateObj.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  const periods = schedule.periods || [];
  const pMap = {{}};
  const pOrder = {{}};
  periods.forEach((p, i) => {{ pMap[p.id] = p; pOrder[p.id] = i; }});

  const showEvening = schedule.showEvening !== false;
  const baseByPid = {{}};
  (schedule.lessons || []).forEach((les) => {{
    if (Number(les.day) === isoDay && pMap[les.periodId]) {{
      baseByPid[les.periodId] = Object.assign({{}}, les);
    }}
  }});

  const dateKey = formatDateKey(dateObj);
  const overrides = schedule.overrides || {{}};
  const classColors = schedule.classColors || {{}};
  const out = [];

  periods.forEach((p) => {{
    if (!showEvening && p.section === "evening") return;
    const ov = overrides[`${{dateKey}}__${{p.id}}`];
    const base = baseByPid[p.id];
    let finalItem = null;

    if (ov) {{
      if (ov.type === "cancel") return;
      if (ov.type === "memo_only" && base) {{
        finalItem = Object.assign({{}}, base, {{ memo: ov.memo || base.memo || "", overrideType: "memo_only" }});
      }} else if (ov.className || ov.subject) {{
        finalItem = {{
          periodId: p.id,
          className: ov.className || (base ? base.className : ""),
          subject: ov.subject || (base ? base.subject : ""),
          room: ov.room !== undefined ? ov.room : (base ? base.room : ""),
          memo: ov.memo !== undefined ? ov.memo : (base ? base.memo : ""),
          overrideType: ov.type || "swap"
        }};
      }}
    }} else if (base) {{
      finalItem = Object.assign({{}}, base, {{ overrideType: null }});
    }}

    if (finalItem) {{
      const cIdx = Number(classColors[finalItem.className] || 0) % paletteList.length;
      out.push({{
        periodNum: p.num || "",
        periodLabel: p.label || "",
        start: p.start || "08:00",
        end: p.end || "08:45",
        className: finalItem.className || "未命名班级",
        subject: finalItem.subject || schedule.defaultSubject || "",
        room: finalItem.room || "",
        memo: finalItem.memo || "",
        overrideType: finalItem.overrideType,
        palette: paletteList[cIdx]
      }});
    }}
  }});
  return out;
}}

const WEEK_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

async function createTimetableWidget() {{
  const payload = await loadPayload();
  const schedule = payload.schedule || {{}};
  const paletteList = payload.palette || [{{ bgLight: "#E6F4EE", bgDark: "#19382D", accent: "#2E7D5B", textLight: "#164A34", textDark: "#8CE0B8" }}];

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const todayAll = resolveLessonsForDate(schedule, now, paletteList);
  const todayRemaining = todayAll.filter((item) => parseMinutes(item.end) > nowMin);
  const tomorrowAll = resolveLessonsForDate(schedule, tomorrow, paletteList);

  const showingTomorrow = todayRemaining.length === 0;
  const displayList = showingTomorrow ? tomorrowAll : todayRemaining;
  const targetDayName = WEEK_NAMES[showingTomorrow ? tomorrow.getDay() : now.getDay()];

  const family = config.widgetFamily || "medium";
  const maxRows = family === "small" ? 2 : (family === "large" ? 6 : 3);

  const w = new ListWidget();
  w.url = APP_URL;
  w.backgroundColor = Color.dynamic(new Color("#FAF8F4"), new Color("#181B20"));
  w.setPadding(12, 14, 12, 14);

  // Header
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const titleText = showingTomorrow ? `明日预告 · ${{targetDayName}}` : `今日课程 · ${{targetDayName}}`;
  const titleEl = header.addText(titleText);
  titleEl.font = Font.boldSystemFont(family === "small" ? 13 : 14);
  titleEl.textColor = Color.dynamic(new Color("#1C2421"), new Color("#F2F4F3"));

  header.addSpacer();

  if (family !== "small") {{
    const badge = header.addStack();
    badge.setPadding(2, 7, 2, 7);
    badge.cornerRadius = 6;
    badge.backgroundColor = showingTomorrow
      ? Color.dynamic(new Color("#FDF0E6"), new Color("#3D2718"))
      : Color.dynamic(new Color("#E6F4EE"), new Color("#19382D"));
    const statusStr = showingTomorrow
      ? (todayAll.length > 0 ? `今日已结课 · 明日${{tomorrowAll.length}}节` : `今日无课 · 明日${{tomorrowAll.length}}节`)
      : `剩余 ${{todayRemaining.length}} / ${{todayAll.length}} 节`;
    const badgeTxt = badge.addText(statusStr);
    badgeTxt.font = Font.mediumSystemFont(10);
    badgeTxt.textColor = showingTomorrow
      ? Color.dynamic(new Color("#B5531B"), new Color("#F7B98E"))
      : Color.dynamic(new Color("#216347"), new Color("#8CE0B8"));
  }}

  w.addSpacer(8);

  if (displayList.length === 0) {{
    w.addSpacer();
    const emptyTitle = w.addText(showingTomorrow ? "🎉 今明两天都没有课" : "☕ 今天没有课");
    emptyTitle.font = Font.boldSystemFont(14);
    emptyTitle.textColor = Color.dynamic(new Color("#2E7D5B"), new Color("#8CE0B8"));
    const sub = w.addText("好好休息，点击可打开完整周课表");
    sub.font = Font.systemFont(11);
    sub.textColor = Color.dynamic(new Color("#737B78"), new Color("#8E9693"));
    w.addSpacer();
    return w;
  }}

  const slice = displayList.slice(0, maxRows);
  slice.forEach((item, idx) => {{
    if (idx > 0) w.addSpacer(5);
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.setPadding(6, 8, 6, 8);
    row.cornerRadius = 8;
    const pal = item.palette || paletteList[0];
    row.backgroundColor = Color.dynamic(new Color(pal.bgLight), new Color(pal.bgDark));

    // Left accent bar
    const bar = row.addStack();
    bar.size = new Size(3, family === "small" ? 26 : 30);
    bar.cornerRadius = 2;
    bar.backgroundColor = new Color(pal.accent);
    row.addSpacer(7);

    // Time column
    const timeCol = row.addStack();
    timeCol.layoutVertically();
    const tStart = timeCol.addText(item.start);
    tStart.font = Font.boldMonospacedSystemFont(11);
    tStart.textColor = Color.dynamic(new Color(pal.textLight), new Color(pal.textDark));
    const tSub = timeCol.addText(family === "small" ? item.periodNum : `${{item.periodLabel || item.periodNum}}`);
    tSub.font = Font.systemFont(9);
    tSub.textColor = Color.dynamic(new Color("#68736F"), new Color("#9BA6A2"));

    row.addSpacer(8);

    // Main lesson info
    const infoCol = row.addStack();
    infoCol.layoutVertically();

    const topLine = infoCol.addStack();
    topLine.layoutHorizontally();
    topLine.centerAlignContent();

    let cname = item.className;
    if (item.overrideType === "swap") cname += " [调]";
    if (item.overrideType === "substitute") cname += " [代]";
    const clsTxt = topLine.addText(cname);
    clsTxt.font = Font.boldSystemFont(family === "small" ? 12 : 13);
    clsTxt.textColor = Color.dynamic(new Color("#18201D"), new Color("#F3F6F4"));
    clsTxt.lineLimit = 1;

    if (family !== "small" && (item.subject || item.room)) {{
      topLine.addSpacer(6);
      const metaStr = [item.subject, item.room].filter(Boolean).join(" · ");
      const metaTxt = topLine.addText(metaStr);
      metaTxt.font = Font.systemFont(11);
      metaTxt.textColor = Color.dynamic(new Color("#56615D"), new Color("#A9B4B0"));
      metaTxt.lineLimit = 1;
    }}

    if (item.memo && family !== "small") {{
      const memoTxt = infoCol.addText(`📌 ${{item.memo}}`);
      memoTxt.font = Font.systemFont(10);
      memoTxt.textColor = Color.dynamic(new Color("#9E501D"), new Color("#F5B88E"));
      memoTxt.lineLimit = 1;
    }} else if (!showingTomorrow && idx === 0) {{
      const stMin = parseMinutes(item.start);
      const edMin = parseMinutes(item.end);
      let liveHint = "";
      if (nowMin >= stMin && nowMin < edMin) {{
        liveHint = `正在上课 · 剩 ${{edMin - nowMin}} 分钟`;
      }} else if (stMin > nowMin && stMin - nowMin <= 90) {{
        liveHint = `${{stMin - nowMin}} 分钟后上课`;
      }}
      if (liveHint) {{
        const hintTxt = infoCol.addText(liveHint);
        hintTxt.font = Font.mediumSystemFont(10);
        hintTxt.textColor = new Color(pal.accent);
      }}
    }}

    row.addSpacer();
  }});

  if (displayList.length > maxRows) {{
    w.addSpacer(4);
    const more = w.addText(`还有 ${{displayList.length - maxRows}} 节课，点击查看完整课表 ›`);
    more.font = Font.systemFont(10);
    more.textColor = Color.dynamic(new Color("#737B78"), new Color("#8E9693"));
  }}

  return w;
}}

const widget = await createTimetableWidget();
if (config.runsInWidget) {{
  Script.setWidget(widget);
}} else {{
  await widget.presentMedium();
}}
Script.complete();
"""
