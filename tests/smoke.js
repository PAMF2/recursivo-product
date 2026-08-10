"use strict";

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const port = 18202;
const protectedPort = 18203;
const groundTruth = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ground_truth_wave4.json"), "utf8"));

function request(method, route, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const headers = body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) };
    if (options.apiKey) headers["X-API-Key"] = options.apiKey;
    const req = http.request({ host: "127.0.0.1", port: options.port || port, path: route, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function waitForHealth(targetPort = port) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = await request("GET", "/health", undefined, { port: targetPort });
      if (result.status === 200) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`product server on ${targetPort} did not become healthy`);
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
}

function independentScores(predictions) {
  let hits = 0;
  const byItem = new Map();
  for (const prediction of predictions) {
    const truth = groundTruth[prediction.item].human[String(prediction.pid)];
    if (prediction.answer.trim().toLowerCase() === truth.trim().toLowerCase()) hits += 1;
    if (!byItem.has(prediction.item)) byItem.set(prediction.item, []);
    byItem.get(prediction.item).push({ truth, answer: prediction.answer });
  }
  let tvSum = 0;
  for (const [item, pairs] of byItem) {
    let distance = 0;
    for (const option of groundTruth[item].opts) {
      const humanShare = pairs.filter((pair) => pair.truth === option).length / pairs.length;
      const predictedShare = pairs.filter((pair) => pair.answer === option).length / pairs.length;
      distance += Math.abs(humanShare - predictedShare);
    }
    tvSum += distance / 2;
  }
  const majorityByItem = {};
  for (const item of byItem.keys()) {
    const counts = {};
    for (const answer of Object.values(groundTruth[item].human)) counts[answer] = (counts[answer] || 0) + 1;
    majorityByItem[item] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  const baselineHits = predictions.filter((prediction) => majorityByItem[prediction.item] === groundTruth[prediction.item].human[String(prediction.pid)]).length;
  const rounded = (value) => Math.round(value * 1000) / 1000;
  return { individual: rounded(hits / predictions.length), group: rounded(1 - tvSum / byItem.size), baseline: rounded(baselineHits / predictions.length) };
}

async function main() {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "recursivo-smoke-"));
  const submissionsFile = path.join(runtime, "submissions.json");
  const eventsFile = path.join(runtime, "events.jsonl");
  const child = spawn(process.execPath, [path.join(ROOT, "server.js"), String(port)], {
    cwd: ROOT,
    env: { ...process.env, RECURSIVO_SUBMISSIONS_FILE: submissionsFile, RECURSIVO_EVENTS_FILE: eventsFile, RECURSIVO_API_KEY: "", RECURSIVO_HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let protectedChild;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const health = await waitForHealth();
    assert.equal(health.body.status, "ok");
    assert.equal(health.body.items, 46);
    const landing = await request("GET", "/");
    assert.equal(landing.status, 200);
    assert.match(landing.body, /Recursivo/i);

    const itemIds = Object.keys(groundTruth).slice(0, 2);
    const fixture = itemIds.flatMap((item) => Object.keys(groundTruth[item].human).slice(0, 2).map((pid, index) => ({
      pid,
      item,
      answer: index === 0 ? groundTruth[item].human[pid] : groundTruth[item].opts.find((option) => option !== groundTruth[item].human[pid]),
    })));
    const expected = independentScores(fixture);
    const cohortItems = [...new Set(fixture.map((entry) => entry.item))].sort();
    const cohortParticipants = new Set(fixture.map((entry) => String(entry.pid))).size;

    const submission = { simulator: "smoke-simulator", source_id: "smoke-source-v1", predictions: fixture, contact: "must-not-persist@example.com" };
    assert(!fs.existsSync(submissionsFile));
    assert(!fs.existsSync(eventsFile));
    const unavailable = await request("POST", "/api/submit", submission);
    assert.equal(unavailable.status, 503);
    assert.deepEqual(unavailable.body, { error: "submissions unavailable: RECURSIVO_API_KEY not configured" });
    assert(!fs.existsSync(submissionsFile));
    assert(!fs.existsSync(eventsFile));

    const predict = await request("POST", "/api/predict", { item: itemIds[0] });
    assert.equal(predict.status, 200);
    assert.equal(predict.body.item, itemIds[0]);
    assert(predict.body.predicted_distribution);

    const verify = await request("POST", "/api/verify", { simulator: "smoke-test", predictions: fixture });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.individual_accuracy, expected.individual);
    assert.equal(verify.body.group_level, expected.group);
    assert.equal(verify.body.matched_baseline, expected.baseline);
    assert.equal(verify.body.n_predictions, fixture.length);

    const protectedSubmissionsFile = path.join(runtime, "protected-submissions.json");
    const protectedEventsFile = path.join(runtime, "protected-events.jsonl");
    protectedChild = spawn(process.execPath, [path.join(ROOT, "server.js"), String(protectedPort)], {
      cwd: ROOT,
      env: { ...process.env, RECURSIVO_SUBMISSIONS_FILE: protectedSubmissionsFile, RECURSIVO_EVENTS_FILE: protectedEventsFile, RECURSIVO_API_KEY: " secret ", RECURSIVO_HOST: "127.0.0.1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForHealth(protectedPort);
    assert.equal((await request("POST", "/api/submit", submission, { port: protectedPort })).status, 401);
    assert.equal((await request("POST", "/api/submit", submission, { port: protectedPort, apiKey: "wrong" })).status, 401);
    assert(!fs.existsSync(protectedSubmissionsFile));
    assert(!fs.existsSync(protectedEventsFile));

    assert.equal((await request("POST", "/api/predict", { item: itemIds[0] }, { port: protectedPort })).status, 200);
    assert.equal((await request("POST", "/api/verify", { simulator: "smoke-test", predictions: fixture }, { port: protectedPort })).status, 200);

    const first = await request("POST", "/api/submit", submission, { port: protectedPort, apiKey: "secret" });
    assert.equal(first.status, 200);
    assert.equal(first.body.replayed, false);
    assert.equal(first.body.result.individual_accuracy, expected.individual);
    assert.equal(first.body.result.group_level_1_minus_tv, expected.group);
    assert.equal(first.body.result.matched_baseline, expected.baseline);
    assert.deepEqual(first.body.cohort.item_ids, cohortItems);
    assert.equal(first.body.cohort.unique_participant_count, cohortParticipants);
    assert.equal(first.body.cohort.scored_pair_count, fixture.length);

    const replay = await request("POST", "/api/submit", submission, { port: protectedPort, apiKey: "secret" });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.receipt_id, first.body.receipt_id);
    assert.equal(replay.body.reproducibility_hash, first.body.reproducibility_hash);
    assert.equal(replay.body.created_at, first.body.created_at);
    assert.deepEqual(replay.body.result, first.body.result);
    const ledger = JSON.parse(fs.readFileSync(protectedSubmissionsFile, "utf8"));
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].contact, undefined);

    const leaderboard = await request("GET", "/api/leaderboard", undefined, { port: protectedPort });
    assert.equal(leaderboard.status, 200);
    assert.equal(leaderboard.body.submitted_results.length, 1);
    assert.equal(leaderboard.body.submitted_results[0].ranked, false);
    assert.match(leaderboard.body.submitted_results[0].label, /partial cohort, not ranked/);
    assert(!leaderboard.body.rows.some((row) => row.receipt_hash === first.body.reproducibility_hash));

    const invalidCases = [
      { ...submission, predictions: [fixture[0], fixture[0]] },
      { ...submission, predictions: [{ ...fixture[0], item: "UNKNOWN" }] },
      { ...submission, predictions: [{ ...fixture[0], pid: "unknown-pid" }] },
      { ...submission, predictions: [{ ...fixture[0], answer: "not an option" }] },
      { source_id: submission.source_id, predictions: fixture },
      { simulator: submission.simulator, predictions: fixture },
    ];
    const beforeInvalidSubmissions = fs.readFileSync(protectedSubmissionsFile, "utf8");
    const beforeInvalidEvents = fs.readFileSync(protectedEventsFile, "utf8");
    for (const invalid of invalidCases) {
      assert.equal((await request("POST", "/api/submit", invalid, { port: protectedPort, apiKey: "secret" })).status, 400);
    }
    assert.equal(fs.readFileSync(protectedSubmissionsFile, "utf8"), beforeInvalidSubmissions);
    assert.equal(fs.readFileSync(protectedEventsFile, "utf8"), beforeInvalidEvents);

    const publicEvents = fs.readFileSync(eventsFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(publicEvents.map((event) => event.event), ["predict_result", "verify_result"]);
    const events = fs.readFileSync(protectedEventsFile, "utf8").trim().split("\n").map(JSON.parse);
    assert.deepEqual(events.map((event) => event.event), ["predict_result", "verify_result", "submit_result", "submit_result"]);
    const serializedEvents = JSON.stringify(events);
    for (const forbidden of ["predictions", "answer", "email", "contact", submission.simulator, submission.source_id, ...fixture.map((entry) => entry.answer)]) {
      assert(!serializedEvents.includes(forbidden), `event leaked forbidden value: ${forbidden}`);
    }
    assert.equal(events.filter((event) => event.receipt_hash === first.body.reproducibility_hash).length, 2);

    fs.writeSync(1, `PRODUCT SMOKE PASS: health=${health.body.items} items, submit=${fixture.length} pairs, receipt=${first.body.receipt_id.slice(0, 12)}, events=${events.length}\n`);
  } finally {
    if (protectedChild) await stop(protectedChild);
    await stop(child);
    if (stderr) process.stderr.write(stderr);
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
