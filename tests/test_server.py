"""Automated test suite for Teacher Timetable PWA backend, ICS feed, Scriptable widget, and OCR parsers."""

from __future__ import annotations

import datetime as dt
import json
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

from server.app import create_server
from server.ics_builder import build_ics_feed, resolve_day_lessons
from server.vision_parser import DEMO_SAMPLE_RESULT, parse_timetable_text


SAMPLE_PERIODS = [
    {"id": "morning_read", "num": "早", "label": "早读", "section": "morning_read", "start": "07:30", "end": "07:55"},
    {"id": "p1", "num": "1", "label": "第一节", "section": "am", "start": "08:05", "end": "08:50"},
    {"id": "p2", "num": "2", "label": "第二节", "section": "am", "start": "09:00", "end": "09:45"},
    {"id": "p3", "num": "3", "label": "第三节", "section": "am", "start": "10:05", "end": "10:50"},
    {"id": "p5", "num": "5", "label": "第五节", "section": "pm", "start": "14:15", "end": "15:00"},
    {"id": "p9", "num": "晚1", "label": "晚自习一", "section": "evening", "start": "19:00", "end": "19:50"},
]


class TestTeacherTimetable(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        db_path = Path(self.tmpdir.name) / "test.db"
        self.httpd = create_server("127.0.0.1", 0, db_path)
        self.port = self.httpd.server_address[1]
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmpdir.cleanup()

    def _req(self, path: str, method: str = "GET", payload: dict | None = None):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        req = urllib.request.Request(f"{self.base_url}{path}", data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, dict(resp.headers), resp.read()

    def test_pwa_static_and_headers(self) -> None:
        status, headers, body = self._req("/")
        self.assertEqual(status, 200)
        self.assertIn("知时课表", body.decode("utf-8"))

        status_sw, headers_sw, _ = self._req("/sw.js")
        self.assertEqual(status_sw, 200)
        self.assertEqual(headers_sw.get("Service-Worker-Allowed"), "/")

        status_mf, headers_mf, _ = self._req("/manifest.webmanifest")
        self.assertEqual(status_mf, 200)
        self.assertIn("application/manifest+json", headers_mf.get("Content-Type", ""))

    def test_sync_code_and_revisions_and_ics_widget(self) -> None:
        schedule = {
            "teacherName": "测试林老师",
            "defaultSubject": "数学",
            "semesterStart": "2026-09-07",
            "reminderMinutes": 15,
            "periods": SAMPLE_PERIODS,
            "classColors": {"高一(3)班": 0, "高一(5)班": 1},
            "lessons": [
                {
                    "id": "les_1_p1",
                    "day": 1,
                    "periodId": "p1",
                    "className": "高一(3)班",
                    "subject": "数学",
                    "room": "303室",
                    "weekType": "all",
                    "memo": "收周末卷子",
                }
            ],
            "overrides": {
                "2026-11-16__p2": {
                    "date": "2026-11-16",
                    "periodId": "p2",
                    "type": "substitute",
                    "className": "高一(5)班",
                    "subject": "数学",
                    "room": "305室",
                    "memo": "替王老师代课",
                }
            },
        }

        status, _, raw = self._req("/api/sync/create", "POST", {"schedule": schedule})
        self.assertEqual(status, 200)
        created = json.loads(raw.decode("utf-8"))
        self.assertTrue(created["ok"])
        code = created["syncCode"]
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

        # Update once to verify revision archiving
        schedule["teacherName"] = "林知夏老师"
        status_put, _, _ = self._req(f"/api/sync/{code}", "PUT", {"schedule": schedule})
        self.assertEqual(status_put, 200)

        _, _, raw_rev = self._req(f"/api/sync/{code}/revisions")
        revs = json.loads(raw_rev.decode("utf-8"))
        self.assertEqual(len(revs["revisions"]), 1)

        # Verify dynamic Apple Calendar ICS feed
        status_ics, headers_ics, raw_ics = self._req(f"/api/ics/{code}.ics?alarm=10")
        self.assertEqual(status_ics, 200)
        self.assertIn("text/calendar", headers_ics.get("Content-Type", ""))
        ics_str = raw_ics.decode("utf-8")
        # Unfold RFC 5545 folded lines before substring assertions
        ics_unfolded = ics_str.replace("\r\n ", "")
        self.assertIn("BEGIN:VCALENDAR", ics_unfolded)
        self.assertIn("TRIGGER:-PT10M", ics_unfolded)
        self.assertIn("高一(3)班 · 数学", ics_unfolded)
        self.assertIn("收周末卷子", ics_unfolded)
        self.assertIn("[代课]", ics_unfolded)

        # Verify Scriptable Widget JSON & JS endpoints
        status_wj, _, raw_wj = self._req(f"/api/widget/{code}.json")
        self.assertEqual(status_wj, 200)
        wj = json.loads(raw_wj.decode("utf-8"))
        self.assertEqual(wj["syncCode"], code)

        status_js, _, raw_js = self._req(f"/api/widget/{code}.js?baseUrl=https://demo.school.edu")
        self.assertEqual(status_js, 200)
        js_text = raw_js.decode("utf-8")
        self.assertIn("https://demo.school.edu", js_text)
        self.assertIn("明日预告", js_text)
        self.assertIn("Script.setWidget", js_text)

    def test_single_day_cancel_override(self) -> None:
        monday = dt.date(2026, 11, 16)  # ISO weekday = 1
        next_monday = dt.date(2026, 11, 23)
        schedule = {
            "periods": SAMPLE_PERIODS,
            "lessons": [{"id": "les_1_p1", "day": 1, "periodId": "p1", "className": "高一(3)班", "subject": "数学"}],
            "overrides": {
                "2026-11-16__p1": {"date": "2026-11-16", "periodId": "p1", "type": "cancel"}
            },
        }
        self.assertEqual(len(resolve_day_lessons(schedule, monday)), 0)
        self.assertEqual(len(resolve_day_lessons(schedule, next_monday)), 1)

        ics_out = build_ics_feed(schedule, past_days=0, future_days=10, reference_date=monday)
        self.assertNotIn("20261116T080500", ics_out)
        self.assertIn("20261123T080500", ics_out)

    def test_ocr_demo_and_text_parsers(self) -> None:
        # 1. Demo photo OCR endpoint
        _, _, raw_ocr = self._req(
            "/api/ocr/parse",
            "POST",
            {"isDemoSample": True, "periods": SAMPLE_PERIODS, "defaultSubject": "数学"},
        )
        res_ocr = json.loads(raw_ocr.decode("utf-8"))
        self.assertTrue(res_ocr["ok"])
        self.assertEqual(len(res_ocr["lessons"]), len(DEMO_SAMPLE_RESULT["lessons"]))

        # 2. Natural Chinese line with 1-2连堂 expansion
        natural = "周一 1-2节 高一(3)班 数学 致远楼303\n周三 早读 高一(5)班 早读 致远楼305"
        parsed_nat = parse_timetable_text(natural, SAMPLE_PERIODS, "数学")
        self.assertEqual(len(parsed_nat["lessons"]), 3)

        # 3. Excel TSV table paste
        tsv = "节次\t星期一\t星期二\n第一节\t高一(3)班 数学 303室\t-\n第二节\t\t高一(5)班 数学 305室"
        parsed_tsv = parse_timetable_text(tsv, SAMPLE_PERIODS, "数学")
        self.assertEqual(len(parsed_tsv["lessons"]), 2)


if __name__ == "__main__":
    unittest.main()
