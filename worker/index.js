/**
 * 知时课表 · Cloudflare Workers Full-Stack Backend + Static Assets Entry
 *
 * Provides:
 * - Static PWA frontend (web/) via Cloudflare Workers Assets (env.ASSETS)
 * - 6-digit Sync Code cloud storage + revision history via Cloudflare KV (env.TIMETABLE_KV)
 * - Dynamic Apple Calendar subscription feed (/api/ics/<code>.ics) — auto-updates when you swap classes!
 * - iOS Scriptable Home Screen Widget JSON & personalized JS (/api/widget/<code>.json & .js)
 * - Timetable text/AI vision parser (/api/ocr/parse & /api/ocr/parse-text)
 */

import { CLASS_PALETTES } from "../web/js/data.js";
import {
  DEMO_SAMPLE_RESULT,
  clientBuildAiPrompt,
  clientBuildIcs,
  clientBuildScriptableJs,
  clientParseImageDirect,
  clientParseText
} from "../web/js/standalone.js";

const APP_VERSION = "1.3.2";
const MAX_REVISIONS = 20;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
}

function textResp(text, contentType, status = 200, filename = null) {
  const headers = {
    ...CORS_HEADERS,
    "Content-Type": contentType,
    "Cache-Control": "no-cache, no-store, must-revalidate"
  };
  if (filename) {
    headers["Content-Disposition"] = `inline; filename="${filename}"`;
  }
  return new Response(text, { status, headers });
}

