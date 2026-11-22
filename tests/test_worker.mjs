import assert from "node:assert/strict";
import { createInitialSchedule } from "../web/js/data.js";
import worker from "../worker/index.js";

function createMemoryKv() {
  const map = new Map();
  return {
    async get(key, type = "text") {
      if (!map.has(key)) return null;
      const val = map.get(key);
      return type === "json" ? JSON.parse(val) : val;
    },
    async put(key, value) {
      map.set(key, String(value));
    }
  };
}

const env = {
  TIMETABLE_KV: createMemoryKv(),
  ASSETS: {
    async fetch(req) {
      return new Response(`STATIC:${new URL(req.url).pathname}`, { status: 200 });
    }
  }
};

const BASE = "https://teacher-timetable.example.workers.dev";

// 1. Health & static asset passthrough
const healthRes = await worker.fetch(new Request(`${BASE}/api/health`), env);
assert.equal(healthRes.status, 200);
const health = await healthRes.json();
assert.equal(health.ok, true);
assert.equal(health.kvBound, true);

const staticRes = await worker.fetch(new Request(`${BASE}/index.html`), env);
assert.equal(await staticRes.text(), "STATIC:/index.html");

// 2. Create 6-digit sync code
const schedule = createInitialSchedule();
const createRes = await worker.fetch(
  new Request(`${BASE}/api/sync/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule })
  }),
  env
);
assert.equal(createRes.status, 200);
const created = await createRes.json();
assert.equal(created.ok, true);
assert.match(created.syncCode, /^\d{6}$/);
const code = created.syncCode;

// 3. GET /api/ics/<code>.ics — bounded to 20 weeks
const icsRes1 = await worker.fetch(new Request(`${BASE}/api/ics/${code}.ics?alarm=10`), env);
assert.equal(icsRes1.status, 200);
assert.ok(icsRes1.headers.get("Content-Type").includes("text/calendar"));
const icsText1 = await icsRes1.text();
assert.ok(icsText1.includes("TRIGGER:-PT10M"));
assert.ok(icsText1.includes("BEGIN:VTIMEZONE"));
assert.ok(icsText1.includes("DTSTART;TZID=Asia/Shanghai:20260907T"));
assert.equal(icsText1.includes("DTSTART;TZID=Asia/Shanghai:202702"), false);
assert.equal(icsText1.includes("DTSTART;TZID=Asia/Shanghai:202703"), false);

// 4. Swap a class via PUT /api/sync/<code> -> dynamic .ics immediately reflects the change!
schedule.overrides["2026-11-16__p2"] = {
  date: "2026-11-16",
  periodId: "p2",
  type: "swap",
  className: "高二(9)班",
  subject: "物理",
  room: "实验楼 101",
  memo: "临时调课"
};
const putRes = await worker.fetch(
  new Request(`${BASE}/api/sync/${code}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule })
  }),
  env
);
assert.equal(putRes.status, 200);

const icsRes2 = await worker.fetch(new Request(`${BASE}/api/ics/${code}.ics`), env);
const icsText2 = await icsRes2.text();
assert.ok(icsText2.includes("高二(9)班 · 物理 [调课]"));

// 5. Revisions & Scriptable Widget JSON/JS
const revRes = await worker.fetch(new Request(`${BASE}/api/sync/${code}/revisions`), env);
const revData = await revRes.json();
assert.equal(revData.revisions.length, 2);

const wJsonRes = await worker.fetch(new Request(`${BASE}/api/widget/${code}.json`), env);
const wJson = await wJsonRes.json();
assert.equal(wJson.syncCode, code);
assert.ok(Array.isArray(wJson.palette));

const wJsRes = await worker.fetch(new Request(`${BASE}/api/widget/${code}.js`), env);
const wJs = await wJsRes.text();
assert.ok(wJs.includes(`/api/widget/${code}.json`));

// 6. Helpful 503 message when KV is not bound yet
const noKvRes = await worker.fetch(
  new Request(`${BASE}/api/sync/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ schedule })
  }),
  {}
);
assert.equal(noKvRes.status, 503);
const noKvJson = await noKvRes.json();
assert.ok(noKvJson.message.includes("TIMETABLE_KV"));

console.log("All Cloudflare Worker backend tests passed!");
