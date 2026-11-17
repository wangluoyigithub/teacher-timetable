"""Multimodal Vision LLM & Smart Text/TSV/JSON parser for Teacher Timetable."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


DAY_MAP = {
    "1": 1, "一": 1, "周一": 1, "星期一": 1, "mon": 1, "monday": 1,
    "2": 2, "二": 2, "周二": 2, "星期二": 2, "tue": 2, "tuesday": 2,
    "3": 3, "三": 3, "周三": 3, "星期三": 3, "wed": 3, "wednesday": 3,
    "4": 4, "四": 4, "周四": 4, "星期四": 4, "thu": 4, "thursday": 4,
    "5": 5, "五": 5, "周五": 5, "星期五": 5, "fri": 5, "friday": 5,
    "6": 6, "六": 6, "周六": 6, "星期六": 6, "sat": 6, "saturday": 6,
    "7": 7, "日": 7, "天": 7, "周日": 7, "周天": 7, "星期日": 7, "星期天": 7, "sun": 7, "sunday": 7,
}

CN_NUM_ORDERED = [
    ("二十", 20), ("十九", 19), ("十八", 18), ("十七", 17), ("十六", 16),
    ("十五", 15), ("十四", 14), ("十三", 13), ("十二", 12), ("十一", 11),
    ("十", 10), ("九", 9), ("八", 8), ("七", 7), ("六", 6),
    ("五", 5), ("四", 4), ("三", 3), ("二", 2), ("一", 1),
]


def build_ai_prompt(periods: list[dict[str, Any]], default_subject: str = "") -> str:
    period_desc = "\n".join(
        f"- periodId=\"{p['id']}\": {p.get('label', p.get('num', ''))} ({p.get('start', '')}-{p.get('end', '')})"
        for p in periods
    )
    subj_hint = f"（该老师默认任教学科为「{default_subject}」，若格子中未写学科名请自动填入「{default_subject}」）" if default_subject else ""
    return f"""你是一个专业的「中国中小学/职校教师课程表」结构化识别助手。请仔细识别这张教师课表图片中的所有课程格子（注意分辨表头方向、合并单元格、早读/午休/晚自习分隔行）{subj_hint}。

当前系统已配置的节次列表如下：
{period_desc}
（注：若图中课表节数多于上方列表，如第9节、第10节、第11节、第12节或晚自习三，请直接输出 "p9"、"p10"、"p11"、"p12" 或 "eve3"，系统会自动扩展节次！）