function missingKvResp() {
  return jsonResp(
    {
      ok: false,
      message:
        "尚未绑定 Cloudflare KV（变量名：TIMETABLE_KV），请在 Cloudflare Worker 设置 → Bindings 中绑定后重试"
    },
    503
  );
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function kvGetSchedule(kv, code) {
  const raw = await kv.get(`sched:${code}`, "json");
  if (!raw || typeof raw !== "object" || !raw.schedule) return null;
  return raw;
}

async function kvSaveSchedule(kv, code, schedule) {
  const updatedAt = Date.now();
  const payload = { schedule, updatedAt };
  await kv.put(`sched:${code}`, JSON.stringify(payload));

  // Keep latest 20 revision snapshots
  const prevRevs = (await kv.get(`rev:${code}`, "json")) || [];
  const nextRevs = [
    {
      id: updatedAt,
      createdAt: updatedAt,
      teacherName: schedule.teacherName || "",
      lessonCount: Array.isArray(schedule.lessons) ? schedule.lessons.length : 0,
      overrideCount:
        schedule.overrides && typeof schedule.overrides === "object"
          ? Object.keys(schedule.overrides).length
          : 0
    },
    ...(Array.isArray(prevRevs) ? prevRevs : [])
  ].slice(0, MAX_REVISIONS);
  await kv.put(`rev:${code}`, JSON.stringify(nextRevs));

  return updatedAt;
}

async function kvGenerateCode(kv, schedule) {
  for (let i = 0; i < 40; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await kv.get(`sched:${code}`);
    if (!existing) {
      const updatedAt = await kvSaveSchedule(kv, code, schedule);
      return { code, updatedAt };
    }
  }
  // Fallback 8-digit code
  const code = String(Math.floor(10000000 + Math.random() * 90000000));
  const updatedAt = await kvSaveSchedule(kv, code, schedule);
  return { code, updatedAt };
}

function buildPaletteExport() {
  return CLASS_PALETTES.map((p) => ({
    bgLight: p.bgLight,
    bgDark: p.bgDark,
    accent: p.bar,
    textLight: p.inkLight,
    textDark: p.inkDark
  }));
}

async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Health & Config
  if (path === "/api/health" && (method === "GET" || method === "HEAD")) {
    const body =
      method === "HEAD"
        ? null
        : JSON.stringify({
            ok: true,
            version: APP_VERSION,
            runtime: "cloudflare-workers",
            kvBound: Boolean(env.TIMETABLE_KV)
          });
    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  }

  if (path === "/api/config" && method === "GET") {
    return jsonResp({
      ok: true,
      version: APP_VERSION,
      runtime: "cloudflare-workers",
      kvBound: Boolean(env.TIMETABLE_KV),
      hasServerVisionKey: Boolean(env.VISION_API_KEY && String(env.VISION_API_KEY).trim()),
      defaultVisionBase:
        env.VISION_API_BASE || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      defaultVisionModel: env.VISION_MODEL || "qwen-vl-max-latest"
    });
  }

  // POST /api/sync/create
  if (path === "/api/sync/create" && method === "POST") {
    if (!env.TIMETABLE_KV) return missingKvResp();
    const body = await readJsonBody(request);
    if (!body || typeof body.schedule !== "object" || !body.schedule) {
      return jsonResp({ ok: false, message: "缺少有效的 schedule 数据" }, 400);
    }
    const { code, updatedAt } = await kvGenerateCode(env.TIMETABLE_KV, body.schedule);
    return jsonResp({ ok: true, syncCode: code, updatedAt });
  }

  // GET /api/sync/<code>/revisions
  const mRev = path.match(/^\/api\/sync\/([A-Za-z0-9]{4,16})\/revisions$/);
  if (mRev && method === "GET") {
    if (!env.TIMETABLE_KV) return missingKvResp();
    const code = mRev[1].toUpperCase();
    const revisions = (await env.TIMETABLE_KV.get(`rev:${code}`, "json")) || [];
    return jsonResp({ ok: true, syncCode: code, revisions });
  }

  // GET / PUT /api/sync/<code>
  const mSync = path.match(/^\/api\/sync\/([A-Za-z0-9]{4,16})$/);
  if (mSync) {
    if (!env.TIMETABLE_KV) return missingKvResp();
    const code = mSync[1].toUpperCase();

    if (method === "GET") {
      const found = await kvGetSchedule(env.TIMETABLE_KV, code);
      if (!found) {
        return jsonResp({ ok: false, message: `未找到同步码 ${code}，请确认后重试` }, 404);
      }
      return jsonResp({
        ok: true,
        syncCode: code,
        schedule: found.schedule,
        updatedAt: found.updatedAt
      });
    }

    if (method === "PUT") {
      const body = await readJsonBody(request);
      if (!body || typeof body.schedule !== "object" || !body.schedule) {
        return jsonResp({ ok: false, message: "缺少有效的 schedule 字段" }, 400);
      }
      const updatedAt = await kvSaveSchedule(env.TIMETABLE_KV, code, body.schedule);
      return jsonResp({ ok: true, syncCode: code, updatedAt });
    }
  }

  // GET /api/ics/<code>.ics — Dynamic Apple Calendar subscription feed
  const mIcs = path.match(/^\/api\/ics\/([A-Za-z0-9]{4,16})\.ics$/);
  if (mIcs && (method === "GET" || method === "HEAD")) {
    if (!env.TIMETABLE_KV) return missingKvResp();
    const code = mIcs[1].toUpperCase();
    const found = await kvGetSchedule(env.TIMETABLE_KV, code);
    if (!found) {
      return textResp("Sync code not found\n", "text/plain; charset=utf-8", 404);
    }
    const alarmParam = url.searchParams.get("alarm");
    const alarmMin =
      alarmParam !== null && /^\d+$/.test(alarmParam)
        ? parseInt(alarmParam, 10)
        : Number(found.schedule.reminderMinutes ?? 15);
    const icsText = clientBuildIcs(found.schedule, alarmMin);
    if (method === "HEAD") {
      return textResp("", "text/calendar; charset=utf-8", 200, `teacher-timetable-${code}.ics`);
    }
    return textResp(icsText, "text/calendar; charset=utf-8", 200, `teacher-timetable-${code}.ics`);
  }

  // POST /api/ics/export
  if (path === "/api/ics/export" && method === "POST") {
    const body = await readJsonBody(request);
    if (!body || typeof body.schedule !== "object") {
      return jsonResp({ ok: false, message: "缺少有效的 schedule 数据" }, 400);
    }
    const alarmMin =
      body.alarmMinutes !== undefined && body.alarmMinutes !== null
        ? Number(body.alarmMinutes)
        : Number(body.schedule.reminderMinutes ?? 15);
    const icsText = clientBuildIcs(body.schedule, alarmMin);
    return textResp(icsText, "text/calendar; charset=utf-8", 200, "teacher-timetable.ics");
  }

  // GET /api/widget/<code>.json
  const mWjson = path.match(/^\/api\/widget\/([A-Za-z0-9]{4,16})\.json$/);
  if (mWjson && method === "GET") {
    if (!env.TIMETABLE_KV) return missingKvResp();
    const code = mWjson[1].toUpperCase();
    const found = await kvGetSchedule(env.TIMETABLE_KV, code);
    if (!found) {
      return jsonResp({ ok: false, message: `Sync code ${code} not found` }, 404);
    }
    return jsonResp({
      syncCode: code,
      palette: buildPaletteExport(),
      schedule: found.schedule
    });
  }

  // GET /api/widget/<code>.js
  const mWjs = path.match(/^\/api\/widget\/([A-Za-z0-9]{4,16})\.js$/);
  if (mWjs && method === "GET") {
    if (!env.TIMETABLE_KV) return missingKvResp();
    const code = mWjs[1].toUpperCase();
    const found = await kvGetSchedule(env.TIMETABLE_KV, code);
    const baseUrl = url.searchParams.get("baseUrl") || url.origin;
    const jsCode = clientBuildScriptableJs(baseUrl, code, found?.schedule || {});
    return textResp(
      jsCode,
      "application/javascript; charset=utf-8",
      200,
      `teacher-widget-${code}.js`
    );
  }

  // POST /api/widget/preview-script
  if (path === "/api/widget/preview-script" && method === "POST") {
    const body = await readJsonBody(request);
    if (!body) return jsonResp({ ok: false, message: "无效请求体" }, 400);
    const code = String(body.syncCode || "LOCAL").toUpperCase();
    const baseUrl = String(body.baseUrl || url.origin);
    const jsCode = clientBuildScriptableJs(baseUrl, code, body.schedule || {});
    return jsonResp({ ok: true, script: jsCode });
  }

  // POST /api/ocr/parse
  if (path === "/api/ocr/parse" && method === "POST") {
    const body = await readJsonBody(request);
    if (!body) return jsonResp({ ok: false, message: "无效请求体" }, 400);
    if (body.isDemoSample) {
      return jsonResp({ ok: true, ...DEMO_SAMPLE_RESULT });
    }
    const apiKey = String(body.apiKey || env.VISION_API_KEY || "").trim();
    const apiBase = String(
      body.apiBase || env.VISION_API_BASE || "https://dashscope.aliyuncs.com/compatible-mode/v1"
    ).trim();
    const model = String(body.model || env.VISION_MODEL || "qwen-vl-max-latest").trim();

    if (!apiKey) {
      return jsonResp({
        ok: false,
        needsApiKey: true,
        source: "needs_config",
        message: "尚未配置多模态视觉 API Key。可填入 API Key 或使用「AI 对话零门槛导入 / 表格粘贴」。",
        aiPrompt: clientBuildAiPrompt(body.periods || [], body.defaultSubject || "")
      });
    }

    try {
      const result = await clientParseImageDirect({
        imageBase64: String(body.imageBase64 || ""),
        mimeType: String(body.mimeType || "image/jpeg"),
        periods: body.periods || [],
        defaultSubject: String(body.defaultSubject || ""),
        apiBase,
        apiKey,
        model
      });
      return jsonResp({ ok: true, ...result });
    } catch (err) {
      return jsonResp({
        ok: false,
        message: `视觉识别调用失败：${err?.message || String(err)}`,
        aiPrompt: clientBuildAiPrompt(body.periods || [], body.defaultSubject || "")
      });
    }
  }

  // POST /api/ocr/parse-text
  if (path === "/api/ocr/parse-text" && method === "POST") {
    const body = await readJsonBody(request);
    if (!body) return jsonResp({ ok: false, message: "无效请求体" }, 400);
    const periods = body.periods || [];
    const defaultSubject = String(body.defaultSubject || "");
    if (body.promptOnly) {
      return jsonResp({ ok: true, prompt: clientBuildAiPrompt(periods, defaultSubject) });
    }
    const parsed = clientParseText(String(body.text || ""), periods, defaultSubject);
    return jsonResp({ ok: true, ...parsed });
  }

  return jsonResp({ ok: false, message: "未知接口路径" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Teacher Timetable Worker is running.", { status: 200 });
  }
};
