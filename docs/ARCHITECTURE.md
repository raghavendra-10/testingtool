# Speclyn Architecture Guide

**Version:** 3.0.0
**Date:** 2026-06-26

---

## Overview

Speclyn is an AI-powered autonomous testing platform that takes requirements, source code, and a live API URL as inputs — and produces executed test results, coverage reports, defects, and compliance findings as outputs.

```
Inputs                          Speclyn                              Outputs
──────                          ──────                               ───────
SRS / PRD docs ──┐                                           ┌── Test Results (pass/fail)
OpenAPI specs ───┤    ┌──────────────────────────────┐       ├── Coverage Reports
GitHub/BB repo ──┤───>│  AI Agents + BullMQ Workers  │──────>├── Defects (classified)
Live API URL ────┤    └──────────────────────────────┘       ├── Code Analysis Issues
SQL Schema ──────┘                                           ├── Schema Analysis Issues
                                                             ├── HIPAA Compliance Report
                                                             ├── k6 Performance Scripts
                                                             └── Webhook Notifications
```

---

## Monorepo Structure

```
speclyn/
├── apps/
│   ├── api/                    # Fastify REST API (port 3001)
│   └── web/                    # Next.js 14 frontend (port 3002)
├── packages/
│   ├── agents/                 # AI agents (Claude via AWS Bedrock)
│   ├── db/                     # Drizzle ORM schema + migrations
│   ├── shared-types/           # Job payloads, error codes, Redis helpers
│   ├── vault/                  # AES-256-GCM credential encryption
│   └── browser-test-harness/   # Playwright + axe-core test runner
├── workers/
│   ├── repo-analyzer/          # GitHub/Bitbucket repo clone + endpoint discovery
│   ├── doc-parser/             # SRS/PDF/DOCX → requirements extraction
│   ├── test-generator/         # AI test planning + code generation
│   ├── api-runner/             # Vitest execution of API tests
│   ├── browser-test-generator/ # AI browser test + accessibility test generation
│   ├── browser-runner/         # Playwright execution + self-healing
│   ├── reporter/               # Failure classification + coverage + webhooks
│   ├── scheduler/              # Cron-based scheduled test runs
│   └── code-analyzer/          # Static code + schema analysis
├── infra/
│   ├── cdk/                    # AWS CDK infrastructure (7 stacks)
│   ├── scripts/                # Deployment scripts (deploy.sh)
│   ├── docker-compose.yml      # Local development
│   └── docker-compose.prod.yml # Production Docker Compose
└── docs/                       # SRS, architecture, UI spec
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS, TanStack Query |
| API | Fastify 4, Zod validation, Clerk auth |
| Database | PostgreSQL + pgvector, Drizzle ORM |
| Queue | BullMQ + Redis (ioredis) |
| AI | AWS Bedrock (Claude claude-3-5-sonnet-20241022-v2:0) |
| Storage | AWS S3 (test files, evidence) |
| Auth | Clerk (user_... string IDs) |
| Browser | Playwright + @axe-core/playwright |
| Secrets | AES-256-GCM encrypted in PostgreSQL |

---

## AI Agents (packages/agents/)

All agents extend `BaseAgent<TInput, TOutput>` — calls Claude via Bedrock, validates output with Zod, retries 2x with exponential backoff, logs to `agent_decision_logs`.

| Agent | Purpose | Used In |
|-------|---------|---------|
| RequirementsAgent | Extract requirements from SRS text | doc-parser |
| EndpointMatchAgent | Match requirements to endpoints | doc-parser |
| TestPlannerAgent | Plan test cases per endpoint | test-generator |
| TestGeneratorAgent | Generate Vitest code per test case | test-generator |
| SecurityTestAgent | Generate OWASP security test cases | test-generator |
| AuthFlowTestAgent | Generate auth flow test scenarios | test-generator |
| ContractTestAgent | Validate response vs OpenAPI schema | test-generator |
| MultiTenantTestAgent | Generate tenant isolation tests | test-generator |
| HIPAAComplianceAgent | Generate HIPAA compliance tests | test-generator |
| PerformanceTestAgent | Generate k6 load test scripts | api (on-demand) |
| BrowserTestAgent | Generate Playwright test code | browser-test-generator |
| UIExplorerAgent | Explore UI pages for elements | browser-test-generator |
| AccessibilityTestAgent | Generate WCAG 2.1 AA tests | browser-test-generator |
| HealerAgent | Self-heal broken selectors | browser-runner |
| FailureClassifierAgent | Classify test failures | reporter |
| TestQualityAgent | Score test quality (1-5) | reporter |
| RequirementDeduplicationAgent | Deduplicate requirements | doc-parser |
| JavaCodeAnalyzerAgent | Analyze source code for issues | code-analyzer |
| SchemaAnalyzerAgent | Analyze SQL schema for issues | code-analyzer |

---

## Workers (BullMQ Queues)

| Worker | Queue | Concurrency | What It Does |
|--------|-------|-------------|-------------|
| repo-analyzer | analyze-repo | 1 | Clone repo, detect stack, extract endpoints (AST + OpenAPI) |
| doc-parser | parse-document | 2 | Extract requirements from uploaded docs |
| test-generator | generate-tests | 1 | Plan + generate tests (functional, security, auth, multi-tenant, HIPAA, contract) |
| api-runner | execute-api | 2 | Execute Vitest test files against live API |
| browser-test-generator | generate-browser-tests | 1 | Generate Playwright tests + accessibility tests |
| browser-runner | execute-browser | 1 | Run Playwright tests with self-healing |
| reporter | generate-report | 2 | Classify failures, compute coverage, fire webhooks |
| scheduler | (cron) | 1 | Scheduled test runs |
| code-analyzer | analyze-code + analyze-schema | 1+2 | Static code analysis + schema analysis |

---

## Test Generation Pipeline

When a user clicks "Run Tests":

```
1. POST /projects/:id/runs
   └─> BullMQ: generate-tests queue

