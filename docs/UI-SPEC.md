# Speclyn — UI Specification
### *"From Spec to Certainty — Automatically."*

**Document Version:** 1.0.0
**Date:** 2026-06-11
**Status:** Draft
**Audience:** Frontend engineers, designers building the Speclyn web application

---

## TABLE OF CONTENTS

1. [Design Philosophy](#1-design-philosophy)
2. [Information Architecture](#2-information-architecture)
3. [Design System](#3-design-system)
4. [Layout Shell](#4-layout-shell)
5. [Screen: Auth — Sign Up / Sign In](#5-screen-auth)
6. [Screen: Projects Dashboard](#6-screen-projects-dashboard)
7. [Screen: Project Setup Wizard](#7-screen-project-setup-wizard)
8. [Screen: Project Overview](#8-screen-project-overview)
9. [Screen: Requirements Table](#9-screen-requirements-table)
10. [Screen: Endpoints Table](#10-screen-endpoints-table)
11. [Screen: Generated Tests](#11-screen-generated-tests)
12. [Screen: Test Code Viewer](#12-screen-test-code-viewer)
13. [Screen: Execution — Live Run](#13-screen-execution--live-run)
14. [Screen: Coverage Matrix](#14-screen-coverage-matrix)
15. [Screen: Defects](#15-screen-defects)
16. [Screen: Project Settings](#16-screen-project-settings)
17. [State Management Map](#17-state-management-map)
18. [Shared Patterns](#18-shared-patterns)

---

## 1. Design Philosophy

### 1.1 Core Principle: Progressive Disclosure

Speclyn handles complex, multi-step workflows. The UI must never overwhelm the user. Show only what is relevant at the current step. Surface detail on demand.

```
User sees at any moment:
  - Where they are in the workflow
  - What the system is doing right now
  - What needs their attention
  - What to do next

User does NOT see at any moment:
  - Raw logs
  - Internal job IDs
  - Technical error codes (show actionable messages instead)
  - Every possible option (hide advanced settings behind "Advanced")
```

### 1.2 Visual Hierarchy for an AI Platform

| Signal | What it means | Component |
|--------|---------------|-----------|
| `CRITICAL` / failed | Something broke | Red badge, red border, destructive toast |
| `HIGH confidence` | AI is confident | No indicator needed — default state |
| `LOW confidence` | AI flagged for review | Amber badge + review queue |
| Processing | AI is working | Skeleton + pulsing indicator (not spinner) |
| Ready to act | User needs to do something | Highlighted action button |
| Done | Step complete | Green check, muted |

### 1.3 AI Output Presentation Rules

- Always show confidence scores as visual indicators, not raw numbers
- Always show "Source: SRS §3.2" type provenance for extracted requirements
- Always offer "Review" or "Edit" for AI-generated content before it is acted upon
- Never show raw LLM prompts or model names to the user
- Show token counts only in a developer/admin mode (not the default view)

---

## 2. Information Architecture

### 2.1 Route Map

```
/sign-up                     ← Public
/sign-in                     ← Public

/projects                    ← Dashboard (project list)
/projects/new                ← Setup wizard (multi-step)

/projects/[id]               ← Project overview / home
/projects/[id]/requirements  ← Requirements table
/projects/[id]/endpoints     ← Discovered API endpoints
/projects/[id]/tests         ← Generated tests list
/projects/[id]/tests/[tid]   ← Test code viewer / editor
/projects/[id]/execute       ← Execution controls + live stream
/projects/[id]/coverage      ← Coverage matrix
/projects/[id]/defects       ← Defect reports
/projects/[id]/settings      ← Environments, credentials, modules
```

### 2.2 User Journey (Happy Path)

```
Sign up
  ↓
Projects dashboard (empty)
  ↓
"New Project" → Setup Wizard
  Step 1: Name + description
  Step 2: Upload SRS document
  Step 3: Import OpenAPI spec (or Postman collection)
  Step 4: Connect Bitbucket repo (optional for MVP)
  Step 5: Add test environment URL + credentials
  ↓
Project Overview (analysis in progress)
  ↓
Requirements Table (review extracted requirements)
  ↓
Endpoints Table (review discovered endpoints)
  ↓
Generated Tests (review generated test code)
  ↓
Execute → Live Run Stream (watch tests run)
  ↓
Coverage Matrix (see which requirements are covered)
  ↓
Defects (see what failed with evidence)
```

### 2.3 Navigation Depth

The UI has two navigation levels:
- **Top level:** Project switcher (header)
- **Second level:** Project section nav (sidebar within a project)

No more than 2 levels deep. Never nest navigation.

---

## 3. Design System

### 3.1 Colour Palette (Tailwind + shadcn/ui tokens)

```
Background:    zinc-950  (dark mode default)  / white (light)
Surface:       zinc-900  / zinc-50
Border:        zinc-800  / zinc-200
Text primary:  zinc-50   / zinc-900
Text muted:    zinc-400  / zinc-500
Text disabled: zinc-600  / zinc-400

Accent (brand): indigo-500  — primary CTA, active nav, links
                indigo-600  — hover state

Status colours:
  Success:      emerald-500 / emerald-100 bg
  Warning:      amber-500   / amber-100 bg
  Danger:       red-500     / red-100 bg
  Info:         sky-500     / sky-100 bg
  Running:      indigo-400  (pulsing)
```

### 3.2 Typography

```
Font:          Inter (Google Fonts) — system fallback: ui-sans-serif
Monospace:     JetBrains Mono — for all code, test IDs, API paths, selectors

Scale:
  Display:    text-3xl font-bold      ← page titles
  Heading:    text-xl font-semibold   ← section headers
  Subheading: text-base font-medium   ← card titles, table headers
  Body:       text-sm                 ← default content
  Caption:    text-xs text-muted      ← timestamps, IDs, meta
  Code:       text-xs font-mono       ← paths, selectors, code blocks
```

### 3.3 Status Badges

```tsx
// packages/shared-types → used for consistent badge variants

const STATUS_BADGE = {
  // Coverage statuses
  COVERED:     { variant: 'success',     label: 'Covered' },
  PARTIAL:     { variant: 'warning',     label: 'Partial' },
  FAILING:     { variant: 'destructive', label: 'Failing' },
  NOT_TESTED:  { variant: 'secondary',   label: 'Not Tested' },
  NOT_STARTED: { variant: 'outline',     label: 'Not Started' },

  // Execution statuses
  running:     { variant: 'info',        label: 'Running',   pulse: true },
  passed:      { variant: 'success',     label: 'Passed' },
  failed:      { variant: 'destructive', label: 'Failed' },
  skipped:     { variant: 'secondary',   label: 'Skipped' },

  // Parse / job statuses
  pending:     { variant: 'outline',     label: 'Pending' },
  processing:  { variant: 'info',        label: 'Processing', pulse: true },
  done:        { variant: 'success',     label: 'Done' },

  // Confidence levels
  HIGH:        { variant: 'success',     label: 'High Confidence' },
  MEDIUM:      { variant: 'warning',     label: 'Medium' },
  LOW:         { variant: 'destructive', label: 'Low — Review' },
}
```

### 3.4 Core Components (shadcn/ui base)

Use these shadcn/ui primitives everywhere. Never build custom alternatives:

```
Button, Input, Textarea, Select, Checkbox, Switch
Badge, Tooltip, Popover, Dialog, Sheet (side panel), Alert
Table, Card, Separator, Skeleton, Progress
Command (⌘K palette), Tabs, Accordion
Sonner (toasts — replace shadcn/ui Toast)
```

Custom components on top of these:
```
<StatusBadge status="COVERED" />
<ConfidenceBar score={0.87} />
<CodeViewer language="typescript" code={...} />   ← Monaco Editor
<EvidenceGallery screenshots={[...]} />
<LiveRunFeed runId={...} />                        ← SSE consumer
<RequirementRow req={...} />
<DefectCard defect={...} />
<WizardStep step={n} total={5} title="..." />
```

---

## 4. Layout Shell

### 4.1 Application Shell

```
┌─────────────────────────────────────────────────────┐
│  HEADER (h-14, border-b)                            │
│  [⚡ Speclyn]  [Project: My App ▾]       [User ▾]   │
├──────────────┬──────────────────────────────────────┤
│  SIDEBAR     │  MAIN CONTENT                        │
│  (w-56)      │  (flex-1, overflow-y-auto)            │
│              │                                      │
│  Overview    │                                      │
│  Requirements│                                      │
│  Endpoints   │                                      │
│  Tests       │                                      │
│  ─────────   │                                      │
│  Execute     │                                      │
│  Coverage    │                                      │
│  Defects     │                                      │
│  ─────────   │                                      │
│  Settings    │                                      │
│              │                                      │
└──────────────┴──────────────────────────────────────┘
```

```tsx
// apps/web/app/(dashboard)/layout.tsx
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-background p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
```

### 4.2 Sidebar Navigation Items

```tsx
// Only shown when inside a project route
const PROJECT_NAV = [
  { href: '/projects/[id]',              icon: LayoutDashboard, label: 'Overview' },
  { href: '/projects/[id]/requirements', icon: FileText,        label: 'Requirements' },
  { href: '/projects/[id]/endpoints',    icon: Webhook,         label: 'Endpoints' },
  { href: '/projects/[id]/tests',        icon: TestTube2,       label: 'Tests' },
  null,  // separator
  { href: '/projects/[id]/execute',      icon: Play,            label: 'Execute',  highlight: true },
  { href: '/projects/[id]/coverage',     icon: BarChart3,       label: 'Coverage' },
  { href: '/projects/[id]/defects',      icon: Bug,             label: 'Defects',  badge: 'defectCount' },
  null,
  { href: '/projects/[id]/settings',     icon: Settings,        label: 'Settings' },
]
```

### 4.3 Header

```
Left:   Logo "⚡ Speclyn" (links to /projects)
Centre: Project switcher dropdown (shows current project name, lists all projects, "New Project" at bottom)
Right:  UserButton (Clerk component — shows avatar, sign out)
```

---

## 5. Screen: Auth

### 5.1 Sign-Up (`/sign-up`)

**Purpose:** New user creates an account. Lands on `/projects` immediately (no email verification).

```
┌─────────────────────────────────┐
│         ⚡ Speclyn               │
│   From Spec to Certainty        │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Create your account    │    │
│  │                         │    │
│  │  Email                  │    │
│  │  [________________________]  │
│  │                         │    │
│  │  Password               │    │
│  │  [________________________]  │
│  │  ≥8 characters          │    │
│  │                         │    │
│  │  [  Create Account  ]   │    │  ← indigo-500 button
│  │                         │    │
│  │  Already have an account?    │
│  │  Sign in →              │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

**Component:** Clerk's `<SignUp>` with custom `appearance` prop (see DEV-SPEC §2.2).

**UX Notes:**
- Full-page centred layout, no sidebar
- Dark background gradient (zinc-950 → indigo-950 subtle)
- Tagline beneath logo
- Password field shows strength indicator (Clerk handles this)
- On success: instant redirect to `/projects` — no loading screen

### 5.2 Sign-In (`/sign-in`)

Same layout as sign-up, uses Clerk `<SignIn>`. Includes "Forgot password?" link (Clerk handles the flow).

---

## 6. Screen: Projects Dashboard

**Route:** `/projects`
**Purpose:** User's home screen. Lists all their projects. Entry point to create a new one.

### 6.1 Layout

```
┌──────────────────────────────────────────────────────────┐
│  Projects                              [+ New Project]   │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ My SaaS App  │  │ E-Commerce   │  │ Mobile API   │  │
│  │              │  │              │  │              │  │
│  │ 47 reqs      │  │ 120 reqs     │  │ 33 reqs      │  │
│  │ 12 tests     │  │ 89 tests     │  │ 22 tests     │  │
│  │ ●  Running   │  │ ✓  Last run  │  │ ✗  3 failing │  │
│  │              │  │  2h ago 94%  │  │  yesterday   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.2 Project Card Component

```tsx
// components/project/ProjectCard.tsx
interface ProjectCardProps {
  project: {
    id: string
    name: string
    requirementCount: number
    testCount: number
    lastRun: { status: 'passed' | 'failed' | 'running' | null; coveragePercent: number | null; completedAt: Date | null }
  }
}

// Card shows:
// - Project name (h3, truncated)
// - Stats row: "{N} requirements  ·  {N} tests"
// - Last run status badge + coverage % + time ago
// - Hover: subtle indigo border glow
// - Click: navigate to /projects/[id]
```

### 6.3 Empty State

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│           🧪  No projects yet                       │
│                                                     │
│   Upload a spec and let Speclyn build your          │
│   test suite automatically.                         │
│                                                     │
│              [Create your first project]            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.4 Data

```typescript
// TanStack Query
useQuery({ queryKey: ['projects'], queryFn: () => api.fetch('/projects') })
```

---

## 7. Screen: Project Setup Wizard

**Route:** `/projects/new`
**Purpose:** Guided multi-step onboarding. Collects everything Speclyn needs to start working.

### 7.1 Wizard Shell

```
┌──────────────────────────────────────────────────────────┐
│  New Project                              Step 2 of 5    │
│  ──────────────────────────────────────────────────────  │
│                                                          │
│  ① Name  ②  Document  ③ API Spec  ④ Credentials  ⑤ Done │
│         ████████████░░░░░░░░░░░░░░░░░░░░░  40%          │
│                                                          │
│  [  Step content here  ]                                 │
│                                                          │
│  [← Back]                              [Continue →]      │
└──────────────────────────────────────────────────────────┘
```

Progress bar uses `Progress` from shadcn/ui. Steps shown as numbered pills — completed = filled indigo, current = outlined indigo, upcoming = muted.

### 7.2 Step 1 — Project Name

```
Name *
[___________________________________]
e.g. "My SaaS App", "E-Commerce Backend"

Description
[___________________________________]
[___________________________________]
Optional — what does this application do?
```

Validation: name required, ≤255 chars, unique per user (client-side check on blur).

### 7.3 Step 2 — Upload SRS Document

```
Upload your SRS or PRD
─────────────────────────────────────────
│                                       │
│   📄 Drag & drop your document here   │
│                                       │
│   Supported: DOCX, Markdown           │
│   Note: text-based PDF only           │
│   (scanned PDFs are not supported)    │
│                                       │
│         [Browse files]                │
│                                       │
─────────────────────────────────────────

✓ requirements.docx  (124 KB)    [×]
```

**Behaviour:**
- Accepts `.docx`, `.md`, `.pdf`
- On upload: immediately calls `POST /documents` to upload to S3
- Shows upload progress bar
- Shows file name + size + remove button after upload
- If scanned PDF detected after parsing: inline amber alert with message from API
- Multiple documents allowed (click "Add another document")
- At least one document required to proceed

### 7.4 Step 3 — API Spec (OpenAPI / Postman)

```
Import API specification    [Skip for now]
─────────────────────────────────────────
How would you like to import?

  ○  Upload OpenAPI spec (YAML or JSON)
  ○  Upload Postman collection (v2.1 JSON)
  ○  I'll add this later
─────────────────────────────────────────

[Upload area — same as Step 2]
```

Skip is allowed. The "I'll add this later" radio is pre-selected if user chose skip previously.

### 7.5 Step 4 — Environment & Credentials

```
Test Environment
────────────────────────────────────────────────
Base URL *
[  https://staging.myapp.com            ]

Environment name
[  Staging                              ]
────────────────────────────────────────────────

Test Credentials
────────────────────────────────────────────────
[+ Add credential]

┌─────────────────────────────────────────┐
│  Name: Admin Token                      │
│  Type: Bearer Token          [×]        │
│  Value: ••••••••••••    (hidden)        │
└─────────────────────────────────────────┘
```

**Add Credential Sheet (Side Panel):**
```
Name *          [________________________]
Type *          [Bearer Token         ▾]
                  Bearer Token
                  API Key (X-API-Key)
                  Basic Auth (user:pass)
                  Custom Header
Value *         [________________________]  ← masked, never shown again
```

On save: `POST /credentials` → API encrypts with AES-256-GCM → confirmation toast.
The value field shows `•••••` after save — never the actual value.

### 7.6 Step 5 — Review & Launch

```
Ready to analyse! 🚀
────────────────────────────────────────────────
✓  Project: My SaaS App
✓  Documents: requirements.docx
✓  API Spec: openapi.yaml  (20 endpoints detected)
✓  Environment: https://staging.myapp.com
✓  Credentials: 2 configured

Speclyn will now:
  1. Extract requirements from your document (~2 min)
  2. Parse your OpenAPI spec (instant)
  3. Generate test cases (~ 3–5 min)

         [Start Analysis]
```

On "Start Analysis": creates project via API, triggers doc-parse job, redirects to `/projects/[id]` with a status banner showing analysis progress.

---

## 8. Screen: Project Overview

**Route:** `/projects/[id]`
**Purpose:** At-a-glance health dashboard for the project. First screen after setup.

### 8.1 Layout

```
My SaaS App                    [Run Tests ▸]  [Export Report]
────────────────────────────────────────────────────────────

┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
│ 47       │  │ 12       │  │  89%     │  │ 3            │
│ Requirements│ Tests    │  │ Coverage │  │ Open Defects │
└──────────┘  └──────────┘  └──────────┘  └──────────────┘

Analysis Status
────────────────────────────────────────────────────────────
  ✓  Document parsed      47 requirements, 8 flows extracted
  ✓  API spec imported    20 endpoints discovered
  ●  Generating tests...  12 / 20 complete               76%
  ○  Execute pending

Recent Runs
────────────────────────────────────────────────────────────
  Run #3   Today 14:32    ✓ 18 passed  ✗ 2 failed   89% cov
  Run #2   Today 11:15    ✓ 15 passed  ✗ 5 failed   75% cov
  Run #1   Yesterday      ✓ 10 passed  ✗ 10 failed  50% cov
```

### 8.2 Stat Cards

Four `<Card>` components in a responsive grid (`grid-cols-2 md:grid-cols-4`):
- Requirements count (links to `/requirements`)
- Tests count (links to `/tests`)
- Coverage % from last run (colour: green >80%, amber 50-80%, red <50%)
- Open defects count (links to `/defects`)

### 8.3 Analysis Status Timeline

Each pipeline step rendered as a vertical timeline:
- `✓` green check = done (with count/summary)
- `●` indigo pulsing = in progress (with progress bar)
- `○` muted = not started yet
- `✗` red = failed (with error message + retry button)

### 8.4 Recent Runs Table

Last 5 execution runs. Columns: Run #, timestamp, passed, failed, coverage %. Click a row → navigate to that run's results.

---

## 9. Screen: Requirements Table

**Route:** `/projects/[id]/requirements`
**Purpose:** Review AI-extracted requirements. Handle low-confidence items.

### 9.1 Layout

```
Requirements                     [47 total]  [⚠ 3 need review]

Search...        Module ▾    Priority ▾    Status ▾    Confidence ▾

┌─────┬──────────────────────────────────┬──────────┬──────────┬───────────┐
│ ID  │ Requirement                      │ Module   │ Priority │ Coverage  │
├─────┼──────────────────────────────────┼──────────┼──────────┼───────────┤
│ R1  │ User shall be able to login      │ Auth     │ CRITICAL │ ✓ COVERED │
│     │ with email and password          │          │          │           │
├─────┼──────────────────────────────────┼──────────┼──────────┼───────────┤
│ R2  │ Password reset via email link    │ Auth     │ HIGH     │ ○ NOT_TESTED│
├─────┼──────────────────────────────────┼──────────┼──────────┼───────────┤
│ R7  │ [!] Response time < 2 seconds    │ Perf     │ HIGH     │ — N/A     │
│     │  Low confidence — ambiguous      │          │          │           │
└─────┴──────────────────────────────────┴──────────┴──────────┴───────────┘

                               < 1 2 3 >  Showing 1–20 of 47
```

### 9.2 Review Queue Banner

If low-confidence requirements exist, show a dismissable amber banner at the top:

```
⚠  3 requirements need your review — confidence below 60%
   The AI was uncertain about these. Review before generating tests.
   [Review now]  [Dismiss]
```

### 9.3 Requirement Row Expansion

Click a row → inline expand (accordion, not modal):

```
▼ R7  "Response time < 2 seconds"
  ────────────────────────────────────────────────────────
  Source: requirements.docx, §4.2 — "The system must..."
  Confidence: ██░░░░░ 42%   [Flag as ambiguous]
  AI note: "No specific endpoint mentioned — applies to all API calls?"

  Linked tests:  (none yet)
  Coverage:      NOT_TESTED

  [Edit requirement]  [Generate test for this]  [Ignore]
```

### 9.4 Filters

- **Search:** instant client-side filter on title text
- **Module:** multi-select dropdown (Auth, Payments, UI, Perf, etc.)
- **Priority:** CRITICAL / HIGH / MEDIUM / LOW
- **Status:** COVERED / PARTIAL / FAILING / NOT_TESTED / NOT_STARTED
- **Confidence:** High (≥0.8) / Medium (0.6–0.8) / Low (<0.6)

Active filters shown as removable chips below the filter bar.

### 9.5 Data

```typescript
useQuery({
  queryKey: ['requirements', projectId, filters],
  queryFn: () => api.fetch(`/projects/${projectId}/requirements?${qs(filters)}`),
})
```

Cursor-based pagination (load 20 at a time). "Load more" button at bottom.

---

## 10. Screen: Endpoints Table

**Route:** `/projects/[id]/endpoints`
**Purpose:** Show all discovered API endpoints. Link them to requirements.

### 10.1 Layout

```
Endpoints                  [20 total]   Source: openapi.yaml + AST

Search path...     Method ▾    Source ▾    Linked ▾

┌────────────┬──────────────────────────────────┬──────────┬──────────────┐
│ Method     │ Path                             │ Source   │ Requirements │
├────────────┼──────────────────────────────────┼──────────┼──────────────┤
│ POST       │ /auth/login                      │ OpenAPI  │ R1, R2       │
│ GET        │ /users/{id}                      │ OpenAPI  │ R12          │
│ DELETE     │ /admin/users/{id}                │ OpenAPI  │ ⚠ None       │
│ GET        │ /internal/metrics                │ AST      │ ⚠ None (UNDOCUMENTED) │
└────────────┴──────────────────────────────────┴──────────┴──────────────┘
```

**Method badges:** colour-coded
- `GET` → emerald background
- `POST` → indigo background
- `PUT/PATCH` → amber background
- `DELETE` → red background

**UNDOCUMENTED flag:** amber badge for endpoints with no linked requirement. These map to REQ-API-007.

### 10.2 Endpoint Detail (Sheet)

Click an endpoint row → right slide-in panel:

```
POST /auth/login
────────────────────────────────────────
Source:     openapi.yaml
Parameters: email (string, required)
            password (string, required)
Response:   200: { token: string, user: object }
            401: { error: string }

Linked requirements:
  R1  User login with email + password
  R2  Password reset

Generated tests: 4
  ✓ happy path — valid credentials → 200
  ✓ missing email → 422
  ✓ wrong password → 401
  ✓ missing auth header → 401

  [View tests]  [Generate more tests]
```

---

## 11. Screen: Generated Tests

**Route:** `/projects/[id]/tests`
**Purpose:** Browse all generated test files. See their compile + execution status.

### 11.1 Layout

```
Tests                  [12 active]  [3 draft — needs review]

Search...    Type ▾    Status ▾    Lifecycle ▾    [+ Generate more]

┌──────────────────────────────────────────┬──────┬──────────┬───────────┐
│ Test Name                                │ Type │ Lifecycle│ Last Run  │
├──────────────────────────────────────────┼──────┼──────────┼───────────┤
│ POST /auth/login — happy path            │ API  │ read_only│ ✓ Passed  │
│ POST /auth/login — missing email         │ API  │ read_only│ ✓ Passed  │
│ GET /users/{id} — valid user             │ API  │ read_only│ ✗ Failed  │
│ POST /users — create user                │ API  │ creates  │ ✓ Passed  │
│ DELETE /admin/users/{id}                 │ API  │ destructive│ ⚠ Draft │
└──────────────────────────────────────────┴──────┴──────────┴───────────┘
```

**Draft tests** (compile failed or no assertions) shown with amber "Draft" badge and a "Review" CTA.

**Lifecycle badges:**
- `read_only` → muted grey
- `creates_data` → sky badge
- `destructive` → red badge + warning icon

### 11.2 Draft Review Banner

```
⚠  3 tests are in Draft status — compile check failed or no assertions found
   Review these before running your test suite.
   [Review drafts]
```

---

## 12. Screen: Test Code Viewer

**Route:** `/projects/[id]/tests/[testId]`
**Purpose:** View and optionally edit a generated test file before execution.

### 12.1 Layout

```
POST /auth/login — happy path               [Run this test]  [Approve]

────────────────────────────────────────────────────────────────────
 Meta               │  Code
────────────────────┤
 Status: Active     │  import { describe, it, expect } from 'vitest'
 Type: API          │  import { buildAuthHeader, createEvidenceClient }
 Lifecycle: read_only│    from '@speclyn/test-harness'
 Requirement: R1    │
 Coverage: COVERED  │  describe('test:550e8400-e29b:POST /auth/login
 Source: openapi    │    — happy path', () => {
                    │    it('returns 200 with token for valid creds', async () => {
 Last run:          │      const client = createEvidenceClient(runId, stepId)
 ✓ Passed           │      const headers = buildAuthHeader('bearer', 'cred-001')
   14:32 today      │      const res = await client.post('/auth/login', {
   220ms            │        data: { email: 'test@example.com', password: '...' }
                    │      })
                    │      expect(res.status).toBe(200)
                    │      expect(res.data.token).toBeDefined()
                    │    })
                    │  })
────────────────────┴───────────────────────────────────────────────

Evidence from last run:
  Response body:  { token: "eyJ...", user: { id: "...", email: "..." } }
  HTTP status:    200
  Duration:       220ms
```

**Code viewer:** Monaco Editor (read-only by default). "Edit" button unlocks editing. Edit mode shows "Save & recompile" button.

**After editing:** API call to update the test → triggers a background tsc compile check → shows compile result inline.

---

## 13. Screen: Execution — Live Run

**Route:** `/projects/[id]/execute`
**Purpose:** Trigger a test run and watch it happen in real time via SSE.

### 13.1 Pre-Run Controls

```
Execute Tests
────────────────────────────────────────────────────────────────
Environment:     [Staging — https://staging.myapp.com  ▾]

Test selection:  ● All tests (12)
                 ○ Failed only (from last run)
                 ○ Specific tests...  [Select...]

                 [▸  Run Tests]
────────────────────────────────────────────────────────────────
```

### 13.2 Live Run Stream (in progress)

After clicking "Run Tests":
1. Fetch stream token (`POST /execution-runs/:runId/stream-token`)
2. Open `EventSource` with `?token=...`
3. Render live feed

```
Run #4  —  Started 14:52:01             [■ Stop]

  Progress: ████████████░░░░░░░░░  7 / 12  58%

  ✓  POST /auth/login — happy path                220ms
  ✓  POST /auth/login — missing email             85ms
  ✓  POST /auth/login — wrong password            92ms
  ✓  GET /users/{id} — valid user                 310ms
  ✗  GET /users/{id} — unauthenticated user       140ms
  ●  POST /users — create user...                 (running)
  ○  DELETE /admin/users/{id}
  ○  GET /products
  ○  GET /products/{id}
  ○  POST /cart/items
  ○  DELETE /cart/items/{id}
  ○  POST /checkout
```

**Live feed behaviour:**
- Steps appear with `○` (pending) on load
- Switch to `●` pulsing indigo when that test starts
- Switch to `✓` green or `✗` red when complete
- Failed steps show inline error type on the row
- Progress bar updates after each step

### 13.3 Run Complete State

```
Run #4  —  Completed 14:53:18  (77 seconds)

  ┌──────────────────────────────────────────────────────┐
  │  ✓ 10 Passed    ✗ 2 Failed    ○ 0 Skipped           │
  │  Coverage: 83%  (+8% vs last run)                   │
  └──────────────────────────────────────────────────────┘

  [View Coverage Matrix]   [View Defects (2)]   [Export JSON]
```

Failed tests show expanded inline with:
- Error type badge (ASSERTION_FAILED / NETWORK_ERROR / TIMEOUT / etc.)
- First line of error message
- Link "View evidence →"

### 13.4 Run History (below controls when no run is active)

Last 5 runs shown as a compact table with run number, date, passed/failed counts, coverage %, and a "View" link.

---

## 14. Screen: Coverage Matrix

**Route:** `/projects/[id]/coverage`
**Purpose:** The core traceability view — requirement → test → execution result.

### 14.1 Layout

```
Coverage Matrix           Run #4  ▾  [Compare with Run #3]

Overall coverage: 83%    ████████████████░░░  [47 requirements]

Filter: All ▾   Module ▾   Status ▾

┌──────────────────────────────────────┬──────────┬──────────────────────┐
│ Requirement                          │ Priority │ Coverage             │
├──────────────────────────────────────┼──────────┼──────────────────────┤
│ ▼ R1  User login with email + pass   │ CRITICAL │ ✓ COVERED            │
│   └─ POST /auth/login — happy path   │          │  ✓ Passed  14:52     │
│   └─ POST /auth/login — wrong pass   │          │  ✓ Passed  14:52     │
├──────────────────────────────────────┼──────────┼──────────────────────┤
│ ▼ R2  Password reset via email       │ HIGH     │ ✗ FAILING            │
│   └─ POST /auth/reset — happy path   │          │  ✗ Failed  14:53     │
├──────────────────────────────────────┼──────────┼──────────────────────┤
│ R12  Admin can delete any user       │ HIGH     │ ○ NOT_STARTED        │
├──────────────────────────────────────┼──────────┼──────────────────────┤
│ R15  Response time < 2 seconds       │ HIGH     │ — NOT_TESTED         │
└──────────────────────────────────────┴──────────┴──────────────────────┘
```

**Colour coding:**
- `COVERED` → emerald row left border
- `PARTIAL` → amber row left border
- `FAILING` → red row left border, slightly red-tinted row background
- `NOT_STARTED` → no left border, muted text
- `NOT_TESTED` → dashed left border, italic text, muted

**Expandable rows:** clicking a requirement row shows linked tests and their results.

### 14.2 Coverage Summary Bar

```
COVERED  ████████████████████  42  (89%)
PARTIAL  ██                     2  (4%)
FAILING  █                      1  (2%)
NOT_STARTED ░                   1  (2%)
NOT_TESTED  ░                   1  (2%)
```

### 14.3 Regression Diff Mode

Toggle "Compare with Run #3":
- Adds a second column showing previous run status
- Highlights rows where status changed (PASSED → FAILED = regression = red bold)
- Shows `+8 newly covered` / `2 regressions` summary at top

---

## 15. Screen: Defects

**Route:** `/projects/[id]/defects`
**Purpose:** Browse structured defect records generated from failing tests.

### 15.1 Layout

```
Defects                [2 open]   Run #4 ▾

Filter: All ▾   Category ▾   Priority ▾    Search...

┌────────────────────────────────────────────────────────────────┐
│  ✗  ASSERTION_FAILED                                           │
│     GET /users/{id} — unauthenticated user                     │
│     Expected: 401   Got: 200                                   │
│     Requirement: R12 — Unauthenticated access should be denied │
│     Run #4  ·  14:53:01  ·  140ms                             │
│                                           [View Evidence →]    │
├────────────────────────────────────────────────────────────────┤
│  ✗  NETWORK_ERROR                                              │
│     POST /checkout — complete purchase                         │
│     Connection refused — staging server unreachable            │
│     Requirement: R31 — Checkout flow                           │
│     Run #4  ·  14:53:15  ·  30008ms (timeout)                │
│                                           [View Evidence →]    │
└────────────────────────────────────────────────────────────────┘
```

### 15.2 Defect Detail (Sheet)

Click "View Evidence →" opens a right-side sheet:

```
✗ GET /users/{id} — unauthenticated user
────────────────────────────────────────────────────────
Category:      ASSERTION_FAILED
Requirement:   R12 (Admin authorization check)
Run:           #4  —  14:53:01

Error:
  AssertionError: expected 200 to be 401
  at /tests/550e8400.test.ts:14:5

Request:
  GET /users/999
  Authorization: (none)

Response:
  Status:  200  ← expected 401
  Body:    { "id": 999, "email": "admin@..." }
           [⚠ Authorization bypass detected]

Screenshots:  (none — API test)
Trace:        (none — API test)

AI Classification:
  "Missing authentication check on GET /users/:id.
   The endpoint returns user data without verifying the caller's identity.
   This is a potential IDOR / broken access control vulnerability."
   OWASP A01: Broken Access Control
```

---

## 16. Screen: Project Settings

**Route:** `/projects/[id]/settings`
**Purpose:** Manage environments, credentials, connected repo, enabled modules.

### 16.1 Tabs Layout

```
Settings
──────────────────────────────────────
  Environments | Credentials | Repository | Modules | Danger Zone
──────────────────────────────────────
```

### 16.2 Environments Tab

```
Environments
────────────────────────────────────────────────────────
  ┌──────────────────────────────────────────────────┐
  │  Staging                                         │
  │  https://staging.myapp.com              [Edit]  │
  │  Tags: ✓ load_safe                     [Delete] │
  └──────────────────────────────────────────────────┘

  [+ Add Environment]
```

### 16.3 Credentials Tab

```
Credentials
────────────────────────────────────────────────────────
  ┌──────────────────────────────────────────────────┐
  │  Admin Token          Bearer Token               │
  │  Value: ••••••••••••• ...abc4         [Rotate]  │
  │                                       [Delete]  │
  └──────────────────────────────────────────────────┘
  ┌──────────────────────────────────────────────────┐
  │  Test User Password   Basic Auth                 │
  │  Value: (no preview)              [Delete]       │
  └──────────────────────────────────────────────────┘

  [+ Add Credential]
```

> No "preview" shown for password types — only bearer/api_key show `...abc4`.

### 16.4 Modules Tab

```
Enabled Modules
────────────────────────────────────────────────────────
  ✓ Functional Testing          (MVP)
  ✓ Regression Testing          (MVP)
  ✓ API Testing                 (MVP)
  ○ UI / E2E Testing            [v2]
  ○ Security Testing            [v2]
  ○ Performance Testing         [v2]
  ○ Accessibility Testing       [v2]
  ✓ Compliance & Audit          (MVP — logging only)
  ✓ Data Testing                (MVP — schema validation)
  ○ Production Monitoring       [v2]
```

v2 modules shown greyed out with "v2" tag — not interactive in MVP.

### 16.5 Danger Zone Tab

```
Danger Zone
────────────────────────────────────────────────────────
  Delete Project
  This will permanently delete the project, all requirements,
  tests, execution history, and evidence. This cannot be undone.

                           [Delete Project]   ← red destructive button
```

Delete triggers a confirm dialog: type project name to confirm.

---

## 17. State Management Map

| Screen / Data | Tool | Query Key | Notes |
|---|---|---|---|
| Projects list | TanStack Query | `['projects']` | Refetch on focus |
| Single project | TanStack Query | `['project', id]` | Stale: 30s |
| Requirements | TanStack Query | `['requirements', id, filters]` | Paginated |
| Endpoints | TanStack Query | `['endpoints', id, filters]` | Paginated |
| Tests | TanStack Query | `['tests', id, filters]` | Paginated |
| Single test | TanStack Query | `['test', testId]` | |
| Execution runs list | TanStack Query | `['runs', projectId]` | Refetch: 10s if any running |
| Live run events | `EventSource` + Zustand | `executionStore.steps` | SSE stream → Zustand |
| Coverage matrix | TanStack Query | `['coverage', projectId, runId]` | |
| Defects | TanStack Query | `['defects', projectId, runId]` | |
| Credentials | TanStack Query | `['credentials', projectId]` | Never cache values |
| Active filters | Zustand | `filterStore` | Persisted to URL params |
| Wizard step state | Zustand | `wizardStore` | Reset on navigation away |
| Sidebar open (mobile) | Zustand | `uiStore.sidebarOpen` | |
| Selected run ID | Zustand | `executionStore.selectedRunId` | |

```typescript
// stores/execution-store.ts
interface ExecutionStore {
  selectedRunId: string | null
  setSelectedRunId: (id: string) => void
  steps: Record<string, StepEvent[]>   // runId → events
  addStep: (runId: string, event: StepEvent) => void
  clearSteps: (runId: string) => void
}

// Populated by SSE consumer:
// es.onmessage = (e) => useExecutionStore.getState().addStep(runId, JSON.parse(e.data))
```

---

## 18. Shared Patterns

### 18.1 Loading States

Never show a spinner for content that takes >300ms. Use skeletons:

```tsx
// While requirements are loading:
<div className="space-y-2">
  {Array.from({ length: 5 }).map((_, i) => (
    <Skeleton key={i} className="h-12 w-full rounded-md" />
  ))}
</div>
```

For async operations (button clicks, form submits): disable the button + show `<Loader2 className="animate-spin" />` inside it.

### 18.2 Error States

API errors must show actionable messages, not codes:

```tsx
<Alert variant="destructive">
  <AlertTriangle className="h-4 w-4" />
  <AlertTitle>Document parsing failed</AlertTitle>
  <AlertDescription>
    This PDF appears to be scanned and has no text layer.
    Please upload a text-based PDF or convert it to DOCX first.
  </AlertDescription>
</Alert>
```

For full-page errors (project not found, network down): centred error card with retry button.

### 18.3 Empty States

Every list screen needs an empty state. Empty states must:
1. Explain why it's empty (not just "No items")
2. Tell the user what to do next
3. Include a primary action CTA if applicable

```tsx
<EmptyState
  icon={FileText}
  title="No requirements extracted yet"
  description="Upload an SRS or PRD document to get started. Speclyn will extract all testable requirements automatically."
  action={{ label: 'Upload document', href: `/projects/${id}/settings` }}
/>
```

### 18.4 Toast Notifications (Sonner)

```typescript
import { toast } from 'sonner'

// Success
toast.success('Tests generated', { description: '12 test files created and compiled.' })

// Error
toast.error('Generation failed', { description: err.message })

// Info / progress
toast.loading('Parsing document...', { id: 'parse-toast' })
toast.success('Document parsed', { id: 'parse-toast', description: '47 requirements found.' })
```

Rules:
- Success toasts: auto-dismiss after 4s
- Error toasts: persist until dismissed
- Loading toasts: always replaced with success/error
- Never show raw error codes in toasts — use human messages

### 18.5 Confirmation Dialogs

For destructive actions (delete project, delete credential, stop a run):

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete Project</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete "My SaaS App"?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete all requirements, tests, and execution history.
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete} className="bg-destructive">
        Delete Project
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 18.6 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Open command palette (Command component) |
| `⌘/` | Focus search bar on current screen |
| `R` | Trigger run (on `/execute` screen) |
| `E` | Export report (on `/coverage` screen) |
| `⌘←` | Navigate to previous screen |

### 18.7 Responsive Breakpoints

```
Mobile  (< 768px):  Sidebar collapses to Sheet, stats stack 2×2
Tablet  (768–1024): Sidebar visible, reduced width (w-48)
Desktop (> 1024px): Full layout as designed
```

The MVP primarily targets desktop (engineers, QA engineers use laptops). Mobile is read-only (viewing coverage reports, defects). No form inputs required on mobile in MVP.

---

*Speclyn UI-SPEC v1.0.0 — "From Spec to Certainty, Automatically."*
*Cross-references: SRS.md (requirements), DEV-SPEC.md §2 (auth implementation), DEV-SPEC.md §17 (implementation slices)*
