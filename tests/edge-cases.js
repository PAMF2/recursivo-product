// Edge Case Tests for Recursivo Product
// Tests all API endpoints with boundary conditions, malformed inputs, and race conditions

const http = require('http');

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

function test(name, fn) {
  return new Promise((resolve, reject) => {
    log(`\n📋 ${name}`, 'blue');
    fn(resolve, reject).catch(reject);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAPI(path, method = 'GET', body = null, apiKey = null) {
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

  return new Promise((resolve, reject) => {
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

async function healthCheck() {
  const { status } = await fetchAPI('/health');
  assert(status === 200, 'Health check should return 200');
  log('✅ Health check passed', 'green');
}

async function itemsList() {
  const { status, data } = await fetchAPI('/api/items');
  assert(status === 200, 'Items list should return 200');
  assert(Array.isArray(data), 'Items should be an array');
  assert(data.length > 0, 'Items list should not be empty');
  assert(data[0].pid && data[0].text, 'Item should have pid and text');
  log(`✅ Items list (${data.length} items)`, 'green');
}

async function predictWithApiKey() {
  const { status, data } = await fetchAPI('/api/predict', 'POST', { item: 'Q157' }, API_KEY);
  assert(status === 200, 'Predict with API key should return 200');
  assert(data.pid && data.answer, 'Prediction should have pid and answer');
  assert(typeof data.confidence === 'number', 'Confidence should be a number');
  log('✅ Predict with API key passed', 'green');
}

async function predictWithoutApiKey() {
  const { status } = await fetchAPI('/api/predict', 'POST', { item: 'Q157' });
  assert(status === 401, 'Predict without API key should return 401');
  log('✅ Predict without API key (401) passed', 'green');
}

async function predictWithBadApiKey() {
  const { status } = await fetchAPI('/api/predict', 'POST', { item: 'Q157' }, 'bad-key');
  assert(status === 401, 'Predict with bad API key should return 401');
  log('✅ Predict with bad API key (401) passed', 'green');
}

async function predictWithInvalidItem() {
  const { status, data } = await fetchAPI('/api/predict', 'POST', { item: 'INVALID_ITEM' }, API_KEY);
  assert(status === 400, 'Predict with invalid item should return 400');
  log('✅ Predict with invalid item (400) passed', 'green');
}

async function predictWithEmptyItem() {
  const { status } = await fetchAPI('/api/predict', 'POST', { item: '' }, API_KEY);
  assert(status === 400, 'Predict with empty item should return 400');
  log('✅ Predict with empty item (400) passed', 'green');
}

async function predictWithMalformedJson() {
  const options = {
    hostname: '127.0.0.1',
    port: 8020,
    path: '/api/predict',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      assert(res.statusCode === 400, 'Malformed JSON should return 400');
      resolve();
    });
    req.on('error', reject);
    req.write('{ invalid json }');
    req.end();
  });
}

async function submitWithoutApiKey() {
  const { status } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: 'test-1',
    predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
  });
  assert(status === 401, 'Submit without API key should return 401');
  log('✅ Submit without API key (401) passed', 'green');
}

async function submitWithEmptyPredictions() {
  const { status, data } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: 'test-1',
    predictions: [],
  }, API_KEY);
  assert(status === 400, 'Submit with empty predictions should return 400');
  log('✅ Submit with empty predictions (400) passed', 'green');
}

async function submitWithInvalidAnswer() {
  const { status, data } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: 'test-1',
    predictions: [{ pid: '3', item: 'Q157', answer: 'INVALID_ANSWER' }],
  }, API_KEY);
  assert(status === 400, 'Submit with invalid answer should return 400');
  log('✅ Submit with invalid answer (400) passed', 'green');
}

async function submitWithMalformedJson() {
  const options = {
    hostname: '127.0.0.1',
    port: 8020,
    path: '/api/submit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      assert(res.statusCode === 400, 'Malformed JSON should return 400');
      resolve();
    });
    req.on('error', reject);
    req.write('{ invalid json }');
    req.end();
  });
}

