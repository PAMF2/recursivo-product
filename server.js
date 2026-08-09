"use strict";
// Recursivo - the verification layer for human-behavior simulation.
// Node stdlib server (zero deps): serves the site + the real product API.
//   GET  /                 landing (site/index.html)   ·  static files under site/
//   GET  /health           status + majority baseline
//   GET  /api/leaderboard  multi-model leaderboard (full 2,058, honest by item/segment)
//   GET  /api/items        held-out item catalog (id + options)
//   GET  /api/predict      usage + verified overall
//   POST /api/verify   {simulator, predictions:[{pid,item,answer}]}  honest report, by segment
//   POST /api/submit   {simulator, predictions, contact?}           verify + record on leaderboard
//   POST /api/predict  {item?|question?, options?}                  our verified prediction
//   POST /api/early-access {email, note?}                           join the waitlist
// Bare routes (/leaderboard, /verify, ...) also work for compatibility.
// Run: node server.js [port]   (default 8020)

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SITE = path.join(ROOT, "site");
const DATA = path.join(ROOT, "data");
const RESULTS = path.join(ROOT, "results");
const SUBMISSIONS = path.join(RESULTS, "submissions.json");
const WAITLIST = path.join(DATA, "waitlist.jsonl");
const API_KEY = process.env.RECURSIVO_API_KEY || "";

const readJSON = (p, fallback) => {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
};
const GROUND_TRUTH = readJSON(path.join(DATA, "ground_truth_wave4.json"), {});
const LEADERBOARD = readJSON(path.join(RESULTS, "leaderboard.json"), { rows: [] });
const SEGMENTS = readJSON(path.join(DATA, "segments.json"), {});
const PREDICT_PANEL = readJSON(path.join(DATA, "predict_panel.json"), {});

// ---------- metrics (mirrors bench/metrics.py) ----------
const norm = (s) => String(s).trim().toLowerCase();

function canonicalLabel(value, options) {
  const normalized = norm(value);
  if (options.some((option) => norm(option) === normalized)) return value;
  const number = Number(String(value).trim());
  if (!Number.isFinite(number)) return value;
  const matches = options.filter((option) => Number.isFinite(Number(option)) && Number(option) === number);
  return matches.length === 1 ? matches[0] : value;
}

function totalVariation(a, b, opts) {
  const ca = {}, cb = {};
  for (const x of a) ca[x] = (ca[x] || 0) + 1;
  for (const x of b) cb[x] = (cb[x] || 0) + 1;
  const na = a.length || 1, nb = b.length || 1;
  let s = 0;
  for (const o of opts) s += Math.abs((ca[o] || 0) / na - (cb[o] || 0) / nb);
  return 0.5 * s;
}

function majorityBaseline(gt) {
  let hit = 0, tot = 0;
  for (const gi of Object.values(gt)) {
    const labels = Object.values(gi.human || {});
    if (!labels.length) continue;
    const c = {}; let mx = 0;
    for (const l of labels) { c[l] = (c[l] || 0) + 1; if (c[l] > mx) mx = c[l]; }
    hit += mx; tot += labels.length;
  }
  return tot ? Math.round((hit / tot) * 1000) / 1000 : null;
}
const MAJORITY = majorityBaseline(GROUND_TRUTH);

function matchedBaseline(predictions, gt) {
  const majority = {};
  for (const [item, gi] of Object.entries(gt)) {
    const counts = {};
    for (const label of Object.values(gi.human || {})) counts[norm(label)] = (counts[norm(label)] || 0) + 1;
    const labels = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (labels.length) majority[item] = labels[0][0];
  }
  let hit = 0, total = 0;
  for (const prediction of predictions) {
    const item = prediction.item, pid = String(prediction.pid), gi = gt[item];
    if (!gi || majority[item] === undefined || gi.human[pid] == null) continue;
    total += 1;
    if (majority[item] === norm(gi.human[pid])) hit += 1;
  }
  return total ? Math.round((hit / total) * 1000) / 1000 : null;
}

