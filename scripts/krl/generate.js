#!/usr/bin/env node

/**
 * Knowledge Retrieval Layers (KRL) Generator
 * Cria KRLs baseado em dados do paper "Light Society" e resultados do produto
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../../results');
const KRL_DIR = path.join(__dirname, '../..', 'knowledge');

function generateMockData() {
  // Dados fictícios baseados no paper "Light Society"
  const items = [
    "Q157", "Q158", "Q159", "Q160", "Q161", "Q162", "Q163", "Q164", "Q165"
  ];

  const responses = [
    "I strongly favor program A",
    "I slightly favor program A",
    "Neutral",
    "I slightly favor program B",
    "I strongly favor program B"
  ];

  const accuracy = {};
  const responseDist = {};

  items.forEach(item => {
    // Distribuição baseada no paper (70% A, 30% B)
    accuracy[item] = {
      ground_truth: { "I strongly favor program A": 420, "I slightly favor program A": 280, "Neutral": 200, "I slightly favor program B": 80, "I strongly favor program B": 20 },
      predicted: { "I strongly favor program A": 450, "I slightly favor program A": 250, "Neutral": 180, "I slightly favor program B": 70, "I strongly favor program B": 50 },
      correct_count: 950,
      total_predictions: 1000
    };
    accuracy[item].accuracy = accuracy[item].correct_count / accuracy[item].total_predictions;
    accuracy[item].confidence_mean = accuracy[item].accuracy;
    accuracy[item].ground_truth_normalized = accuracy[item].ground_truth;

    responseDist[item] = accuracy[item].ground_truth;
  });

  const calibration = [
    { low: 0.0, high: 0.2, predictions: [], actuals: [], mean_actual: 0.15 },
    { low: 0.2, high: 0.4, predictions: [], actuals: [], mean_actual: 0.35 },
    { low: 0.4, high: 0.6, predictions: [], actuals: [], mean_actual: 0.50 },
    { low: 0.6, high: 0.8, predictions: [], actuals: [], mean_actual: 0.70 },
    { low: 0.8, high: 1.0, predictions: [], actuals: [], mean_actual: 0.85 }
  ];

  const patterns = {
    position_inversion: {
      items: ["Q157", "Q158"],
      description: "Pessoas que se favorecem program A em item 1 mudam para B em item 2"
    },
    social_desirability: {
      items: ["Q157", "Q159"],
      description: "Respostas mais positivas para programas mais populares"
    },
    polarization: {
      items: ["Q161", "Q162", "Q163"],
      description: "Aumento de polarização com distância temporal"
    }
  };

  const metadata = {
    total_items: items.length,
    total_participants: 1000,
    total_events: 192,
    scenario_lab_runs: 10,
    generated_at: new Date().toISOString(),
    source: "Light Society Paper (Mock)"
  };

  return { metadata, accuracy, responseDist, calibration, patterns };
}

function generateKRL() {
  console.log('🧠 Gerando Knowledge Retrieval Layers (KRLs)...\n');

  // Gerar dados mockados
  const krlData = generateMockData();

  // Criar diretório de KRL
  if (!fs.existsSync(KRL_DIR)) {
    fs.mkdirSync(KRL_DIR, { recursive: true });
  }

  // Salvar arquivos KRL
  fs.writeFileSync(
    path.join(KRL_DIR, 'metadata.json'),
    JSON.stringify(krlData.metadata, null, 2)
  );

  fs.writeFileSync(
    path.join(KRL_DIR, 'accuracy.json'),
    JSON.stringify(krlData.accuracy, null, 2)
  );

  fs.writeFileSync(
    path.join(KRL_DIR, 'response_distribution.json'),
    JSON.stringify(krlData.responseDist, null, 2)
  );

  fs.writeFileSync(
    path.join(KRL_DIR, 'confidence_calibration.json'),
    JSON.stringify(krlData.calibration, null, 2)
  );

  fs.writeFileSync(
    path.join(KRL_DIR, 'common_patterns.json'),
    JSON.stringify(krlData.patterns, null, 2)
  );

  console.log('✅ KRLs gerados com sucesso!\n');
  console.log('📁 Arquivos criados:\n');

  Object.keys(krlData).forEach(key => {
    const value = krlData[key];
    console.log(`  ${key}.json:`);
    console.log(`    - ${Object.keys(value).length} registros`);
    if (key === 'metadata') {
      console.log(`    - Items: ${value.total_items}, Participants: ${value.total_participants}, Events: ${value.total_events}`);
    }
    console.log('');
  });

  return krlData;
}

if (require.main === module) {
  generateKRL();
}

module.exports = { generateKRL };
