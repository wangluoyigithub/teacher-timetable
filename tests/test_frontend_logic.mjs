import assert from "node:assert/strict";
import {
  computeFocusState,
  createInitialSchedule,
  resolveDayLessons
} from "../web/js/data.js";

const schedule = createInitialSchedule();

// Monday 2026-11-16
const monday = new Date(2026, 10, 16, 8, 20, 0);

// 1. Morning 08:20 -> Ongoing p1 (08:05-08:50), NOT switched to tomorrow
const morningFocus = computeFocusState(schedule, monday, 8 * 60 + 20);
assert.equal(morningFocus.switchedToTomorrow, false);
assert.equal(morningFocus.ongoing?.className, "高一(3)班");
assert.equal(morningFocus.ongoing?.remainMin, 30);
assert.equal(morningFocus.remainingToday.length, 3); // p1, p3, p6

// 2. Evening 18:30 -> All Monday classes finished (last on Monday is p6 15:55) -> Automatically switches to Tuesday!
const afterSchoolFocus = computeFocusState(schedule, monday, 18 * 60 + 30);
assert.equal(afterSchoolFocus.switchedToTomorrow, true);
assert.equal(afterSchoolFocus.tomorrowLessons.length, 4); // Tuesday p2, p4, p7, p9
assert.equal(afterSchoolFocus.tomorrowLessons[0].className, "高一(5)班");

// 3. Saturday 2026-11-21 (0 classes today) -> Immediately switches to tomorrow!
const saturday = new Date(2026, 10, 21, 9, 0, 0);
const satFocus = computeFocusState(schedule, saturday, 9 * 60);
assert.equal(satFocus.todayLessons.length, 0);
assert.equal(satFocus.switchedToTomorrow, true);

// 4. Single-occurrence substitute override on Monday p2
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
// Next Monday 2026-11-23 remains unaffected
const nextMon = new Date(2026, 10, 23);
assert.equal(resolveDayLessons(schedule, nextMon).some((x) => x.periodId === "p2"), false);

console.log("Frontend schedule & Today->Tomorrow state tests passed!");
