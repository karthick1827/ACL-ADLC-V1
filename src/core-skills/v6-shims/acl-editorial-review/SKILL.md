---
name: acl-editorial-review
description: 'Deprecated — forwards to acl-review.'
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



Merged into `acl-review`. Invoke the `acl-review` skill on the same content with the `structure` and `prose` lenses — both, structure first, so prose runs on top of the structure findings — unless the caller asked for a structure-only or prose-only review, in which case pass only that lens. Pass through any `also_consider` areas, and forward this skill's resolved `[workflow]` fields as pre-resolved values — but only those that resolved to something, since an empty value here means no legacy override exists and acl-review's own default should stand: `reader_type`, `style_guide`, `review_guidance`, `output_preferences`, `persistent_facts`, `activation_steps_prepend`, `activation_steps_append`, `on_complete`, and `review_output_path` as the report path. Present the findings in the legacy shape: the two-pass findings table `| Pass | Original Text | Revised Text | Changes |` with the purpose/audience read above it and, when the structure pass ran, the reduction summary below it — and no other lens's output.
