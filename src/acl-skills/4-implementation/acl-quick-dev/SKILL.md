---
name: acl-quick-dev
description: "Implements any user intent, requirement, story, bug fix or change request by producing clean working code artifacts that follow the project's existing architecture, patterns and conventions. Use when the user wants to build, fix, tweak, refactor, add or modify any code, component or feature."
---

## 🚦 Universal Phase Gate Precondition (Mandatory & Non-Negotiable)

Before executing any actions, adopting any persona, greeting the user, or producing output:

1. Scan all existing markdown files in `_acl-output/` (or run `node tools/adlc-gate-guard.js`).
2. If ANY prerequisite markdown file in `_acl-output/` is missing, or has ANY status other than `Approved` (e.g. `In Review`, `draft`, `Pending`, `Rejected`):
   - **TOTAL AGENT BLOCK (NO PERSONAS, NO CHATTING, NO BRAINSTORMING, NO FILE GENERATION)**:
     - The AI Agent is **STRICTLY FORBIDDEN** from adopting personas or greeting the user as an agent.
     - The AI Agent is **STRICTLY FORBIDDEN** from offering conversational advice, whiteboard diagrams, or brainstorming in chat while waiting for approval.
     - The AI Agent is **STRICTLY FORBIDDEN** from creating, updating, or modifying downstream files.
     - The AI Agent is **STRICTLY FORBIDDEN** from asking or suggesting the user/developer to self-approve or change the status.
   - **THE ONLY PERMITTED ACTION**: Output the official waiting message:

     ```text
     ========================================================================
     ⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)
     ========================================================================
     📄 Document in Review: One or more prerequisite documents in _acl-output/ are currently IN REVIEW / PENDING.
     🏷️ Current Status:      [IN REVIEW / PENDING]

     ⚠️ STATUS:
        As per the ACL-ADLC sequential delivery framework, this document
        is currently awaiting official review and sign-off by your Manager.

     👉 NEXT STEP:
        Please wait for your manager to review and mark this document as
        'Approved' or 'Rejected' in Markdown Studio before proceeding with
        downstream tasks.
     ========================================================================
     ```

3. Only proceed if ALL existing documents in `_acl-output/` have `status: Approved`.

## 🛑 STRICT PROHIBITION: No Direct AI Status Manipulation & Manager-Only Approval

- The AI agent is **STRICTLY PROHIBITED** from using tools (`replace_file_content`, `write_to_file`, `run_command`, etc.) to change `status: In Review` -> `status: Approved` at ANY cost.
- ONLY THE MANAGER is authorized and permitted to change the status via Markdown Studio (`markdown.html`).
- The AI agent is **STRICTLY PROHIBITED** from prompting the developer to self-approve or change review statuses.
- The AI agent MUST ONLY instruct the developer to wait for the manager's review.

## Phase Gate Guard Precondition (Mandatory)

Before generating or modifying code artifacts, verify prerequisite document approvals:

### Greenfield Projects:

1. Verify that Phase 2 (PRD), Phase 3 (Architecture Spine), and Phase 4 (Epics/Stories) are marked `status: Approved` (or execute `node tools/adlc-gate-guard.cjs phase4`).
2. If prerequisite artifacts are `In Review`, `Pending`, or `Rejected`:
   - **HALT IMMEDIATELY. DO NOT GENERATE OR MODIFY CODE.**
   - Output structured gate blocked error:
     "❌ [ADLC GATE REJECTED / BLOCKED]: Cannot proceed with Code Implementation.
     Prerequisite artifacts in Phase 2/3/4 must be reviewed and marked 'Approved' by your manager in Markdown Studio before code generation can start."

### Brownfield Projects (Adaptive Tiered Gate):

1. **Tier 1 (Self-Contained Spec)**:
   - Verify that `project-context.md` and the targeted `spec-<feature-slug>.md` (in `_acl-output/4-implementation/` or `_acl-output/specs/`) are marked `status: Approved`.
   - Greenfield full sequential artifacts (Phase 1-3) are **NOT required** for Tier 1 changes.
   - If the spec is `In Review` or `Rejected`:
     - **HALT IMMEDIATELY. DO NOT GENERATE OR MODIFY CODE.**
     - Output the Tier 1 Gate Locked banner and wait for Manager sign-off.
2. **Tier 2 (Major Architectural Overhaul)**:
   - Full sequential governance applies.
   - Verify that `project-context.md`, `brief.md`, `prd.md`, `architecture-spine.md`, and `epics.md` are all marked `status: Approved`.
   - **Per-Story Implementation Gate**: Before implementing any individual story from `epics.md`, the AI Agent MUST create `_acl-output/4-implementation/story-<id>.md` (with `status: In Review` and the story's acceptance criteria checklist).
   - The AI Agent MUST halt immediately and await Manager sign-off in Markdown Studio (`status: Approved`) before generating or modifying application code for that story.

Run this, substituting `{skill-root}` with the absolute path to this skill's base directory, without changing the cwd:

```bash
uv run --no-cache {skill-root}/render.py
```

- **On success:** follow the instruction it prints to stdout; ignore stderr.
- **On any failure** (including `uv` not being installed): report what it printed and HALT.
