// 닥터빌 제안서 생성기 AI 프록시 (Cloudflare Worker)
// - API 키는 Worker 시크릿(ANTHROPIC_API_KEY)에만 저장되고 브라우저로 내려가지 않습니다.
// - 허용된 사이트(ALLOWED_ORIGINS)에서 온 요청만 처리합니다.
// - ACCESS_CODE 시크릿을 등록하면 팀 접근 코드가 있어야 사용할 수 있습니다.

const DEFAULT_MODEL = "claude-sonnet-5-5";
const DEFAULT_ORIGINS = ["https://doctorville.github.io"];
const MAX_PROMPT = 40000;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowList = DEFAULT_ORIGINS.concat(String(env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean));
    const allowed = allowList.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : allowList[0],
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type,x-access-code",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
    const fail = (code, status) => json({ error: { code } }, status);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    const model = env.MODEL || DEFAULT_MODEL;

    if (url.pathname === "/health") return json({ ok: true, ready: !!env.ANTHROPIC_API_KEY, access: !!env.ACCESS_CODE, model });
    if (!allowed) return fail("forbidden_origin", 403);
    if (req.method !== "POST") return fail("not_found", 404);
    if (env.ACCESS_CODE && req.headers.get("x-access-code") !== env.ACCESS_CODE) return fail("access_code", 401);
    if (!env.ANTHROPIC_API_KEY) return fail("not_configured", 503);

    let body;
    try { body = await req.json(); } catch { return fail("bad_request", 400); }

    // 1) 요구사항 분석: Claude 응답을 스트리밍(SSE)으로 그대로 전달
    if (url.pathname === "/analyze") {
      const prompt = String(body.prompt || "");
      if (!prompt || prompt.length > MAX_PROMPT) return fail("bad_request", 400);
      const r = await callClaude(env, { model, max_tokens: 16000, stream: true, messages: [{ role: "user", content: prompt }] });
      if (!r.ok) return fail(mapStatus(r.status), r.status === 401 ? 503 : r.status);
      return new Response(r.body, { status: 200, headers: { ...cors, "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache" } });
    }

    // 2) 기관 최신 정보: Claude 웹 검색 도구로 찾아 JSON 요약
    if (url.pathname === "/research") {
      const org = String(body.org || "").trim().slice(0, 80);
      const type = String(body.type || "기관").trim().slice(0, 20);
      if (org.length < 2) return fail("bad_request", 400);
      const r = await callClaude(env, {
        model, max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } }],
        messages: [{ role: "user", content: researchPrompt(org, type) }],
      });
      if (!r.ok) return fail(mapStatus(r.status), r.status === 401 ? 503 : r.status);
      const data = await r.json();
      const blocks = data.content || [];
      const text = blocks.filter(b => b.type === "text").map(b => b.text).join("");
      const sources = [];
      for (const b of blocks) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const x of b.content) if (x && x.url && !sources.some(s => s.url === x.url)) sources.push({ url: x.url, title: x.title || "" });
        }
      }
      let out;
      try { out = parseLoose(text); } catch { return fail("parse", 502); }
      out.sources = sources.slice(0, 8);
      return json(out);
    }
    // 3) 참고 사이트 요약: 제목·설명·주요 색·폰트·본문 일부를 추출 (컨셉 적용용)
    if (url.pathname === "/digest") {
      const urls = (Array.isArray(body.urls) ? body.urls : []).map(u => String(u || "").trim()).filter(u => /^https?:\/\//i.test(u)).slice(0, 3);
      if (!urls.length) return fail("bad_request", 400);
      const sites = await Promise.all(urls.map(siteDigest));
      return json({ sites });
    }
    return fail("not_found", 404);
  },
};

function blockedHost(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return !h.includes(".") || /^(localhost|127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.(local|internal|localhost)$/.test(h) || h.startsWith("[");
  } catch { return true; }
}

