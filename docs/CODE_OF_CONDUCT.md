# Speclyn — Code of Conduct
### *"From Spec to Certainty — Automatically."*

**Version:** 1.0.0
**Date:** 2026-06-11
**Applies to:** All contributors, collaborators, and team members working on the Speclyn codebase.

---

## 1. Our Commitment

We are committed to making Speclyn a welcoming, safe, and productive environment for everyone who contributes — regardless of experience level, background, nationality, or identity. Every person who opens a PR, files an issue, reviews code, or discusses architecture deserves to be treated with respect and good faith.

---

## 2. Standards of Conduct

### 2.1 Expected Behaviour

- **Be direct, not harsh.** Disagree with ideas; never attack people.
- **Be precise.** Vague criticism wastes everyone's time. Say what is wrong and why.
- **Assume good intent by default.** A confusing PR is more likely confusion than malice.
- **Give and receive feedback professionally.** Code reviews are about the code, not the coder.
- **Ask before you assume.** If something is unclear in an issue or PR, ask a clarifying question before escalating.
- **Own your mistakes.** If you break something in main, fix it. No blame culture.
- **Respect scope.** Don't refactor code that wasn't in the task. Don't expand a bug fix into a feature without agreement.

### 2.2 Unacceptable Behaviour

- Personal attacks, insults, or belittling comments in any channel (GitHub, Slack, PR reviews, etc.)
- Sharing someone's private information without their consent
- Dismissing a contribution without explanation ("this is bad" without a reason is not a review)
- Repeated unsolicited advice after it has been declined
- Committing code that intentionally introduces security vulnerabilities, even as a "joke"
- Bypassing security controls (force-pushing main, disabling CI checks) without team discussion

---

## 3. Engineering Code of Conduct

These rules apply specifically to the Speclyn codebase. They are non-negotiable:

### 3.1 Security

| Rule | Rationale |
|------|-----------|
| Never commit credentials, tokens, or secrets to git | A committed secret is a permanent secret even after deletion — git history is public |
| Never disable CI checks (`--no-verify`) without team sign-off | CI protects everyone's work |
| Never hard-code test credentials in generated test files | Violates REQ-CON-001 and REQ-GEN-004 |
| Never `eval()` LLM output | Arbitrary code execution vulnerability |
| Always validate LLM output with Zod before persisting | Malformed data silently breaks downstream features |

### 3.2 Code Quality

| Rule | Rationale |
|------|-----------|
| Every PR must pass `pnpm typecheck`, `pnpm lint`, and `pnpm test` | Non-negotiable gate — broken main blocks everyone |
| No `any` type without a comment explaining why | `any` is a technical debt marker; make it visible |
| No `console.log` in production code | Use the structured pino logger |
| Every new public function needs at least one unit test | Untested code is a bug waiting to be discovered in production |
| Import from `@speclyn/shared-types` for shared contracts | DRY principle — see DEV-SPEC §1.6 |

### 3.3 Database & Migrations

| Rule | Rationale |
|------|-----------|
| Every schema change needs a Drizzle migration | Manual SQL in production is a maintenance nightmare |
| No `DROP COLUMN` or `DROP TABLE` without a data backup confirmation | Irreversible — one mistake deletes customer data |
| Migrations must run in CI before tests | Catches schema regressions before they reach production |
| Migrations are committed to git and reviewed in PRs | Schema changes are as important as code changes |

### 3.4 Branching & Commits

| Rule | Rationale |
|------|-----------|
| Branch from `main`, target `main` | Keeps history simple |
| Branch names: `feat/`, `fix/`, `chore/`, `docs/` prefix | Readable at a glance |
| Commit messages: imperative mood, ≤72 chars subject line | `Add stream token auth` not `Added stream token auth` |
| One logical change per PR | Mixing concerns makes code review and rollback harder |
| Never force-push `main` | Rewrites shared history; breaks teammates' local repos |

### 3.5 AI / LLM Usage in Development

Building Speclyn involves both writing AI-powered features AND using AI tools in development. Both require care:

- **When writing AI features:** Follow DEV-SPEC §1.1 (Hybrid Intelligence Rule) — LLMs only where reasoning is genuinely required. Document *why* an LLM is used in a comment.
- **When using AI coding assistants:** Review every line of AI-generated code before committing. You are responsible for the code you commit, regardless of who wrote it.
- **Do not paste customer data into AI assistants.** Even anonymised data — you don't know what gets logged.
- **Do not use AI to generate migration files.** Migrations touch the data model; write them deliberately and review them carefully.

---

## 4. Pull Request Guidelines

### 4.1 Before Opening a PR

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes  
- [ ] `pnpm test` passes
- [ ] No `console.log` left in code
- [ ] No secrets in the diff (run `git diff` and visually scan)
- [ ] If schema changed: migration file is included
- [ ] PR description explains *why*, not just *what*

### 4.2 PR Description Template

```
## What
One sentence: what does this PR do?

## Why
Why is this change needed? Link to issue/ticket if applicable.

## How
Key implementation decisions or non-obvious choices.

## Testing
What was tested and how? (unit tests / manual / both)

## Checklist
- [ ] Tests pass
- [ ] No secrets committed
- [ ] Migration included (if schema changed)
- [ ] Docs updated (if behaviour changed)
```

### 4.3 Review Standards

- Respond to review comments within 1 business day
- A review is a conversation — "please explain X" is a valid comment
- Approval means "I've read this and it meets our standards" — not "I glanced at it"
- At least 1 approval required before merging (solo founders: self-review with fresh eyes after a break)
- Resolve all open threads before merging

---

## 5. Issue Reporting

### 5.1 Bug Reports

Include:
1. What you expected to happen
2. What actually happened
3. Steps to reproduce (minimal, deterministic)
4. Environment (Node version, OS, relevant env vars — **no secrets**)
5. Error output or logs (redact any sensitive data)

### 5.2 Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.**

Report privately to the founder/security contact. Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix

Allow 48 hours for acknowledgement before escalating.

---

## 6. Enforcement

Violations of this Code of Conduct will be addressed as follows:

| Severity | Response |
|----------|----------|
| Minor (tone, forgotten checklist item) | Private correction + reminder |
| Moderate (repeated minor, code quality failure in prod) | Formal conversation + remediation plan |
| Serious (security violation, harassment) | Immediate suspension pending review |
| Critical (deliberate sabotage, malicious code) | Permanent removal from project |

All reports are treated confidentially. Retaliation against anyone who reports a violation is itself a violation.

---

## 7. Attribution

This Code of Conduct is maintained by the Speclyn founding team and reviewed annually (or after any significant incident). It is adapted for a technical project context and covers both interpersonal conduct and engineering standards.

---

*Speclyn Code of Conduct v1.0.0 — last reviewed 2026-06-11*
