"use strict";

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const port = 18203;
const groundTruth = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ground_truth_wave4.json"), "utf8"));

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const isObject = body && typeof body === "object";
    const payload = body === undefined ? "" : isObject ? JSON.stringify(body) : String(body);
    const headers = body === undefined ? {} : {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    };
    const req = http.request({ host: "127.0.0.1", port, path: route, method, headers }, (res) => {
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

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const result = await request("GET", "/health");
      if (result.status === 200) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not become healthy");
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, "server.js"), String(port)], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const results = [];
  const check = async (name, fn) => {
    try {
      await fn();
      results.push(`${name}: PASS`);
    } catch (error) {
      results.push(`${name}: FAIL ${error.message}`);
      throw error;
    }
  };

  try {
    const health = await waitForHealth();
    await check("health contract", async () => {
      assert.equal(health.body.status, "ok");
      assert(health.body.items >= 40);
      assert.equal(typeof health.body.majority_baseline, "number");
    });

    await check("landing page", async () => {
      const response = await request("GET", "/");
      assert.equal(response.status, 200);
      assert.match(response.body, /Recursivo/i);
    });

    const items = await request("GET", "/api/items");
    await check("item catalog", async () => {
      assert.equal(items.status, 200);
      assert(Array.isArray(items.body));
      assert(items.body.length >= 40);
    });

    const item = items.body[0].item;
    const itemGt = groundTruth[item];
    const pid = Object.keys(itemGt.human)[0];
    const humanAnswer = itemGt.human[pid];

    await check("leaderboard route", async () => {
      const response = await request("GET", "/api/leaderboard");
      assert.equal(response.status, 200);
      assert(Array.isArray(response.body.rows));
    });

    await check("known predict", async () => {
      const response = await request("POST", "/api/predict", { item });
      assert.equal(response.status, 200);
      assert.equal(response.body.item, item);
      assert(response.body.predicted_distribution);
      assert(response.body.verified_accuracy);
    });

    await check("unknown predict is honest", async () => {
      const response = await request("POST", "/api/predict", { item: "UNKNOWN_ITEM", options: ["A", "B"] });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, "requires model runtime");
      assert.match(response.body.methodology, /UNVERIFIED/i);
    });

    await check("valid verify", async () => {
      const response = await request("POST", "/api/verify", {
        simulator: "ppo-smoke",
        predictions: [{ pid, item, answer: humanAnswer }],
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.n_predictions, 1);
      assert.equal(response.body.individual_accuracy, 1);
      assert.equal(typeof response.body.matched_baseline, "number");
    });

    const numericItem = Object.keys(groundTruth).find((key) => key.startsWith("Q198_"));
    const numericPid = Object.entries(groundTruth[numericItem].human).find(([, answer]) => answer === "1")[0];
    await check("numeric answer normalization", async () => {
      const response = await request("POST", "/api/verify", {
        simulator: "ppo-numeric",
        predictions: [{ pid: numericPid, item: numericItem, answer: "1.0" }],
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.individual_accuracy, 1);
    });

    await check("invalid verify body", async () => {
      const response = await request("POST", "/api/verify", { simulator: "invalid", predictions: [] });
      assert.equal(response.status, 400);
    });

    await check("invalid JSON boundary", async () => {
      const response = await request("POST", "/api/predict", "{");
      assert.equal(response.status, 400);
    });

    await check("unknown route", async () => {
      const response = await request("GET", "/api/not-a-route");
      assert.equal(response.status, 404);
    });

    await check("early access validation", async () => {
      const response = await request("POST", "/api/early-access", { email: "not-an-email" });
      assert.equal(response.status, 400);
    });

    console.log(`PPO PRODUCT GATE PASS: ${results.length} checks`);
    console.log(results.join("\n"));
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    if (stderr) process.stderr.write(stderr);
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
