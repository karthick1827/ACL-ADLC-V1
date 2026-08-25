---
name: acl-help
description: 'Analyzes current state and user query to answer ACL questions or recommend the next skill(s) to use. Use when user asks for help, acl help, what to do next, or what to start with in ACL.'
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



# ACL Help

## Purpose

Help the user understand where they are in their ACL workflow and what to do next, and also answer broader questions when asked that could be augmented with remote sources such as module documentation sources.

## Desired Outcomes

When this skill completes, the user should:

1. **Know where they are** — which module and phase they're in, what's already been completed
2. **Know what to do next** — the next recommended and/or required step, with clear reasoning
3. **Know how to invoke it** — skill name, menu code, action context, and any args that shortcut the conversation
4. **Get offered a quick start** — when a single skill is the clear next step, offer to run it for the user right now rather than just listing it
5. **Feel oriented, not overwhelmed** — surface only what's relevant to their current position; don't dump the entire catalog
6. **Get answers to general questions** — when the question doesn't map to a specific skill, use the module's registered documentation to give a grounded answer

## Data Sources

- **Catalog**: `{project-root}/_acl/_config/acl-help.csv` — assembled manifest of all installed module skills
- **Config**: Run `uv run {project-root}/_acl/scripts/resolve_config.py --project-root {project-root}` and use the merged JSON to resolve `output-location` variables and read `core.communication_language` and `modules.acl.project_knowledge`. The resolver merges `_acl/config.toml`, `_acl/config.user.toml`, `_acl/custom/config.toml`, and `_acl/custom/config.user.toml` in that order.
- **Artifacts**: Files matching `outputs` patterns at resolved `output-location` paths reveal which steps are possibly completed; their content may also provide grounding context for recommendations
- **Project knowledge**: If `project_knowledge` resolves to an existing path, read it for grounding context. Never fabricate project-specific details.
- **Module docs**: Rows with `_meta` in the `skill` column carry a URL or path in `output-location` pointing to the module's documentation (e.g., llms.txt). Fetch and use these to answer general questions about that module.

## CSV Interpretation

The catalog uses this format:

```
module,skill,display-name,menu-code,description,action,args,phase,preceded-by,followed-by,required,output-location,outputs
```

**Phases** determine the high-level flow:
- `anytime` — available regardless of workflow state
- Numbered phases (`1-analysis`, `2-planning`, etc.) flow in order; naming varies by module

**Sequencing** determines recommended ordering within and across phases (these are soft suggestions, not hard gates — see `required` for gating):
- `preceded-by` — skills that should ideally complete before this one
- `followed-by` — skills that should ideally run after this one
- Format: `skill-name` for single-action skills, `skill-name:action` for multi-action skills

**Required gates**:
- `required=true` items must complete before the user can meaningfully proceed to later phases
- A phase with no required items is entirely optional — recommend it but be clear about what's actually required next

**Completion detection**:
- Search resolved output paths for `outputs` patterns
- Fuzzy-match found files to catalog rows
- User may also state completion explicitly, or it may be evident from the current conversation

**Descriptions carry routing context** — some contain cycle info and alternate paths (e.g., "back to DS if fixes needed"). Read them as navigation hints, not just display text.

## Response Format

For each recommended item, present:
- `[menu-code]` **Display name** — e.g., "[PR] PRD"
- Skill name in backticks — e.g., `acl-prd`
- For multi-action skills: action invocation context — e.g., "tech-writer lets create a mermaid diagram!"
- Description if present in CSV; otherwise your existing knowledge of the skill suffices
- Args if available

**Ordering**: Show optional items first, then the next required item. Make it clear which is which.

## Constraints

- Present all output in `{communication_language}`
- Recommend running each skill in a **fresh context window**
- Match the user's tone — conversational when they're casual, structured when they want specifics
- If the active module is ambiguous, retrieve all meta rows remote sources to find relevant info also to help answer their question
