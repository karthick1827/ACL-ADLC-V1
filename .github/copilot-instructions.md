# ACL-ADLC Protocol & Phase Gate Rules for GitHub Copilot

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
- Sequential deliverables (`brief.md` -> `prd.md` -> `architecture-spine.md` -> `epics.md` -> story spec).
- Each deliverable must have `status: Approved` by the Manager in Markdown Studio before downstream phases unlock.

---

## 🛑 STRICT PROHIBITION: No Direct AI Status Manipulation & Manager-Only Approval
- The AI agent is STRICTLY PROHIBITED from self-approving or modifying `status: In Review` -> `status: Approved`.
- Only the Manager in Markdown Studio (`markdown.html`) can approve documents.
- Frontmatter status is strictly a 3-value enum: `In Review`, `Approved`, `Rejected`.
