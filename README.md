# Recursivo Product

Produto web e API para previsão e verificação de comportamento humano.

## O que o cliente usa

- `/` - produto e proposta de valor.
- `GET /api/items` - catálogo de itens disponíveis.
- `POST /api/predict` - previsão conhecida com distribuição e acurácia verificada.
- `POST /api/verify` - verifica qualquer simulador contra respostas humanas reais.
- `POST /api/submit` - verifica e registra uma submissão.
- `POST /api/early-access` - lista de acesso antecipado.
- `GET /api/leaderboard` - resultados publicados do produto.

## Rodar localmente

Sem dependências npm:

```bash
node server.js 8020
curl http://127.0.0.1:8020/health
curl http://127.0.0.1:8020/api/items
curl -X POST http://127.0.0.1:8020/api/predict \
  -H 'Content-Type: application/json' \
  -d '{"item":"Q157"}'
```

Para proteger POSTs localmente:

```bash
RECURSIVO_API_KEY=local-secret node server.js 8020
```

## Estrutura

```text
server.js                 servidor HTTP e API do produto
site/                     landing, deck e assets da experiência
 data/                    dados runtime necessários ao produto
results/                  leaderboard e submissões
 tests/smoke.js            teste HTTP end-to-end offline
AGENTS.md                 contrato do agente construtor
```

Pesquisa, treinamento, experimentos e orquestração ficam fora deste repo. O agente constrói produto aqui; deploy e publicação exigem aprovação humana.
