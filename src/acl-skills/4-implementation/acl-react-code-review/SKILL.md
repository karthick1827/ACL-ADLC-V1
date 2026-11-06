---
name: acl-react-code-review
description: Comprehensive React and JavaScript code review engine. Audits codebases for React 18/19 idioms, hook safety, component composition, state immutability, performance, and JS best practices. Generates audit reports in _acl-output/acl-react-code-review/{filename}.md without modifying files. Use when the user says "review react code", "react code review", or when dispatched from Rachel.
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


# React & JavaScript Code Review Workflow (Report Only)

## Overview

The `acl-react-code-review` skill provides an automated, rigorous code audit of React and JavaScript codebases. It verifies adherence to modern React 18/19 paradigms, Hook safety, component decomposition, state immutability, list rendering performance, modern ES6+ idioms, and accessibility standards.

This skill operates in **Report Only** mode: it outputs a comprehensive review document to `_acl-output/acl-react-code-review/{filename}.md` and **does not modify any source code files**.

## Conventions

- Bare paths (e.g. `steps/step-01-gather-context.md`) resolve from `{skill-root}`.
- `{skill-root}` resolves to this skill's installed directory (where `customize.toml` lives).
- `{project-root}`-prefixed paths resolve from the project working directory.

## On Activation

### Step 1: Resolve the Workflow Block
Run: `python3 {project-root}/_acl/scripts/resolve_customization.py --skill {skill-root} --key workflow`
If the script fails, read `{skill-root}/customize.toml` and apply defaults.

### Step 2: Execute Prepend Steps
Execute each entry in `{workflow.activation_steps_prepend}` in order.

### Step 3: Load Persistent Facts
Treat each entry in `{workflow.persistent_facts}` as foundational context.

### Step 4: Load Config
Load config from `{project-root}/_acl/acl/config.yaml` for `project_name`, `user_name`, and `communication_language`.

### Step 5: Execute Append Steps
Execute each entry in `{workflow.activation_steps_append}` in order.

## Step-File Architecture

Follow the step files sequentially:
1. `steps/step-01-gather-context.md`
2. `steps/step-02-audit.md`
3. `steps/step-03-generate-report.md`
4. `steps/step-04-present.md`

## FIRST STEP

Read fully and follow: `./steps/step-01-gather-context.md`.