2. test-generator worker:
   ├── Phase 1: Functional tests (per endpoint)
   │   ├── TestPlannerAgent → plan test cases
   │   └── TestGeneratorAgent → generate Vitest code
   ├── Phase 2a: Security tests (POST/PUT/PATCH endpoints)
   │   └── SecurityTestAgent → OWASP test cases → deterministic code
   ├── Phase 2b: Contract checks (GET endpoints)
   │   └── Probe fetch → ContractTestAgent → SSE event
   ├── Phase 3: Auth flow tests (if login endpoint exists)
   │   └── AuthFlowTestAgent → multi-step auth scenarios
   ├── Phase 4: Multi-tenant tests (if resource endpoints exist)
   │   └── MultiTenantTestAgent → tenant isolation tests
   └── Phase 5: HIPAA compliance tests
       └── HIPAAComplianceAgent → PHI protection, audit, access control tests

3. BullMQ: execute-api queue
   └── api-runner: execute each .test.ts via Vitest CLI

4. BullMQ: generate-report queue
   └── reporter: classify failures, compute coverage, fire webhooks
```

---

## Code Analysis Pipeline

When a user clicks "Analyze Code":

```
1. POST /projects/:id/code-analysis
   └─> BullMQ: analyze-code queue

2. code-analyzer worker:
   ├── Clone connected repo (GitHub/Bitbucket)
   ├── Walk source files by language extension
   ├── For each file: JavaCodeAnalyzerAgent → issues
   │   Categories checked:
   │   ├── Code Structure (DTO/Entity separation, god classes)
   │   ├── API Pattern (controller→service→repo, error handling)
   │   ├── Auth & Security (RBAC, JWT validation, ownership checks)
   │   ├── SQL Security (injection, parameterized queries, SELECT *)
   │   ├── Hardcoded Secrets (passwords, API keys in source)
   │   ├── Input Validation (null checks, field validation)
   │   ├── Error Handling (swallowed exceptions, stack traces)
   │   ├── Logging (PII/PHI in logs)
   │   ├── Deprecated Usage (old APIs, EOL libs)
   │   ├── Naming Convention (package, class, method naming)
   │   ├── Transaction Handling (@Transactional, rollback)
   │   ├── Data Exposure (sensitive fields in responses)
   │   ├── Encryption (weak algorithms, missing at-rest)
   │   ├── Multi-Tenant (missing tenant filtering)
   │   └── HIPAA (PHI unencrypted, missing audit)
   │
   ├── Auto-detect SQL migrations (Flyway/Liquibase)
   └── If found: SchemaAnalyzerAgent → schema issues
       Categories checked:
       ├── Table Structure (missing PKs, audit columns)
       ├── Column Types (wrong types, missing NOT NULL)
       ├── Missing Constraints (UNIQUE, CHECK)
       ├── Missing Indexes (FK columns, filter columns)
       ├── Missing Foreign Keys (orphan columns)
       ├── Naming Convention (snake_case consistency)
       ├── Cascade Rules (DELETE/UPDATE rules)
       ├── Soft Delete (indexed correctly)
       ├── Referential Integrity (circular refs, M:N)
       ├── Multi-Tenant Isolation (missing tenant_id)
       └── HIPAA Field (PHI encryption, audit)
