# ACL-ADLC

Open source framework for structured, agent-assisted software delivery.

## Rules

- Use Conventional Commits for every commit.
- Before pushing, run `npm ci && npm run quality` on `HEAD` in the exact checkout you are about to push.
  `quality` mirrors the checks in `.github/workflows/quality.yaml`.

- Skill validation rules are in `tools/skill-validator.md`.
- Deterministic skill checks run via `npm run validate:skills` (included in `quality`).

## 🚦 Phase Gate Approval Invariants (Mandatory & Non-Negotiable)

- **Universal Sequential Document Gate for ALL Agents & Skills**:
  - EVERY single agent (Sally UX Designer, Winston Architect, Amelia Developer, Mary Analyst, etc.) and EVERY skill (`acl-architecture`, `acl-ux`, `acl-create-epics-and-stories`, `acl-quick-dev`, `acl-figma-bridge`, etc.) MUST FIRST verify that ALL upstream documents in `_acl-output/` have `status: Approved`.
  - If **ANY** prerequisite document in `_acl-output/` is missing, or has ANY status other than `Approved` (e.g. `In Review`, `draft`, `Pending`, `Rejected`):
    - **TOTAL AGENT BLOCK (NO PERSONAS, NO CHATTING, NO BRAINSTORMING, NO FILE GENERATION)**:
      - The AI Agent is **STRICTLY FORBIDDEN** from adopting personas or greeting the user as an agent.
      - The AI Agent is **STRICTLY FORBIDDEN** from offering conversational advice, whiteboard diagrams, or brainstorming in chat while waiting for approval.
      - The AI Agent is **STRICTLY FORBIDDEN** from creating, updating, or modifying downstream files.
      - The AI Agent is **STRICTLY FORBIDDEN** from asking or suggesting the user/developer to self-approve or change the status.
    - **THE ONLY PERMITTED ACTION**: The AI Agent MUST inform the user to WAIT for Manager sign-off:
      ```text
      ========================================================================
      ⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)
      ========================================================================
      📄 Document in Review: <Document Name> (<Path>)
      🏷️ Current Status:      [IN REVIEW / PENDING]

      ⚠️ STATUS:
         As per the ACL-ADLC sequential delivery framework, this document 
         is currently awaiting official review and sign-off by your Manager.

      👉 NEXT STEP:
         Please wait for your manager to review and mark this document as 
         'Approved' or 'Rejected' in Markdown Studio before proceeding with 
         downstream tasks (<Next Phase / Skill Name>).
      ========================================================================
      ```

### 1. Brownfield Change Request Protocol (Interactive Tier Selection)

Whenever the developer asks for a feature, bugfix, or code change in a Brownfield project:

#### Case A: Tier is Explicitly Specified in the User Prompt
If the user specifies a tier (e.g., *"Tier 1: create notification drawer"*, *"Tier 2: migrate database"*, or *"use Tier 1"*), the AI Agent immediately follows the rules of that tier without asking.

#### Case B: No Tier is Specified in the User Prompt
The AI Agent **MUST NOT** immediately write code or modify files.  
The AI Agent **MUST FIRST** output the following interactive prompt and **STOP** to await the user's choice:

```text
========================================================================
📊 [BROWNFIELD ASSESSMENT]: Choose Execution Tier
========================================================================
🎯 Feature / Change:   <Summary of requested work>
💡 AI Recommendation:  [Tier 1 / Tier 2 based on blast radius]

Please choose which Tier you want to proceed with:

  [1] Tier 1 — Self-Contained Spec (1-Page Story + Manager Sign-Off)
      📝 AI generates a 1-page Spec in _acl-output/4-implementation/ (status: In Review).
      ⏳ Code implementation is strictly LOCKED until Manager approves in Markdown Studio.

  [2] Tier 2 — Major Architectural Overhaul
      🏛️ Full sequential governance (Product Brief -> PRD -> Architecture Spine -> Epics).

👉 Reply with 1 or 2 to proceed:
========================================================================
```

---

### 2. Blast-Radius Tier Rules (2 Tiers: Tier 1 & Tier 2)

