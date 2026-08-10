# Knowledge Retrieval Layers (KRL) - Recursivo Product

KRLs = camadas de conhecimento extraído do ground truth humano e treinamento do modelo AlphaPrediction.

## Estrutura

- **metadata.json** - metadados do dataset (itens, participantes, eventos)
- **accuracy.json** - acurácia do modelo por item
- **response_distribution.json** - distribuição de respostas por item (ground truth)
- **confidence_calibration.json** - calibração de confiança do modelo
- **common_patterns.json** - padrões comuns de resposta humana

## Gerado via scripts

```bash
# Gerar KRL completo
npm run krl:generate

# Rodar testes de KRL
npm run krl:test

# Visualizar KRL
npm run krl:visualize
```

## Formato de Dados

### metadata.json
```json
{
  "total_items": 200,
  "total_participants": 1000,
  "total_events": 192,
  "item_ids": ["Q157", "Q158", ...],
  "participant_ids": ["1", "2", ...],
  "scenario_lab_runs": 10
}
```

### accuracy.json
```json
{
  "Q157": {
    "ground_truth": {"A": 0.7, "B": 0.3},
    "predicted": {"A": 0.72, "B": 0.28},
    "accuracy": 0.92,
    "confidence_mean": 0.85
  }
}
```

### response_distribution.json
```json
{
  "Q157": {
    "I strongly favor program A": 450,
    "I slightly favor program A": 250,
    "Neutral": 200,
    "I slightly favor program B": 80,
    "I strongly favor program B": 20
  }
}
```

### confidence_calibration.json
```json
{
  "bins": [
    {"low": 0.0, "high": 0.2, "mean_actual": 0.15},
    {"low": 0.2, "high": 0.4, "mean_actual": 0.35},
    {"low": 0.4, "high": 0.6, "mean_actual": 0.50},
    {"low": 0.6, "high": 0.8, "mean_actual": 0.70},
    {"low": 0.8, "high": 1.0, "mean_actual": 0.85}
  ]
}
```

### common_patterns.json
```json
{
  "position_inversion": {
    "items": ["Q157", "Q158"],
    "pattern": "Pessoas que se favorecem program A em item 1 mudam para B em item 2"
  },
  "social_desirability": {
    "items": ["Q157", "Q159"],
    "pattern": "Respostas mais positivas para programas mais populares"
  }
}
```

## Uso em Produto

- **Predict API**: busca em accuracy.json e confidence_calibration.json
- **Verify API**: compara resposta humana com distribuição em response_distribution.json
- **Scenario Lab**: consulta common_patterns.json para inicializar estados
- **Leaderboard**: mostra calibração e padrões comuns

## Atualização

KRLs atualizados automaticamente quando:
- Novos itens adicionados (via admin UI)
- Novos participantes respondem
- Re-avaliação de ground truth acontece