```

---

## Schema Analysis Pipeline

When a user pastes SQL and clicks "Analyze Schema":

```
1. POST /projects/:id/schema-analysis
   └─> BullMQ: analyze-schema queue

2. code-analyzer worker (schema sub-worker):
   ├── Send SQL content to SchemaAnalyzerAgent
   └── Store issues with table, column, severity, recommendation
```

---

## Database Tables

### Core
| Table | Purpose |
|-------|---------|
| projects | User projects |
| source_documents | Uploaded SRS/spec files |
| requirements | Extracted requirements |
| endpoints | Discovered API endpoints |
| repository_connections | GitHub/Bitbucket connections |
| environments | Base URLs per environment |
| credentials / credential_references | Encrypted test credentials |

### Testing
| Table | Purpose |
|-------|---------|
| generated_tests | AI-generated test files |
| test_suites | Test grouping |
| coverage_links | Requirement ↔ test mapping |
| execution_runs | Test run metadata |
| execution_steps | Individual test results |
| evidence | Screenshots, traces |
| defects | Classified failures |

### Analysis
| Table | Purpose |
|-------|---------|
| code_analysis_runs | Code analysis job tracking |
| code_issues | Findings from code analysis |
| schema_analysis_runs | Schema analysis job tracking |
| schema_issues | Findings from schema analysis |

### Platform
| Table | Purpose |
|-------|---------|
| agent_decision_logs | AI agent call logs |
| api_keys | API authentication keys |
| audit_logs | User action audit trail |
| schedules | Cron schedules for automated runs |
| outbound_webhooks | Webhook delivery configuration |
| spec_templates | Pre-built project templates |
| organizations / org_members | Multi-org support (planned) |

---

## API Routes

### Projects
- `GET/POST /api/v1/projects` — list/create projects
- `GET/PATCH/DELETE /api/v1/projects/:id` — project CRUD

### Documents & Requirements
- `POST /api/v1/projects/:id/documents` — upload SRS/spec
- `GET /api/v1/projects/:id/requirements` — list requirements

### Endpoints & Repositories
- `GET /api/v1/projects/:id/endpoints` — list discovered endpoints
- `POST /api/v1/projects/:id/repositories` — connect GitHub/Bitbucket

### Test Execution
- `POST /api/v1/projects/:id/runs` — trigger API test run
- `POST /api/v1/projects/:id/browser-runs` — trigger browser test run
- `GET /api/v1/projects/:id/runs` — list runs
- `GET /api/v1/projects/:id/runs/:runId` — run detail with steps
- `POST /api/v1/projects/:id/runs/:runId/cancel` — cancel run
- `GET /api/v1/projects/:id/runs/:runId/events` — SSE live stream

### Code & Schema Analysis
- `POST /api/v1/projects/:id/code-analysis` — trigger code analysis
- `GET /api/v1/projects/:id/code-analysis` — list analysis runs
- `GET /api/v1/projects/:id/code-analysis/:runId` — run detail with issues
- `POST /api/v1/projects/:id/schema-analysis` — trigger schema analysis
- `GET /api/v1/projects/:id/schema-analysis` — list schema runs
- `GET /api/v1/projects/:id/schema-analysis/:runId` — run detail with issues

### Performance
- `POST /api/v1/projects/:id/performance/k6` — generate k6 load test script

### Coverage & Defects
- `GET /api/v1/projects/:id/coverage` — requirement coverage matrix
- `GET /api/v1/projects/:id/defects` — classified failures

### Settings
- `CRUD /api/v1/projects/:id/environments` — environment management
- `CRUD /api/v1/projects/:id/credentials` — test credentials
- `CRUD /api/v1/projects/:id/webhooks` — outbound webhooks
- `CRUD /api/v1/projects/:id/schedules` — scheduled runs

### Webhooks (Inbound)
- `POST /api/v1/webhooks/github` — GitHub push webhook
- `POST /api/v1/webhooks/bitbucket` — Bitbucket push webhook

---

## Frontend Pages (Next.js)

| Path | Page | Description |
|------|------|-------------|
| /projects/:id | Spec Docs | Upload SRS/spec documents |
| /projects/:id/requirements | Requirements | View extracted requirements |
| /projects/:id/endpoints | Endpoints | View discovered API endpoints |
| /projects/:id/repositories | Repositories | Connect GitHub/Bitbucket |
| /projects/:id/tests | Tests | View generated test code |
| /projects/:id/execute | Execute | Run tests (API, Browser, Performance tabs) |
| /projects/:id/analysis | Analysis | Code analysis + Schema analysis |
| /projects/:id/coverage | Coverage | Requirement → test coverage matrix |
| /projects/:id/defects | Defects | Classified failure reports |
| /projects/:id/schedules | Schedules | Scheduled test runs |
| /projects/:id/audit | Audit Log | User action audit trail |
| /projects/:id/settings/* | Settings | Environments, credentials, API keys, webhooks |

---

## Testing Categories

### 1. Functional API Testing
- Generated from requirements + OpenAPI spec
- Vitest code tests each endpoint's happy/error paths
- Tests stored in S3, executed via Vitest CLI

### 2. Security Testing (OWASP)
- SQL injection, XSS, IDOR, auth bypass, CSRF, header injection
- Generated for POST/PUT/PATCH endpoints with request bodies
- Deterministic code templates (no extra LLM call for code)

### 3. Contract Testing
- Probes GET endpoints at test generation time
- Validates actual response vs OpenAPI schema
- Reports violations as SSE events in live log

### 4. Auth Flow Testing
- Multi-step scenarios: valid token, expired, invalid, missing, wrong scope
- Generated once per project if login endpoint detected

### 5. Multi-Tenant Isolation Testing
- Cross-tenant data read/write/delete attempts
- Missing tenant scoping detection
- Admin escalation testing

### 6. HIPAA Compliance Testing
- PHI exposure in errors/responses
- Audit trail verification
- Access control for PHI endpoints
- Minimum necessary principle

### 7. Browser/UI Testing
- Playwright tests generated per page URL
- AI explores UI elements before generating
- Self-healing via HealerAgent on selector failures

### 8. Accessibility Testing
- WCAG 2.1 AA compliance via @axe-core/playwright
- One test per page URL
- Stored alongside browser tests

### 9. Performance Testing
- k6 load test scripts generated on demand
- Covers all endpoints with ramp stages
- User downloads and runs locally

### 10. Code Analysis
- Static analysis of Java/Python/Go/TS/JS source code
- 15 categories: code structure, API patterns, security, SQL, secrets, validation, etc.
- Runs against connected repository

### 11. Schema Analysis
- Database schema validation from SQL or migrations
- 14 categories: table structure, indexes, FK, naming, multi-tenant, HIPAA
- Upload SQL or auto-detect from repo migrations

---

## Outbound Webhooks

The reporter fires HMAC-SHA256 signed webhooks on:
- `run_completed` — test run finished
- `defect_created` — new defects found
- `coverage_changed` — coverage percentage changed

Signature: `X-Speclyn-Signature: sha256=<hmac_hex>`

---

## AWS Infrastructure (CDK)

Speclyn uses AWS CDK (TypeScript) to define all cloud infrastructure. The CDK project lives in `infra/cdk/` and deploys 7 stacks:

### Stacks

| Stack | Resources |
|-------|-----------|
| `speclyn-network` | VPC (2 AZs, public/private/isolated subnets), NAT gateway, VPC endpoints (S3, ECR, Bedrock, Secrets Manager, CloudWatch) |
| `speclyn-secrets` | Secrets Manager secrets for DB credentials and app secrets (Clerk, encryption key, GitHub, Bitbucket) |
| `speclyn-data` | RDS PostgreSQL 16 (t4g.medium, encrypted, 7-day backup), ElastiCache Redis 7.1 (t4g.micro, encrypted at rest) |
| `speclyn-events` | EventBridge event bus with 30-day archive, rules for RunCompleted, DefectCreated, CodeAnalysisCompleted |
| `speclyn-compute` | ECS Fargate cluster, 11 ECR repositories, 9 worker services (Spot 80%/On-Demand 20%), API service with ALB |
| `speclyn-pipeline` | Step Functions state machine: GenerateTests → ExecuteTests → GenerateReport, with error handling and EventBridge integration |
| `speclyn-observability` | CloudWatch dashboard (pipeline executions, ECS CPU/memory, worker errors, agent latency, token usage, test pass rate), alarms (pipeline failure >50%, CPU >80%, memory >85%), SNS alert topic |

### Architecture Diagram

```
Internet → ALB → Speclyn API (Fargate, 2 tasks)
                     │
                     ├── Step Functions (test pipeline)
                     │   ├── test-generator (Fargate)
                     │   ├── api-runner (Fargate)
                     │   └── reporter (Fargate)
                     │
                     ├── Long-running workers (Fargate)
                     │   ├── doc-parser, repo-analyzer, scheduler
                     │   ├── browser-test-generator, browser-runner
                     │   └── code-analyzer
                     │
                     ├── RDS PostgreSQL (isolated subnet)
                     ├── ElastiCache Redis (isolated subnet)
                     ├── S3 (test files, evidence)
                     ├── Bedrock (Claude AI)
                     ├── Secrets Manager
                     ├── EventBridge → CloudWatch Logs
                     └── CloudWatch Dashboard + Alarms → SNS
