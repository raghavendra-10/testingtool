# Speclyn — Software Requirements Specification (SRS)
### *"From Spec to Certainty — Automatically."*

**Document Version:** 2.0.0
**Date:** 2026-06-26
**Status:** Draft — Updated with code analysis, schema analysis, multi-tenant, HIPAA modules
**Author:** Founder / Product Owner

> **Audit note v1.1.0 (2026-06-10):** REQ-CON-003 and REQ-SEC-P-009 reworded to match
> Railway MVP isolation reality (context-level, not container-per-run). REQ-UI-008
> downgraded from auto-apply to propose-only. Acceptance criteria re-scoped to match
> the vertical-slice MVP (API testing first; UI testing in v2). "swagger" standardised
> to "OpenAPI" throughout.
>
> **Audit note v1.2.0 (2026-06-10):** REQ-RPT-002 adds NOT_STARTED status (A-12).
> REQ-ING-001 clarifies scanned-PDF rejection (A-9). REQ-SEC-P-007 rewritten to
> app-level egress control (B-3). §3.1 declares single-user MVP scope (C-3).
> REQ-AUD-005 references unified REDACT_KEYS list (C-5). Acceptance criterion #8
> adds stream-token requirement (B-1). REQ-INT-006 updated to AES-GCM secrets model (B-8).
>
> **Update v2.0.0 (2026-06-26):** Added Module 13 (Static Code Analysis), Module 14
> (Database Schema Analysis), Module 15 (Multi-Tenant Isolation Testing), Module 16
> (HIPAA Compliance Testing). All four modules are implemented and wired end-to-end.

---

## TABLE OF CONTENTS

