# ACL-ADLC Deliverable Protocol — one file per deliverable, append on change, re-review on change

Applies to **every** project (greenfield **and** brownfield), **every** tier, and **every** AI agent
(Claude Code, GitHub Copilot, Cursor, Windsurf, Antigravity, Cline, Augment, Codex, Gemini …).
It overrides any run-folder, `{date}`-stamped or "fresh folder" instruction elsewhere.

`{output_folder}` is the configured output folder (default `_acl-output`).

## 1. Canonical deliverables — the ONLY place each one may exist

| Deliverable | Canonical file (relative to `{project-root}/{output_folder}/`) |
|---|---|
| Product Brief | `1-analysis/acl-product-brief/brief.md` |
| PRD | `2-plan-workflows/acl-prd/prd.md` |
| UX Design | `2-plan-workflows/acl-ux/DESIGN.md` (+ `EXPERIENCE.md` in the same folder) |
| Architecture Spine | `3-solutioning/acl-architecture/architecture-spine.md` |
| Epics & Stories | `3-solutioning/acl-create-epics-and-stories/epics.md` |
| Project Context | `project-context.md` |

Companion files (`addendum.md`, `.memlog.md`, `reconcile-*.md`, `review-*.md`, validation reports)
live **in the same folder** as their deliverable. Legacy spine names `ARCHITECTURE-SPINE.md` /
`architecture.md` in the architecture folder are read if they already exist, but are never newly created.

### Hard rules

1. **Never** create a dated or per-run folder for a deliverable (no `brief-<project>-<date>/`,
   `prds/…`, `architecture/architecture-<project>-<date>/`, `planning-artifacts/<x>/`, …).
2. **Never** create a second copy of a deliverable anywhere — not in another folder, not under another
   name, not with a suffix (`brief-v2.md`, `brief-feature.md`, `prd-new.md` are all forbidden).
3. Before writing, **check whether the canonical file exists**:
   - **Absent** → Create it at the canonical path (first run, greenfield or brownfield).
   - **Present** → **Update it in place**. Never Create, never "start fresh", never offer Create.

## 2. Adding or changing a feature (Tier 2 cascade, "add feature", "update feature", course correction)

When the canonical file already exists — greenfield or brownfield:

1. Open the **existing** canonical file. Keep every existing line exactly as it is
   (completed checklists stay `- [x]`).
2. **Append at the bottom** of the file, after all existing content:

   ```markdown

   ---

   ## 🔄 Feature Update — {feature name} ({date}) · Tier 2

   **Summary:** …
   (sections appropriate to this deliverable: scope, users, requirements, decisions, epics/stories …)
   ```

   For a change to something already written (not a new feature), use the heading
   `## 🔄 Change Update — {what changed} ({date})` and describe the change there; only edit earlier
   sections when the change makes them factually wrong, and say so in the update block.
3. **Re-open review in the same file's frontmatter:**
   - `status: In Review`
   - `updated: {date}`
   - remove `reviewed_by`, `review_timestamp`, `gate_signature`, `approved_hash` (they belong to the
     previous approval and no longer apply)
   - keep every other field (`title`, `project_type`, `created`, `tier`, `jira_*`, …).
4. **Halt** and tell the user the file is waiting for Manager approval in Markdown Studio. The next
   deliverable in the cascade (Brief → PRD → UX → Architecture → Epics) is updated the same way only
   after this one is `Approved` again.

## 3. Review status rules (all `.md` files under `{output_folder}`)

- Status is a strict enum in frontmatter: `In Review` | `Approved` | `Rejected`.
- **Any** content change an agent makes to a file whose status is `Approved` (or `Rejected`) sets it
  to `status: In Review` and clears the approval metadata listed above. This includes greenfield
  and brownfield, every deliverable, story files and specs.
- Agents may only ever move a status **to** `In Review`. Agents must **never** write
  `status: Approved` or `status: Rejected` — only the Manager does that in Markdown Studio.
- Editing only metadata (e.g. writing back `jira_key`) is not a content change and must not reset
  the status.

## 4. Verify before finishing

Run `node tools/adlc-gate-guard.cjs --validate-all` when the project has it. It fails on:
duplicate deliverables, downstream files created before upstream approval, and files edited after
approval without being set back to `In Review`.
