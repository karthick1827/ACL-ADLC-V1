---
name: acl-dev-auto
description: 'One iteration of an unattended development loop. Use when invoked by name.'
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



Run this single command exactly once, substituting the absolute project and skill roots without changing the working directory:

```bash
uv run --no-cache "{project-root}/_acl/scripts/render_skill.py" --project-root "{project-root}" --skill "{skill-root}"
```

- On success, read and follow the one absolute `workflow.md` instruction printed to stdout.
- On failure (including `uv` being unavailable), report the command output and HALT. Do not run any workflow source directly.
