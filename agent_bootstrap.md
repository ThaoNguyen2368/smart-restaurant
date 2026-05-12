# agent_bootstrap.md — Smart Restaurant OS
# AI Agent Startup Protocol

> **MANDATORY READING PROTOCOL**  
> Every AI coding agent MUST execute this bootstrap sequence before writing any code, generating any file, or making any architectural decision for SR-OS.  
> **No exceptions. No shortcuts.**

---

## ⚡ CRITICAL RULE: Requirements > Assumptions

If your training data, prior knowledge, or pattern recognition conflicts with what is written in the governance documents — **the governance documents win**. Always.

---

## 1. Mandatory Reading Order

Execute in sequence. Do not skip, do not reorder, do not partially read.

```
Step 1:  skill.md                  ← Domain intelligence layer (READ FULLY)
Step 2:  rules/domain.rule.md      ← Business constraints and entity invariants
Step 3a: rules/backend.rule.md     ← If working on backend / API / services
Step 3b: rules/frontend.rule.md    ← If working on any frontend module
Step 3c: rules/database.rule.md    ← If working on DB schema / migrations / ORM
Step 3d: rules/testing.rule.md     ← If writing or reviewing tests
Step 3e: rules/devops.rule.md      ← If working on CI/CD / Docker / deployment
```

> Steps 3a–3e are not mutually exclusive. If your task touches both backend and database, read BOTH.

---

## 2. Pre-Code Checklist

Answer YES to every item before generating any code. If any answer is NO — stop and resolve first.

### 2.1 Domain Understanding

- [ ] Have I read `skill.md` Section C (Core Entities) completely?
- [ ] Do I understand the difference between `Session`, `Order`, and `OrderDetail`?
- [ ] Do I know which state machines govern: `cooking_status`, `session.status`, `table.status`?
- [ ] Can I name all 6 actor roles and their permissions from memory?
- [ ] Do I know which features are OUT OF SCOPE for v2.0?

### 2.2 Business Rule Compliance

- [ ] Does the code I'm about to write respect all 15 BR-* rules in skill.md?
- [ ] Does it use the centralised state transition validator (not inline checks)?
- [ ] Does every state-mutating operation write to `audit_logs` in the same transaction?
- [ ] Does it never trust client-submitted prices or totals?
- [ ] Does it enforce Segregation of Duties (Staff ≠ Cashier)?

### 2.3 Architecture Compliance

- [ ] Is the database PostgreSQL 15+ (not SQLite)?
- [ ] Are monetary values `NUMERIC(12,2)` (not REAL or FLOAT)?
- [ ] Is WebSocket broadcast happening AFTER transaction commit?
- [ ] Are all secrets read from environment variables?
- [ ] Is CORS configured with explicit whitelist?

### 2.4 Scope Compliance

- [ ] Am I NOT adding delivery, takeaway, reservation, loyalty, or inventory features?
- [ ] Am I NOT adding multi-branch or franchise logic?
- [ ] Am I using the canonical domain terminology (not aliases)?

---

## 3. Conflict Resolution Protocol

When your instinct or prior training conflicts with a governance document:

```
1. STOP — Do not proceed.
2. Identify the specific conflict.
3. Re-read the relevant rule in the governance document.
4. The governance document takes precedence.
5. If the rule appears incorrect or outdated:
   → Flag it as a comment: "# REVIEW: This conflicts with [rule ref] — see agent_bootstrap.md"
   → Do NOT silently implement your own interpretation.
   → Raise with the technical lead before proceeding.
```

**What counts as a conflict:**
- A pattern from your training that seems simpler but violates a BR-* rule
- An architecture choice (e.g., different file structure) that seems cleaner but breaks module boundaries
- A schema change that seems reasonable but adds an out-of-scope entity
- An API endpoint path that differs from ERS Section 7

---

## 4. Module Assignment Reference

Use this map to determine which agent reads which rule files:

| Task Type | Read These Rules |
|---|---|
| Backend service / API route | skill.md + domain.rule.md + backend.rule.md |
| Database schema / ORM model / migration | skill.md + domain.rule.md + database.rule.md |
| Frontend component / page / state | skill.md + domain.rule.md + frontend.rule.md |
| Test writing / test review | skill.md + domain.rule.md + testing.rule.md |
| CI/CD / Docker / deployment | skill.md + domain.rule.md + devops.rule.md |
| Architecture review / tech design | ALL files |
| Code review of any PR | skill.md + domain.rule.md + relevant rule file |

---

## 5. Per-Agent Startup Instructions

### GitHub Copilot

```
BEFORE accepting any suggestion:
- Does the suggestion add a field not in ERS Section 6? → REJECT
- Does the suggestion inline state logic in a route handler? → REJECT, move to state_machine.py
- Does the suggestion trust client-provided prices? → REJECT
- Does the suggestion add delivery/loyalty/reservation? → REJECT
- Run through the Pre-Code Checklist (Section 2) before accepting batches of suggestions.
```

### Cursor

