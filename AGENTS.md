# Recursivo Product Repo

This is the autonomous product workspace. Build the customer-facing Recursivo product here: web experience, Predict API, Verify API, submissions, waitlist, runtime data, and product reliability. This repo is intentionally separate from research, benchmark experiments, model training, and orchestration.

## Mission

Ship a usable product that lets a customer:

1. understand the value on `/`;
2. inspect the available item catalog;
3. request a verified prediction on `/api/predict`;
4. submit any simulator to `/api/verify`;
5. inspect honest results and join early access.

## Maker contract

- Read `AGENTS.md` and `README.md` before editing.
- Preserve unrelated work already present.
- Build complete behavior, not placeholders or fake fallbacks.
- Keep the runtime dependency-free unless the task explicitly justifies a dependency.
- Do not modify research or training systems from this repo.
- Do not fabricate customers, metrics, claims, or data.
- Never push, publish, deploy, spend, contact customers, or change credentials during an autonomous run. Those actions require a human gate in the Command Center.
- Do not reset, clean, or delete unrelated files.
## Verification

The product server is Node stdlib only:

```bash
node tests/ppo.js
node tests/smoke.js
node --check server.js
```

A product change is PASS only when the changed path is exercised through the running HTTP server. API changes must cover success and the relevant error/auth boundary. Keep the PPO gate deterministic and offline.

## Runtime

```bash
node server.js 8020
```

Default bind is local development only. Use `RECURSIVO_API_KEY` for protected POST routes. Production exposure, domain changes, and deploys are human-gated.

## Delivery format

Return:

```text
PRODUCT_RESULT
STATUS
FILES_CHANGED
TESTS
RISKS
NEXT_ACTION
```

`STATUS=PASS` requires actual product behavior exercised through HTTP and exact changed paths. Use `STATUS=NEEDS_HUMAN` for external services, credentials, legal/data questions, or irreversible actions.
