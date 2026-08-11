# Iteration Plan: Launch Readiness

## Current Status
- ✅ Core APIs (Predict/Verify/Submit) working
- ✅ Scenario Lab engine (deterministic, Light Society)
- ✅ KRL generation & documentation
- ✅ All gates passing (PPO, Smoke, Result Path, Activation)
- ✅ Ground truth logging (events.jsonl)
- ✅ Receipt system (idempotent, reproducibility hash)

## Next Iteration: Launch Completeness

### Phase 1: CI/CD Automation (Priority: CRITICAL)
- [ ] GitHub Actions workflow (`/.github/workflows/ci.yml`)
  - Run PPO gate (12 checks)
  - Run Smoke tests (all endpoints)
  - Run KRL tests (17 tests)
  - Build artifacts (if any)
  - On failure: comment PR with error details
- [ ] Code coverage tracking (basic: files touched >= checks)

### Phase 2: Edge Cases & Stress Testing
- [ ] Add error boundary tests
  - Invalid API keys (X-API-Key missing/bad)
  - Malformed JSON payloads
  - Empty/missing required fields
  - Out of bounds values (negative numbers, huge strings)
  - Concurrent submissions (race conditions)
- [ ] Performance benchmarks
  - `/api/predict` latency (target: <100ms)
  - `/api/verify` latency (target: <500ms)
  - Concurrent load test (10 req/s, 5 min)
  - Memory leak detection (running 1h, 10 req/s)

### Phase 3: Documentation Completeness
- [ ] Architecture diagrams
  - API flow (Predict → Verify → Submit)
  - Scenario Lab event queue flow
  - KRL data structure diagram
  - Ground truth validation pipeline
- [ ] Deployment checklist
  - Environment variables needed
  - Database/file requirements (if any)
  - Domain setup (if any)
  - SSL/cert setup (if any)
- [ ] Integration examples
  - Python client example (requests)
  - JavaScript client example (fetch)
  - Curl examples for all endpoints
  - Postman collection (optional)

### Phase 4: Security & Compliance
- [ ] Security audit checklist
  - Input validation (all endpoints)
  - SQL injection protection (if using DB)
  - XSS prevention (HTML rendering)
  - CSRF protection (if using cookies)
  - Rate limiting (protect against abuse)
  - API key rotation policy
- [ ] Privacy compliance
  - Data retention policy documented
  - User data handling documented
  - GDPR/CCPA compliance notes (if applicable)

### Phase 5: Production Readiness
- [ ] Backup strategy (if using files)
  - results/submissions.json
  - results/events.jsonl
  - KRL files
  - Snapshot strategy
- [ ] Monitoring & observability
  - Health check improvements (current: `/health`)
  - Error logging (structured logs)
  - Metrics collection (latency, error rate, throughput)
  - Uptime monitoring setup
- [ ] Rollback plan
  - Version strategy for receipts
  - Database migration strategy (if using DB)
  - Rollback procedure documented

## Success Criteria

### Mandatory for Launch
- ✅ All CI/CD checks passing
- ✅ Error boundary tests covering all endpoints
- ✅ Performance benchmarks within targets
- ✅ Documentation complete (API, Architecture, Deployment)
- ✅ Security audit checklist passed
- ✅ Monitoring & observability in place

### Nice to Have
- 📊 Dashboard for submission results
- 📱 Mobile-responsive landing page improvements
- 🎨 Dark mode support
- 🔐 OAuth2 support (optional)
- 📈 Real-time leaderboard updates

## Estimated Effort
- Phase 1: 2-3 commits (CI/CD, tests)
- Phase 2: 2-3 commits (edge cases, benchmarks)
- Phase 3: 2 commits (diagrams, examples, checklist)
- Phase 4: 1-2 commits (security audit)
- Phase 5: 1-2 commits (monitoring, rollback)

**Total:** ~8-12 commits for launch readiness

## Blocking Issues
None currently. All gates passing.

## Next Immediate Action
Create GitHub Actions workflow (`/.github/workflows/ci.yml`) - this is the highest impact for launch readiness.