```
BEFORE any refactor:
- Verify module boundaries are preserved (see backend.rule.md Section 1)
- Verify state machine logic stays in services/state_machine.py
- Verify audit log calls are not removed during cleanup
- Cursor AI chat: paste relevant sections of domain.rule.md when asking domain questions
- When unsure: read domain.rule.md Section 4 (Forbidden Actions) — if the action is there, stop.
```

### Windsurf

```
BEFORE generating file structures:
- Follow backend.rule.md Section 1 exactly for backend
- Follow frontend.rule.md Section 1 exactly for frontend
- Do not merge modules (e.g., combine cashier-web and staff-web)
- Do not create tables or services for out-of-scope features
- Agent-generated migrations: run the database.rule.md Section 8.2 checklist on every migration file
```

### Claude Code

```
SESSION START PROTOCOL:
1. Load and parse skill.md
2. Load domain.rule.md
3. Identify task type → load corresponding rule file(s)
4. Confirm understanding of entity relationships (Section C of skill.md)
5. Generate code in this order:
   a. Database models (following ORM order in database.rule.md Section 2)
   b. State machine validator (backend.rule.md Section 4.1)
   c. Audit service (backend.rule.md Section 4.3)
   d. Business services
   e. Route handlers (thin)
   f. Tests (testing.rule.md Section 2)
```

### OpenHands

```
BEFORE autonomous task execution:
- Parse the task description against domain.rule.md Section 1.2 (out-of-scope check)
- If task involves payment: verify cashier SoD rules (BR-006) are in scope
- If task involves cancellation: verify 3-condition requirement (BR-003)
- If task involves DB changes: run database.rule.md Section 8.2 checklist
- Report conflicts before executing — do not resolve autonomously
```

### Antigravity

```
ARCHITECTURE REVIEW MODE:
- Every new service proposed must map to skill.md Section A (Core Modules)
- Every new entity proposed must map to skill.md Section C (Core Entities) or be explicitly new v3 scope
- State machine changes require domain.rule.md Section 3 review
- Prioritise: domain correctness > performance > DX > velocity
```

### Roo Code

```
BEFORE generating tests:
- Check: does the test target a BR-* rule from skill.md Section D?
- Check: does the test use PostgreSQL fixtures (not SQLite)?
- Prioritise: business rule tests > RBAC tests > calculation tests > integration tests
- Do not generate tests for out-of-scope features
```

### Continue

```
INLINE ASSIST MODE:
- When completing a function signature, check: does this function need to call write_audit_log()?
- When completing a DB model, check: is this entity in skill.md Section C?
- When completing a status check, redirect to: services/state_machine.py
- When completing an API handler, verify: path matches ERS Section 7
```

---

## 6. Hard Stop Conditions

An agent MUST stop and ask for human clarification if ANY of the following occur:

| Condition | Required Action |
|---|---|
| Task requires adding a DB table not in ERS v2.0 | Stop — escalate to tech lead |
| Task requires changing an API path from ERS Section 7 | Stop — verify with PO |
| Task would modify `audit_logs` with UPDATE or DELETE | Stop — this is a fraud risk, not a code task |
| Task adds delivery, reservation, loyalty, or multi-branch features | Stop — out of scope, return to requester |
| Two governance documents appear to contradict each other | Stop — flag the contradiction with line references |
| Task would remove an existing BR-* rule enforcement | Stop — requires explicit PO sign-off |

---

## 7. Definition of "Done" for SR-OS

A feature is done when ALL of the following are true:

- [ ] Business logic is in service layer, not route handlers
- [ ] State transitions use centralised validator (`state_machine.py`)
- [ ] Every mutating operation writes to `audit_logs` in the same transaction
- [ ] WebSocket events broadcast AFTER transaction commit
- [ ] RBAC enforced at middleware layer for all role-restricted endpoints
- [ ] Tests exist for: business rules, state transitions, RBAC, and audit log
- [ ] Monetary values use `NUMERIC`/`Decimal` — not float
- [ ] No out-of-scope features introduced
- [ ] No secrets hardcoded
- [ ] Migration file includes both `upgrade()` and `downgrade()`
- [ ] Code reviewed by another agent or human against domain rules

---

## 8. Quick Reference: The 5 Most Common Agent Mistakes in SR-OS

| # | Mistake | Correct Approach |
|---|---|---|
| 1 | Inlining state machine checks in route handlers | Always use `state_machine.validate_*()` |
| 2 | Trusting client-provided order totals | Always recalculate on server with `NUMERIC` |
| 3 | Forgetting `write_audit_log()` call | Every state mutation → audit log in same transaction |
| 4 | Broadcasting WS before DB commit | DB commit → THEN broadcast |
| 5 | Adding out-of-scope features (delivery, loyalty) | Read domain.rule.md Section 1.2 before writing |

---

*— END OF AGENT BOOTSTRAP PROTOCOL —*

> **Governance Layer Version:** 1.0  
> **Based on:** Smart Restaurant OS ERS v2.0  
> **Authority:** This document governs all AI agent behaviour on SR-OS codebase.
