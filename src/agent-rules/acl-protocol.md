# ACL-ADLC Protocol & Phase Gate Rules for {{AGENT_NAME}}

## 🛑 PRE-FLIGHT CHECK: Quick Dev Opt-In Governance

### 🟢 1. Default Mode (No "quick dev" tag):
When the user's prompt does **NOT** explicitly mention or tag `quick dev` (or `@acl-quick-dev` / `/acl-quick-dev`):
- **DO NOT** prompt for Tier 1 / Tier 2.
- **DO NOT** create spec files in `_acl-output/4-implementation/`.
- **DO NOT** lock execution or wait for Manager sign-off.
- Answer questions, explain code, or apply changes directly and normally as requested.

---

### 🔴 2. Governed Mode (Explicit "quick dev" tag):
The Brownfield Tier Governance workflow is **STRICTLY OPT-IN**.
ONLY activate the Tier Selection and Gate Lock protocol when the user **explicitly tags or mentions `quick dev`** (e.g., `quick dev: <task>`, `@acl-quick-dev <task>`, or `/acl-quick-dev <task>`):

1. **INTERACTIVE TIER SELECTION**:
   - **Case A: User specifies Tier** (e.g. `quick dev Tier 1: ...`, `quick dev Tier 2: ...`, `use Tier 1`):
     - Follow the rules of that tier immediately.
   - **Case B: No Tier specified with quick dev**:
     - **DO NOT WRITE ANY CODE.**
     - **DO NOT EDIT ANY FILES.**
     - **OUTPUT THIS EXACT PROMPT AND STOP**:

```text
========================================================================
📊 [FEATURE / CHANGE ASSESSMENT]: Choose Execution Tier
========================================================================
🎯 Feature / Change:   <Summary of requested work>
💡 AI Recommendation:  [Tier 1 / Tier 2 based on blast radius]

Please choose which Tier you want to proceed with:

  [1] Tier 1 — Self-Contained Spec (1-Page Story + Manager Sign-Off)
      📝 AI generates a 1-page Spec in _acl-output/4-implementation/ (status: In Review).
      ⏳ Code implementation is strictly LOCKED until Manager approves in Markdown Studio.

  [2] Tier 2 — Major Architectural Overhaul / Full Cascade
      🏛️ Full sequential governance (Product Brief -> PRD -> Architecture Spine -> Epics).

👉 Reply with 1 or 2 to proceed:
========================================================================
```

---

## 🟡 TIER 1 WORKFLOW (Self-Contained Spec + Manager Gate Lock)
1. **Create Spec**: Generate `_acl-output/4-implementation/spec-<feature-slug>.md` with frontmatter:
   ```yaml
   ---
   title: <Feature Name>
   tier: Tier 1 (Self-Contained)
   status: In Review
   type: feature
   created: <YYYY-MM-DD>
   ---
   ```
2. **Immediate Gate Lock**:
   - **DO NOT WRITE APPLICATION CODE.**
   - Output the Gate Lock banner:
     ```text
     ========================================================================
     ⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)
     ========================================================================
     📄 Document in Review: spec-<feature-slug>.md (_acl-output/4-implementation/)
     🏷️ Current Status:      [IN REVIEW]

     ⚠️ STATUS:
        As per the Tier 1 protocol, this 1-page specification
        is currently awaiting official review and sign-off by your Manager.
        Code implementation is strictly locked until approved.

     👉 NEXT STEP:
        Please open Markdown Studio (http://localhost:5173/markdown.html)
        and have your Manager review and mark this document as 'Approved'
        or 'Rejected' before proceeding with code implementation.
     ========================================================================
     ```
3. **Coding Gate**: Only proceed to implement application code when `spec-<feature-slug>.md` has `status: Approved`.

---

## 🔴 TIER 2 WORKFLOW (Major Overhaul / Full Cascade)
- Sequential deliverables (`brief.md` -> `prd.md` -> UX (if any) -> `architecture-spine.md` -> `epics.md` -> story spec).
- Each deliverable must have `status: Approved` by the Manager in Markdown Studio before downstream phases unlock.
- **Adding or changing a feature (greenfield AND brownfield): UPDATE THE EXISTING FILES — NEVER CREATE NEW ONES.**
  For each deliverable in order, one at a time:
  1. If the canonical file exists, open **that** file, keep every existing line, and **append at the bottom**:
     ```markdown

     ---

     ## 🔄 Feature Update — <feature name> (<YYYY-MM-DD>) · Tier 2
     ...feature content for this deliverable...
     ```
  2. In the same file's frontmatter set `status: In Review` and `updated: <YYYY-MM-DD>`, and remove
     `reviewed_by`, `review_timestamp`, `gate_signature`, `approved_hash`.
  3. **HALT** with the Gate Lock banner for that file. Update the next deliverable only after the Manager
     marks this one `Approved` in Markdown Studio.
  4. If the canonical file does not exist yet, create it at its canonical path (below).

---

## 📁 ONE FILE PER DELIVERABLE (greenfield & brownfield, every tier)
Each deliverable exists exactly once, at this path under `_acl-output/` (or the configured `output_folder`):

| Deliverable | Canonical file |
|---|---|
| Product Brief | `1-analysis/acl-product-brief/brief.md` |
| PRD | `2-plan-workflows/acl-prd/prd.md` |
| UX Design | `2-plan-workflows/acl-ux/DESIGN.md` + `EXPERIENCE.md` |
| Architecture Spine | `3-solutioning/acl-architecture/architecture-spine.md` |
| Epics & Stories | `3-solutioning/acl-create-epics-and-stories/epics.md` |
| Project Context | `project-context.md` |

- **NEVER** create dated or per-run folders (`brief-<project>-<date>/`, `planning-artifacts/prds/...`), second copies in other folders, or renamed copies (`brief-v2.md`, `prd-feature.md`).
- Companion files (`addendum.md`, `.memlog.md`, `reconcile-*.md`, reviews) live in the deliverable's own folder.
- If an older spine named `ARCHITECTURE-SPINE.md` or `architecture.md` already exists, update that file instead of adding a new one.
- Full rules: `_acl/scripts/references/acl-deliverable-protocol.md`. Verify with `node tools/adlc-gate-guard.cjs --validate-all`.

---

## 🌳 WORKING TREE TRACKING
- After creating or updating any deliverable in `_acl-output/`, run `uv run {project-root}/_acl/scripts/working_tree.py track --agent <analyst|pm|ux-designer|architect|dev|tech-writer> --skill <skill-id> --file <path>`.
- Run `uv run {project-root}/_acl/scripts/working_tree.py sync` to backfill untracked deliverables. Never hand-edit `_acl-output/working-tree.md` or give it a `status` field; gates never evaluate it.

---

## 🛑 STRICT PROHIBITION: No Direct AI Status Manipulation & Manager-Only Approval
- The AI agent is STRICTLY PROHIBITED from self-approving or modifying `status: In Review` -> `status: Approved` (or `Rejected`).
- Only the Manager in Markdown Studio (`markdown.html`) can approve or reject documents.
- Frontmatter status is strictly a 3-value enum: `In Review`, `Approved`, `Rejected`.
- **Re-review on change:** whenever the agent changes the content of any `.md` file under `_acl-output/` whose status is `Approved` or `Rejected`, it MUST set `status: In Review` and remove `reviewed_by`, `review_timestamp`, `gate_signature`, `approved_hash`. Moving a status **to** `In Review` is the only status change an agent may make. Metadata-only edits (e.g. writing back `jira_key`) do not count as content changes.