> ⚠️ **GOVERNANCE POLICY**: Every change, bugfix, or feature in a Brownfield project requires at minimum a 1-Page Spec with Manager Sign-Off in Markdown Studio (**Tier 1**), or full sequential governance for major architectural overhauls (**Tier 2**). Direct unverified code generation without an approved spec is strictly forbidden.

#### 🟡 Tier 1: Self-Contained Features & Tweaks (1-Page Spec + Manager Approval Gate)
- **Scope**: All standard features, standalone dialogs, modals, widgets, UI tweaks, bug fixes, or components.
- **Workflow**:
  1. **Spec Generation**: The AI Agent creates a concise 1-page specification in `_acl-output/4-implementation/spec-<feature-slug>.md` with frontmatter:
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
     - The AI Agent **MUST IMMEDIATELY HALT**.
     - The AI Agent is **STRICTLY FORBIDDEN** from generating or modifying any application code.
     - The AI Agent **MUST** output the Gate Lock banner:
       ```text
       ========================================================================
       ⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)
       ========================================================================
       📄 Document in Review: spec-<feature-slug>.md (_acl-output/4-implementation/)
       🏷️ Current Status:      [IN REVIEW]

       ⚠️ STATUS:
          As per the Brownfield Tier 1 protocol, this 1-page specification 
          is currently awaiting official review and sign-off by your Manager.
          Code implementation is strictly locked until approved.

       👉 NEXT STEP:
          Please open Markdown Studio (http://localhost:5173/markdown.html) 
          and have your Manager review and mark this document as 'Approved' 
          or 'Rejected' before proceeding with code implementation.
       ========================================================================
       ```
  3. **Verification Before Coding**:
     - When the developer later asks to implement the code, the AI Agent **MUST check the status** of `spec-<feature-slug>.md`.
     - If `status: Approved`: The AI Agent is **UNBLOCKED** and proceeds to implement the code.
     - If `status: In Review`, `status: Rejected`, or missing: The AI Agent **REMAINS BLOCKED** and refuses to write code.

#### 🔴 Tier 2: Major Architectural Overhauls
- **Scope**: Complete framework upgrades, database schema rewrites, replacing global state/auth paradigms, or major cross-cutting capabilities.
- **Sequential Pipeline**:
  1. **Phase 1 (Product Brief)**: The AI Agent **FIRST** creates `_acl-output/1-analysis/acl-product-brief/brief.md` with frontmatter:
     ```yaml
     ---
     title: "Product Brief: <Feature/Overhaul Name>"
     project_type: brownfield
     tier: Tier 2 (Major Overhaul)
     status: In Review
     created: <YYYY-MM-DD>
     ---
     ```
     **Immediate Gate Lock**: The AI Agent **MUST IMMEDIATELY HALT** and output the Gate Lock banner for `brief.md`. Downstream deliverables (PRD, Architecture Spine, Epics) and application code are strictly locked until `brief.md` is approved by the Manager in Markdown Studio.
  2. **Phase 2 (PRD)**: Once `brief.md` has `status: Approved`, the AI creates `_acl-output/2-plan-workflows/acl-prd/prd.md` (`status: In Review`) and halts for approval.
  3. **Phase 3A (Architecture Spine)**: Once PRD has `status: Approved`, the AI creates `_acl-output/3-solutioning/acl-architecture/architecture-spine.md` (`status: In Review`) and halts for approval.
  4. **Phase 3B (Epics & Stories)**: Once Architecture has `status: Approved`, the AI creates `_acl-output/3-solutioning/acl-create-epics-and-stories/epics.md` (`status: In Review`) and halts for approval.
  5. **Phase 4 (Implementation)**: Strictly locked until all upstream deliverables are approved.

---

## 🛑 STRICT PROHIBITION: No Direct AI Status Manipulation & Manager-Only Approval
- The AI agent is **STRICTLY PROHIBITED** from using tools (`replace_file_content`, `write_to_file`, `run_command`, etc.) to change `status: In Review` -> `status: Approved` at ANY cost.
- ONLY THE MANAGER is authorized and permitted to change the status via Markdown Studio (`markdown.html`).
- The AI agent is **STRICTLY PROHIBITED** from prompting the developer to self-approve or change review statuses.
- The AI agent MUST ONLY instruct the developer to wait for the manager's review.
