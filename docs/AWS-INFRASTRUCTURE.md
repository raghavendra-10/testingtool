# Speclyn AWS Infrastructure Reference

**Version:** 1.0.0
**Date:** 2026-06-26

Complete reference for every AWS resource created by Speclyn's CDK deployment.

---

## Table of Contents

1. [Stack Overview](#1-stack-overview)
2. [Networking (speclyn-network)](#2-networking)
3. [Secrets (speclyn-secrets)](#3-secrets)
4. [Data Layer (speclyn-data)](#4-data-layer)
5. [Event Bus (speclyn-events)](#5-event-bus)
6. [Compute (speclyn-compute)](#6-compute)
7. [Pipeline (speclyn-pipeline)](#7-pipeline)
8. [Observability (speclyn-observability)](#8-observability)
9. [IAM Roles & Policies](#9-iam-roles--policies)
10. [Security Groups](#10-security-groups)
11. [Network Diagram](#11-network-diagram)
12. [Data Flow Diagrams](#12-data-flow-diagrams)

---

## 1. Stack Overview

```
speclyn-network          ← VPC, subnets, NAT, VPC endpoints
  └── speclyn-secrets    ← Secrets Manager (DB + app credentials)
      └── speclyn-data   ← RDS PostgreSQL + ElastiCache Redis
          └── speclyn-events    ← EventBridge bus + rules
              └── speclyn-compute    ← ECS Fargate cluster + ALB
                  └── speclyn-pipeline      ← Step Functions
                      └── speclyn-observability  ← CloudWatch + SNS
```

Each stack depends on the one above it. CDK handles deployment order automatically.

---

## 2. Networking

**Stack:** `speclyn-network`
**File:** `infra/cdk/lib/network-stack.ts`

### VPC

| Property | Value |
|----------|-------|
| Name | speclyn-vpc |
| CIDR | 10.0.0.0/16 (default) |
| Availability Zones | 2 |
| NAT Gateways | 1 (cost-optimized) |

### Subnets

| Type | Name | CIDR Mask | Purpose |
|------|------|-----------|---------|
| PUBLIC | speclyn-public | /24 | ALB, NAT gateway |
| PRIVATE_WITH_EGRESS | speclyn-private | /24 | ECS Fargate tasks (outbound via NAT) |
| PRIVATE_ISOLATED | speclyn-isolated | /24 | RDS, ElastiCache (no internet access) |

### VPC Endpoints (avoid NAT charges)

| Endpoint | Type | Purpose |
|----------|------|---------|
| S3 | Gateway | Test file storage — zero data transfer cost |
| ECR | Interface | Docker image pulls |
| ECR Docker | Interface | Docker layer pulls |
| CloudWatch Logs | Interface | Log shipping |
| Secrets Manager | Interface | Secret retrieval |
| Bedrock Runtime | Interface | AI model calls |

---

## 3. Secrets

**Stack:** `speclyn-secrets`
**File:** `infra/cdk/lib/secrets-stack.ts`

### speclyn/database

| Field | Value |
|-------|-------|
| Secret Name | speclyn/database |
| username | speclyn |
| password | Auto-generated (32 chars, no punctuation) |
| dbname | speclyn |

Used by: RDS instance (credentials), ECS tasks (DATABASE_URL)

### speclyn/app

| Field | Description |
|-------|-------------|
| CLERK_SECRET_KEY | Clerk authentication secret |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk frontend key |
| ENCRYPTION_KEY | AES-256-GCM vault key (hex, 64 chars) |
| GITHUB_APP_ID | GitHub App integration ID |
| GITHUB_PRIVATE_KEY | GitHub App private key (PEM) |
| BITBUCKET_CLIENT_ID | Bitbucket OAuth consumer ID |
| BITBUCKET_CLIENT_SECRET | Bitbucket OAuth consumer secret |
| RESEND_API_KEY | Resend email API key |

**Note:** Initially created with `REPLACE_ME` placeholders. Must be populated manually via AWS Console or CLI before services will work.

---

## 4. Data Layer

**Stack:** `speclyn-data`
**File:** `infra/cdk/lib/data-stack.ts`

### RDS PostgreSQL

| Property | Value |
|----------|-------|
| Instance ID | speclyn-postgres |
| Engine | PostgreSQL 16.4 |
| Instance Type | db.t4g.medium (2 vCPU, 4GB RAM) |
| Storage | 20GB GP3, auto-scale to 100GB |
| Encryption | At rest (AWS-managed key) |
| Multi-AZ | No (single-AZ for cost) |
| Backup | 7 days retention |
| Performance Insights | Enabled |
| Monitoring | 60-second interval |
| Deletion Protection | Enabled |
| Subnet | Private Isolated |
| Removal Policy | RETAIN (survives `cdk destroy`) |

### ElastiCache Redis

| Property | Value |
|----------|-------|
| Cluster ID | speclyn-redis |
| Engine | Redis 7.1 |
| Node Type | cache.t4g.micro (2 vCPU, 0.5GB) |
| Nodes | 1 (single node for cost) |
| Encryption at Rest | Enabled |
| Transit Encryption | Disabled (ioredis default) |
| Automatic Failover | Disabled |
| Port | 6379 |
| Subnet | Private Isolated |

---

## 5. Event Bus

**Stack:** `speclyn-events`
**File:** `infra/cdk/lib/event-stack.ts`

### EventBridge Bus

| Property | Value |
|----------|-------|
| Bus Name | speclyn-events |
| Archive | 30-day retention |
| Log Group | /speclyn/events (2 weeks) |

### Event Rules

| Rule | Source | Detail Type | Purpose |
|------|--------|-------------|---------|
| speclyn-run-completed | speclyn.runner | RunCompleted | Trigger notifications on test run completion |
| speclyn-critical-defect | speclyn.reporter | DefectCreated | Alert on critical defects (filtered by severity=critical) |
| speclyn-code-analysis-completed | speclyn.analyzer | CodeAnalysisCompleted | Notify when code analysis finishes |
| speclyn-log-all | speclyn.* | * | Log all events to CloudWatch for debugging |

### Event Schema

**RunCompleted:**
```json
{
  "source": "speclyn.reporter",
  "detail-type": "RunCompleted",
  "detail": {
    "projectId": "uuid",
    "runId": "uuid",
    "status": "passed|failed|error",
    "passed": 15,
    "failed": 3,
    "coveragePercent": 78,
    "defectsCreated": 3
  }
}
```

**DefectCreated:**
```json
{
  "source": "speclyn.reporter",
  "detail-type": "DefectCreated",
  "detail": {
    "projectId": "uuid",
    "runId": "uuid",
    "defectCount": 3,
    "severity": "critical|high|medium|low"
  }
}
```

**CodeAnalysisCompleted:**
```json
{
  "source": "speclyn.analyzer",
  "detail-type": "CodeAnalysisCompleted",
  "detail": {
    "projectId": "uuid",
    "runId": "uuid",
    "totalFiles": 47,
    "totalIssues": 12
  }
}
```

---

## 6. Compute

**Stack:** `speclyn-compute`
**File:** `infra/cdk/lib/compute-stack.ts`

### ECS Cluster

| Property | Value |
|----------|-------|
| Cluster Name | speclyn |
| Container Insights | Enabled |
| Capacity Providers | FARGATE + FARGATE_SPOT |

### ECR Repositories

11 repositories, each with lifecycle rule keeping last 10 images:

| Repository | Image |
|------------|-------|
| speclyn/api | Fastify API server |
| speclyn/web | Next.js frontend |
| speclyn/worker-test-generator | Test generation (5 phases) |
| speclyn/worker-api-runner | Vitest execution |
| speclyn/worker-browser-runner | Playwright execution + healing |
| speclyn/worker-browser-test-generator | Browser test generation |
| speclyn/worker-reporter | Failure classification + webhooks |
| speclyn/worker-scheduler | Cron scheduler |
| speclyn/worker-repo-analyzer | Repository clone + endpoint discovery |
| speclyn/worker-doc-parser | Document parsing |
| speclyn/worker-code-analyzer | Code + schema analysis |

### Fargate Services

| Service | CPU | Memory | Desired | Capacity |
|---------|-----|--------|---------|----------|
| speclyn-api | 512 | 1024MB | 2 | On-Demand |
| speclyn-test-generator | 1024 | 2048MB | 1 | 80% Spot / 20% OD |
| speclyn-api-runner | 512 | 1024MB | 2 | 80% Spot / 20% OD |
| speclyn-browser-runner | 2048 | 4096MB | 1 | 80% Spot / 20% OD |
| speclyn-browser-test-gen | 1024 | 2048MB | 1 | 80% Spot / 20% OD |
| speclyn-reporter | 512 | 1024MB | 1 | 80% Spot / 20% OD |
| speclyn-scheduler | 256 | 512MB | 1 | 80% Spot / 20% OD |
| speclyn-repo-analyzer | 1024 | 2048MB | 1 | 80% Spot / 20% OD |
| speclyn-doc-parser | 512 | 1024MB | 1 | 80% Spot / 20% OD |
| speclyn-code-analyzer | 1024 | 2048MB | 1 | 80% Spot / 20% OD |

All workers: ARM64 architecture, circuit breaker with rollback enabled.

### Application Load Balancer

| Property | Value |
|----------|-------|
| Name | speclyn-api-alb |
| Scheme | Internet-facing |
| Listener | HTTP:80 (add HTTPS:443 for production) |
| Target Group | speclyn-api-tg (port 3001) |
| Health Check | GET /api/v1/health (30s interval) |
| Deregistration Delay | 30 seconds |

### Shared Environment Variables

All ECS tasks receive:

| Variable | Value |
|----------|-------|
| NODE_ENV | production |
| AWS_REGION | us-west-2 |
| REDIS_URL | redis://<elasticache-endpoint>:6379 |
| EVENT_BUS_NAME | speclyn-events |
| USE_AWS_SERVICES | true |

Plus secrets injected from Secrets Manager.

---

## 7. Pipeline

**Stack:** `speclyn-pipeline`
**File:** `infra/cdk/lib/pipeline-stack.ts`

### Step Functions State Machine

| Property | Value |
|----------|-------|
| Name | speclyn-test-pipeline |
| Timeout | 1 hour |
| X-Ray Tracing | Enabled |
| Log Level | ALL (with execution data) |
| Log Group | /speclyn/pipeline (2 weeks) |

### Workflow

```
Input: { projectId, runId, baseUrl, ownerId }

┌─────────────────────┐
│   GenerateTests     │  ECS RunTask (test-generator)
│   (5 test phases)   │  - Functional, Security, Auth
│                     │  - Multi-Tenant, HIPAA, Contract
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   ExecuteTests      │  ECS RunTask (api-runner)
│   (Vitest CLI)      │  - Runs all .test.ts files
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   GenerateReport    │  ECS RunTask (reporter)
│   (classify+cover)  │  - Failure classification
│                     │  - Coverage computation
│                     │  - Webhook delivery
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  EmitRunCompleted   │  EventBridge PutEvents
│                     │  source: speclyn.pipeline
│                     │  detail-type: RunCompleted
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   PipelineComplete  │  Succeed
└─────────────────────┘

On any error:
  → EmitRunFailed (EventBridge)
  → PipelineFailed (Fail state)
```

---

## 8. Observability

**Stack:** `speclyn-observability`
**File:** `infra/cdk/lib/observability-stack.ts`

### CloudWatch Dashboard: `speclyn-platform`

**Row 1 — Pipeline**
| Widget | Metrics |
|--------|---------|
| Test Pipeline Executions | Started, Succeeded, Failed (5-min) |
| Pipeline Duration (ms) | Execution time (5-min) |

**Row 2 — Cluster**
| Widget | Metrics |
|--------|---------|
| ECS CPU Utilization | Average across cluster (5-min) |
| ECS Memory Utilization | Average across cluster (5-min) |

**Row 3 — Workers**
| Widget | Metrics |
|--------|---------|
| Worker Errors | Sum per worker (test-gen, api-runner, browser, reporter, code-analyzer, doc-parser) |

**Row 4 — AI Agents**
| Widget | Metrics |
|--------|---------|
| Bedrock API Latency | p95 latency across all agents |
| Bedrock Token Usage | Sum of input + output tokens |

**Row 5 — Test Results**
| Widget | Metrics |
|--------|---------|
| Test Pass Rate (24h) | Average percentage |
| Total Tests Run (24h) | Sum count |
| Defects Created (24h) | Sum count |

### CloudWatch Alarms

| Alarm | Condition | Action |
|-------|-----------|--------|
| speclyn-pipeline-high-failure-rate | >3 failed executions in 10 min | SNS → speclyn-alerts |
| speclyn-ecs-high-cpu | CPU >80% for 15 min | SNS → speclyn-alerts |
| speclyn-ecs-high-memory | Memory >85% for 15 min | SNS → speclyn-alerts |

### SNS Topic

| Property | Value |
|----------|-------|
| Topic Name | speclyn-alerts |
| Display Name | Speclyn Platform Alerts |
| Subscribers | Add via Console or CLI (email, SMS, webhook) |

### Log Groups

| Log Group | Retention | Source |
|-----------|-----------|--------|
| /speclyn/api | 2 weeks | API Fargate tasks |
| /speclyn/worker-test-generator | 2 weeks | Test generator |
| /speclyn/worker-api-runner | 2 weeks | API runner |
| /speclyn/worker-browser-runner | 2 weeks | Browser runner |
| /speclyn/worker-browser-test-generator | 2 weeks | Browser test gen |
| /speclyn/worker-reporter | 2 weeks | Reporter |
| /speclyn/worker-scheduler | 2 weeks | Scheduler |
| /speclyn/worker-repo-analyzer | 2 weeks | Repo analyzer |
| /speclyn/worker-doc-parser | 2 weeks | Doc parser |
| /speclyn/worker-code-analyzer | 2 weeks | Code analyzer |
| /speclyn/events | 2 weeks | EventBridge events |
| /speclyn/pipeline | 2 weeks | Step Functions |

### Custom Metrics (published by application code)

| Namespace | Metric | Source |
|-----------|--------|--------|
| Speclyn/Agents | Latency | BaseAgent (per agent dimension) |
| Speclyn/Agents | InputTokens | BaseAgent (per agent dimension) |
| Speclyn/Agents | OutputTokens | BaseAgent (per agent dimension) |
| Speclyn/Tests | TestsExecuted | Reporter |
| Speclyn/Tests | PassRate | Reporter |
| Speclyn/Tests | DefectsCreated | Reporter |
| Speclyn/Workers | Errors | Each worker (future) |

---

## 9. IAM Roles & Policies

### speclyn-worker-role (Task Role)

Used by all ECS tasks for runtime AWS API calls.

| Permission | Resources |
|------------|-----------|
| bedrock:InvokeModel | * |
| bedrock:InvokeModelWithResponseStream | * |
| s3:GetObject, PutObject, DeleteObject, ListBucket | arn:aws:s3:::speclyn-* |
| secretsmanager:GetSecretValue | speclyn/database, speclyn/app |
| events:PutEvents | speclyn-events bus |
| xray:PutTraceSegments, PutTelemetryRecords | * |
| states:StartExecution, DescribeExecution | speclyn-* state machines |

### speclyn-ecs-exec-role (Execution Role)

Used by ECS to pull images and inject secrets.

| Permission | Source |
|------------|--------|
| AmazonECSTaskExecutionRolePolicy | AWS Managed |
| secretsmanager:GetSecretValue | speclyn/database, speclyn/app |

---

## 10. Security Groups

### speclyn-db-sg (RDS)

| Direction | Source | Port | Purpose |
|-----------|--------|------|---------|
| Inbound | speclyn-worker-sg | 5432 | Worker → PostgreSQL |
| Outbound | None | — | No outbound needed |

### speclyn-redis-sg (ElastiCache)

| Direction | Source | Port | Purpose |
|-----------|--------|------|---------|
| Inbound | speclyn-worker-sg | 6379 | Worker → Redis |
| Outbound | None | — | No outbound needed |

### speclyn-worker-sg (ECS Fargate)

| Direction | Source | Port | Purpose |
|-----------|--------|------|---------|
| Inbound | speclyn-api-sg | 3001 | ALB → API |
| Outbound | 0.0.0.0/0 | All | Internet (via NAT) |

### speclyn-api-sg (ALB)

| Direction | Source | Port | Purpose |
|-----------|--------|------|---------|
| Inbound | 0.0.0.0/0 | 80 | HTTP from internet |
| Inbound | 0.0.0.0/0 | 443 | HTTPS from internet |
| Outbound | 0.0.0.0/0 | All | To targets |

---

## 11. Network Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        speclyn-vpc                               │
│                                                                  │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐ │
│  │   Public Subnet (AZ-1)  │  │   Public Subnet (AZ-2)       │ │
│  │                          │  │                               │ │
│  │  ┌─────┐  ┌──────────┐  │  │                               │ │
│  │  │ NAT │  │   ALB    │  │  │                               │ │
│  │  └──┬──┘  └────┬─────┘  │  │                               │ │
│  └─────┼──────────┼────────┘  └───────────────────────────────┘ │
│        │          │                                              │
│  ┌─────┼──────────┼────────┐  ┌──────────────────────────────┐ │
│  │  Private Subnet (AZ-1) │  │  Private Subnet (AZ-2)       │ │
│  │        │       │        │  │                               │ │
│  │  ┌─────▼───────▼─────┐  │  │  ┌────────────────────────┐  │ │
│  │  │  Fargate Tasks     │  │  │  │  Fargate Tasks         │  │ │
│  │  │  - API (x2)        │  │  │  │  - Workers             │  │ │
│  │  │  - Workers         │  │  │  │                        │  │ │
│  │  └────────┬───────────┘  │  │  └────────────────────────┘  │ │
│  └───────────┼──────────────┘  └──────────────────────────────┘ │
│              │                                                   │
│  ┌───────────┼──────────────┐  ┌──────────────────────────────┐ │
│  │  Isolated Subnet (AZ-1) │  │  Isolated Subnet (AZ-2)     │ │
│  │           │              │  │                               │ │
│  │  ┌────────▼────────┐     │  │  ┌────────────────────┐      │ │
│  │  │  RDS PostgreSQL │     │  │  │  ElastiCache Redis │      │ │
│  │  │  (speclyn-db)   │     │  │  │  (speclyn-redis)   │      │ │
│  │  └─────────────────┘     │  │  └────────────────────┘      │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                  │
│  VPC Endpoints: S3, ECR, Bedrock, Secrets Manager, CloudWatch   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 12. Data Flow Diagrams

### Test Execution Flow

```
User clicks "Run Tests"
        │
        ▼
   Fastify API ──── POST /runs ────► BullMQ Queue (or Step Functions)
        │                                      │
        │                                      ▼
        │                            ┌──────────────────┐
        │                            │  test-generator   │
        │                            │  (Fargate task)   │
        │   SSE ◄──── Redis ◄──────  │  Phase 1-5:      │
        │   pub/sub                  │  Functional       │
        │                            │  Security         │
        │                            │  Contract         │
        │                            │  Auth Flow        │
        │                            │  Multi-Tenant     │
        │                            │  HIPAA            │
        │                            └────────┬─────────┘
        │                                     │
        │                                     ▼
        │                            ┌──────────────────┐
        │                            │  api-runner       │
        │   SSE ◄──── Redis ◄──────  │  (Fargate task)   │
        │                            │  Vitest CLI       │
        │                            └────────┬─────────┘
        │                                     │
        │                                     ▼
        │                            ┌──────────────────┐
        │                            │  reporter         │
        │                            │  (Fargate task)   │
        │                            │  - Classify       │
        │                            │  - Coverage       │
        │                            │  - Webhooks       │
        │                            │  - EventBridge    │
        │                            │  - CloudWatch     │
        │                            └────────┬─────────┘
        │                                     │
        ▼                                     ▼
   User sees live results            EventBridge → CloudWatch
   in browser via SSE                        → SNS Alerts
```

### Code Analysis Flow

```
User clicks "Analyze Code"
        │
        ▼
   Fastify API ──── POST /code-analysis ────► BullMQ Queue
        │                                           │
        │                                           ▼
        │                              ┌──────────────────────┐
        │                              │  code-analyzer        │
        │                              │  (Fargate task)       │
        │   WebSocket ◄──── Redis ◄──  │                       │
        │   updates                    │  1. Clone repo        │
        │                              │  2. Walk source files │
        │                              │  3. Per-file AI       │
        │                              │  4. Auto-detect SQL   │
        │                              │  5. Schema analysis   │
        │                              │  6. Store issues      │
        │                              └──────────────────────┘
        │                                           │
        ▼                                           ▼
   User sees issues                      EventBridge event
   with severity + recommendations       CodeAnalysisCompleted
```