async function getText(u, ms, max) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(u, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; DrVilleProposal/1.0)", "accept": "text/html,text/css,*/*;q=0.8" } });
    if (!r.ok) throw new Error("http " + r.status);
    if (blockedHost(r.url)) throw new Error("blocked");
    const t = await r.text();
    return { text: t.slice(0, max), url: r.url };
  } finally { clearTimeout(timer); }
}

function decodeEnt(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}

function metaContent(html, key) {
  const re = new RegExp("<meta[^>]+(?:name|property)=[\"']" + key + "[\"'][^>]*>", "i");
  const tag = (html.match(re) || [""])[0];
  return decodeEnt((tag.match(/content=["']([^"']*)/i) || [])[1] || "").trim();
}

function topColors(css) {
  const cnt = new Map();
  const add = h => { if (h !== "ffffff" && h !== "000000") cnt.set(h, (cnt.get(h) || 0) + 1); };
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { let h = m[1].toLowerCase(); if (h.length === 3) h = h.split("").map(c => c + c).join(""); add(h); }
  for (const m of css.matchAll(/rgba?\(\s*(\d{1,3})[,\s]+(\d{1,3})[,\s]+(\d{1,3})/gi)) add([m[1], m[2], m[3]].map(v => Math.min(255, +v).toString(16).padStart(2, "0")).join(""));
  return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([h, n]) => "#" + h + "(" + n + ")");
}

function topFonts(css) {
  const cnt = new Map();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    const f = m[1].split(",")[0].replace(/["']/g, "").trim();
    if (f && !/^(inherit|initial|unset|var\()/i.test(f)) cnt.set(f, (cnt.get(f) || 0) + 1);
  }
  for (const m of css.matchAll(/family=([^&:"')]+)/g)) { const f = decodeURIComponent(m[1]).replace(/\+/g, " "); cnt.set(f, (cnt.get(f) || 0) + 3); }
  return [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
}

async function siteDigest(u) {
  if (blockedHost(u)) return { url: u, error: "blocked" };
  try {
    const { text: html, url: final } = await getText(u, 8000, 600000);
    const title = decodeEnt((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "").trim().slice(0, 120);
    const desc = (metaContent(html, "description") || metaContent(html, "og:description")).slice(0, 200);
    const themeColor = metaContent(html, "theme-color").slice(0, 20);
    let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join("\n") + "\n" + [...html.matchAll(/style=["']([^"']*)["']/gi)].map(m => m[1]).join(";");
    const links = [...html.matchAll(/<link[^>]+>/gi)].map(m => m[0]).filter(t => /stylesheet/i.test(t)).map(t => (t.match(/href=["']([^"']+)/i) || [])[1]).filter(Boolean).slice(0, 4);
    for (const h of links) {
      try {
        const abs = new URL(decodeEnt(h), final).href;
        if (/fonts\.googleapis\.com/.test(abs)) { css += "\n/* " + abs + " */"; continue; }
        if (blockedHost(abs)) continue;
        css += "\n" + (await getText(abs, 6000, 400000)).text;
      } catch {}
    }
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ");
    return { url: final, title, desc, themeColor, colors: topColors(css), fonts: topFonts(css), text: decodeEnt(text).replace(/\s+/g, " ").trim().slice(0, 1500) };
  } catch {
    return { url: u, error: "fetch_failed" };
  }
}

function callClaude(env, payload) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function mapStatus(s) {
  return s === 429 ? "rate_limited" : s === 529 ? "overloaded" : s === 401 || s === 403 ? "not_configured" : s === 400 ? "bad_request" : "api_error";
}

function parseLoose(text) {
  let t = String(text || "").replace(/```(?:json)?/g, "");
  const a = t.indexOf("{"), z = t.lastIndexOf("}");
  if (a < 0 || z < a) throw new Error("parse");
  t = t.slice(a, z + 1);
  try { return JSON.parse(t); } catch { return JSON.parse(t.replace(/,\s*([}\]])/g, "$1")); }
}

function researchPrompt(name, type) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  return `당신은 의료 B2B 플랫폼 '닥터빌'의 제안 리서처입니다. 웹 검색으로 제안처 '${name}'(${type})의 최근 동향을 찾아 한국어로 요약하세요.
오늘 날짜: ${today}. 최근 6개월 이내 소식을 우선하고, 날짜를 확인할 수 없는 내용은 date를 빈 문자열로 두세요.
동명의 다른 기관 자료는 제외하고, 기관을 특정하기 어려우면 profile에 그 사실을 적으세요. 검색 결과에 없는 내용은 만들지 마세요.
닥터빌 서비스: 플랫폼 광고(배너·팝업·브랜드존·아카데미·서베이·EDM/SMS), 웹 세미나(웨비나·웹심포지엄·시리즈), 온/오프라인 컨퍼런스.
JSON만 출력하세요:
{"name":"확인된 정식 기관명","profile":"기관 개요 1~2문장, 100자 이내",
 "updates":[{"date":"YYYY.MM.DD","title":"소식 제목 40자 이내","summary":"핵심 내용 70자 이내","url":"출처 URL"}],
 "focus":["주력 제품·질환군·사업 분야 2~5개, 각 20자 이내"],
 "implications":["닥터빌 제안 요구사항에 반영할 만한 시사점 2~4개, 각 60자 이내 (예: 신제품 런칭 → 런칭 웹심포지엄)"],
 "keywords":["요구사항 작성용 키워드 3~6개"]}
updates는 3~6개로 작성하세요.`;
}
