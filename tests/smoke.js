"use strict";

const assert = require("assert");
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const port = 18202;
const groundTruth = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "ground_truth_wave4.json"), "utf8"));

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: route,
      method,
      headers: body === undefined ? {} : {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
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
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = await request("GET", "/health");
      if (result.status === 200) return result;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("product server did not become healthy");
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, "server.js"), String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    const health = await waitForHealth();
    assert.equal(health.body.status, "ok");
    assert(health.body.items > 0);

    const landing = await request("GET", "/");
    assert.equal(landing.status, 200);
    assert.match(landing.body, /Recursivo/i);

    const items = await request("GET", "/api/items");
    assert.equal(items.status, 200);
    assert(Array.isArray(items.body));
    const item = items.body[0].item;
    const human = groundTruth[item];
    const pid = Object.keys(human.human)[0];
    const answer = human.human[pid];

    const predict = await request("POST", "/api/predict", { item });
    assert.equal(predict.status, 200);
    assert.equal(predict.body.item, item);
    assert(predict.body.predicted_distribution);
    assert(predict.body.verified_accuracy);

    const verify = await request("POST", "/api/verify", {
      simulator: "smoke-test",
      predictions: [{ pid, item, answer }],
    });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.n_predictions, 1);
    assert.equal(verify.body.individual_accuracy, 1);
    assert.equal(verify.body.matched_baseline !== undefined, true);

    console.log(`PRODUCT SMOKE PASS: health=${health.body.items} items, verify=1/1, item=${item}`);
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