1. [Introduction](#1-introduction)
2. [Authentication](#2-authentication)
3. [Product Overview](#3-product-overview)
4. [Stakeholders & User Roles](#4-stakeholders--user-roles)
5. [System Constraints & Assumptions](#5-system-constraints--assumptions)
6. [Functional Requirements — Core Platform](#6-functional-requirements--core-platform)
7. [Functional Requirements — Module 1: Functional Testing](#7-module-1--functional-testing)
8. [Functional Requirements — Module 2: Regression Testing](#8-module-2--regression-testing)
9. [Functional Requirements — Module 3: API Testing](#9-module-3--api-testing)
10. [Functional Requirements — Module 4: UI / End-to-End Testing](#10-module-4--ui--end-to-end-testing)
11. [Functional Requirements — Module 5: AI/LLM Testing](#11-module-5--aillm-testing)
12. [Functional Requirements — Module 6: Security Testing](#12-module-6--security-testing)
13. [Functional Requirements — Module 7: Performance & Load Testing](#13-module-7--performance--load-testing)
14. [Functional Requirements — Module 8: Compatibility Testing](#14-module-8--compatibility-testing)
15. [Functional Requirements — Module 9: Accessibility Testing](#15-module-9--accessibility-testing)
16. [Functional Requirements — Module 10: Compliance & Audit](#16-module-10--compliance--audit)
17. [Functional Requirements — Module 11: Data Testing](#17-module-11--data-testing)
18. [Functional Requirements — Module 12: Production Monitoring](#18-module-12--production-testingmonitoring)
19. [Functional Requirements — Module 13: Static Code Analysis](#19-module-13--static-code-analysis)
20. [Functional Requirements — Module 14: Database Schema Analysis](#20-module-14--database-schema-analysis)
21. [Functional Requirements — Module 15: Multi-Tenant Isolation Testing](#21-module-15--multi-tenant-isolation-testing)
22. [Functional Requirements — Module 16: HIPAA Compliance Testing](#22-module-16--hipaa-compliance-testing)
23. [Non-Functional Requirements](#23-non-functional-requirements)
24. [Integration Requirements](#24-integration-requirements)
25. [Security Requirements](#25-security-requirements)
26. [Acceptance Criteria Summary](#26-acceptance-criteria-summary)

---

## 1. Introduction

### 1.1 Purpose

This document defines the complete software requirements for **Speclyn** — an AI-powered autonomous testing platform. It serves as the authoritative reference for what the system must do, how it must behave, and what constraints it must respect.

### 1.2 Scope

Speclyn automates the full testing lifecycle:

```
SRS / PRD document
    +
Bitbucket repository
    +
Live application URL
    +
Test credentials
    ↓
[Speclyn Platform]
    ↓
Executed test suite
    +
Coverage report
    +
Defect reports with evidence
```

### 1.3 Definitions

| Term | Definition |
|------|-----------|
| SRS | Software Requirements Specification — source document describing what the system under test should do |
| PRD | Product Requirements Document — alternative to SRS |
| Flow | A user journey composed of ordered steps (e.g. login → add to cart → checkout) |
| Requirement | A single testable statement of expected system behaviour |
| Generated Test | TypeScript test code produced by the AI agent |
| Execution Run | A single invocation of the test suite against an environment |
| Evidence | Artifacts captured during test execution (screenshot, API response, trace) |
| Defect | A structured bug report produced when a test fails |
| Self-Healing | Automatic repair of a broken test selector without human intervention |
| Coverage Link | A record connecting a requirement to a test case |

---

## 2. Authentication

### 2.1 Account Creation & Login

> **Decision (updated 2026-06-12):** Email verification is **enabled**. A user registers with email + password, verifies via the Clerk email link, then lands on the dashboard. This is the safer default for production use and avoids needing to re-enable verification later.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-AUTH-001 | The system shall allow a new user to create an account with an email address and password | CRITICAL |
| REQ-AUTH-002 | Account creation requires email verification via a Clerk-sent link before the user can access the dashboard | CRITICAL |
| REQ-AUTH-003 | The system shall allow a registered user to sign in with email and password | CRITICAL |
| REQ-AUTH-004 | The system shall redirect an unauthenticated user to the login page for any protected route | CRITICAL |
| REQ-AUTH-005 | The system shall provide a "Forgot Password" flow that sends a reset link to the registered email | HIGH |
| REQ-AUTH-006 | Sessions shall expire after 7 days of inactivity; the user shall be redirected to login | HIGH |
| REQ-AUTH-007 | Passwords shall meet minimum security: ≥8 characters, enforced client-side and server-side | HIGH |
| REQ-AUTH-008 | The system shall never expose the Clerk secret key to the frontend or any public-facing response | CRITICAL |

### 2.2 Auth User Flow

```
New user
  │
  ├─ GET /sign-up
  │     Fill: email + password (≥8 chars)
  │     Submit → Clerk creates user
  │     No email verification step
  │     ↓
  │     Redirect → /projects (dashboard)
  │
Returning user
  │
  ├─ GET /sign-in
  │     Fill: email + password
  │     Submit → Clerk validates
  │     ↓
  │     Redirect → /projects (dashboard)
  │
Protected route without session
  │
  └─ Any /projects/*, /execute, etc.
        ↓
        Redirect → /sign-in?redirect_url={current_path}
        After login → return to original URL
```

---

## 3. Product Overview

### 3.1 Product Vision

Speclyn eliminates the manual effort of writing, maintaining, and reporting on tests. A team provides their specification document and application access — Speclyn produces a running, evidence-backed test suite.

### 2.2 Core Value Propositions

1. **Zero test authoring** — Tests are generated from requirements and code, not written by hand
2. **Full traceability** — Every test is linked to the requirement it validates
3. **Self-maintaining** — Broken selectors and changed flows are healed automatically
4. **Complete coverage** — 12 testing modules cover every layer of quality in one platform
5. **Evidence-first** — Every result is backed by screenshots, API responses, and logs

### 2.3 MVP Scope

The following modules are in scope for MVP (v1):

- Core Platform (ingestion, generation, execution, reporting)
- Module 1: Functional Testing
- Module 2: Regression Testing
- Module 3: API Testing
- Module 4: UI / End-to-End Testing
- Module 10: Compliance & Audit (logging only)
- Module 11: Data Testing (schema validation)

---

## 4. Stakeholders & User Roles

> **MVP Scope (C-3):** The initial release supports a **single authenticated user per
> deployment**. Multi-user teams, role-based access control (RBAC), and row-level
> security are v2 features. All projects in MVP belong to the one registered owner.
> Do not claim or implement tenant-level RBAC in the MVP build.

### 3.1 External Users

| Role | Description | Primary Action |
|------|-------------|----------------|
| **Project Owner** | Creates and configures the project | Setup, review reports |
| **QA Engineer** | Reviews generated tests, approves/edits before execution | Test review, manual healing |
| **Engineering Manager** | Views coverage and defect reports | Dashboard, export reports |
| **Developer** | Views failing tests and defects, fixes code | Defect detail, evidence |

### 3.2 System Actors (Internal)

| Actor | Description |
|-------|-------------|
| **Requirements Agent** | LLM agent that extracts structured requirements from documents |
| **Repo Agent** | Analyzes Bitbucket codebase to discover endpoints and routes |
| **Test Planner Agent** | Maps requirements to test cases |
| **Test Generator Agent** | Produces executable TypeScript test code |
| **UI Explorer Agent** | Spiders the live application with Playwright |
| **Failure Classifier Agent** | Classifies test failures by root cause |
| **Healer Agent** | Repairs broken test selectors |
| **Reporting Agent** | Generates coverage matrix and defect reports |

---

## 4. System Constraints & Assumptions

### 4.1 Constraints

- REQ-CON-001: The system shall never store plaintext credentials in the database
- REQ-CON-002: The system shall never execute cloned repository code
- REQ-CON-003: [MVP] Browser execution workers shall run in isolated BrowserContext instances on a long-lived worker process; [v2] each execution run shall get an ephemeral Docker container on ECS Fargate. Railway (MVP host) does not support container-per-run without Docker-in-Docker.
- REQ-CON-004: The system shall only access URLs explicitly provided by the user
- REQ-CON-005: The system shall respect robots.txt when spidering live applications
- REQ-CON-006: Production environment tests shall only include smoke tests tagged as `production_safe`

### 4.2 Assumptions

- The user provides a staging or test environment URL, not production, for full test execution
- The Bitbucket repository uses standard route patterns (Express, Next.js, FastAPI, Spring)
- Test credentials are valid at the time of execution
- SRS documents may be incomplete or ambiguous — the system must handle this gracefully
- Generated tests may not be 100% correct on first generation — a review step is provided

---

## 5. Functional Requirements — Core Platform

### 5.1 Project Management

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-CORE-001 | The system shall allow users to create a project with a name and description | CRITICAL |
| REQ-CORE-002 | The system shall allow multiple documents to be uploaded per project | HIGH |
| REQ-CORE-003 | The system shall allow multiple environments (staging, production) per project | HIGH |
| REQ-CORE-004 | The system shall allow multiple user roles with separate credentials per project | HIGH |
| REQ-CORE-005 | The system shall display real-time analysis progress via server-sent events | HIGH |
| REQ-CORE-006 | The system shall support Bitbucket repository connection via OAuth 2.0 | CRITICAL |

### 5.2 Document Ingestion

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-ING-001 | The system shall accept documents in text-based PDF (scanned/image-only PDFs must be rejected with an actionable error — not silently accepted), DOCX, and Markdown formats | CRITICAL |
| REQ-ING-002 | The system shall extract plain text from uploaded documents deterministically | CRITICAL |
| REQ-ING-003 | The system shall chunk documents into ≤4000 token segments for LLM processing | HIGH |
| REQ-ING-004 | The system shall store a confidence score (0.0–1.0) for each extracted requirement | HIGH |
| REQ-ING-005 | The system shall flag requirements with confidence < 0.6 for human review | HIGH |
| REQ-ING-006 | The system shall flag contradictory or ambiguous requirements separately | HIGH |
| REQ-ING-007 | The system shall accept OpenAPI (YAML/JSON) and Postman collection files | HIGH |

### 5.3 Repository Analysis

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-REPO-001 | The system shall clone Bitbucket repositories using shallow clone (depth=1) | CRITICAL |
| REQ-REPO-002 | The system shall detect the technology stack deterministically from config files | CRITICAL |
| REQ-REPO-003 | The system shall extract API routes using AST analysis (not regex alone) | HIGH |
| REQ-REPO-004 | The system shall delete cloned repository data after analysis completes | CRITICAL |
| REQ-REPO-005 | The system shall support TypeScript/JavaScript, Python, and Java repositories | HIGH |
| REQ-REPO-006 | The system shall use LLM analysis only for auth patterns and business logic, not route extraction | MEDIUM |

### 5.4 Test Generation

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-GEN-001 | The system shall generate TypeScript test code for all discovered flows | CRITICAL |
| REQ-GEN-002 | The system shall validate generated code compiles before storing it | CRITICAL |
| REQ-GEN-003 | The system shall retry code generation once if compilation fails, then flag for review | HIGH |
| REQ-GEN-004 | The system shall never hard-code credentials in generated test code | CRITICAL |
| REQ-GEN-005 | The system shall store generated tests with their source flow and requirement references | HIGH |
| REQ-GEN-006 | The system shall allow users to view and edit generated test code before execution | HIGH |

### 5.5 Test Execution

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-EXEC-001 | The system shall execute tests in isolated worker processes | CRITICAL |
| REQ-EXEC-002 | The system shall stream execution results to the frontend in real time via SSE | HIGH |
| REQ-EXEC-003 | The system shall capture evidence (screenshots, API responses) for every test step | CRITICAL |
| REQ-EXEC-004 | The system shall resolve credentials from the secrets vault immediately before execution | CRITICAL |
| REQ-EXEC-005 | The system shall classify each failure by root cause category | HIGH |
| REQ-EXEC-006 | The system shall retry flaky tests once before marking as failed | MEDIUM |
| REQ-EXEC-007 | The system shall terminate any worker that exceeds 10 minutes of execution time | HIGH |

### 5.6 Reporting

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-RPT-001 | The system shall produce a requirements coverage matrix for every execution run | CRITICAL |
| REQ-RPT-002 | The system shall classify each requirement as COVERED / PARTIAL / FAILING / NOT_TESTED / NOT_STARTED. NOT_TESTED = no test was ever generated. NOT_STARTED = a test exists but was not executed in this run. | CRITICAL |
| REQ-RPT-003 | The system shall generate a structured defect record for every failed test | HIGH |
| REQ-RPT-004 | The system shall export reports as PDF and JSON | HIGH |
| REQ-RPT-005 | The system shall link every defect to its source requirement | HIGH |
| REQ-RPT-006 | The system shall retain execution evidence for a minimum of 30 days | MEDIUM |

---

## 6. Module 1 — Functional Testing

**Purpose:** Verify the application behaves exactly as described in the SRS/PRD.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-FN-001 | The system shall extract at least one test case per HIGH and CRITICAL priority requirement | CRITICAL |
| REQ-FN-002 | The system shall generate happy path, negative, and edge case variants per flow | HIGH |
| REQ-FN-003 | The system shall link each generated test to its source requirement via coverage_links | CRITICAL |
| REQ-FN-004 | The system shall display which requirements have no generated test (NOT_TESTED status) | HIGH |
| REQ-FN-005 | The system shall allow users to manually link additional tests to requirements | MEDIUM |

**Acceptance Criteria:**
- Given a valid SRS with 10 functional requirements, Speclyn shall extract ≥8 requirements and generate at least 1 test per HIGH/CRITICAL requirement
- Coverage matrix shall show correct status for every requirement after execution

---

## 7. Module 2 — Regression Testing

**Purpose:** Detect when a new deployment breaks previously passing behaviour.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-REG-001 | The system shall store all generated tests permanently and re-execute them on demand | CRITICAL |
| REQ-REG-002 | The system shall compare each execution run against a specified baseline run | HIGH |
| REQ-REG-003 | The system shall flag a test as a regression if it passed in the baseline but failed in the current run | CRITICAL |
| REQ-REG-004 | The system shall support scheduled execution via cron expression | HIGH |
| REQ-REG-005 | The system shall produce a regression diff report showing new failures vs previously passing tests | HIGH |

**Acceptance Criteria:**
- When a previously passing test fails in a new run, it is labelled REGRESSION in the report
- Regression diff shows: test name, pass/fail in baseline run, pass/fail in current run, evidence links

---

## 8. Module 3 — API Testing

**Purpose:** Validate every API endpoint for contract, authentication, validation, and error handling.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-API-001 | The system shall discover all API endpoints from OpenAPI spec, Postman collection, and/or code AST | CRITICAL |
| REQ-API-002 | The system shall generate a happy path test for every discovered endpoint | CRITICAL |
| REQ-API-003 | The system shall generate negative tests: missing required fields, wrong data types, boundary values | HIGH |
| REQ-API-004 | The system shall generate auth tests: no auth header, expired token, wrong role | HIGH |
| REQ-API-005 | The system shall validate response body schema against OpenAPI spec or inferred schema | HIGH |
| REQ-API-006 | The system shall record HTTP status code, response time, and body for every API test step | HIGH |
| REQ-API-007 | The system shall report endpoints with no linked requirement as UNDOCUMENTED | MEDIUM |

**Acceptance Criteria:**
- For a project with OpenAPI spec containing 20 endpoints, system generates ≥3 tests per endpoint (happy + 2 negative minimum)
- All generated tests compile and are executable without modification for standard REST APIs

---

## 9. Module 4 — UI / End-to-End Testing

**Purpose:** Validate complete user journeys in the browser across all user roles.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-UI-001 | The system shall spider the live application starting from the base URL, up to depth 3 | HIGH |
| REQ-UI-002 | The system shall build an element inventory with multi-strategy selectors per element | CRITICAL |
| REQ-UI-003 | Selector strategy shall follow priority: data-testid → aria-label → getByRole → getByText → CSS | CRITICAL |
| REQ-UI-004 | The system shall generate Playwright TypeScript tests for every extracted flow | CRITICAL |
| REQ-UI-005 | The system shall execute UI tests in authenticated browser context per user role | HIGH |
| REQ-UI-006 | The system shall capture a screenshot at every test step | HIGH |
| REQ-UI-007 | The system shall trigger the Healer Agent when a test fails with selector_not_found | HIGH |
| REQ-UI-008 | [MVP] The system shall propose a selector fix (before/after diff) and require one user confirmation before applying it. Auto-apply is deferred to v2 after false-heal rate is measured on real applications. Self-reported LLM confidence is not calibrated probability — treating 0.85 as an auto-apply threshold risks silently masking real defects as test failures. | HIGH |
| REQ-UI-009 | The system shall flag all selector fix proposals for human review in MVP; in v2, auto-apply proposals with confidence ≥ 0.85 only after false-heal rate baseline is established | HIGH |
| REQ-UI-010 | The spider shall not submit forms with real data on any URL marked as production | CRITICAL |
| REQ-UI-011 | The spider shall skip external domains | HIGH |

**Acceptance Criteria:**
- A 5-step login flow generates a Playwright test that executes successfully against the staging environment
- When a button's CSS class changes, the healer proposes an updated selector within 60 seconds
- Screenshots are stored and accessible via signed URL for 30 days

---

## 10. Module 5 — AI/LLM Testing

**Purpose:** Test applications that use LLMs internally — chatbots, AI-powered APIs, prompt-driven features.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-LLM-001 | The system shall detect AI/LLM endpoints from code patterns (routes containing chat, completion, prompt) | HIGH |
| REQ-LLM-002 | The system shall generate prompt injection tests for every detected LLM endpoint | HIGH |
| REQ-LLM-003 | The system shall generate jailbreak attempt tests | MEDIUM |
| REQ-LLM-004 | The system shall validate that LLM responses do not reflect injected instructions | HIGH |
| REQ-LLM-005 | The system shall benchmark LLM endpoint latency (p50, p95) | MEDIUM |
| REQ-LLM-006 | The system shall test output consistency: same input produces semantically equivalent output across 3 runs | MEDIUM |

**MVP Status:** v1 partial (endpoint detection) — full eval harness in v2

---

## 11. Module 6 — Security Testing

**Purpose:** Detect authorization bypasses, missing authentication, and OWASP Top 10 vulnerabilities.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-SEC-001 | The system shall generate role-bypass tests for every endpoint (lower role calling higher-privilege action) | CRITICAL |
| REQ-SEC-002 | The system shall generate IDOR tests by substituting other users' resource IDs | HIGH |
| REQ-SEC-003 | The system shall generate missing-auth tests (removing Authorization header entirely) | CRITICAL |
| REQ-SEC-004 | The system shall generate expired-token tests | HIGH |
| REQ-SEC-005 | The system shall generate SQL injection probes for string input fields (safe, non-destructive patterns only) | HIGH |
| REQ-SEC-006 | The system shall generate XSS payload tests on form inputs and assert the payload is not reflected unescaped | HIGH |
| REQ-SEC-007 | Security findings shall be mapped to OWASP Top 10 categories | HIGH |
| REQ-SEC-008 | The system shall never use destructive attack patterns (DROP TABLE, DELETE *, etc.) | CRITICAL |

**MVP Status:** v1 partial (role-bypass + missing auth) — full OWASP coverage in v2

---

## 12. Module 7 — Performance & Load Testing

**Purpose:** Validate response times under load and detect degradation.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-PERF-001 | The system shall extract performance thresholds from SRS (e.g. "system shall respond within 2 seconds") | HIGH |
| REQ-PERF-002 | The system shall generate Artillery or k6 scripts from discovered API endpoints | HIGH |
| REQ-PERF-003 | Load scripts shall ramp from 1 to 100 concurrent users over 60 seconds | MEDIUM |
| REQ-PERF-004 | The system shall assert that p95 latency does not exceed the SRS-defined threshold | HIGH |
| REQ-PERF-005 | The system shall identify the slowest 5 endpoints by p95 latency | MEDIUM |
| REQ-PERF-006 | Load tests shall only run against environments explicitly tagged as load_safe | CRITICAL |

**MVP Status:** v2

---

## 13. Module 8 — Compatibility Testing

**Purpose:** Verify the UI works across browsers and device sizes.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-COMPAT-001 | The system shall execute all Playwright UI tests against Chromium, Firefox, and WebKit | HIGH |
| REQ-COMPAT-002 | The system shall execute UI tests against mobile viewport presets (iPhone 14, Pixel 7, iPad) | HIGH |
| REQ-COMPAT-003 | The system shall capture screenshots per browser per test step | HIGH |
| REQ-COMPAT-004 | The system shall produce a compatibility matrix: test × browser × result | HIGH |
| REQ-COMPAT-005 | Visual differences between browsers shall be flagged in the compatibility report | MEDIUM |

**MVP Status:** v2 (1 day to add — Playwright config change)

---

## 14. Module 9 — Accessibility Testing

**Purpose:** Verify WCAG 2.1 compliance for every page in the application.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-A11Y-001 | The system shall inject axe-core into every generated UI test | HIGH |
| REQ-A11Y-002 | The system shall scan every page visited during UI test execution for WCAG violations | HIGH |
| REQ-A11Y-003 | Accessibility violations shall be stored as defects with: element reference, WCAG rule ID, severity | HIGH |
| REQ-A11Y-004 | The system shall test keyboard navigation: tab order, focus visibility, enter key on buttons | MEDIUM |
| REQ-A11Y-005 | The system shall report violations grouped by WCAG 2.1 level (A, AA, AAA) | MEDIUM |

**MVP Status:** v2 (1 day to add — inject axe-core into test template)

---

## 15. Module 10 — Compliance & Audit

**Purpose:** Provide a complete, immutable audit trail of all AI decisions and test executions.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-AUD-001 | Every LLM agent call shall be logged with: model, tokens used, latency, confidence score | CRITICAL |
| REQ-AUD-002 | Every test execution step shall be stored with: timestamp, worker ID, status, error | CRITICAL |
| REQ-AUD-003 | Every credential access shall be logged with: vault_key accessed, timestamp (no plaintext) | CRITICAL |
| REQ-AUD-004 | Execution evidence shall be immutable — records cannot be deleted within the retention period | HIGH |
| REQ-AUD-005 | The system shall redact sensitive fields from API response evidence and logs using a unified `REDACT_KEYS` list maintained in `packages/shared-types/src/redact-keys.ts`. Default keys: `password`, `token`, `access_token`, `refresh_token`, `secret`, `ssn`, `card_number`, `cvv`, `authorization`. All log redact configs and evidence scrubbers must import from this single source. | CRITICAL |
| REQ-AUD-006 | The system shall blur password input fields in screenshots before storage | CRITICAL |
| REQ-AUD-007 | The system shall export a full audit trail as a signed, timestamped PDF | HIGH |
| REQ-AUD-008 | Default evidence retention period shall be 30 days, configurable per project | MEDIUM |

**MVP Status:** ✅ Logging built-in from Day 1 — PDF export in v2

---

## 16. Module 11 — Data Testing

**Purpose:** Validate data integrity, schema correctness, business rule calculations, and DB constraints.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-DATA-001 | The system shall validate every API response body against its OpenAPI response schema | HIGH |
| REQ-DATA-002 | The system shall extract business rules from SRS that describe data constraints (min, max, format) | HIGH |
| REQ-DATA-003 | The system shall generate boundary value tests for all numeric and string fields | HIGH |
| REQ-DATA-004 | The system shall generate calculation tests where SRS defines formulas | MEDIUM |
| REQ-DATA-005 | The system shall flag API responses that return data not matching the defined schema | HIGH |
| REQ-DATA-006 | The system shall test null handling: optional fields missing, empty arrays, zero values | MEDIUM |

**MVP Status:** ✅ Partial (Zod schema validation) — calculation testing in v2

---

## 17. Module 12 — Production Testing/Monitoring

**Purpose:** Continuously verify that critical production flows are working.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-MON-001 | The system shall allow tests to be tagged as production_safe (read-only, no side effects) | HIGH |
| REQ-MON-002 | The system shall support a cron schedule to run smoke tests against any environment | HIGH |
| REQ-MON-003 | Any failure in a scheduled production run shall create a defect and trigger an alert | CRITICAL |
| REQ-MON-004 | The system shall track latency trends over time for production smoke test runs | MEDIUM |
| REQ-MON-005 | The system shall support alert delivery via email and/or webhook | HIGH |
| REQ-MON-006 | Production monitoring runs shall never submit forms or mutate data | CRITICAL |

**MVP Status:** v2

---

## 18. Module 13 — Static Code Analysis

**Purpose:** Analyze backend source code (Java, Python, Go, TypeScript, etc.) for structural issues, security vulnerabilities, and best practice violations without executing it.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-CODE-001 | The system shall clone the connected repository and analyze source files by language | HIGH |
| REQ-CODE-002 | The system shall detect code structure issues: missing DTO/Entity separation, god classes, duplicate logic | HIGH |
| REQ-CODE-003 | The system shall detect API pattern issues: business logic in controllers, missing error handling | HIGH |
| REQ-CODE-004 | The system shall detect auth/security issues: missing RBAC, JWT validation flaws, ownership checks | CRITICAL |
| REQ-CODE-005 | The system shall detect SQL security issues: injection, missing parameterized queries, SELECT *, N+1 | CRITICAL |
| REQ-CODE-006 | The system shall detect hardcoded secrets: passwords, API keys, tokens, connection strings | CRITICAL |
| REQ-CODE-007 | The system shall detect input validation issues: missing null checks, field validation, size limits | HIGH |
| REQ-CODE-008 | The system shall detect error handling issues: swallowed exceptions, stack traces in responses | HIGH |
| REQ-CODE-009 | The system shall detect logging issues: PII/PHI in logs, missing audit logging | HIGH |
| REQ-CODE-010 | The system shall detect deprecated library/API usage | MEDIUM |
| REQ-CODE-011 | The system shall detect naming convention violations | LOW |
| REQ-CODE-012 | The system shall detect transaction handling issues: missing @Transactional, rollback rules | MEDIUM |
| REQ-CODE-013 | The system shall detect data exposure: sensitive fields in responses, missing @JsonIgnore | HIGH |
| REQ-CODE-014 | The system shall detect encryption issues: weak algorithms, missing encryption at rest | HIGH |
| REQ-CODE-015 | The system shall detect multi-tenant isolation issues: missing tenant filtering in queries | CRITICAL |
| REQ-CODE-016 | The system shall detect HIPAA violations: PHI unencrypted, PHI in logs, missing audit trail | CRITICAL |
| REQ-CODE-017 | Each issue shall include severity (critical/high/medium/low), category, file path, line number, code snippet, and recommendation | HIGH |
| REQ-CODE-018 | The system shall support Java, Python, C#, Go, Kotlin, TypeScript, JavaScript | HIGH |

**MVP Status:** v1 (implemented)

---

## 19. Module 14 — Database Schema Analysis

**Purpose:** Analyze SQL schema definitions for structural issues, missing constraints, indexing problems, and compliance gaps.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-SCHEMA-001 | The system shall accept SQL schema (CREATE TABLE/ALTER TABLE/CREATE INDEX) via paste or auto-detect from repo migrations | HIGH |
| REQ-SCHEMA-002 | The system shall detect missing primary keys | CRITICAL |
| REQ-SCHEMA-003 | The system shall detect wrong column data types (e.g., FLOAT for money, VARCHAR for dates) | HIGH |
| REQ-SCHEMA-004 | The system shall detect missing NOT NULL constraints on required fields | HIGH |
| REQ-SCHEMA-005 | The system shall detect missing indexes on foreign key and frequently filtered columns | HIGH |
| REQ-SCHEMA-006 | The system shall detect missing foreign key constraints on reference columns | HIGH |
| REQ-SCHEMA-007 | The system shall detect missing UNIQUE constraints on natural keys | MEDIUM |
| REQ-SCHEMA-008 | The system shall detect naming convention inconsistencies | LOW |
| REQ-SCHEMA-009 | The system shall detect missing ON DELETE cascade/restrict rules | MEDIUM |
| REQ-SCHEMA-010 | The system shall detect multi-tenant isolation gaps: tables missing tenant_id column | CRITICAL |
| REQ-SCHEMA-011 | The system shall detect HIPAA field issues: PHI not marked for encryption, missing audit columns | CRITICAL |
| REQ-SCHEMA-012 | The system shall detect redundant columns and duplicate tables | MEDIUM |
| REQ-SCHEMA-013 | The system shall detect soft delete implementation issues (missing filtered indexes) | MEDIUM |
| REQ-SCHEMA-014 | Each issue shall include table name, column name, severity, description, and SQL recommendation | HIGH |
| REQ-SCHEMA-015 | The system shall auto-detect Flyway/Liquibase migration files in connected repositories | MEDIUM |

**MVP Status:** v1 (implemented)

---

## 20. Module 15 — Multi-Tenant Isolation Testing

**Purpose:** Generate and execute API tests that verify data isolation between tenants (organizations, clinics, users).

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-TENANT-001 | The system shall generate tests that attempt cross-tenant data reads (Tenant A reading Tenant B's data) | CRITICAL |
| REQ-TENANT-002 | The system shall generate tests that attempt cross-tenant data writes | CRITICAL |
| REQ-TENANT-003 | The system shall generate tests that attempt cross-tenant data deletes | CRITICAL |
| REQ-TENANT-004 | The system shall test that list endpoints filter by tenant scope | HIGH |
| REQ-TENANT-005 | The system shall test admin escalation (regular user accessing admin-only APIs) | HIGH |
| REQ-TENANT-006 | The system shall test shared resource access across tenant boundaries | HIGH |
| REQ-TENANT-007 | All cross-tenant access attempts shall be expected to return 403 or 404, never 200 with other tenant data | CRITICAL |
| REQ-TENANT-008 | Multi-tenant tests shall be auto-generated when resource endpoints (with :id params) are detected | HIGH |

**MVP Status:** v1 (implemented)

---

## 21. Module 16 — HIPAA Compliance Testing

**Purpose:** Generate and execute API tests that verify healthcare applications properly protect PHI and comply with HIPAA regulations.

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-HIPAA-001 | The system shall test that PHI (SSN, DOB, diagnosis, insurance ID) is not exposed in error messages | CRITICAL |
| REQ-HIPAA-002 | The system shall test that all PHI access is audit-logged (164.312(b)) | CRITICAL |
| REQ-HIPAA-003 | The system shall test authentication on all PHI-related endpoints (164.312(a)) | CRITICAL |
| REQ-HIPAA-004 | The system shall test role-based access to PHI (doctor vs nurse vs admin vs billing) | HIGH |
| REQ-HIPAA-005 | The system shall test minimum necessary principle: APIs return only necessary PHI fields (164.502(b)) | HIGH |
| REQ-HIPAA-006 | The system shall test that error responses do not leak PHI (164.530(f)) | CRITICAL |
| REQ-HIPAA-007 | The system shall test that stack traces and 500 errors do not contain patient data | CRITICAL |
| REQ-HIPAA-008 | The system shall produce compliance recommendations alongside test cases | HIGH |
| REQ-HIPAA-009 | Each HIPAA test case shall reference the specific HIPAA rule it validates | HIGH |

**MVP Status:** v1 (implemented)

---

## 23. Non-Functional Requirements

### 18.1 Performance

| ID | Requirement |
|----|-------------|
| REQ-NFR-001 | Document parsing shall complete within 2 minutes for documents up to 50MB |
| REQ-NFR-002 | Repository analysis shall complete within 5 minutes for repositories up to 100MB |
| REQ-NFR-003 | API test execution shall support up to 100 concurrent test cases per run |
| REQ-NFR-004 | The UI dashboard shall load within 2 seconds under normal conditions |
| REQ-NFR-005 | Evidence screenshots shall be retrievable via signed URL within 500ms |

### 18.2 Reliability

| ID | Requirement |
|----|-------------|
| REQ-NFR-006 | Failed jobs shall be retried up to 3 times with exponential backoff |
| REQ-NFR-007 | The system shall maintain execution state across worker restarts (via BullMQ persistence) |
| REQ-NFR-008 | A browser worker crash shall not affect other concurrent test runs |

### 18.3 Scalability

| ID | Requirement |
|----|-------------|
| REQ-NFR-009 | Each worker type shall scale horizontally by adding worker instances |
| REQ-NFR-010 | The database shall support up to 1,000 projects without schema changes |

### 18.4 Usability

| ID | Requirement |
|----|-------------|
| REQ-NFR-011 | A new user shall be able to complete project setup in under 10 minutes |
| REQ-NFR-012 | The system shall provide clear status messages for all async operations |
| REQ-NFR-013 | All error states shall show actionable guidance, not raw error codes |

---

## 24. Integration Requirements

| ID | Integration | Requirement | Priority |
|----|-------------|-------------|----------|
| REQ-INT-001 | Bitbucket | OAuth 2.0 authentication for repository access | CRITICAL |
| REQ-INT-002 | Bitbucket | Read-only repository clone via HTTPS | CRITICAL |
| REQ-INT-003 | OpenAPI | Parse OpenAPI 3.0 YAML and JSON specifications (canonical name: OpenAPI, not "Swagger" — Swagger refers only to OpenAPI 2.x) | HIGH |
| REQ-INT-004 | Postman | Import Postman Collection v2.1 JSON | HIGH |
| REQ-INT-005 | S3/MinIO | Store and retrieve artifacts via S3-compatible API | CRITICAL |
| REQ-INT-006 | Secrets Model | App-level AES-256-GCM envelope encryption; ciphertext stored in PostgreSQL `credential_references.encrypted_value`. No external vault service required for MVP. The encryption key (`CREDENTIAL_ENCRYPTION_KEY`) is a 32-byte secret stored only in the deployment environment. See DEV-SPEC §13 for implementation. | CRITICAL |
| REQ-INT-007 | Claude API | Anthropic Claude for all LLM agent operations | CRITICAL |
| REQ-INT-008 | Clerk | User authentication and JWT management | HIGH |

---

## 25. Security Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-SEC-P-001 | Plaintext credentials shall never be stored in the database | CRITICAL |
| REQ-SEC-P-002 | Credentials shall only be decrypted inside worker processes, immediately before use | CRITICAL |
| REQ-SEC-P-003 | All project data shall be scoped to the authenticated project owner (tenant isolation) | CRITICAL |
| REQ-SEC-P-004 | project_id shall be derived from the JWT claim, never from the request body | CRITICAL |
| REQ-SEC-P-005 | All LLM inputs from user-provided content shall be wrapped in XML delimiters to mitigate prompt injection | HIGH |
| REQ-SEC-P-006 | Generated test code shall pass TypeScript compilation before execution — never eval'd inline | CRITICAL |
| REQ-SEC-P-007 | [MVP] Browser workers shall enforce an app-level egress allowlist: Playwright's `route()` intercept shall block any navigation or network request whose host does not match the project's registered `TEST_BASE_URL` or an explicitly approved list. The allowlist is checked before each request, not at network-firewall level (Railway does not support per-container firewall rules in MVP). [v2] Migrate to OS-level iptables or a sidecar proxy when deploying to ECS Fargate. | HIGH |
| REQ-SEC-P-008 | API runners shall block requests to private IP ranges (10.x.x.x, 172.16.x.x, 192.168.x.x, 127.x.x.x, and link-local 169.254.x.x) by resolving the hostname via DNS before sending the request, and rejecting if the resolved IP falls within a private range. This is in addition to, not instead of, the Playwright route intercept above. | HIGH |
| REQ-SEC-P-009 | [MVP] Each execution run shall use a freshly-created, isolated BrowserContext that is destroyed immediately after the run completes; [v2] each run shall use an ephemeral container destroyed post-run | HIGH |
| REQ-SEC-P-010 | All artifact URLs shall be signed S3 pre-signed URLs with maximum 7-day expiry | HIGH |

---

## 26. Acceptance Criteria Summary

### MVP Go/No-Go Criteria

> **Audit re-scope (B5):** The original criteria included Playwright UI tests (#5) and
> PDF export (#10) in the Day-30 bar. Those are moved to v2. The MVP bar is now:
> "upload spec + OpenAPI → get a running API test suite with coverage." That is still
> a shippable, demoable, valuable product.

The MVP is considered complete when all of the following are true:

| # | Criterion | Scope |
|---|-----------|-------|
| 1 | A user can create a project, upload a DOCX or Markdown SRS, and see extracted requirements in the UI within 5 minutes | MVP |
| 2 | A user can import an OpenAPI spec and see discovered API endpoints in the UI within 2 minutes | MVP |
| 3 | The system generates at least 1 compilable API test per HIGH/CRITICAL requirement | MVP |
| 4 | Generated API tests execute against a staging environment and produce pass/fail results with response-body evidence | MVP |
| 5 | The coverage matrix correctly shows COVERED / PARTIAL / FAILING / NOT_TESTED status per requirement | MVP |
| 6 | A structured defect record is produced for every failing test with failure_category and evidence link | MVP |
| 7 | No plaintext credentials appear in database records, logs, or API responses | MVP |
| 8 | Execution step results appear in the browser within 2 seconds of completion. SSE stream is opened using a short-lived signed stream token (obtained via `POST /execution-runs/:runId/stream-token`), not the Clerk JWT — the browser `EventSource` API cannot send `Authorization` headers. | MVP |
| 9 | The system exports a JSON report from an execution run | MVP |
| 10 | A scanned PDF upload sets parse_status='failed' with an actionable error message (not silent empty extraction) | MVP |
| 11 | The system halts LLM calls for a project that has exceeded its daily token budget | MVP |
| 12 | A Playwright test with a broken selector produces a selector-fix proposal (before/after diff) for human review | v2 |
| 13 | PDF report export | v2 |

---

*Speclyn SRS v1.2.0 — "From Spec to Certainty, Automatically."*
*Audit v1 applied: 2026-06-10 — fixes B2, B3, B5, B6, A5 (OpenAPI naming)*
*Audit v2 applied: 2026-06-10 — fixes A-9, A-12, B-1, B-3, B-8, C-3, C-5*
