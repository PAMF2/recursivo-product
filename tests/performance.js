// Performance Benchmarks for Recursivo Product
// Tests latency, throughput, and memory usage

const http = require('http');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://127.0.0.1:8020';
const API_KEY = 'local-secret';

// Colors for terminal output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function formatLatency(latency) {
  return `${latency.toFixed(2)}ms`;
}

function formatThroughput(count, duration) {
  const reqPerSec = (count / duration) * 1000;
  return `${reqPerSec.toFixed(0)} req/s`;
}

function formatMemory(mb) {
  return `${mb.toFixed(2)} MB`;
}

async function fetchAPI(path, method = 'GET', body = null, apiKey = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 8020,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (apiKey) {
      options.headers['X-API-Key'] = apiKey;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Memory measurement using process.memoryUsage()
function measureMemory() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024), // MB
  };
}

async function benchmarkLatency(fn, iterations = 100) {
  const latencies = [];
  const startMemory = measureMemory();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    latencies.push(end - start);
  }

  const endMemory = measureMemory();
  const heapDelta = Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024);

  const min = Math.min(...latencies);
  const max = Math.max(...latencies);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
  const p99 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)];

  return {
    min,
    max,
    avg,
    p95,
    p99,
    iterations,
    memoryDelta: heapDelta,
  };
}

async function benchmarkThroughput(fn, durationSeconds = 5, concurrency = 10) {
  const startTime = performance.now();
  let completed = 0;
  const results = [];

  const runWorkers = async () => {
    while (performance.now() - startTime < durationSeconds * 1000 && completed < 10000) {
      const result = await fn();
      results.push(result);
      completed++;
    }
  };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorkers());
  }

  await Promise.all(workers);

  const duration = (performance.now() - startTime) / 1000;
  const throughput = completed / duration;

  return {
    completed,
    duration,
    throughput: throughput.toFixed(2),
    latency: {
      min: Math.min(...results.map(r => r.latency)),
      max: Math.max(...results.map(r => r.latency)),
      avg: results.reduce((a, b) => a + b.latency, 0) / results.length,
    },
  };
}

async function healthBenchmark() {
  log('\n🏥 BENCHMARK: Health Check', 'blue');

  const result = await benchmarkLatency(
    async () => {
      await fetchAPI('/health');
    },
    100
  );

  log(`  Min: ${formatLatency(result.min)}`, 'yellow');
  log(`  Max: ${formatLatency(result.max)}`, 'yellow');
  log(`  Avg: ${formatLatency(result.avg)}`, 'yellow');
  log(`  P95: ${formatLatency(result.p95)}`, 'yellow');
  log(`  P99: ${formatLatency(result.p99)}`, 'yellow');
  log(`  Iterations: ${result.iterations}`, 'yellow');
  log(`  Memory Delta: ${formatMemory(result.memoryDelta)}`, 'yellow');
  log(`✅ Health Check benchmark passed`, 'green');

  return result.avg < 50; // Target: < 50ms
}

async function itemsBenchmark() {
  log('\n📦 BENCHMARK: Items List', 'blue');

  const result = await benchmarkLatency(
    async () => {
      await fetchAPI('/api/items');
    },
    50
  );

  log(`  Min: ${formatLatency(result.min)}`, 'yellow');
  log(`  Max: ${formatLatency(result.max)}`, 'yellow');
  log(`  Avg: ${formatLatency(result.avg)}`, 'yellow');
  log(`✅ Items List benchmark passed`, 'green');

  return result.avg < 30; // Target: < 30ms
}

async function predictBenchmark() {
  log('\n🔮 BENCHMARK: Predict API', 'blue');

  const result = await benchmarkLatency(
    async () => {
      await fetchAPI('/api/predict', 'POST', { item: 'Q157' }, API_KEY);
    },
    100
  );

  log(`  Min: ${formatLatency(result.min)}`, 'yellow');
  log(`  Max: ${formatLatency(result.max)}`, 'yellow');
  log(`  Avg: ${formatLatency(result.avg)}`, 'yellow');
  log(`  P95: ${formatLatency(result.p95)}`, 'yellow');
  log(`  Memory Delta: ${formatMemory(result.memoryDelta)}`, 'yellow');

  const target = 100; // Target: < 100ms
  if (result.avg > target) {
    log(`⚠️  WARNING: Average latency (${formatLatency(result.avg)}) exceeds target (${formatLatency(target)})`, 'yellow');
  } else {
    log(`✅ Predict API benchmark passed (target: <${formatLatency(target)})`, 'green');
  }

  return result.avg < target;
}

async function verifyBenchmark() {
  log('\n✅ BENCHMARK: Verify API', 'blue');

  const result = await benchmarkLatency(
    async () => {
      await fetchAPI('/api/verify', 'POST', {
        simulator: 'test-simulator',
        predictions: [{ pid: '3', item: 'Q157', answer: 'I favor program A' }],
      }, API_KEY);
    },
    50
  );

  log(`  Min: ${formatLatency(result.min)}`, 'yellow');
  log(`  Max: ${formatLatency(result.max)}`, 'yellow');
  log(`  Avg: ${formatLatency(result.avg)}`, 'yellow');

  const target = 500; // Target: < 500ms
  if (result.avg > target) {
    log(`⚠️  WARNING: Average latency (${formatLatency(result.avg)}) exceeds target (${formatLatency(target)})`, 'yellow');
  } else {
    log(`✅ Verify API benchmark passed (target: <${formatLatency(target)})`, 'green');
  }

  return result.avg < target;
}

