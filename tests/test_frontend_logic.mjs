import assert from "node:assert/strict";
import {
  DEFAULT_PERIODS_40,
  addSmartPeriod,
  cascadeSectionTimes,
  computeFocusState,
  createInitialSchedule,
  ensurePeriodsCoverLessons,
  generateCustomPeriods,
  resolveDayLessons,
  toChineseNum
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

// 5. Dynamic unlimited period management (adding 9th, 10th, 11th, 12th lessons + custom generator)
assert.equal(toChineseNum(8), "八");
assert.equal(toChineseNum(11), "十一");
assert.equal(toChineseNum(12), "十二");

let pList = structuredClone(DEFAULT_PERIODS_40);
const added9 = addSmartPeriod(pList, { kind: "regular" });
assert.equal(added9.created.label, "第九节");
assert.equal(added9.created.id, "p9");
// Ensure trailing '课后服务' was pushed after 第九节 without overlap
const afterSvc = added9.periods.find((p) => p.id === "after_service");
assert.ok(afterSvc.start > added9.created.end);

const custom13 = generateCustomPeriods({
  hasMorningRead: true,
  amCount: 5,
  pmCount: 5,
  eveningCount: 3,
  durationMin: 45
});
assert.equal(custom13.length, 14); // 1 早读 + 10 常规课 + 3 晚自习
assert.equal(custom13.find((p) => p.id === "p10")?.label, "第十节");

const cascaded = cascadeSectionTimes(custom13, 10);
assert.equal(cascaded.length, 14);

// 6. Auto-expanding periods when importing a 12-period timetable onto a 7-period schedule
const shortSched = createInitialSchedule();
shortSched.periods = shortSched.periods.filter((p) => ["p1", "p2", "p3", "p4", "p5", "p6", "p7"].includes(p.id));
const parsed12 = clientParseText("周三 第十一节 高二(1)班 数学 401\n周四 12节 高二(2)班 数学 402", shortSched.periods, "数学");
assert.equal(parsed12.lessons.length, 2);
assert.equal(parsed12.lessons[0].periodId, "p11");
assert.equal(parsed12.lessons[1].periodId, "p12");
ensurePeriodsCoverLessons(shortSched, parsed12.lessons);
assert.ok(shortSched.periods.some((p) => p.id === "p11" && p.label === "第十一节"));
assert.ok(shortSched.periods.some((p) => p.id === "p12" && p.label === "第十二节"));

const shareUrl = await encodeScheduleShareUrl(schedule);
const hashPart = shareUrl.slice(shareUrl.indexOf("#"));
const decoded = await decodeScheduleFromHash(hashPart);
assert.equal(decoded.teacherName, schedule.teacherName);
assert.equal(decoded.lessons.length, schedule.lessons.length);

console.log("All frontend, dynamic period & standalone serverless tests passed!");
