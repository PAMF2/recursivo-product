# Recursivo Product

Produto web e API para previsão e verificação de comportamento humano.

## O que o cliente usa

- `/` - produto e proposta de valor.
- `GET /api/items` - catálogo de itens disponíveis.
- `POST /api/predict` - previsão conhecida com distribuição e acurácia verificada.
- `POST /api/verify` - verifica qualquer simulador contra respostas humanas reais.
- `POST /api/submit` - valida, verifica e registra uma submissão idempotente.
- `POST /api/early-access` - lista de acesso antecipado.
- `GET /api/leaderboard` - resultados publicados do produto.
- `GET /scenario` e `POST /api/scenario/run` - Scenario Lab determinístico inspirado em Light Society: agentes, estados, event queue, rounds e readout. Saída é sintética e `verified: false`.

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

`POST /api/submit` fica indisponível sem uma chave configurada. Ao configurar a chave, envie o mesmo valor no header `X-API-Key`. `POST /api/predict` e `POST /api/verify` permanecem públicos.

```bash
RECURSIVO_API_KEY=local-secret node server.js 8020
```

```bash
curl -X POST http://127.0.0.1:8020/api/submit \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: local-secret' \
  -d '{"simulator":"nome","source_id":"versao-local","predictions":[{"pid":"3","item":"Q157","answer":"I slightly favor program A"}]}'
```

## Submit e recibos reproduzíveis

Envie `POST /api/submit` com `{"simulator":"nome","source_id":"identificador-da-versao","predictions":[{"pid":"3","item":"Q157","answer":"I slightly favor program A"}]}`. `simulator` e `source_id` devem ser strings já sem espaços nas pontas, com 1–120 caracteres. Cada par `(item,pid)` deve existir uma única vez e a resposta precisa ser uma opção canônica do item. Dados de contato não fazem parte deste contrato e não são persistidos.

Uma submissão válida retorna um recibo `submit-receipt-v1` com coorte, cobertura, métricas, identificadores das fontes e `reproducibility_hash`. Reenviar a mesma entrada canônica devolve o recibo original com `replayed: true`, preserva `created_at` e não cria outra entrada. O hash prova identidade da entrada e das fontes de pontuação; não prova como as previsões foram geradas.

`GET /api/leaderboard` mantém `rows` como resultados canônicos e publica recibos separadamente em `submitted_results`. Resultados parciais são sempre `ranked: false` e rotulados como não comparáveis ao ranking canônico.

Por padrão, os recibos e eventos de ativação são gravados em `results/submissions.json` e `results/events.jsonl`. Testes e processos isolados podem definir `RECURSIVO_SUBMISSIONS_FILE` e `RECURSIVO_EVENTS_FILE`. Use apenas um processo servidor por arquivo de recibos.

## Scenario Lab vs AlphaPrediction

Scenario Lab é a camada de simulação social: explora trajetórias de agentes e eventos com seed reproduzível. Não é previsão de pessoas reais e não substitui ground truth. AlphaPrediction é a camada separada de predição humana verificada; Verify é a régua que mede as duas quando existe resposta real.

```text
Scenario Lab -> simula cenários
AlphaPrediction -> prevê respostas humanas
Verify -> verifica contra realidade
```

## Testes de lançamento

```bash
node --check server.js
node tests/ppo.js
node tests/smoke.js
```

`tests/ppo.js` é o gate de preflight do produto: 12 checks HTTP offline cobrindo sucesso, erro, normalização, honestidade de resposta e limites de entrada. O loop de launch fica registrado em `research-state.yaml`, `research-log.md`, `findings.md` e `experiments/launch-readiness/`.

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