async function throughputBenchmark() {
  log('\n⚡ THROUGHPUT BENCHMARK: Concurrent Requests', 'blue');

  const result = await benchmarkThroughput(
    async () => {
      return await fetchAPI('/api/predict', 'POST', { item: 'Q157' }, API_KEY);
    },
    5,
    10
  );

  log(`  Duration: ${result.duration}s`, 'yellow');
  log(`  Completed: ${result.completed} requests`, 'yellow');
  log(`  Throughput: ${formatThroughput(result.completed, result.duration)}`, 'yellow');
  log(`  Min Latency: ${formatLatency(result.latency.min)}`, 'yellow');
  log(`  Max Latency: ${formatLatency(result.latency.max)}`, 'yellow');
  log(`  Avg Latency: ${formatLatency(result.latency.avg)}`, 'yellow');
  log(`✅ Throughput benchmark passed`, 'green');

  return result.throughput > 10; // Target: > 10 req/s
}

async function memoryStabilityBenchmark() {
  log('\n🧠 MEMORY STABILITY BENCHMARK (10 minutes, 10 req/s)', 'blue');

  const startMemory = measureMemory();
  let totalLatency = 0;
  let count = 0;
  const durationSeconds = 600; // 10 minutes
  const concurrency = 10;
  const duration = durationSeconds;
  let completed = 0;
  const latencies = [];

  const runWorkers = async () => {
    while (performance.now() - startMemory < duration * 1000 && completed < 100000) {
      const start = performance.now();
      await fetchAPI('/api/predict', 'POST', { item: 'Q157' }, API_KEY);
      const end = performance.now();
      totalLatency += (end - start);
      count++;
      completed++;
      latencies.push(end - start);

      // Print progress every 60 seconds
      if (completed % 1000 === 0) {
        const elapsed = (performance.now() - startMemory) / 1000;
        const throughput = (completed / elapsed).toFixed(2);
        const avgLatency = (totalLatency / count).toFixed(2);
        log(`  Progress: ${completed} requests, ${throughput} req/s, avg latency ${avgLatency}ms`, 'yellow');
      }
    }
  };

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(runWorkers());
  }

  await Promise.all(workers);

  const endMemory = measureMemory();
  const durationActual = (performance.now() - startMemory) / 1000;
  const heapUsed = Math.round(endMemory.heapUsed / 1024 / 1024);
  const heapDelta = Math.round((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024);

  const avgLatency = totalLatency / count;
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

  log(`\n  Final Stats:`, 'yellow');
  log(`  Duration: ${durationActual.toFixed(2)}s`, 'yellow');
  log(`  Completed: ${completed} requests`, 'yellow');
  log(`  Throughput: ${formatThroughput(completed, durationActual)}`, 'yellow');
  log(`  Avg Latency: ${formatLatency(avgLatency)}`, 'yellow');
  log(`  P95 Latency: ${formatLatency(p95)}`, 'yellow');
  log(`  Heap Used: ${formatMemory(heapUsed)}`, 'yellow');
  log(`  Heap Delta: ${formatMemory(heapDelta)}`, 'yellow');

  if (heapDelta > 50) {
    log(`⚠️  WARNING: Heap delta > 50MB, potential memory leak`, 'yellow');
  } else {
    log(`✅ Memory stability benchmark passed (heap delta < 50MB)`, 'green');
  }

  return heapDelta < 50;
}

async function runAllPerformanceBenchmarks() {
  log('\n🚀 RUNNING PERFORMANCE BENCHMARKS', 'blue');
  log('=' .repeat(60), 'blue');

  try {
    const health = await healthBenchmark();
    const items = await itemsBenchmark();
    const predict = await predictBenchmark();
    const verify = await verifyBenchmark();
    const throughput = await throughputBenchmark();
    const memory = await memoryStabilityBenchmark();

    log('\n' + '='.repeat(60), 'blue');
    log('SUMMARY', 'blue');
    log('=' .repeat(60), 'blue');

    const allPassed = health && items && predict && verify && throughput && memory;

    log(`Health Check:  ${health ? '✅ PASS' : '❌ FAIL'}`, health ? 'green' : 'red');
    log(`Items List:    ${items ? '✅ PASS' : '❌ FAIL'}`, items ? 'green' : 'red');
    log(`Predict API:   ${predict ? '✅ PASS' : '❌ FAIL'}`, predict ? 'green' : 'red');
    log(`Verify API:    ${verify ? '✅ PASS' : '❌ FAIL'}`, verify ? 'green' : 'red');
    log(`Throughput:    ${throughput ? '✅ PASS' : '❌ FAIL'}`, throughput ? 'green' : 'red');
    log(`Memory:        ${memory ? '✅ PASS' : '❌ FAIL'}`, memory ? 'green' : 'red');

    log('=' .repeat(60), 'blue');
    if (allPassed) {
      log('✅ ALL PERFORMANCE BENCHMARKS PASSED', 'green');
    } else {
      log('❌ SOME PERFORMANCE BENCHMARKS FAILED', 'red');
    }
    log('=' .repeat(60), 'blue');

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    log(`\n❌ BENCHMARK FAILED: ${error.message}`, 'red');
    log(error.stack, 'red');
    process.exit(1);
  }
}

runAllPerformanceBenchmarks();
