# Findings

## Current understanding

The product is a dependency-free Node service with landing, Predict, Verify, Submit, Early Access, and Leaderboard routes. A launch-ready loop must test customer-visible behavior and failure boundaries, not only syntax or benchmark arithmetic.

## Confirmed

- Health exposes runtime status, item count, and baseline.
- Known Predict returns distribution plus verified accuracy.
- Unknown Predict is explicit about requiring a model runtime and remains unverified.
- Verify returns individual accuracy, group-level score, and matched baseline.
- Numeric answer formatting is normalized only against the item's options.
- Invalid Verify input, invalid JSON, unknown routes, and invalid early-access email are rejected.
- Product PPO gate passes 12/12 checks offline.

## Open

- `paid_decisions` is not yet instrumented.
- `activation` and buyer signals need real product telemetry or founder-entered evidence.
- Deployment, domain, email delivery, and external outreach require human approval and a separate production gate.

## Rule

Do not call the product launched from local smoke alone. Launch requires PPO 100%, a human review of claims/data, a production health check, and an approved deploy.
