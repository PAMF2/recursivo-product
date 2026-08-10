#!/usr/bin/env node

/**
 * KRL Test Suite
 * Valida integridade e qualidade dos dados extraídos
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../../results');
const KRL_DIR = path.join(__dirname, '../..', 'knowledge');

function loadJSON(filename) {
  const filepath = path.join(KRL_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function validateMetadata(metadata) {
  const tests = [];

  if (!metadata) {
    tests.push({ name: 'metadata exists', passed: false, error: 'File not found' });
  } else {
    tests.push({
      name: 'metadata exists',
      passed: true,
      details: `total_items: ${metadata.total_items}, total_events: ${metadata.total_events}`
    });

    if (!metadata.total_items || !metadata.total_events) {
      tests.push({ name: 'metadata has required fields', passed: false });
    } else {
      tests.push({ name: 'metadata has required fields', passed: true });
    }
  }

  return tests;
}

function validateAccuracy(accuracy) {
  const tests = [];

  if (!accuracy) {
    tests.push({ name: 'accuracy.json exists', passed: false, error: 'File not found' });
  } else {
    tests.push({ name: 'accuracy.json exists', passed: true });

    const items = Object.keys(accuracy);
    if (items.length === 0) {
      tests.push({ name: 'accuracy has items', passed: false, error: 'No items found' });
    } else {
      tests.push({ name: 'accuracy has items', passed: true, details: `${items.length} items` });

      items.forEach(item => {
        const data = accuracy[item];
        if (!data.accuracy || typeof data.accuracy !== 'number') {
          tests.push({ name: `accuracy[${item}].accuracy`, passed: false });
        } else {
          tests.push({ name: `accuracy[${item}].accuracy`, passed: true, details: `= ${data.accuracy.toFixed(2)}` });
        }
      });
    }
  }

  return tests;
}

function validateResponseDistribution(distribution) {
  const tests = [];

  if (!distribution) {
    tests.push({ name: 'response_distribution.json exists', passed: false, error: 'File not found' });
  } else {
    tests.push({ name: 'response_distribution.json exists', passed: true });

    const items = Object.keys(distribution);
    if (items.length === 0) {
      tests.push({ name: 'distribution has items', passed: false });
    } else {
      tests.push({ name: 'distribution has items', passed: true, details: `${items.length} items` });
    }
  }

  return tests;
}

function validateCalibration(calibration) {
  const tests = [];

  if (!calibration) {
    tests.push({ name: 'confidence_calibration.json exists', passed: false, error: 'File not found' });
  } else {
    tests.push({ name: 'confidence_calibration.json exists', passed: true });

    const bins = calibration.length;
    if (bins === 0) {
      tests.push({ name: 'calibration has bins', passed: false });
    } else {
      tests.push({ name: 'calibration has bins', passed: true, details: `${bins} bins` });
    }
  }

  return tests;
}

function validatePatterns(patterns) {
  const tests = [];

  if (!patterns) {
    tests.push({ name: 'common_patterns.json exists', passed: false, error: 'File not found' });
  } else {
    tests.push({ name: 'common_patterns.json exists', passed: true });

    const types = Object.keys(patterns);
    if (types.length === 0) {
      tests.push({ name: 'patterns have types', passed: false });
    } else {
      tests.push({ name: 'patterns have types', passed: true, details: `${types.length} types` });
    }
  }

  return tests;
}

function runKRLTests() {
  console.log('🧪 KRL Test Suite\n');
  console.log('Carregando KRLs...\n');

  const metadata = loadJSON('metadata.json');
  const accuracy = loadJSON('accuracy.json');
  const distribution = loadJSON('response_distribution.json');
  const calibration = loadJSON('confidence_calibration.json');
  const patterns = loadJSON('common_patterns.json');

  console.log('Executando testes...\n');

  const allTests = [
    ...validateAccuracy(accuracy),
    ...validateResponseDistribution(distribution),
    ...validateCalibration(calibration),
    ...validatePatterns(patterns)
  ];

  const passed = allTests.filter(t => t.passed).length;
  const failed = allTests.filter(t => !t.passed).length;

  console.log('Testes executados:');
  console.log(`  ✓ Passed: ${passed}`);
  console.log(`  ✗ Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('Testes falhados:\n');
    allTests.filter(t => !t.passed).forEach(test => {
      console.log(`  ✗ ${test.name}`);
      if (test.error) console.log(`    Error: ${test.error}`);
      if (test.details) console.log(`    Details: ${test.details}`);
    });
    console.log('');
  }

  console.log('✅ KRL Test Suite Complete\n');

  process.exit(failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runKRLTests();
}

module.exports = { runKRLTests };
