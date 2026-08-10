"use strict";

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = 18206;
const SESSION = "123e4567-e89b-42d3-a456-426614174000";

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const headers = body === undefined ? {} : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), "X-Recursivo-Session-ID": SESSION };
    const req = http.request({ host: "127.0.0.1", port: PORT, path: route, method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => { let parsed = data; try { parsed = JSON.parse(data); } catch {} resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on("error", reject);
    req.end(payload);
  });
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, "server.js"), String(PORT)], { cwd: ROOT, env: { ...process.env, RECURSIVO_ENV: "test" }, stdio: ["ignore", "pipe", "pipe"] });
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { if ((await request("GET", "/health")).status === 200) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const info = await request("GET", "/api/scenario");
    assert.equal(info.status, 200);
    assert.equal(info.body.verified, false);
    const input = { topic: "AI automation will change work", agents: 24, rounds: 8, seed: 42 };
    const first = await request("POST", "/api/scenario/run", input);
    const second = await request("POST", "/api/scenario/run", input);
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, second.body);
    assert.equal(first.body.engine, "scenario-lab-local-v2");
    assert.equal(first.body.config.agents, 24);
    assert.equal(first.body.events_processed, 192);
    assert.equal(first.body.trajectory.length, 9);
    for (const mode of ["trust_game", "ultimatum_game"]) {
      const response = await request("POST", "/api/scenario/run", { mode, topic: "test", agents: 24, rounds: 8, seed: 42 });
      assert.equal(response.status, 200);
      assert.equal(response.body.config.mode, mode);
      assert.equal(response.body.events_processed, 192);
      assert(response.body.readout.metric);
      assert.equal(response.body.verified, false);
    }
    assert.match(first.body.reproducibility_hash, /^[0-9a-f]{64}$/);
    const invalid = await request("POST", "/api/scenario/run", { agents: 1, rounds: 8, seed: 42 });
    assert.equal(invalid.status, 400);
    const noSession = await new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port: PORT, path: "/api/scenario/run", method: "POST", headers: { "Content-Type": "application/json" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
      req.on("error", reject); req.end(JSON.stringify(input));
    });
    assert.equal(noSession, 400);
    console.log(`SCENARIO LAB PASS: events=${first.body.events_processed} trajectory=${first.body.trajectory.length} hash=${first.body.reproducibility_hash.slice(0, 12)}`);
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
