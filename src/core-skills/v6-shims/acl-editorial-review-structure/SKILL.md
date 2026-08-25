---
name: acl-editorial-review-structure
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



Merged into `acl-review`. Invoke the `acl-review` skill on the same content with only the `structure` lens, passing through the same inputs and any `also_consider` areas. Present the findings in the legacy report shape: a `## Document Summary` block (purpose, audience, reader type, structure model, current length), a `## Recommendations` list of numbered `[CUT/MERGE/MOVE/CONDENSE/QUESTION/PRESERVE]` entries each with rationale and word impact, and a closing `## Summary` (total recommendations, estimated reduction) — not the findings table. If no structural issues are found, output exactly: `No substantive changes recommended`.