```

### Feature Flags

Workers detect `USE_AWS_SERVICES=true` to switch between:
- **Local (false):** BullMQ + Redis pub/sub (no AWS SDK calls)
- **Production (true):** EventBridge events + CloudWatch metrics + Secrets Manager

### Deployment

```bash
# 1. Bootstrap CDK (first time only)
cd infra/cdk && npm run bootstrap

# 2. Deploy all stacks
npm run deploy

# 3. Populate app secrets in AWS Console:
#    Secrets Manager → speclyn/app → Edit

# 4. Build and push Docker images
cd ../.. && ./infra/scripts/deploy.sh all

# 5. Force ECS service update (after image push)
aws ecs update-service --cluster speclyn --service speclyn-api --force-new-deployment
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| REDIS_URL | Yes | Redis connection string |
| AWS_ACCESS_KEY_ID | Yes | AWS credentials for Bedrock + S3 |
| AWS_SECRET_ACCESS_KEY | Yes | AWS credentials |
| AWS_REGION | No | Default: us-west-2 |
| S3_BUCKET | Yes | S3 bucket for test files |
| BEDROCK_MODEL_ID | No | Default: anthropic.claude-3-5-sonnet-20241022-v2:0 |
| CLERK_SECRET_KEY | Yes | Clerk authentication |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Yes | Clerk frontend key |
| ENCRYPTION_KEY | Yes | AES-256-GCM key for vault |
| GITHUB_APP_ID | No | GitHub App integration |
| GITHUB_PRIVATE_KEY | No | GitHub App private key |
| BITBUCKET_CLIENT_ID | No | Bitbucket OAuth |
| BITBUCKET_CLIENT_SECRET | No | Bitbucket OAuth |
| ALLOWED_ORIGINS | No | CORS origins (default: localhost:3002) |
| FALLBACK_BASE_URL | No | Default base URL if no environment set |
| USE_AWS_SERVICES | No | Enable EventBridge + CloudWatch (default: false) |
| EVENT_BUS_NAME | No | EventBridge bus name (default: speclyn-events) |
| STATE_MACHINE_ARN | No | Step Functions ARN for test pipeline |

