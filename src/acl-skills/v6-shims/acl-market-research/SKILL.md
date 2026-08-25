---
name: acl-market-research
description: 'Deprecated — forwards to acl-deep-recon (market type).'
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



# DEPRECATED — forwards to acl-deep-recon (market type)

This skill was consolidated into `acl-deep-recon`. It is retained as a thin compatibility shim so existing invocations by name and `_acl/custom/acl-market-research.toml` override files keep working. New work should invoke `acl-deep-recon` directly — it drafts deep-research prompts for outside tools, processes finished reports into downstream-ready summaries, and runs research directly, across market, domain, technical, competitive, user-voice, and academic-lit types (plus a select shape for choose-between decisions and custom types).

## On Activation

1. Resolve customization: `uv run {project-root}/_acl/scripts/resolve_customization.py --skill {skill-root} --key workflow`. This picks up any `{project-root}/_acl/custom/acl-market-research.toml` and `acl-market-research.user.toml` overrides for the legacy fields (`activation_steps_prepend`, `activation_steps_append`, `persistent_facts`, `on_complete`).
2. Emit a deprecation notice to the user (in their configured communication language): `acl-market-research` is deprecated and forwards to `acl-deep-recon` with the market type. To silence this notice and access the full new surface (draft/process/run modes, research types, verification levels, HTML briefing, handoffs), migrate `_acl/custom/acl-market-research.toml` to `_acl/custom/acl-deep-recon.toml` and invoke `acl-deep-recon` directly.
3. Invoke `acl-deep-recon` with: **research type** `market` (skip its type inference), the four legacy fields above as pre-resolved values, and the user's original input verbatim. `acl-deep-recon` takes the workflow from here — do not execute any further steps in this shim.