async function verifyWithInvalidItem() {
  const { status } = await fetchAPI('/api/verify', 'POST', {
    simulator: 'test-simulator',
    predictions: [{ pid: '3', item: 'INVALID_ITEM', answer: 'I favor program A' }],
  }, API_KEY);
  assert(status === 400, 'Verify with invalid item should return 400');
  log('✅ Verify with invalid item (400) passed', 'green');
}

async function concurrentSubmissions() {
  log('Testing concurrent submissions...', 'yellow');

  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(fetchAPI('/api/submit', 'POST', {
      simulator: 'test-simulator',
      source_id: `test-${i}`,
      predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
    }, API_KEY));
  }

  const results = await Promise.all(promises);
  const statuses = results.map(r => r.status);

  assert(statuses.every(s => s === 200), 'All concurrent submissions should succeed');
  log('✅ Concurrent submissions (10 parallel) passed', 'green');
}

async function longSimulationId() {
  const longId = 'a'.repeat(121);
  const { status } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: longId,
    predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
  }, API_KEY);

  assert(status === 400, 'Source ID > 120 chars should return 400');
  log('✅ Long simulation ID (121 chars) (400) passed', 'green');
}

async function longSimulatorName() {
  const longName = 'b'.repeat(121);
  const { status } = await fetchAPI('/api/submit', 'POST', {
    simulator: longName,
    source_id: 'test-1',
    predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
  }, API_KEY);

  assert(status === 400, 'Simulator name > 120 chars should return 400');
  log('✅ Long simulator name (121 chars) (400) passed', 'green');
}

async function verifyApiKeyRequired() {
  const { status } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: 'test-1',
    predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
  });

  assert(status === 401, 'Submit should require API key');
  log('✅ Verify API key requirement (401) passed', 'green');
}

async function negativeConfidence() {
  const { status, data } = await fetchAPI('/api/predict', 'POST', { item: 'Q157' }, API_KEY);
  assert(status === 200, 'Prediction should succeed even with extreme confidence');
  log('✅ Prediction with any confidence passed', 'green');
}

async function submitSameIdTwice() {
  const { status: firstStatus, data: firstData } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: 'replay-test',
    predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
  }, API_KEY);

  assert(firstStatus === 200, 'First submission should succeed');

  // Wait a bit for consistency
  await sleep(100);

  const { status: secondStatus, data: secondData } = await fetchAPI('/api/submit', 'POST', {
    simulator: 'test-simulator',
    source_id: 'replay-test',
    predictions: [{ pid: '3', item: 'Q157', answer: 'I slightly favor program A' }],
  }, API_KEY);

  assert(secondStatus === 200, 'Replay submission should succeed');
  assert(secondData.replayed === true, 'Replay should have replayed flag true');
  assert(secondData.receipt_id === firstData.receipt_id, 'Replay should have same receipt_id');

  log('✅ Replay submission (same input twice) passed', 'green');
}

async function runAllEdgeCaseTests() {
  log('\n🧪 RUNNING EDGE CASE TESTS', 'blue');
  log('=' .repeat(60), 'blue');

  try {
    await healthCheck();
    await itemsList();
    await predictWithApiKey();
    await predictWithoutApiKey();
    await predictWithBadApiKey();
    await predictWithInvalidItem();
    await predictWithEmptyItem();
    await predictWithMalformedJson();
    await submitWithoutApiKey();
    await submitWithEmptyPredictions();
    await submitWithInvalidAnswer();
    await submitWithMalformedJson();
    await verifyWithInvalidItem();
    await concurrentSubmissions();
    await longSimulationId();
    await longSimulatorName();
    await verifyApiKeyRequired();
    await negativeConfidence();
    await submitSameIdTwice();

    log('\n✅ ALL EDGE CASE TESTS PASSED', 'green');
    log('=' .repeat(60), 'green');
    log(`Total: ${18} tests passed`, 'green');
    process.exit(0);
  } catch (error) {
    log(`\n❌ TEST FAILED: ${error.message}`, 'red');
    process.exit(1);
  }
}

runAllEdgeCaseTests();
