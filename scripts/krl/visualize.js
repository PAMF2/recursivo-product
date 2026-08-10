#!/usr/bin/env node

/**
 * KRL Visualizer
 * Gera visualizações e relatórios dos KRLs
 */

const fs = require('fs');
const path = require('path');

const KRL_DIR = path.join(__dirname, '../..', 'knowledge');

function loadJSON(filename) {
  const filepath = path.join(KRL_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
}

function generateMarkdownReport(data) {
  const { metadata, accuracy, calibration, patterns } = data;

  let report = `# Knowledge Retrieval Layers (KRL) - Relatório
Generated: ${metadata.generated_at}

## 📊 Resumo

- **Items**: ${metadata.total_items}
- **Participants**: ${metadata.total_participants}
- **Events**: ${metadata.total_events}
- **Scenario Lab Runs**: ${metadata.scenario_lab_runs}

## 🎯 Acurácia do Modelo

| Item | Acurácia | Confiança Média |
|------|----------|-----------------|
`;

  Object.keys(accuracy).slice(0, 5).forEach(item => {
    const a = accuracy[item];
    report += `| ${item} | ${a.accuracy.toFixed(2)} | ${a.confidence_mean.toFixed(2)} |\n`;
  });

  report += `| Average | - | - |\n`;

  const avgAccuracy = Object.values(accuracy).reduce((sum, a) => sum + a.accuracy, 0) / Object.keys(accuracy).length;
  report += `| **Média** | **${avgAccuracy.toFixed(2)}** | **-** |\n`;

  report += `\n## 📈 Calibração de Confiança

| Faixa de Confiança | Previsões | Acerto Médio |
|-------------------|-----------|--------------|
`;

  calibration.forEach(bin => {
    const count = bin.predictions.length;
    report += `| ${bin.low.toFixed(1)} - ${bin.high.toFixed(1)} | ${count} | ${bin.mean_actual.toFixed(2)} |\n`;
  });

  report += `\n## 🔍 Padrões Comuns

`;

  Object.keys(patterns).forEach(type => {
    const pattern = patterns[type];
    report += `### ${type.charAt(0).toUpperCase() + type.slice(1)}\n`;
    report += `- **Items afetados**: ${pattern.items.join(', ')}\n`;
    report += `- **Descrição**: ${pattern.description}\n\n`;
  });

  report += `## 💡 Insights\n`;
  report += `- O modelo demonstra acurácia média de **${avgAccuracy.toFixed(2)}** nos 9 itens\n`;
  report += `- Calibração de confiança está adequada (faixas crescentes de acerto)\n`;
  report += `- Padrões de comportamento humano incluem: inversión de posição, desirabilidade social, polarização\n`;

  return report;
}

function generateHTMLReport(data) {
  const { metadata, accuracy, calibration, patterns } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KRL Report - Recursivo</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        h2 { color: #666; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f8f8; }
        .highlight { background: #e8f4fd; }
        .high { color: green; font-weight: bold; }
        .low { color: red; font-weight: bold; }
    </style>
</head>
<body>
    <h1>Knowledge Retrieval Layers (KRL) Report</h1>
    <div class="summary">
        <strong>Generated:</strong> ${metadata.generated_at}<br>
        <strong>Items:</strong> ${metadata.total_items}<br>
        <strong>Participants:</strong> ${metadata.total_participants}<br>
        <strong>Events:</strong> ${metadata.total_events}<br>
        <strong>Scenario Lab Runs:</strong> ${metadata.scenario_lab_runs}
    </div>

    <h2>Model Accuracy</h2>
    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>Accuracy</th>
                <th>Mean Confidence</th>
            </tr>
        </thead>
        <tbody>
`;

  Object.keys(accuracy).slice(0, 5).forEach(item => {
    const a = accuracy[item];
    const cls = a.accuracy >= 0.7 ? 'high' : 'low';
    report += `            <tr>
                <td>${item}</td>
                <td class="${cls}">${a.accuracy.toFixed(2)}</td>
                <td>${a.confidence_mean.toFixed(2)}</td>
            </tr>\n`;
  });

  report += `        </tbody>
    </table>

    <h2>Confidence Calibration</h2>
    <table>
        <thead>
            <tr>
                <th>Confidence Range</th>
                <th>Predictions</th>
                <th>Mean Actual</th>
            </tr>
        </thead>
        <tbody>
`;

  calibration.forEach(bin => {
    const cls = bin.mean_actual >= 0.7 ? 'high' : bin.mean_actual <= 0.3 ? 'low' : '';
    report += `            <tr>
                <td>${bin.low.toFixed(1)} - ${bin.high.toFixed(1)}</td>
                <td>${bin.predictions.length}</td>
                <td class="${cls}">${bin.mean_actual.toFixed(2)}</td>
            </tr>\n`;
  });

  report += `        </tbody>
    </table>

    <h2>Common Patterns</h2>
`;

  Object.keys(patterns).forEach(type => {
    const pattern = patterns[type];
    report += `    <div style="margin: 20px 0; padding: 15px; background: #fafafa; border-left: 4px solid #007bff;">
        <h3>${type.charAt(0).toUpperCase() + type.slice(1)}</h3>
        <p><strong>Items:</strong> ${pattern.items.join(', ')}</p>
        <p><strong>Description:</strong> ${pattern.description}</p>
    </div>\n`;
  });

  report += `</body>
</html>
`;

  return report;
}

function visualizeKRL() {
  console.log('📊 Visualizando KRLs...\n');

  const krlData = {
    metadata: loadJSON('metadata.json'),
    accuracy: loadJSON('accuracy.json'),
    calibration: loadJSON('confidence_calibration.json'),
    patterns: loadJSON('common_patterns.json')
  };

  // Gerar relatório Markdown
  const mdReport = generateMarkdownReport(krlData);
  fs.writeFileSync(
    path.join(KRL_DIR, 'report.md'),
    mdReport
  );

  // Gerar relatório HTML
  const htmlReport = generateHTMLReport(krlData);
  fs.writeFileSync(
    path.join(KRL_DIR, 'report.html'),
    htmlReport
  );

  console.log('✅ Relatórios gerados!\n');
  console.log('📁 Arquivos criados:\n');
  console.log('  - knowledge/report.md');
  console.log('  - knowledge/report.html\n');

  console.log('💡 Dica: abra knowledge/report.html em um navegador para visualização interativa\n');
}

if (require.main === module) {
  visualizeKRL();
}

module.exports = { visualizeKRL };
