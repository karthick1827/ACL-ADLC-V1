# ACL-ADLC Workflow Matrix & Custom Agent Integration

This matrix defines how custom agents connect to the Agile Delivery Lifecycle (ACL-ADLC) sequential phases, approval gates, and file locations.

---

## 1. Lifecycle Phases & Default Roster

| Phase | Core Deliverable | Output Location | Default Agent | Upstream Gate Prerequisite |
|---|---|---|---|---|
| **Phase 1: Analysis** | `brief.md` / `prfaq.md` | `_acl-output/1-analysis/acl-product-brief/` | Mary (Analyst), Paige (Tech Writer) | None (Greenfield) or Project Context |
| **Phase 2: Plan Workflows** | `prd.md` / `spec.md` / `ux.md` | `_acl-output/2-plan-workflows/acl-prd/` | John (PM), Sally (UX Designer) | Phase 1 (`brief.md`) must be `Approved` |
| **Phase 3A: Architecture** | `architecture-spine.md` | `_acl-output/3-solutioning/acl-architecture/` | Winston (System Architect) | Phase 2 (`prd.md`) must be `Approved` |
| **Phase 3B: Epics & Stories** | `epics.md` | `_acl-output/3-solutioning/acl-create-epics-and-stories/` | Winston (System Architect) | Phase 3A (`architecture-spine.md`) must be `Approved` |
| **Phase 4: Implementation** | `story-X-Y.md`, source code, audit reports | `_acl-output/4-implementation/` & repo source | Amelia (Dev), Rachel (Reviewer), QA | Phase 3B (`epics.md`) & `story-X-Y.md` must be `Approved` |
| **Cross-Cutting** | Audit reports, research, party memory | `_acl-output/...` | Scout, Party Mode, Review | Respects phase-specific preconditions |

---

## 2. Output Archetypes & Workflow Mappings

### Archetype A: Markdown File Creator
- **Typical Roles**: Compliance Officer, Security Threat Modeler, API Contract Designer, Technical Writer, Product Strategist, Release Manager.
- **Output Target**: `_acl-output/<phase-dir>/<artifact-slug>.md`
- **Frontmatter Standard**:
  ```yaml
  ---
  title: "<Document Title>"
  status: In Review
  author: "<Agent Name>"
  tier: "Tier 1 (Self-Contained)" # or Tier 2
  created: "<YYYY-MM-DD>"
  ---
  ```
- **Phase Gate Integration**:
  - Automatically sets `status: In Review` on creation or updates.
  - Strictly relies on Manager Sign-Off in Markdown Studio (`markdown.html`) to transition to `status: Approved`.
  - Downstream skills check for `status: Approved` before consuming the output.

### Archetype B: Code Reviewer
- **Typical Roles**: Security Code Auditor, Performance Auditor, Accessibility Reviewer, React/Frontend Reviewer, Database Migration Reviewer.
- **Output Target**: `_acl-output/<review-dir>/{target-file-slug}.md`
- **Standard Execution Modes**:
  1. `[RO]` **Report Only**: Scans target files against rules catalog, identifies anti-patterns, and writes markdown report with exact `file:line` locations and before/after snippets.
  2. `[RF]` **Report & Fix**: Generates the markdown report AND executes minimal, targeted remediation directly in the source files while preserving formatting and tests.
- **Rules Catalog**: Rules stored in `./rules/<domain>-rules.md` inside the skill directory.

### Archetype C: Code Generator
- **Typical Roles**: Full-Stack Feature Engineer, Microservice Builder, Test Automation Engineer, Migration Script Developer.
- **Output Target**: Application codebase (`src/`, `test/`, etc.).
- **Gating Invariant**:
  - **MANDATORY CHECK**: Inspects `_acl-output/4-implementation/story-<epic>-<story>.md` (Tier 2) or `spec-<feature>.md` (Tier 1).
  - If `status: In Review`, `status: Rejected`, or missing -> **HALTS IMMEDIATELY**. Code generation is strictly locked until Manager sign-off.
  - If `status: Approved` -> Unlocks code implementation.
- **Discipline**:
  - Kent Beck's Test-Driven Development (Red -> Green -> Refactor).
  - Every acceptance criterion checklist item (`- [ ]`) in the story must be validated.
  - No AI metadata, prompt pollution, or story comments in production code.

---

## 3. Governance Tier Rules (Brownfield Feature Work)

When creating or modifying features in existing codebases, the custom agent must enforce:

- **Tier 1 (Self-Contained / Low Blast Radius)**:
  - 1-page Spec created in `_acl-output/4-implementation/spec-<slug>.md` (`status: In Review`).
  - Implementation locked until Manager approves in Markdown Studio.
- **Tier 2 (Major Architectural Overhaul / High Blast Radius)**:
  - Full sequential cascade:
    1. Phase 1: `brief.md` (`In Review` -> Manager `Approved`)
    2. Phase 2: `prd.md` (`In Review` -> Manager `Approved`)
    3. Phase 3A: `architecture-spine.md` (`In Review` -> Manager `Approved`)
    4. Phase 3B: `epics.md` (`In Review` -> Manager `Approved`)
    5. Phase 4: `story-X-Y.md` (`In Review` -> Manager `Approved` -> Code implementation).

---

## 4. Central Roster Integration

To ensure the custom agent is recognized by `acl-party-mode`, `acl-help`, and other multi-agent orchestration tools:

Add an entry to `{project-root}/_acl/custom/config.toml` (team-shared) or `{project-root}/_acl/custom/config.user.toml` (personal):

```toml
[agents.<agent-code>]
name = "<Agent Name>"
title = "<Professional Title>"
icon = "<Emoji Icon>"
team = "software-development" # or security, qa, platform, etc.
description = "<1-2 sentence essence of identity and expertise for party mode>"
```