---

## Running Locally

```bash
# Start PostgreSQL + Redis
cd infra && docker compose up -d

# Install dependencies
pnpm install

# Push DB schema
pnpm db:migrate

# Start all services (API + Web + Workers)
pnpm dev

# Or start individually:
pnpm --filter @speclyn/api dev          # API on :3001
pnpm --filter @speclyn/web dev          # Web on :3002
pnpm --filter @speclyn/worker-* dev     # Each worker
```

---

## Deploying to AWS

```bash
# 1. Configure AWS credentials
aws configure

# 2. Bootstrap CDK (first time)
cd infra/cdk && npm install && npm run bootstrap

# 3. Deploy infrastructure
npm run deploy

# 4. Update secrets in AWS Console
# Go to Secrets Manager → speclyn/app → paste real values

# 5. Run DB migrations against RDS
DATABASE_URL="postgresql://speclyn:<password>@<rds-endpoint>:5432/speclyn" pnpm db:migrate

# 6. Build + push all Docker images
./infra/scripts/deploy.sh all

# 7. Verify
# API: curl http://<ALB-DNS>/api/v1/health
# Dashboard: CloudWatch → Dashboards → speclyn-platform
```

---

## Database Migrations

```bash
cd packages/db
pnpm drizzle-kit generate    # Generate migration
pnpm drizzle-kit push        # Push to database
```
