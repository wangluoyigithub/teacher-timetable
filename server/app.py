#!/usr/bin/env python3
"""Lightweight, zero-dependency HTTP server for Teacher Timetable PWA.

Serves:
- Static PWA frontend (web/) with proper manifest & Service Worker headers
- 6-digit Sync Code cloud storage + revision snapshots (SQLite)
- Dynamic Apple Calendar subscription feed (/api/ics/<code>.ics)
- iOS Scriptable Home Screen Widget JSON & personalized JS (/api/widget/<code>.json & .js)
- Multimodal AI Vision timetable photo parser & text/TSV parser (/api/ocr/*)
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import posixpath
import random
import re
import sqlite3
import sys
import threading
import time
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server.ics_builder import build_ics_feed
from server.scriptable_template import build_scriptable_js, build_widget_payload
from server.vision_parser import (
    build_ai_prompt,
    parse_timetable_image,
    parse_timetable_text,
)

APP_VERSION = os.environ.get("APP_VERSION", "1.0.0")
WEB_DIR = ROOT_DIR / "web"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT_DIR / "data")))
DB_PATH = DATA_DIR / "timetable.db"

MAX_BODY_BYTES = 20 * 1024 * 1024  # 20 MB for iPhone high-res photos
SYNC_CODE_RE = re.compile(r"^[A-Za-z0-9]{4,16}$")

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("text/calendar", ".ics")


class TimetableStore:
    """Thread-safe SQLite store for 6-digit sync codes and schedule revisions."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS schedules (
                    sync_code TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS schedule_revisions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sync_code TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    saved_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_rev_code_time
                    ON schedule_revisions(sync_code, saved_at DESC);
                """
            )

    def generate_code(self, schedule: dict[str, Any]) -> tuple[str, int]:
        now_ms = int(time.time() * 1000)
        schedule = dict(schedule)
        schedule["updatedAt"] = now_ms
        payload_str = json.dumps(schedule, ensure_ascii=False)

        with self._lock, self._connect() as conn:
            for _ in range(50):
                code = f"{random.randint(100000, 999999)}"
                exists = conn.execute(
                    "SELECT 1 FROM schedules WHERE sync_code = ?", (code,)
                ).fetchone()
                if not exists:
                    conn.execute(
                        "INSERT INTO schedules (sync_code, payload_json, updated_at, created_at) VALUES (?, ?, ?, ?)",
                        (code, payload_str, now_ms, now_ms),
                    )
                    return code, now_ms
        raise RuntimeError("Unable to allocate unique sync code")

    def get(self, sync_code: str) -> tuple[dict[str, Any], int] | None:
        code = sync_code.upper()
        with self._lock, self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json, updated_at FROM schedules WHERE sync_code = ?",
                (code,),
            ).fetchone()
            if not row:
                return None
            return json.loads(row["payload_json"]), int(row["updated_at"])

    def put(self, sync_code: str, schedule: dict[str, Any]) -> int:
        code = sync_code.upper()
        now_ms = int(time.time() * 1000)
        schedule = dict(schedule)
        schedule["updatedAt"] = now_ms
        payload_str = json.dumps(schedule, ensure_ascii=False)

        with self._lock, self._connect() as conn:
            prev = conn.execute(
                "SELECT payload_json, updated_at FROM schedules WHERE sync_code = ?",
                (code,),
            ).fetchone()
            if prev and prev["payload_json"] != payload_str:
                conn.execute(
                    "INSERT INTO schedule_revisions (sync_code, payload_json, saved_at) VALUES (?, ?, ?)",
                    (code, prev["payload_json"], int(prev["updated_at"])),
                )
                # Keep latest 20 revisions per code
                conn.execute(
                    """
                    DELETE FROM schedule_revisions
                    WHERE sync_code = ? AND id NOT IN (
                        SELECT id FROM schedule_revisions
                        WHERE sync_code = ?
                        ORDER BY saved_at DESC, id DESC
                        LIMIT 20
                    )
                    """,
                    (code, code),
                )

            conn.execute(
                """
                INSERT INTO schedules (sync_code, payload_json, updated_at, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(sync_code) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (code, payload_str, now_ms, now_ms),
            )
        return now_ms

    def list_revisions(self, sync_code: str) -> list[dict[str, Any]]:
        code = sync_code.upper()
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, saved_at FROM schedule_revisions WHERE sync_code = ? ORDER BY saved_at DESC LIMIT 15",
                (code,),
            ).fetchall()
            return [{"id": r["id"], "savedAt": r["saved_at"]} for r in rows]


