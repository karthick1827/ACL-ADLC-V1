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

## 🛑 STRICT PROHIBITION: No Direct AI Status Manipulation & Manager-Only Approval
- The AI agent is **STRICTLY PROHIBITED** from using tools (`replace_file_content`, `write_to_file`, `run_command`, etc.) to change `status: In Review` -> `status: Approved` at ANY cost.
- ONLY THE MANAGER is authorized and permitted to change the status via Markdown Studio (`markdown.html`).
- The AI agent is **STRICTLY PROHIBITED** from prompting the developer to self-approve or change review statuses.
- The AI agent MUST ONLY instruct the developer to wait for the manager's review.
