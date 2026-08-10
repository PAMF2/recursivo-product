"use strict";

const assert = require("assert");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const PORT = 18205;
const FAILURE_PORT = 18206;
const SESSION = "123e4567-e89b-42d3-a456-426614174000";

function request(port, method, route, body, session = SESSION) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const headers = body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) };
    if (session && method === "POST") headers["X-Recursivo-Session-ID"] = session;
    const req = http.request({ host: "127.0.0.1", port, path: route, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, text: data, body: (() => { try { return JSON.parse(data); } catch { return null; } })() }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await request(port, "GET", "/health", undefined, null)).status === 200) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server ${port} did not become healthy`);
}

function stop(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once("exit", resolve);
    child.kill("SIGTERM");
  });
}

function start(port, eventsFile, submissionsFile) {
  return spawn(process.execPath, [path.join(ROOT, "server.js"), String(port)], {
    cwd: ROOT,
    env: { ...process.env, RECURSIVO_ENV: "test", RECURSIVO_HOST: "127.0.0.1", RECURSIVO_EVENTS_FILE: eventsFile, RECURSIVO_SUBMISSIONS_FILE: submissionsFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

class Element {
  constructor(id, tag = "div") { this.id = id; this.tagName = tag.toUpperCase(); this.value = ""; this.textContent = ""; this.disabled = false; this.dataset = {}; this.children = []; this.listeners = {}; this.fieldset = null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  appendChild(child) { this.children.push(child); if (this.tagName === "SELECT" && !this.value) this.value = child.value; }
  querySelector(selector) { return selector === "fieldset" ? this.fieldset : null; }
  async dispatch(name) { const event = { preventDefault() {} }; for (const fn of this.listeners[name] || []) await fn(event); }
}

function fixtureDocument() {
  const ids = ["predictForm", "verifyForm", "predictItem", "verifyItem", "verifyAnswer", "predictStatus", "verifyStatus", "verifySimulator", "verifyParticipant"];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element(id, id.includes("Item") || id === "verifyAnswer" ? "select" : id.includes("Form") ? "form" : "div")]));
  elements.predictForm.fieldset = new Element("predictFieldset", "fieldset");
  elements.verifyForm.fieldset = new Element("verifyFieldset", "fieldset");
  elements.predictForm.fieldset.disabled = true;
  elements.verifyForm.fieldset.disabled = true;
  elements.verifySimulator.value = "<img src=x onerror=alert(1)>";
  elements.verifyParticipant.value = "3";
  return { elements, document: { getElementById: (id) => elements[id] || null, createElement: (tag) => new Element("", tag) } };
}

async function runClient(baseUrl) {
  const source = fs.readFileSync(path.join(ROOT, "site", "result-path.js"), "utf8");
  const { elements, document } = fixtureDocument();
  const calls = [];
  let mode = "real";
  const interceptedFetch = async (route, options) => {
    calls.push({ route, options });
    if (mode === "network") throw new Error("offline");
    if (mode === "malformed") return { ok: true, status: 200, json: async () => ({ unexpected: true }) };
    if (mode === "http") return { ok: false, status: 400, json: async () => ({ error: "unknown participant for item" }) };
    return fetch(baseUrl + route, options);
  };
  vm.runInNewContext(source, { document, fetch: interceptedFetch, crypto: { randomUUID: () => SESSION }, globalThis: { crypto: { randomUUID: () => SESSION } } });
  for (let attempt = 0; attempt < 30 && elements.predictForm.fieldset.disabled; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls.filter((call) => call.route === "/api/items").length, 1);
  assert.equal(elements.predictForm.fieldset.disabled, false);

  elements.predictItem.value = "Q157";
  await elements.predictForm.dispatch("submit");
  assert.match(elements.predictStatus.textContent, /Predicted distribution/);
  assert.match(elements.predictStatus.textContent, /Caveat:/);
  assert.equal(calls.filter((call) => call.route === "/api/predict").length, 1);
  assert.equal(calls.find((call) => call.route === "/api/predict").options.headers["X-Recursivo-Session-ID"], SESSION);

  elements.verifyItem.value = "Q157";
  await elements.verifyItem.dispatch("change");
  elements.verifyAnswer.value = "I slightly favor program A";
  await elements.verifyForm.dispatch("submit");
  assert.match(elements.verifyStatus.textContent, /Individual accuracy:/);
  assert.match(elements.verifyStatus.textContent, /Ranking:/);
  assert(!elements.verifyStatus.textContent.includes("<img"));
  assert.equal(calls.filter((call) => call.route === "/api/verify").length, 1);

  mode = "http";
  elements.verifyParticipant.value = "unknown-participant";
  await elements.verifyForm.dispatch("submit");
  assert.match(elements.verifyStatus.textContent, /unknown participant/i);
  assert.equal(calls.filter((call) => call.route === "/api/verify").length, 2);
  elements.verifyParticipant.value = "3";

  elements.predictItem.value = "";
  await elements.predictForm.dispatch("submit");
  assert.match(elements.predictStatus.textContent, /Choose an item/);
  assert.equal(calls.filter((call) => call.route === "/api/predict").length, 1);

  mode = "network";
  elements.predictItem.value = "Q157";
  await elements.predictForm.dispatch("submit");
  assert.match(elements.predictStatus.textContent, /Network error/);

  mode = "malformed";
  await elements.predictForm.dispatch("submit");
  assert.match(elements.predictStatus.textContent, /incomplete prediction/);

  let release;
  mode = "network";
  const before = calls.length;
  const originalFetch = interceptedFetch;
  // Disabled fieldsets make a second submit a no-op while the first request is pending.
  mode = "real";
  const pending = new Promise((resolve) => { release = resolve; });
  const slowFetch = async (route, options) => route === "/api/predict" ? (await pending, {
    ok: true,
    status: 200,
    json: async () => ({
      item: "Q157",
      predicted_distribution: { "I slightly favor program A": 1 },
      verified_accuracy: { individual: 1, group_level: 1 },
      honest_caveat: "Synthetic response for duplicate-submit acceptance.",
    }),
  }) : originalFetch(route, options);
  const slowContext = fixtureDocument();
  const slowCalls = [];
  vm.runInNewContext(source, { document: slowContext.document, fetch: async (route, options) => { slowCalls.push(route); return slowFetch(route, options); }, crypto: { randomUUID: () => SESSION }, globalThis: { crypto: { randomUUID: () => SESSION } } });
  for (let attempt = 0; attempt < 30 && slowContext.elements.predictForm.fieldset.disabled; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  slowContext.elements.predictItem.value = "Q157";
  const first = slowContext.elements.predictForm.dispatch("submit");
  await new Promise((resolve) => setTimeout(resolve, 10));
  await slowContext.elements.predictForm.dispatch("submit");
  assert.equal(slowCalls.filter((route) => route === "/api/predict").length, 1);
  release();
  await first;
  assert(before > 0);
}

async function main() {
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "recursivo-result-path-"));
  const eventsFile = path.join(runtime, "events.jsonl");
  const submissionsFile = path.join(runtime, "submissions.json");
  const child = start(PORT, eventsFile, submissionsFile);
  let failureChild;
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitForHealth(PORT);
    const landing = await request(PORT, "GET", "/", undefined, null);
    const client = await request(PORT, "GET", "/result-path.js", undefined, null);
    assert.equal(landing.status, 200);
    assert.equal(client.status, 200);
    for (const expected of ["predictForm", "verifyForm", "predictItem", "verifySimulator", "verifyParticipant", "verifyAnswer", 'role="status"', 'aria-live="polite"', 'src="/result-path.js" defer']) assert(landing.text.includes(expected), `landing missing ${expected}`);
    assert(!client.text.includes("innerHTML"));
    assert(client.text.includes("textContent"));

    fs.writeFileSync(eventsFile, "");
    await runClient(`http://127.0.0.1:${PORT}`);
    const activations = fs.readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
    assert.equal(activations.length, 2);
    assert.deepEqual(activations.map((event) => event.route), ["/api/predict", "/api/verify"]);
    assert(activations.every((event) => Object.keys(event).sort().join() === "environment,event,latency_ms,route,session_id,status,timestamp"));

    const badEvents = path.join(runtime, "events-directory");
    fs.mkdirSync(badEvents);
    failureChild = start(FAILURE_PORT, badEvents, path.join(runtime, "failure-submissions.json"));
    failureChild.stderr.on("data", (chunk) => { stderr += chunk; });
    await waitForHealth(FAILURE_PORT);
    const predict = await request(FAILURE_PORT, "POST", "/api/predict", { item: "Q157" });
    const verify = await request(FAILURE_PORT, "POST", "/api/verify", { simulator: "fault", predictions: [{ pid: "3", item: "Q157", answer: "I slightly favor program A" }] });
    assert.equal(predict.status, 503);
    assert.deepEqual(predict.body, { error: "result temporarily unavailable" });
    assert.equal(verify.status, 503);
    assert.deepEqual(verify.body, { error: "result temporarily unavailable" });
    assert.equal((await request(FAILURE_PORT, "GET", "/health", undefined, null)).status, 200);
    assert(fs.statSync(badEvents).isDirectory());
    console.log("RESULT-PATH-01 PASS: forms=2 ui_api_requests=3 activations=2 fault_responses=2");
  } finally {
    await stop(failureChild);
    await stop(child);
    if (stderr) process.stderr.write(stderr);
    fs.rmSync(runtime, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
