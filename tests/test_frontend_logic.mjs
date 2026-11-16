import assert from "node:assert/strict";
import {
  computeFocusState,
  createInitialSchedule,
  resolveDayLessons
} from "../web/js/data.js";
import {
  clientBuildIcs,
  clientBuildScriptableJs,
  clientParseText,
  decodeScheduleFromHash,
  encodeScheduleShareUrl
} from "../web/js/standalone.js";

// Polyfill window.location for share URL test in Node
globalThis.window = { location: { href: "https://wangluoyigithub.github.io/teacher-timetable/" } };

const schedule = createInitialSchedule();
const monday = new Date(2026, 10, 16, 8, 20, 0);

// 1. Morning 08:20 -> Ongoing p1, NOT switched to tomorrow
const morningFocus = computeFocusState(schedule, monday, 8 * 60 + 20);
assert.equal(morningFocus.switchedToTomorrow, false);
assert.equal(morningFocus.ongoing?.className, "高一(3)班");
assert.equal(morningFocus.ongoing?.remainMin, 30);

// 2. Evening 18:30 -> Automatically switches to Tuesday!
const afterSchoolFocus = computeFocusState(schedule, monday, 18 * 60 + 30);
assert.equal(afterSchoolFocus.switchedToTomorrow, true);
assert.equal(afterSchoolFocus.tomorrowLessons.length, 4);

// 3. Single-occurrence substitute override on Monday p2
schedule.overrides["2026-11-16__p2"] = {
  date: "2026-11-16",
  periodId: "p2",
  type: "substitute",
  className: "高一(8)班",
  subject: "数学",
  room: "202室",
  memo: "临时替课"
};
const resolvedMon = resolveDayLessons(schedule, monday);
assert.equal(resolvedMon.some((x) => x.periodId === "p2" && x.overrideType === "substitute"), true);
const nextMon = new Date(2026, 10, 23);
assert.equal(resolveDayLessons(schedule, nextMon).some((x) => x.periodId === "p2"), false);

// 4. Standalone client-side .ics, Scriptable JS, text parser, and URL hash roundtrip
const ics = clientBuildIcs(schedule, 15, 14);
assert.ok(ics.includes("BEGIN:VCALENDAR"));
assert.ok(ics.includes("TRIGGER:-PT15M"));
assert.ok(ics.includes("高一(3)班 · 数学"));

const widgetJs = clientBuildScriptableJs("https://wangluoyigithub.github.io/teacher-timetable", "LOCAL", schedule);
assert.ok(widgetJs.includes("明日预告"));
assert.ok(widgetJs.includes("Script.setWidget"));

const parsedText = clientParseText("周一 1-2节 高一(3)班 数学 致远楼303", schedule.periods, "数学");
assert.equal(parsedText.lessons.length, 2);

const shareUrl = await encodeScheduleShareUrl(schedule);
const hashPart = shareUrl.slice(shareUrl.indexOf("#"));
const decoded = await decodeScheduleFromHash(hashPart);
assert.equal(decoded.teacherName, schedule.teacherName);
assert.equal(decoded.lessons.length, schedule.lessons.length);

console.log("All frontend & standalone serverless tests passed!");
