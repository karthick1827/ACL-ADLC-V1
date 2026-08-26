---
name: acl-quick-dev
description: 'Implements any user intent, requirement, story, bug fix or change request by producing clean working code artifacts that follow the project''s existing architecture, patterns and conventions. Use when the user wants to build, fix, tweak, refactor, add or modify any code, component or feature.'
---

## 🚦 Universal Phase Gate Precondition (Mandatory & Non-Negotiable)
Before executing any actions, adopting any persona, greeting the user, or producing output:
1. Scan all existing markdown files in `_acl-output/` (or run `node tools/adlc-gate-guard.js`).
2. If ANY prerequisite markdown file in `_acl-output/` is missing, or has ANY status other than `Accepted` (e.g. `In Review`, `draft`, `Pending`, `Rejected`):
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
        'Accepted' or 'Rejected' in Markdown Studio before proceeding with 
        downstream tasks.
     ========================================================================
     ```
3. Only proceed if ALL existing documents in `_acl-output/` have `status: Accepted`.



## Phase Gate Guard Precondition (Mandatory)
Before generating or modifying code artifacts:
1. Verify that Phase 2 (PRD) and Phase 3 (Architecture Spine) are marked `status: Accepted` (or execute `node tools/adlc-gate-guard.cjs phase4`).
2. If prerequisite artifacts are `In Review` or `Rejected`:
   - **HALT IMMEDIATELY. DO NOT GENERATE OR MODIFY CODE.**
   - Output structured gate blocked error:
     "❌ [ADLC GATE REJECTED / BLOCKED]: Cannot proceed with Code Implementation.
      Prerequisite artifacts in Phase 2/3 must be reviewed and marked 'Accepted' by your manager in Markdown Studio before code generation can start."

Run this, substituting `{skill-root}` with the absolute path to this skill's base directory, without changing the cwd:

```bash
uv run --no-cache {skill-root}/render.py
```

- **On success:** follow the instruction it prints to stdout; ignore stderr.
- **On any failure** (including `uv` not being installed): report what it printed and HALT.
