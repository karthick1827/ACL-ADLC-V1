---
name: acl-create-architecture
description: 'Deprecated — forwards to acl-architecture (create intent).'
---

## 🚦 Universal Phase Gate Precondition (Mandatory & Non-Negotiable)
Before executing any actions, adopting any persona, greeting the user, or producing output:
1. Scan all existing markdown files in `_acl-output/` (or run `node tools/adlc-gate-guard.cjs`).
2. If ANY markdown file has `status: In Review` or `status: Rejected` (or is unapproved):
   - **HALT IMMEDIATELY. DO NOT PROCEED. DO NOT ADOPT PERSONA. DO NOT GENERATE FILES.**
   - **DO NOT suggest or ask the user/developer to self-approve or edit the review status.**
   - Output the official waiting message:
     "========================================================================\n⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)\n========================================================================\n📄 Document in Review: One or more prerequisite documents in _acl-output/ are currently IN REVIEW / PENDING.\n\n⚠️ STATUS:\n   As per the ACL-ADLC sequential delivery framework, this document is currently awaiting official review and sign-off by your Manager.\n\n👉 NEXT STEP:\n   Please wait for your manager to review and mark this document as 'Accepted' or 'Rejected' in Markdown Studio before proceeding with downstream tasks.\n========================================================================"
3. Only proceed if ALL existing documents in `_acl-output/` have `status: Accepted`.



# DEPRECATED — forwards to acl-architecture (create intent)

This skill was consolidated into `acl-architecture`. It is retained as a thin compatibility shim so existing invocations by name and `_acl/custom/acl-create-architecture.toml` override files keep working. New work should invoke `acl-architecture` directly — it detects create / update / validate intent from the conversation.

## On Activation

1. Resolve customization: `python3 {project-root}/_acl/scripts/resolve_customization.py --skill {skill-root} --key workflow`. This picks up any `{project-root}/_acl/custom/acl-create-architecture.toml` and `acl-create-architecture.user.toml` overrides for the legacy fields (`activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, `on_complete`).

2. Load `{project-root}/_acl/acl/config.yaml` (and `config.user.yaml` if present) to resolve `{user_name}` and `{communication_language}`.

3. Emit a deprecation notice to the user in `{communication_language}`:

   > Notice: `acl-create-architecture` is deprecated and will be removed in a future release. It now forwards to `acl-architecture` with create intent. To silence this notice and access the full new customization surface (`spine_template`, `spine_output_path`, `run_folder_pattern`, `doc_standards`, `external_sources`, `external_handoffs`, `finalize_reviewers`), migrate `_acl/custom/acl-create-architecture.toml` to `_acl/custom/acl-architecture.toml` and invoke `acl-architecture` directly next time. Customization fields that were in this version still remain in the new version and will be respected if present in `_acl/custom/acl-architecture.toml`, but the new version also supports additional fields that you can take advantage of by migrating.

4. Invoke `acl-architecture` with the following context. Pass these as the activating context so `acl-architecture` honors them instead of resolving its own customization from scratch:

   - **Intent:** `create` — skip `acl-architecture`'s usual intent detection step.
   - **Pre-resolved legacy customization** — use these in place of resolving from `acl-architecture`'s own `customize.toml` for the four legacy fields. For everything else (`spine_template`, `spine_output_path`, `run_folder_pattern`, `doc_standards`, `external_sources`, `external_handoffs`, `finalize_reviewers`), use `acl-architecture`'s own defaults and overrides as normal:
     - `activation_steps_prepend` = the resolved value from step 1
     - `activation_steps_append` = the resolved value from step 1
     - `persistent_facts` = the resolved value from step 1
     - `on_complete` = the resolved value from step 1
   - **Original user input:** forward whatever the user said when invoking this skill verbatim.

   `acl-architecture` takes the workflow from here. Do not execute any further steps in this shim.
