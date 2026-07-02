# Speclyn Production Roadmap

## Deployment Target: AWS ECS/Fargate

### Infrastructure
- **Frontend**: Next.js on ECS Fargate + CloudFront CDN
- **API**: Fastify on ECS Fargate behind ALB
- **Workers**: 4-7 ECS Fargate tasks (auto-scaling)
- **Database**: RDS PostgreSQL 16 (Multi-AZ)
- **Cache/Queue**: ElastiCache Redis 7 (cluster mode)
- **Storage**: S3 (speclyn-docs bucket)
- **AI**: AWS Bedrock (Claude Sonnet 4.6)
- **DNS**: Route 53
- **Secrets**: AWS Secrets Manager
- **CI/CD**: GitHub Actions → ECR → ECS deploy
- **Monitoring**: CloudWatch + Sentry + Axiom

---

## Phase 2 — Intelligence Layer

### 2.1 Semantic Search (pgvector)
- Enable `pgvector` extension on RDS
- Add `embedding VECTOR(1024)` column to `requirements` table
- Create Bedrock embeddings endpoint using `amazon.titan-embed-text-v2:0`
- Embed on requirement insert/update (doc-parser worker)
- API: `GET /projects/:id/requirements/search?q=auth` — cosine similarity search
- Frontend: Search bar in Requirements tab

### 2.2 Requirement Deduplication
- New `RequirementDeduplicationAgent` — detects overlapping/conflicting requirements
- Runs after doc-parser extracts requirements
- Groups similar requirements (>0.85 cosine similarity)
- UI: "Potential duplicates" section in Requirements tab with merge/dismiss actions

### 2.3 Auto-mapping Confidence Scores
- `EndpointMatchAgent` already produces confidence — display it in UI
- Coverage matrix shows confidence color (green >0.8, amber 0.5-0.8, red <0.5)
- Low-confidence mappings flagged for human review

### 2.4 Gap Analysis
- API: `GET /projects/:id/gaps` — requirements with no endpoint match
- Frontend: "Gap Analysis" sub-tab in Coverage showing unmapped requirements
- AI suggests potential endpoints that could cover each gap

### 2.5 Test Quality Scoring
- New `TestQualityAgent` — rates each generated test 1-5 stars
- Criteria: covers happy path, validates response schema, handles errors, tests edge cases
- UI: Star rating on each test in Execute tab

---

## Phase 3 — Credential Vault UI

### 3.1 Backend
- Already have `credential_references` table + AES-256-GCM encryption
- API routes: CRUD for credentials per project
- API routes: CRUD for environments per project
- Credential types: API key, Bearer token, Basic auth, OAuth 2.0 client credentials

### 3.2 Frontend
- New "Settings" tab in project detail (or sub-tab)
- Credential form: name, type, value (masked), environment
- Environment selector: dev / staging / prod
- Credentials never shown in full after save (masked with last 4 chars)

### 3.3 Test Runner Integration
- Environment selector on Execute tab (dropdown next to base URL)
- Selected environment determines which credentials + base URL to use
- Workers decrypt and inject as `SPECLYN_CRED_{ID}` env vars (already built)

---

## Phase 4 — CI/CD Integration

### 4.1 GitHub App
- Probot-based GitHub App
- Webhook: `pull_request.opened`, `pull_request.synchronize`
- On PR: triggers Speclyn run against PR's API (branch deployment URL)
- Posts coverage diff as PR comment
- Sets commit status check (pass/fail based on coverage threshold)

### 4.2 CLI Tool
- `@speclyn/cli` package: `npx speclyn run --project <id> --env staging`
- Authenticates via API key (new `api_keys` table)
- Streams test progress to terminal (SSE → stdout)
- Exits with code 0/1 based on pass/fail
- JSON output mode for CI parsing

### 4.3 Notifications
- Slack webhook integration per project
- Post on: run completed, coverage dropped, new defects
- Teams webhook (same pattern)

### 4.4 Coverage Gates
- Project setting: minimum coverage % (e.g., 80%)
- If run drops below threshold: mark as "gated failure"
- GitHub status check fails if below gate
- CLI exits with code 1

---

## Phase 5 — Advanced Test Authoring

### 5.1 Visual Test Editor
- Monaco editor in browser for each generated test
- Edit → save → re-run flow
- Diff view showing AI-generated vs human-edited
- Lock edited tests from auto-regeneration

### 5.2 Test Suites
- Group tests into named suites
- Define run order, parallel vs serial
- Shared fixtures (setup/teardown)
- Run specific suite from Execute tab

### 5.3 Contract Testing
- Compare API response against OpenAPI schema
- Report schema violations as defects
- Track schema drift over time

### 5.4 Auth Flow Testing
- OAuth 2.0 authorization code flow
- Token refresh testing
- Session expiry testing
- Multi-step auth sequences

---

## Phase 6 — Monitoring & Regression

### 6.1 Scheduled Runs
- Cron-based test execution (every N hours)
- EventBridge + ECS task scheduling
- Per-project schedule configuration

### 6.2 Regression Detection
- Track test results over time
- Alert when previously passing test fails
- Flaky test detection (passes/fails inconsistently)

### 6.3 Historical Trends
- Coverage % over time chart
- Pass rate trends
- Test execution time trends
- Defect open/close velocity

### 6.4 Incident Correlation
- Link test failures to deployment timestamps
- "This endpoint started failing 2h after deploy X"

---

## Phase 7 — Teams & Enterprise

### 7.1 Organizations
- Clerk Organizations for multi-user teams
- Role-based access: viewer, tester, admin
- Project-level permissions

### 7.2 Audit Log
- Immutable log of all actions (who, what, when)
- Filterable by user, project, action type
- Export as CSV/JSON

### 7.3 SSO
- SAML 2.0 via Clerk Enterprise
- OIDC support

### 7.4 Self-hosted
- Docker Compose for single-machine deploy
- Helm chart for Kubernetes
- Configuration via environment variables

---

## Phase 8 — Marketplace & Ecosystem

### 8.1 Spec Templates
- Pre-built requirement sets (payments, auth, CRUD, e-commerce)
- Import template → customize → run

### 8.2 Plugin System
- Custom document parsers (proprietary formats)
- Custom test generators (framework-specific)

### 8.3 Public API
- REST API with API key auth
- Webhooks for external integrations
- Rate limiting per API key

---

## AWS Infrastructure (Terraform)

```
VPC
├── Public Subnets (2 AZs)
│   ├── ALB (API)
│   └── NAT Gateway
├── Private Subnets (2 AZs)
│   ├── ECS Fargate Services
│   │   ├── api (2 tasks, auto-scale 2-10)
│   │   ├── web (2 tasks, auto-scale 2-6)
│   │   ├── worker-doc-parser (1 task)
│   │   ├── worker-test-generator (1 task)
│   │   ├── worker-api-runner (2 tasks, auto-scale 1-5)
│   │   └── worker-reporter (1 task)
│   ├── RDS PostgreSQL 16 (Multi-AZ, db.r6g.large)
│   └── ElastiCache Redis 7 (2 nodes, cache.r6g.large)
├── S3
│   └── speclyn-docs (versioning enabled)
├── CloudFront
│   └── web frontend CDN
├── ECR
│   └── Docker image repositories
├── Secrets Manager
│   └── CREDENTIAL_ENCRYPTION_KEY, CLERK_SECRET_KEY, etc.
└── CloudWatch
    └── Log groups, alarms, dashboards
```