function score(predictions, gt, segments) {
  let hits = 0, tot = 0;
  const byItem = {}, dist = {}, bySeg = { age: {}, gender: {} };
  for (const p of predictions) {
    const item = p.item, pid = String(p.pid), rawAnswer = p.answer;
    const gi = gt[item];
    if (!gi) continue;
    const human = gi.human[pid];
    if (human == null) continue;
    const answer = rawAnswer == null ? rawAnswer : canonicalLabel(rawAnswer, gi.opts);
    tot += 1;
    const ok = (answer != null && norm(answer) === norm(human)) ? 1 : 0;
    hits += ok;
    const bi = (byItem[item] = byItem[item] || [0, 0]); bi[0] += ok; bi[1] += 1;
    const d = (dist[item] = dist[item] || { h: [], p: [], opts: gi.opts });
    d.h.push(human);
    if (answer != null) d.p.push(String(answer));
    if (segments && segments[pid]) {
      for (const dim of ["age", "gender"]) {
        const g = segments[pid][dim];
        if (g) { const sgg = (bySeg[dim][g] = bySeg[dim][g] || [0, 0]); sgg[0] += ok; sgg[1] += 1; }
      }
    }
  }
  const tvs = [];
  for (const d of Object.values(dist)) if (d.p.length) tvs.push(totalVariation(d.h, d.p, d.opts));
  const group = tvs.length ? 1 - tvs.reduce((a, b) => a + b, 0) / tvs.length : null;
  const perItem = {};
  for (const [k, v] of Object.entries(byItem)) if (v[1]) perItem[k] = Math.round((v[0] / v[1]) * 1000) / 1000;
  const worst = Object.entries(perItem).sort((a, b) => a[1] - b[1]).slice(0, 5);
  const segOut = {};
  for (const [dim, gs] of Object.entries(bySeg)) {
    const acc = {};
    for (const [g, v] of Object.entries(gs)) if (v[1] >= 20) acc[g] = Math.round((v[0] / v[1]) * 1000) / 1000;
    const vals = Object.values(acc);
    if (vals.length) segOut[dim] = { accuracy: acc, gap: Math.round((Math.max(...vals) - Math.min(...vals)) * 1000) / 1000 };
  }
  const r3 = (x) => (x == null ? null : Math.round(x * 1000) / 1000);
  return {
    n_predictions: tot,
    individual_accuracy: tot ? r3(hits / tot) : null,
    group_level: r3(group),
    by_segment: segOut,
    per_item_accuracy: perItem,
    worst_items: worst,
  };
}

function rank(individual, matched) {
  const rows = (LEADERBOARD.rows || []).filter((r) => r.individual != null);
  const beats = rows.filter((r) => individual != null && individual > r.individual + 1e-9).map((r) => r.simulator);
  const reference = matched == null ? MAJORITY : matched;
  const beatsReference = individual != null && reference != null && individual > reference;
  return {
    beats_matched_baseline: beatsReference,
    matched_baseline: matched,
    majority_baseline: MAJORITY,
    beats,
    verdict: beatsReference
      ? "above the matched baseline on these pairs"
      : "BELOW the matched baseline - simulation adds nothing on these pairs",
  };
}

function predict(body) {
  const item = body.item;
  const entry = item ? PREDICT_PANEL[item] : null;
  if (entry) {
    const v = entry.verified || {};
    return {
      model: (PREDICT_PANEL._overall || {}).model || "Recursivo Predict v1",
      item,
      options: entry.options,
      n_verified: entry.n_aligned,
      predicted_distribution: entry.predicted_distribution,
      human_distribution: entry.human_distribution,
      verified_accuracy: { individual: v.individual, group_level: v.group_level, by_segment: { age: v.by_age || {} } },
      honest_caveat: "individual prediction is low; this is a group-level distribution with verified accuracy",
      thesis: "recursion only compounds where the outcome is verifiable",
    };
  }
  return {
    status: "requires model runtime",
    question: body.question || item || null,
    options: body.options || null,
    methodology: "we condition a persona model on the respondent, sample the answer distribution, then VERIFY it against held-out real answers (individual exact-match + group-level 1-TV). Without ground truth for a new question we return the distribution UNVERIFIED, and say so.",
    known_items: Object.keys(PREDICT_PANEL).filter((k) => k !== "_overall").length,
    verified_overall: (PREDICT_PANEL._overall || {}).verified || null,
  };
}

// ---------- http helpers ----------
const CT = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" };

