# Step 2: Plan

## RULES

- **Language** — Speak in `{{.communication_language}}`. Write any file output in `{{.document_output_language}}`.
- No intermediate approvals.

## INSTRUCTIONS

1. Draft resume check. If `{spec_file}` exists with `status: draft`, read it and capture the verbatim `<frozen-after-approval>...</frozen-after-approval>` block as `preserved_intent`. Otherwise `preserved_intent` is empty.
2. Investigate codebase. _Isolate deep exploration in synchronous subagents/tasks where available. To prevent context snowballing, instruct subagents to give you distilled summaries only._ Decide which findings actually matter for execution — the specific files, symbols/lines, reuse points, and read-only constraints — and carry those forward for the Code Map. This is where the investigation lands: the spec preserves it so it is never re-narrated to the implementer at dispatch time.
3. Read `./spec-template.md` fully. Fill it out based on the intent and investigation, resolving the template's `date` field to the current system date. Drain the investigation into the `## Code Map` section — annotated paths, symbol/line anchors, reuse pointers, and read-only evidence — so the spec is the implementer's investigation map and the step-03 handoff need only point at it. If `preserved_intent` is non-empty, replace the `<frozen-after-approval>` block in the spec you just filled out with `preserved_intent`, before writing. Write the result to `{spec_file}`.
4. Self-review against READY FOR DEVELOPMENT standard.
5. If intent gaps exist, do not fantasize, do not leave open questions, HALT and ask the human.
6. Token count check (see SCOPE STANDARD). If spec exceeds 1600 tokens:
   - Show user the token count.
   - HALT and ask human: `[S] Split — carve off secondary goals` | `[K] Keep full spec — accept the risks`
   - On **S**: Propose the split — name each secondary goal. For each deferred goal, append one new entry to `{{.deferred_work_file}}` using this format. Do not modify existing entries or look for duplicates. Rewrite the current spec to cover only the main goal — do not surgically carve sections out; regenerate the spec for the narrowed scope. Continue to checkpoint.
     ```markdown
     - source_spec: `{spec_file}`
       summary: <one sentence naming the deferred goal>
       evidence: <why this was split from the current spec>
     ```
   - On **K**: Continue to checkpoint with full spec.

### CHECKPOINT 1: GATE LOCK (Awaiting Manager Sign-Off in Markdown Studio)

1. Write the completed specification to `{spec_file}` with frontmatter:
   ```yaml
   ---
   title: <Feature Title>
   tier: Tier 1 (Self-Contained)
   status: In Review
   type: feature
   created: <YYYY-MM-DD>
   ---
   ```
2. **HALT IMMEDIATELY**. Do NOT proceed to implementation (`./step-03-implement.md`).
3. Do NOT ask or prompt the human to self-approve in chat (`[A] Approve` is strictly prohibited).
4. Display the official Gate Locked banner:

```text
========================================================================
⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)
========================================================================
📄 Document in Review: {spec_file}
🏷️ Current Status:      [IN REVIEW]

⚠️ STATUS:
   As per the ACL-ADLC Brownfield Tier 1 protocol, this specification
   is currently awaiting official review and sign-off by your Manager.
   Code implementation is strictly locked until approved.

👉 NEXT STEP:
   Please open Markdown Studio (http://localhost:5173/markdown.html)
   and have your Manager review and mark this document as 'Approved'
   or 'Rejected' before proceeding with code implementation.
========================================================================
```

5. **STOP EXECUTION.** When the developer later asks to implement the code, verify that `{spec_file}` has `status: Approved` (or `Accepted`) before proceeding to `./step-03-implement.md`.

## NEXT

When `{spec_file}` has `status: Approved` (or `Accepted`), read fully and follow `./step-03-implement.md`.
