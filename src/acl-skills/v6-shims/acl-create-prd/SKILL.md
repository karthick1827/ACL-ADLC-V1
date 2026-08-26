---
name: acl-create-prd
description: 'Deprecated — forwards to acl-prd (create intent).'
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


# DEPRECATED — forwards to acl-prd (create intent)

This skill was consolidated into `acl-prd`. It is retained as a thin compatibility shim so existing invocations by name and `_acl/custom/acl-create-prd.toml` override files keep working. New work should invoke `acl-prd` directly — it detects create / update / validate intent from the conversation.

## On Activation

1. Resolve customization: `python3 {project-root}/_acl/scripts/resolve_customization.py --skill {skill-root} --key workflow`. This picks up any `{project-root}/_acl/custom/acl-create-prd.toml` and `acl-create-prd.user.toml` overrides for the legacy fields (`activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, `on_complete`).

2. Load `{project-root}/_acl/acl/config.yaml` (and `config.user.yaml` if present) to resolve `{user_name}` and `{communication_language}`.

3. Emit a deprecation notice to the user in `{communication_language}`:

   > Notice: `acl-create-prd` is deprecated and will be removed in a future release. It now forwards to `acl-prd` with create intent. To silence this notice and access the full new customization surface (`prd_template`, `validation_checklist_template`, `validation_report_template`, `doc_standards`, `finalize_reviewers`, `external_sources`, `external_handoffs`, `prd_output_path`, `run_folder_pattern`), migrate `_acl/custom/acl-create-prd.toml` to `_acl/custom/acl-prd.toml` and invoke `acl-prd` directly next time. Customization fields that were in this version still remain in the new version and will be respected if present in `_acl/custom/acl-prd.toml`, but the new version also supports additional fields that you can take advantage of by migrating.

4. Invoke `acl-prd` with the following context. Pass these as the activating context so `acl-prd` honors them instead of resolving its own customization from scratch:

   - **Intent:** `create` — skip `acl-prd`'s usual intent detection step.
   - **Pre-resolved legacy customization** — use these in place of resolving from `acl-prd`'s own `customize.toml` for the four legacy fields. For everything else (`prd_template`, `validation_checklist_template`, `validation_report_template`, `doc_standards`, `finalize_reviewers`, `prd_output_path`, `run_folder_pattern`, `external_sources`, `external_handoffs`), use `acl-prd`'s own defaults and overrides as normal:
     - `activation_steps_prepend` = the resolved value from step 1
     - `activation_steps_append` = the resolved value from step 1
     - `persistent_facts` = the resolved value from step 1
     - `on_complete` = the resolved value from step 1
   - **Original user input:** forward whatever the user said when invoking this skill verbatim.

   `acl-prd` takes the workflow from here. Do not execute any further steps in this shim.