请严格只输出如下格式的 JSON（不要添加多余解释）：
```json
{{
  "teacherName": "识别到的教师姓名（若无则留空）",
  "defaultSubject": "识别到的主要任教学科（若无则留空）",
  "lessons": [
    {{
      "day": 1,
      "periodId": "p1",
      "className": "高一(3)班",
      "subject": "数学",
      "room": "致远楼303",
      "weekType": "all",
      "memo": ""
    }}
  ]
}}
```
字段规则：
1. `day`: 1~7 的整数（1=周一，5=周五，6=周六，7=周日）。
2. `periodId`: 优先对应上方节次列表中的 `periodId`；若图中节次超出列表，用 `p9`/`p10`/`p11`… 或 `eve3`。如果是两节连堂（如第1-2节合并单元格），请拆成两条记录（`p1` 和 `p2` 各一条）！
3. `className`: 授课班级名称（如 `高一(3)班`、`七年级2班`、`24电商1班`）。教师课表最重要的是班级，请保持格式统一！
4. `subject`: 课程/科目名称（如 `数学`、`语文`、`班会`、`早读`）。
5. `room`: 教室或地点（若图中未标注则填空字符串 `""`）。
6. `weekType`: 默认 `"all"`；若标有单周填 `"odd"`，双周填 `"even"`。"""


def normalize_period_id(raw_period: Any, periods: list[dict[str, Any]]) -> list[str]:
    """Normalize arbitrary period text like '1', '第一节', '11节', '3-4节', '早读', '晚1' into periodIds."""
    valid_ids = {p["id"] for p in periods}
    s = str(raw_period or "").strip()
    if not s:
        return []
    if s in valid_ids:
        return [s]

    for p in periods:
        if p.get("label") == s or p.get("num") == s:
            return [p["id"]]

    s_lower = s.lower()
    if re.match(r"^(p\d{1,2}|eve\d)$", s_lower):
        return [s_lower]

    if "早" in s_lower:
        return ["morning_read"]

    if "晚" in s_lower:
        if "3" in s_lower or "三" in s_lower:
            return ["eve3"]
        if "2" in s_lower or "二" in s_lower:
            return ["p10"] if "p10" in valid_ids else ["eve2"]
        return ["p9"] if "p9" in valid_ids else ["eve1"]

    # Check range like "1-2", "3~4节", "第1、2节"
    range_match = re.search(r"(\d+)\s*[-~至到、,，]\s*(\d+)", s)
    if range_match:
        a, b = int(range_match.group(1)), int(range_match.group(2))
        if 1 <= a <= b <= 20:
            return [f"p{i}" for i in range(a, b + 1)]

    num_match = re.search(r"(\d+)", s)
    if num_match:
        n = int(num_match.group(1))
        if 1 <= n <= 20:
            return [f"p{n}"]

    for cn_str, num_val in CN_NUM_ORDERED:
        if cn_str in s:
            return [f"p{num_val}"]

    return []


def normalize_day(raw_day: Any) -> int | None:
    if isinstance(raw_day, int) and 1 <= raw_day <= 7:
        return raw_day
    s = str(raw_day or "").strip().lower()
    if s in DAY_MAP:
        return DAY_MAP[s]
    for k, v in DAY_MAP.items():
        if len(k) >= 2 and k in s:
            return v
    return None


def normalize_parsed_lessons(
    raw_items: list[dict[str, Any]],
    periods: list[dict[str, Any]],
    default_subject: str = "",
) -> list[dict[str, Any]]:
    dedup: dict[tuple[int, str], dict[str, Any]] = {}
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        day = normalize_day(item.get("day") or item.get("weekday"))
        if not day:
            continue
        raw_pid = item.get("periodId") or item.get("period") or item.get("slot")
        pids = normalize_period_id(raw_pid, periods)
        if not pids:
            continue

        class_name = str(item.get("className") or item.get("class") or item.get("grade") or "").strip()
        subject = str(item.get("subject") or item.get("course") or item.get("name") or default_subject or "").strip()
        room = str(item.get("room") or item.get("location") or "").strip()
        memo = str(item.get("memo") or item.get("note") or "").strip()
        week_type = str(item.get("weekType") or "all").strip()
        if week_type not in ("all", "odd", "even"):
            week_type = "all"

        if not class_name and not subject:
            continue
        if not class_name and subject:
            class_name = subject

        for pid in pids:
            dedup[(day, pid)] = {
                "id": f"les_{day}_{pid}",
                "day": day,
                "periodId": pid,
                "className": class_name,
                "subject": subject,
                "room": room,
                "weekType": week_type,
                "memo": memo,
            }
    return list(dedup.values())


def extract_json_object(text: str) -> dict[str, Any] | list[Any] | None:
    text = (text or "").strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    candidate = fence.group(1).strip() if fence else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass
    # Fallback find outermost { ... } or [ ... ]
    obj_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", text)
    if obj_match:
        try:
            return json.loads(obj_match.group(1))
        except json.JSONDecodeError:
            return None
    return None


def _split_cell_content(cell_text: str, default_subject: str = "") -> tuple[str, str, str]:
    """Split compact timetable cell string like '高一(3)班 数学 @302' into (className, subject, room)."""
    cleaned = re.sub(r"\s+", " ", cell_text.strip())
    if not cleaned or cleaned in ("-", "—", "/", "无", "休息", "午休", "空"):
        return ("", "", "")

    parts = [p.strip() for p in re.split(r"[\s/｜|·,，]+", cleaned) if p.strip()]
    if not parts:
        return ("", "", "")

    class_name = ""
    subject = ""
    room = ""

    for token in parts:
        if not class_name and re.search(r"(班|级|届|\d+\(\d+\))", token):
            class_name = token
        elif not room and re.search(r"(楼|室|机房|实验室|阶梯|馆|操场|[A-Za-z]?\d{3,4})", token) and token != class_name:
            room = token.lstrip("@")
        elif not subject:
            subject = token

    if not class_name:
        class_name = parts[0]
        if len(parts) >= 2 and subject == parts[0]:
            subject = parts[1]
    if not subject:
        subject = default_subject
    return (class_name, subject, room)


def parse_timetable_text(
    raw_text: str,
    periods: list[dict[str, Any]],
    default_subject: str = "",
) -> dict[str, Any]:
    """Parse AI JSON output, Excel/WPS tab-separated table text, or free-form Chinese lines."""
    parsed_json = extract_json_object(raw_text)
    if parsed_json is not None:
        if isinstance(parsed_json, list):
            lessons = normalize_parsed_lessons(parsed_json, periods, default_subject)
            return {"lessons": lessons, "source": "json_array"}
        if isinstance(parsed_json, dict):
            t_subj = str(parsed_json.get("defaultSubject") or default_subject or "").strip()
            raw_list = parsed_json.get("lessons") or parsed_json.get("courses") or []
            lessons = normalize_parsed_lessons(raw_list, periods, t_subj)
            return {
                "teacherName": str(parsed_json.get("teacherName") or "").strip(),
                "defaultSubject": t_subj,
                "lessons": lessons,
                "source": "json_object",
            }

    lines = [ln.rstrip() for ln in (raw_text or "").splitlines() if ln.strip()]
    if not lines:
        return {"lessons": [], "source": "empty"}

    # Check if TSV / table grid (header contains 周一 / 星期一)
    header_idx = -1
    col_days: dict[int, int] = {}
    for idx, ln in enumerate(lines[:5]):
        cols = re.split(r"\t+|\s{2,}", ln.strip())
        matched = {}
        for c_i, c_text in enumerate(cols):
            d = normalize_day(c_text)
            if d:
                matched[c_i] = d
        if len(matched) >= 2:
            header_idx = idx
            col_days = matched
            break

    extracted: list[dict[str, Any]] = []
    if header_idx >= 0:
        for row_ln in lines[header_idx + 1 :]:
            cols = re.split(r"\t+|\s{2,}", row_ln.strip())
            if not cols:
                continue
            pids = normalize_period_id(cols[0], periods)
            if not pids:
                continue
            for col_i, day_num in col_days.items():
                if col_i < len(cols):
                    cname, subj, rm = _split_cell_content(cols[col_i], default_subject)
                    if cname:
                        for pid in pids:
                            extracted.append(
                                {
                                    "day": day_num,
                                    "periodId": pid,
                                    "className": cname,
                                    "subject": subj,
                                    "room": rm,
                                }
                            )
        return {
            "lessons": normalize_parsed_lessons(extracted, periods, default_subject),
            "source": "table_tsv",
        }

    # Line-by-line natural Chinese parsing: e.g. "周一 第1-2节 高一(3)班 数学 致远楼303"
    current_day: int | None = None
    for ln in lines:
        tokens = ln.strip().split()
        if not tokens:
            continue
        maybe_day = normalize_day(tokens[0])
        if maybe_day and len(tokens) == 1:
            current_day = maybe_day
            continue
        if maybe_day:
            current_day = maybe_day
            rest = tokens[1:]
        else:
            rest = tokens

        if not current_day or not rest:
            continue

        pids = normalize_period_id(rest[0], periods)
        if not pids:
            continue
        cell_str = " ".join(rest[1:])
        cname, subj, rm = _split_cell_content(cell_str, default_subject)
        if cname:
            for pid in pids:
                extracted.append(
                    {
                        "day": current_day,
                        "periodId": pid,
                        "className": cname,
                        "subject": subj,
                        "room": rm,
                    }
                )

    return {
        "lessons": normalize_parsed_lessons(extracted, periods, default_subject),
        "source": "natural_lines",
    }


DEMO_SAMPLE_RESULT = {
    "teacherName": "林知夏",
    "defaultSubject": "数学",
    "source": "demo_sample",
    "lessons": [
        {"id": "les_1_morning_read", "day": 1, "periodId": "morning_read", "className": "高一(3)班", "subject": "早读巡班", "room": "致远楼 303", "weekType": "all", "memo": ""},
        {"id": "les_1_p1", "day": 1, "periodId": "p1", "className": "高一(3)班", "subject": "数学", "room": "致远楼 303", "weekType": "all", "memo": "函数的概念与图象"},
        {"id": "les_1_p3", "day": 1, "periodId": "p3", "className": "高一(5)班", "subject": "数学", "room": "致远楼 305", "weekType": "all", "memo": ""},
        {"id": "les_1_p6", "day": 1, "periodId": "p6", "className": "高一(8)班", "subject": "数学", "room": "博雅楼 202", "weekType": "all", "memo": ""},
        {"id": "les_2_p2", "day": 2, "periodId": "p2", "className": "高一(5)班", "subject": "数学", "room": "致远楼 305", "weekType": "all", "memo": ""},
        {"id": "les_2_p4", "day": 2, "periodId": "p4", "className": "高一(3)班", "subject": "数学", "room": "致远楼 303", "weekType": "all", "memo": ""},
        {"id": "les_2_p7", "day": 2, "periodId": "p7", "className": "数学教研组", "subject": "集体备课", "room": "行政楼 401", "weekType": "all", "memo": "期中命题研讨"},
        {"id": "les_2_p9", "day": 2, "periodId": "p9", "className": "高一(3)班", "subject": "晚自习答疑", "room": "致远楼 303", "weekType": "all", "memo": ""},
        {"id": "les_3_morning_read", "day": 3, "periodId": "morning_read", "className": "高一(5)班", "subject": "早读巡班", "room": "致远楼 305", "weekType": "all", "memo": ""},
        {"id": "les_3_p1", "day": 3, "periodId": "p1", "className": "高一(8)班", "subject": "数学", "room": "博雅楼 202", "weekType": "all", "memo": ""},
        {"id": "les_3_p2", "day": 3, "periodId": "p2", "className": "高一(3)班", "subject": "数学", "room": "致远楼 303", "weekType": "all", "memo": ""},
        {"id": "les_3_p5", "day": 3, "periodId": "p5", "className": "高一(5)班", "subject": "数学", "room": "致远楼 305", "weekType": "all", "memo": ""},
        {"id": "les_4_p2", "day": 4, "periodId": "p2", "className": "高一(8)班", "subject": "数学", "room": "博雅楼 202", "weekType": "all", "memo": ""},
        {"id": "les_4_p3", "day": 4, "periodId": "p3", "className": "高一(3)班", "subject": "数学", "room": "致远楼 303", "weekType": "all", "memo": ""},
        {"id": "les_4_p6", "day": 4, "periodId": "p6", "className": "高一(5)班", "subject": "数学", "room": "致远楼 305", "weekType": "all", "memo": ""},
        {"id": "les_4_p9", "day": 4, "periodId": "p9", "className": "高一(5)班", "subject": "晚自习答疑", "room": "致远楼 305", "weekType": "all", "memo": ""},
        {"id": "les_5_p1", "day": 5, "periodId": "p1", "className": "高一(5)班", "subject": "数学", "room": "致远楼 305", "weekType": "all", "memo": "收本周错题本"},
        {"id": "les_5_p3", "day": 5, "periodId": "p3", "className": "高一(8)班", "subject": "数学", "room": "博雅楼 202", "weekType": "all", "memo": "随堂小测"},
        {"id": "les_5_p5", "day": 5, "periodId": "p5", "className": "高一(3)班", "subject": "班会/周结", "room": "致远楼 303", "weekType": "all", "memo": ""},
    ],
}


def parse_timetable_image(
    image_base64: str,
    mime_type: str,
    periods: list[dict[str, Any]],
    default_subject: str = "",
    api_base: str = "",
    api_key: str = "",
    model: str = "",
    is_demo_sample: bool = False,
) -> dict[str, Any]:
    """Call OpenAI-compatible Vision LLM API (Qwen-VL / GPT-4o / Gemini / GLM-4V) to parse timetable image."""
    if is_demo_sample:
        return dict(DEMO_SAMPLE_RESULT)

    eff_key = (api_key or os.environ.get("VISION_API_KEY") or "").strip()
    eff_base = (
        api_base
        or os.environ.get("VISION_API_BASE")
        or "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).rstrip("/")
    eff_model = (
        model
        or os.environ.get("VISION_MODEL")
        or "qwen-vl-max-latest"
    ).strip()

    if not eff_key:
        return {
            "ok": False,
            "code": "NO_API_KEY",
            "message": "尚未配置视觉大模型 API Key。您可以在右侧填入通义千问/DeepSeek/OpenAI 兼容 Key 直接识别，或点击下方「一键复制 AI 提示词」配合豆包/Kimi 免费转换，也可以先点「试用示例课表照片」体验完整识别校对流程！",
            "prompt": build_ai_prompt(periods, default_subject),
        }

    clean_b64 = re.sub(r"^data:[^;]+;base64,", "", image_base64 or "").strip()
    data_uri = f"data:{mime_type or 'image/jpeg'};base64,{clean_b64}"
    prompt_text = build_ai_prompt(periods, default_subject)

    req_body = {
        "model": eff_model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri}},
                    {"type": "text", "text": prompt_text},
                ],
            }
        ],
    }

    endpoint = f"{eff_base}/chat/completions"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(req_body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {eff_key}",
            "User-Agent": "TeacherTimetablePWA/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=55) as resp:
            resp_json = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        err_detail = exc.read().decode("utf-8", errors="replace")[:400]
        return {
            "ok": False,
            "code": "UPSTREAM_HTTP_ERROR",
            "message": f"视觉模型接口返回错误 (HTTP {exc.code}): {err_detail}",
        }
    except Exception as exc:
        return {
            "ok": False,
            "code": "NETWORK_ERROR",
            "message": f"调用视觉模型接口失败：{exc}",
        }

    try:
        content = resp_json["choices"][0]["message"]["content"]
        if isinstance(content, list):
            content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
    except (KeyError, IndexError, TypeError):
        return {
            "ok": False,
            "code": "BAD_RESPONSE",
            "message": "模型返回格式异常，未能提取文本内容。",
        }

    parsed = parse_timetable_text(str(content), periods, default_subject)
    parsed["ok"] = True
    parsed["rawReply"] = str(content)
    return parsed