class TimetableRequestHandler(BaseHTTPRequestHandler):
    store: TimetableStore

    server_version = f"TeacherTimetable/{APP_VERSION}"

    def log_message(self, fmt: str, *args: Any) -> None:
        if os.environ.get("QUIET_LOGS") == "1":
            return
        sys.stderr.write(f"[{self.log_date_time_string()}] {fmt % args}\n")

    def _send_cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, status: int, data: dict[str, Any]) -> None:
        raw = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _send_text(
        self,
        status: int,
        text: str,
        content_type: str,
        filename: str | None = None,
    ) -> None:
        raw = text.encode("utf-8")
        self.send_response(status)
        self._send_cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-cache")
        if filename:
            self.send_header(
                "Content-Disposition", f'inline; filename="{filename}"'
            )
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json_body(self) -> dict[str, Any] | None:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length <= 0:
            return {}
        if length > MAX_BODY_BYTES:
            self._send_json(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                {"ok": False, "message": "上传图片或请求体积超过 20MB 限制"},
            )
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "message": "无效的 JSON 请求体"},
            )
            return None

    def _infer_base_url(self, query: dict[str, list[str]]) -> str:
        if "baseUrl" in query and query["baseUrl"]:
            return query["baseUrl"][0].rstrip("/")
        proto = self.headers.get("X-Forwarded-Proto", "http")
        host = self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "localhost:8780"
        return f"{proto}://{host}"

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        if path == "/api/health":
            self._send_json(HTTPStatus.OK, {"ok": True, "version": APP_VERSION})
            return

        if path == "/api/config":
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "version": APP_VERSION,
                    "hasServerVisionKey": bool(os.environ.get("VISION_API_KEY", "").strip()),
                    "defaultVisionBase": os.environ.get(
                        "VISION_API_BASE",
                        "https://dashscope.aliyuncs.com/compatible-mode/v1",
                    ),
                    "defaultVisionModel": os.environ.get(
                        "VISION_MODEL", "qwen-vl-max-latest"
                    ),
                },
            )
            return

        # Sync GET: /api/sync/<code> or /api/sync/<code>/revisions
        m_rev = re.match(r"^/api/sync/([A-Za-z0-9]{4,16})/revisions$", path)
        if m_rev:
            code = m_rev.group(1).upper()
            revs = self.store.list_revisions(code)
            self._send_json(HTTPStatus.OK, {"ok": True, "syncCode": code, "revisions": revs})
            return

        m_sync = re.match(r"^/api/sync/([A-Za-z0-9]{4,16})$", path)
        if m_sync:
            code = m_sync.group(1).upper()
            found = self.store.get(code)
            if not found:
                self._send_json(
                    HTTPStatus.NOT_FOUND,
                    {"ok": False, "message": f"未找到同步码 {code}，请确认后重试"},
                )
                return
            schedule, updated_at = found
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "syncCode": code,
                    "schedule": schedule,
                    "updatedAt": updated_at,
                },
            )
            return

        # Dynamic Apple Calendar .ics feed: /api/ics/<code>.ics
        m_ics = re.match(r"^/api/ics/([A-Za-z0-9]{4,16})\.ics$", path)
        if m_ics:
            code = m_ics.group(1).upper()
            found = self.store.get(code)
            if not found:
                self._send_text(
                    HTTPStatus.NOT_FOUND,
                    "Sync code not found\n",
                    "text/plain; charset=utf-8",
                )
                return
            schedule, _ = found
            alarm_param = query.get("alarm", [None])[0]
            alarm_min = int(alarm_param) if (alarm_param and alarm_param.isdigit()) else None
            ics_text = build_ics_feed(schedule, sync_code=code, alarm_minutes=alarm_min)
            self._send_text(
                HTTPStatus.OK,
                ics_text,
                "text/calendar; charset=utf-8",
                filename=f"teacher-timetable-{code}.ics",
            )
            return

        # iOS Scriptable Widget JSON: /api/widget/<code>.json
        m_wjson = re.match(r"^/api/widget/([A-Za-z0-9]{4,16})\.json$", path)
        if m_wjson:
            code = m_wjson.group(1).upper()
            found = self.store.get(code)
            if not found:
                self._send_json(
                    HTTPStatus.NOT_FOUND,
                    {"ok": False, "message": f"Sync code {code} not found"},
                )
                return
            schedule, _ = found
            payload = build_widget_payload(schedule, sync_code=code)
            self._send_json(HTTPStatus.OK, payload)
            return

        # iOS Scriptable Widget JS: /api/widget/<code>.js
        m_wjs = re.match(r"^/api/widget/([A-Za-z0-9]{4,16})\.js$", path)
        if m_wjs:
            code = m_wjs.group(1).upper()
            found = self.store.get(code)
            schedule = found[0] if found else {}
            base_url = self._infer_base_url(query)
            js_code = build_scriptable_js(base_url, code, fallback_schedule=schedule)
            self._send_text(
                HTTPStatus.OK,
                js_code,
                "application/javascript; charset=utf-8",
                filename=f"teacher-widget-{code}.js",
            )
            return

        # Serve static files from WEB_DIR
        self._serve_static(path)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        path = parsed.path
        body = self._read_json_body()
        if body is None:
            return

        if path == "/api/sync/create":
            schedule = body.get("schedule")
            if not isinstance(schedule, dict):
                self._send_json(
                    HTTPStatus.BAD_REQUEST,
                    {"ok": False, "message": "缺少有效的 schedule 数据"},
                )
                return
            code, updated_at = self.store.generate_code(schedule)
            self._send_json(
                HTTPStatus.OK,
                {"ok": True, "syncCode": code, "updatedAt": updated_at},
            )
            return

        if path == "/api/ics/export":
            schedule = body.get("schedule") or {}
            alarm_min = body.get("alarmMinutes")
            ics_text = build_ics_feed(
                schedule,
                sync_code=str(body.get("syncCode") or "LOCAL"),
                alarm_minutes=int(alarm_min) if alarm_min is not None else None,
            )
            self._send_text(
                HTTPStatus.OK,
                ics_text,
                "text/calendar; charset=utf-8",
                filename="teacher-timetable.ics",
            )
            return

        if path == "/api/widget/preview-script":
            schedule = body.get("schedule") or {}
            code = str(body.get("syncCode") or "LOCAL").upper()
            base_url = str(body.get("baseUrl") or "https://your-domain.example.com")
            js_code = build_scriptable_js(base_url, code, fallback_schedule=schedule)
            self._send_json(HTTPStatus.OK, {"ok": True, "script": js_code})
            return

        if path == "/api/ocr/parse":
            periods = body.get("periods") or []
            default_subj = str(body.get("defaultSubject") or "")
            result = parse_timetable_image(
                image_base64=str(body.get("imageBase64") or ""),
                mime_type=str(body.get("mimeType") or "image/jpeg"),
                periods=periods,
                default_subject=default_subj,
                api_base=str(body.get("apiBase") or ""),
                api_key=str(body.get("apiKey") or ""),
                model=str(body.get("model") or ""),
                is_demo_sample=bool(body.get("isDemoSample", False)),
            )
            if "ok" not in result:
                result["ok"] = True
            self._send_json(HTTPStatus.OK, result)
            return

        if path == "/api/ocr/parse-text":
            periods = body.get("periods") or []
            default_subj = str(body.get("defaultSubject") or "")
            raw_text = str(body.get("text") or "")
            if body.get("promptOnly"):
                self._send_json(
                    HTTPStatus.OK,
                    {"ok": True, "prompt": build_ai_prompt(periods, default_subj)},
                )
                return
            parsed_res = parse_timetable_text(raw_text, periods, default_subj)
            parsed_res["ok"] = True
            self._send_json(HTTPStatus.OK, parsed_res)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "message": "未知接口路径"})

    def do_PUT(self) -> None:
        parsed = urllib.parse.urlsplit(self.path)
        m_sync = re.match(r"^/api/sync/([A-Za-z0-9]{4,16})$", parsed.path)
        if not m_sync:
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "message": "无效的同步码路径"})
            return

        code = m_sync.group(1).upper()
        body = self._read_json_body()
        if body is None:
            return
        schedule = body.get("schedule")
        if not isinstance(schedule, dict):
            self._send_json(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "message": "缺少有效的 schedule 字段"},
            )
            return

        updated_at = self.store.put(code, schedule)
        self._send_json(
            HTTPStatus.OK,
            {"ok": True, "syncCode": code, "updatedAt": updated_at},
        )

    def _serve_static(self, raw_path: str) -> None:
        rel = posixpath.normpath(urllib.parse.unquote(raw_path)).lstrip("/")
        if not rel or rel == ".":
            rel = "index.html"

        target = (WEB_DIR / rel).resolve()
        if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
            # SPA fallback to index.html for root-like navigation
            if "." not in Path(rel).name:
                target = WEB_DIR / "index.html"
            else:
                self.send_error(HTTPStatus.NOT_FOUND, "File not found")
                return

        ctype, _ = mimetypes.guess_type(str(target))
        if not ctype:
            ctype = "application/octet-stream"
        if ctype.startswith("text/") or ctype in (
            "application/javascript",
            "application/json",
            "application/manifest+json",
        ):
            ctype += "; charset=utf-8"

        data = target.read_bytes()
        self.send_response(HTTPStatus.OK)
        self._send_cors()
        self.send_header("Content-Type", ctype)
        if target.name == "sw.js":
            self.send_header("Service-Worker-Allowed", "/")
            self.send_header("Cache-Control", "no-cache")
        elif target.name == "index.html":
            self.send_header("Cache-Control", "no-cache")
        else:
            self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def create_server(host: str = "0.0.0.0", port: int = 8780, db_path: Path = DB_PATH) -> ThreadingHTTPServer:
    store = TimetableStore(db_path)

    class BoundHandler(TimetableRequestHandler):
        pass

    BoundHandler.store = store
    return ThreadingHTTPServer((host, port), BoundHandler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Teacher Timetable PWA Server")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8780")))
    parser.add_argument("--db", default=str(DB_PATH))
    args = parser.parse_args()

    srv = create_server(args.host, args.port, Path(args.db))
    print(
        f"✨ 教师极简智能课程表服务已启动: http://{args.host}:{args.port} (v{APP_VERSION})",
        flush=True,
    )
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n正在关闭服务...", flush=True)
        srv.server_close()


if __name__ == "__main__":
    main()