function sendJSON(res, code, obj) {
  const b = Buffer.from(JSON.stringify(obj, null, 1));
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Content-Length": b.length });
  res.end(b);
}
function sendFile(res, file) {
  fs.readFile(file, (err, b) => {
    if (err) return sendJSON(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": CT[path.extname(file)] || "application/octet-stream", "Content-Length": b.length });
    res.end(b);
  });
}
const validEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()) && e.length < 254;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname.replace(/\/+$/, "") || "/";
  const route = p.replace(/^\/api/, ""); // /api/x and /x both map to x

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-API-Key" });
    return res.end();
  }

  if (req.method === "GET") {
    if (p === "/") return sendFile(res, path.join(SITE, "index.html"));
    if (route === "/deck") return sendFile(res, path.join(SITE, "deck.html"));
    if (route === "/health") return sendJSON(res, 200, { status: "ok", items: Object.keys(GROUND_TRUTH).length, majority_baseline: MAJORITY, segments: !!Object.keys(SEGMENTS).length });
    if (route === "/leaderboard") return sendJSON(res, 200, LEADERBOARD);
    if (route === "/items") return sendJSON(res, 200, Object.entries(GROUND_TRUTH).map(([k, v]) => ({ item: k, options: v.opts })));
    if (route === "/predict") return sendJSON(res, 200, { usage: "POST /api/predict {item?|question?, options?}", overall: PREDICT_PANEL._overall || {}, known_items: Object.keys(PREDICT_PANEL).filter((k) => k !== "_overall").length });
    // static under site/
    const rel = p.replace(/^\/+/, "");
    if (rel) {
      const cand = path.resolve(SITE, rel);
      if (cand.startsWith(path.resolve(SITE)) && fs.existsSync(cand) && fs.statSync(cand).isFile()) return sendFile(res, cand);
    }
    return sendJSON(res, 404, { routes: ["/", "/deck", "/health", "/api/leaderboard", "/api/items", "/api/predict", "POST /api/verify", "POST /api/submit", "POST /api/early-access"] });
  }

  if (req.method === "POST") {
    const known = ["/verify", "/submit", "/predict", "/early-access"];
    if (!known.includes(route)) return sendJSON(res, 404, { error: "POST /api/verify, /api/predict, /api/submit or /api/early-access" });
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { error: "bad json: " + e.message }); }

    if (route === "/early-access") {
      const email = (body.email || "").trim().toLowerCase();
      if (!validEmail(email)) return sendJSON(res, 400, { ok: false, error: "valid email required" });
      const rec = { ts: Date.now(), email, note: (body.note || "").slice(0, 500) };
      fs.appendFileSync(WAITLIST, JSON.stringify(rec) + "\n");
      let position = 1;
      try { position = fs.readFileSync(WAITLIST, "utf8").trim().split("\n").filter(Boolean).length; } catch {}
      return sendJSON(res, 200, { ok: true, email, position });
    }

    if (API_KEY && req.headers["x-api-key"] !== API_KEY) return sendJSON(res, 401, { error: "X-API-Key required" });

    if (route === "/predict") return sendJSON(res, 200, predict(body));

    const preds = body.predictions || [];
    if (!Array.isArray(preds) || !preds.length) return sendJSON(res, 400, { error: "predictions: [{pid,item,answer}] required" });
    const rep = score(preds, GROUND_TRUTH, SEGMENTS);
    rep.simulator = body.simulator || "unnamed";
    rep.matched_baseline = matchedBaseline(preds, GROUND_TRUTH);
    rep.ranking = rank(rep.individual_accuracy, rep.matched_baseline);
    rep.thesis = "recursion only compounds where the outcome is verifiable";
    if (route === "/submit") {
      const subs = readJSON(SUBMISSIONS, []);
      subs.push({ ts: Date.now(), simulator: rep.simulator, contact: body.contact || null, individual: rep.individual_accuracy, group_level: rep.group_level, n: rep.n_predictions });
      fs.writeFileSync(SUBMISSIONS, JSON.stringify(subs, null, 1));
      rep.submitted = true; rep.submission_count = subs.length;
    }
    return sendJSON(res, 200, rep);
  }

  return sendJSON(res, 405, { error: "method not allowed" });
});

const PORT = parseInt(process.argv[2] || process.env.PORT || "8020", 10);
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Recursivo server on http://0.0.0.0:${PORT}  items=${Object.keys(GROUND_TRUTH).length} majority=${MAJORITY}`);
});
