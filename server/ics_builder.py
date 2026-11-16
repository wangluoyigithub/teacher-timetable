"""RFC 5545 iCalendar (.ics) dynamic feed builder for Teacher Timetable."""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import Any


def _ics_escape(text: str) -> str:
    if not text:
        return ""
    return (
        str(text)
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _fold_line(line: str) -> str:
    """Fold iCalendar lines at 73 UTF-8 octets per RFC 5545."""
    raw = line.encode("utf-8")
    if len(raw) <= 73:
        return line
    chunks: list[str] = []
    current = bytearray()
    limit = 73
    for ch in line:
        encoded = ch.encode("utf-8")
        if len(current) + len(encoded) > limit:
            chunks.append(current.decode("utf-8"))
            current = bytearray(b" " + encoded)
            limit = 73
        else:
            current.extend(encoded)
    if current:
        chunks.append(current.decode("utf-8"))
    return "\r\n".join(chunks)


def _parse_hhmm(hhmm: str) -> tuple[int, int]:
    parts = (hhmm or "08:00").strip().split(":")
    try:
        return int(parts[0]), int(parts[1])
    except (ValueError, IndexError):
        return 8, 0


def _week_number(target_date: dt.date, semester_start_str: str | None) -> int:
    if not semester_start_str:
        return 1
    try:
        start_date = dt.date.fromisoformat(semester_start_str)
    except ValueError:
        return 1
    start_monday = start_date - dt.timedelta(days=start_date.weekday())
    target_monday = target_date - dt.timedelta(days=target_date.weekday())
    delta_weeks = (target_monday - start_monday).days // 7 + 1
    return max(1, delta_weeks)


def resolve_day_lessons(
    schedule: dict[str, Any],
    target_date: dt.date,
) -> list[dict[str, Any]]:
    """Resolve effective lessons on a specific calendar date including overrides."""
    iso_day = target_date.isoweekday()  # 1=Mon .. 7=Sun
    periods = schedule.get("periods") or []
    period_map = {p["id"]: p for p in periods if isinstance(p, dict) and "id" in p}
    period_order = {p["id"]: idx for idx, p in enumerate(periods) if isinstance(p, dict) and "id" in p}

    show_evening = schedule.get("showEvening", True)
    week_no = _week_number(target_date, schedule.get("semesterStart"))
    is_odd = (week_no % 2) == 1

    base_by_period: dict[str, dict[str, Any]] = {}
    for lesson in schedule.get("lessons") or []:
        if int(lesson.get("day", 0)) != iso_day:
            continue
        pid = lesson.get("periodId")
        if pid not in period_map:
            continue
        week_type = lesson.get("weekType", "all")
        if week_type == "odd" and not is_odd:
            continue
        if week_type == "even" and is_odd:
            continue
        base_by_period[pid] = dict(lesson)

    date_str = target_date.isoformat()
    overrides = schedule.get("overrides") or {}

    resolved: list[dict[str, Any]] = []
    for pid, period in period_map.items():
        if not show_evening and period.get("section") == "evening":
            continue
        ov_key = f"{date_str}__{pid}"
        ov = overrides.get(ov_key)
        base = base_by_period.get(pid)

        if ov:
            ov_type = ov.get("type", "swap")
            if ov_type == "cancel":
                continue
            if ov_type == "memo_only" and base:
                merged = dict(base)
                merged["memo"] = ov.get("memo", base.get("memo", ""))
                merged["overrideType"] = "memo_only"
                merged["period"] = period
                resolved.append(merged)
                continue
            if ov.get("className") or ov.get("subject"):
                item = {
                    "id": f"ov_{ov_key}",
                    "day": iso_day,
                    "periodId": pid,
                    "className": ov.get("className") or (base or {}).get("className", ""),
                    "subject": ov.get("subject") or (base or {}).get("subject", ""),
                    "room": ov.get("room") if "room" in ov else (base or {}).get("room", ""),
                    "memo": ov.get("memo") if "memo" in ov else (base or {}).get("memo", ""),
                    "overrideType": ov_type,
                    "reason": ov.get("reason", ""),
                    "period": period,
                }
                resolved.append(item)
                continue

        if base:
            item = dict(base)
            item["overrideType"] = None
            item["period"] = period
            resolved.append(item)

    resolved.sort(key=lambda x: period_order.get(x["periodId"], 999))
    return resolved


def build_ics_feed(
    schedule: dict[str, Any],
    sync_code: str = "LOCAL",
    alarm_minutes: int | None = None,
    past_days: int = 7,
    future_days: int = 120,
    reference_date: dt.date | None = None,
) -> str:
    """Build an RFC 5545 iCalendar string suitable for Apple Calendar webcal:// subscription."""
    teacher_name = (schedule.get("teacherName") or "教师").strip()
    cal_name = f"{teacher_name}的课程表"
    if alarm_minutes is None:
        alarm_minutes = int(schedule.get("reminderMinutes", 15))

    today = reference_date or dt.date.today()
    now_utc = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//TeacherTimetablePWA//CN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_escape(cal_name)}",
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
        "END:VTIMEZONE",
    ]

    start_day = today - dt.timedelta(days=past_days)
    total_days = past_days + future_days

    for offset in range(total_days + 1):
        cur_date = start_day + dt.timedelta(days=offset)
        if not schedule.get("showWeekend", False) and cur_date.isoweekday() in (6, 7):
            # Still allow explicit overrides on weekends (e.g., holiday makeup classes)
            has_weekend_override = any(
                k.startswith(f"{cur_date.isoformat()}__")
                for k in (schedule.get("overrides") or {})
            )
            if not has_weekend_override:
                continue

        day_lessons = resolve_day_lessons(schedule, cur_date)
        for item in day_lessons:
            period = item["period"]
            sh, sm = _parse_hhmm(period.get("start", "08:00"))
            eh, em = _parse_hhmm(period.get("end", "08:45"))
            dt_start = dt.datetime(cur_date.year, cur_date.month, cur_date.day, sh, sm)
            dt_end = dt.datetime(cur_date.year, cur_date.month, cur_date.day, eh, em)
            if dt_end <= dt_start:
                dt_end = dt_start + dt.timedelta(minutes=45)

            class_name = item.get("className") or "未命名班级"
            subject = item.get("subject") or schedule.get("defaultSubject") or "授课"
            ov_type = item.get("overrideType")
            badge = ""
            if ov_type == "swap":
                badge = " [调课]"
            elif ov_type == "substitute":
                badge = " [代课]"

            summary = f"{class_name} · {subject}{badge}"
            room = (item.get("room") or "").strip()
            memo = (item.get("memo") or "").strip()
            reason = (item.get("reason") or "").strip()
            p_label = period.get("label") or period.get("num") or ""

            desc_parts = [f"节次：{p_label} ({period.get('start', '')}-{period.get('end', '')})"]
            if room:
                desc_parts.append(f"教室：{room}")
            if memo:
                desc_parts.append(f"📌 随堂备忘：{memo}")
            if reason:
                desc_parts.append(f"🔄 变动说明：{reason}")
            description = "\n".join(desc_parts)

            uid_seed = f"{sync_code}-{cur_date.isoformat()}-{item['periodId']}"
            uid_hash = hashlib.sha1(uid_seed.encode("utf-8")).hexdigest()[:16]
            uid = f"{uid_hash}@teacher-timetable.local"

            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:{uid}",
                    f"DTSTAMP:{now_utc}",
                    f"DTSTART;TZID=Asia/Shanghai:{dt_start.strftime('%Y%m%dT%H%M%S')}",
                    f"DTEND;TZID=Asia/Shanghai:{dt_end.strftime('%Y%m%dT%H%M%S')}",
                    f"SUMMARY:{_ics_escape(summary)}",
                ]
            )
            if room:
                lines.append(f"LOCATION:{_ics_escape(room)}")
            lines.append(f"DESCRIPTION:{_ics_escape(description)}")

            if alarm_minutes and alarm_minutes > 0:
                alarm_text = f"即将上课：{summary}" + (f"（{room}）" if room else "")
                if memo:
                    alarm_text += f" | 备忘：{memo}"
                lines.extend(
                    [
                        "BEGIN:VALARM",
                        f"TRIGGER:-PT{int(alarm_minutes)}M",
                        "ACTION:DISPLAY",
                        f"DESCRIPTION:{_ics_escape(alarm_text)}",
                        "END:VALARM",
                    ]
                )
            lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold_line(line) for line in lines) + "\r\n"
