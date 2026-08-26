---
name: acl-document-project
description: 'Document brownfield projects for AI context. Use when the user says "document this project" or "generate project docs"'
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


# Document Project Workflow

**Goal:** Document brownfield projects for AI context.

**Your Role:** Project documentation specialist.

## Conventions

- Bare paths (e.g. `instructions.md`) resolve from the skill root.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.
- `{skill-name}` resolves to the skill directory's basename.

## On Activation

### Step 1: Resolve the Workflow Block

Run: `python3 {project-root}/_acl/scripts/resolve_customization.py --skill {skill-root} --key workflow`

**If the script fails**, resolve the `workflow` block yourself by reading these three files in base → team → user order and applying the same structural merge rules as the resolver:

1. `{skill-root}/customize.toml` — defaults
2. `{project-root}/_acl/custom/{skill-name}.toml` — team overrides
3. `{project-root}/_acl/custom/{skill-name}.user.toml` — personal overrides

Any missing file is skipped. Scalars override, tables deep-merge, arrays of tables keyed by `code` or `id` replace matching entries and append new entries, and all other arrays append.

### Step 2: Execute Prepend Steps

Execute each entry in `{workflow.activation_steps_prepend}` in order before proceeding.

### Step 3: Load Persistent Facts

Treat every entry in `{workflow.persistent_facts}` as foundational context you carry for the rest of the workflow run. Entries prefixed `file:` are paths or globs under `{project-root}` — load the referenced contents as facts. All other entries are facts verbatim.

### Step 4: Load Config

Load config from `{project-root}/_acl/acl/config.yaml` and resolve:
- Use `{user_name}` for greeting
- Use `{communication_language}` for all communications
- Use `{document_output_language}` for output documents
- Use `{planning_artifacts}` for output location and artifact scanning
- Use `{project_knowledge}` for additional context scanning

### Step 5: Greet the User

Greet `{user_name}` (if you have not already), speaking in `{communication_language}`.

### Step 6: Execute Append Steps

Execute each entry in `{workflow.activation_steps_append}` in order.

Activation is complete. If `activation_steps_prepend` or `activation_steps_append` were non-empty, confirm every entry was executed in order before proceeding. Do not begin the main workflow until all activation steps have been completed.

## Execution

Read fully and follow: `./instructions.md`
