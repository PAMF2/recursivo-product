# H1 · Product preflight readiness

## Prediction

If the product server is treated as a customer surface, a deterministic HTTP suite will catch more launch-blocking regressions than syntax-only checks.

## Scope

Test the local Node product at `127.0.0.1` without network, LLM calls, npm installs, or mutable external services.

## Checks

- health and baseline shape;
- landing page;
- item catalog;
- leaderboard;
- known Predict;
- unknown Predict honesty;
- valid Verify;
- numeric answer normalization;
- invalid Verify body;
- invalid JSON;
- unknown route;
- invalid early-access input.

## Metric

Primary: PPO pass rate, target `12/12 = 1.0`.

Counter-metrics: server startup failure, smoke duration, unexpected writes, and any claim or cohort change.

## Keep/reject rule

Keep a product change only if PPO and smoke remain green and the change improves a customer-facing behavior or launch metric. Reject or revert on any failed gate. Deploy, publication, outreach, spend, and claim changes stop at human approval.
