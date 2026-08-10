"use strict";

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 18204;
const SESSION_ONE = "123e4567-e89b-42d3-a456-426614174000";
const SESSION_TWO = "01890f47-3d5b-4c2e-8a1f-123456789abc";
const ALLOWED_KEYS = ["environment", "event", "latency_ms", "route", "session_id", "status", "timestamp"];

function request(route, body, sessionId) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) };
    if (sessionId !== undefined) headers["X-Recursivo-Session-ID"] = sessionId;
    const req = http.request({ host: "127.0.0.1", port: PORT, path: route, method: "POST", headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await request("/api/predict", {}, SESSION_ONE);
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("activation server did not become healthy");
}

function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
}

function activatedSessions(records, environment) {
  return new Set(records.filter((record) =>
    record.event === "activation_result" &&
    record.status === "success" &&
    record.environment === environment &&
    ["/api/predict", "/api/verify"].includes(record.route)
  ).map((record) => record.session_id)).size;
}

async function main() {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "recursivo-activation-"));
  const eventsFile = path.join(runtime, "events.jsonl");
  const submissionsFile = path.join(runtime, "submissions.json");
  const child = spawn(process.execPath, [path.join(ROOT, "server.js"), String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      RECURSIVO_ENV: "test",
      RECURSIVO_EVENTS_FILE: eventsFile,
      RECURSIVO_SUBMISSIONS_FILE: submissionsFile,
      RECURSIVO_HOST: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });

  const fixture = { item: "Q157", fixture_marker: "payload-must-not-leak@example.com" };
  const verifyFixture = { simulator: "private-simulator-marker", predictions: [{ pid: "3", item: "Q157", answer: "I slightly favor program A" }] };
  try {
    await waitForServer();
    fs.writeFileSync(eventsFile, "");

    assert.equal((await request("/api/predict", fixture, SESSION_ONE)).status, 200);
    assert.equal((await request("/api/verify", verifyFixture, SESSION_ONE)).status, 200);
    assert.equal((await request("/api/predict", fixture, SESSION_TWO)).status, 200);
    assert.equal((await request("/api/predict", fixture)).status, 400);
    assert.equal((await request("/api/predict", fixture, SESSION_ONE.toUpperCase())).status, 400);
    assert.equal((await request("/api/predict", fixture, "123e4567-e89b-12d3-a456-426614174000")).status, 400);
    assert.equal((await request("/api/verify", { simulator: "invalid", predictions: [] }, SESSION_TWO)).status, 400);

    const records = fs.readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.equal(records.length, 3);
    assert.deepEqual(records.map((record) => record.route), ["/api/predict", "/api/verify", "/api/predict"]);
    for (const record of records) {
      assert.deepEqual(Object.keys(record).sort(), ALLOWED_KEYS);
      assert.equal(record.event, "activation_result");
      assert.equal(record.environment, "test");
      assert.equal(record.status, "success");
      assert(!Number.isNaN(Date.parse(record.timestamp)));
      assert.equal(new Date(record.timestamp).toISOString(), record.timestamp);
      assert(Number.isInteger(record.latency_ms) && record.latency_ms >= 0);
    }

    const serialized = JSON.stringify(records);
    for (const forbidden of ["fixture_marker", "payload-must-not-leak@example.com", "predictions", "answer", "private-simulator-marker", "email", "127.0.0.1"]) {
      assert(!serialized.includes(forbidden), `activation event leaked forbidden value: ${forbidden}`);
    }
    const productionActivations = activatedSessions(records, "production");
    const testActivations = activatedSessions(records, "test");
    assert.equal(productionActivations, 0);
    assert.equal(testActivations, 2);
    assert(!fs.existsSync(submissionsFile));
    console.log(`ACTIVATION-01 PASS: records=${records.length} test_activated_sessions=${testActivations} production_activated_sessions=${productionActivations} pii_fields=0`);
  } finally {
    await stop(child);
    if (stderr) process.stderr.write(stderr);
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
