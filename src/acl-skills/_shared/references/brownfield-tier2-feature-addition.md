# Brownfield Tier 2 — Feature addition (single canonical deliverables)

Use this whenever the user adds a **new feature** to an **existing** project via **Tier 2 (Major Overhaul)** sequential gates — not Day-0 greenfield, not Tier 1 spec-only work.

## Canonical gate paths (only these count for Markdown Studio)

All paths are under `{project-root}/_acl-output/`:

| Phase | File |
|-------|------|
| 1 — Brief | `1-analysis/acl-product-brief/brief.md` |
| 2 — PRD | `2-plan-workflows/acl-prd/prd.md` |
| 3A — Architecture | `3-solutioning/acl-architecture/architecture-spine.md` if present, else `ARCHITECTURE-SPINE.md`, else `architecture.md` (use whichever already exists; do not create a second spine file) |
| 3B — Epics | `3-solutioning/acl-create-epics-and-stories/epics.md` |

## Mandatory behavior

1. **Detect:** If the canonical file for the current phase **already exists** (typical after an approved pipeline) and the user is extending the product (new feature, Tier 2 cascade, "add feature", "brownfield Tier 2"), treat the run as **feature addition** — not greenfield **Create**.
2. **Update in place:** Edit **only** the canonical file above. **Do not** create a second `brief.md`, `prd.md`, spine, or `epics.md` under `{planning_artifacts}/briefs/`, `.../prds/`, run folders, or duplicate folders elsewhere in `_acl-output/`.
3. **Append at bottom:** Add the new feature content **after** all existing body content. Start the addition with a horizontal rule and a heading, for example:
   ```markdown
   ---

   ## Feature addition: {feature name} ({date})
   ```
   Preserve all prior sections and completed story checklists (`- [x]` stays checked).
4. **Re-open review:** In the **same file's YAML frontmatter**, set `status: In Review` and `updated: {date}`. Keep `project_type: brownfield` and Tier 2 markers as appropriate.  
   **Exception to the usual status rule:** agents **may** change `status: Approved` → `status: In Review` **only** when appending a Tier 2 feature addition to an existing canonical deliverable. Agents must **never** set `status: Approved` (Manager only).
5. **Sequential gates:** After finalize, **halt** for Manager approval of **that** file before starting the next phase. Repeat append + `In Review` for PRD, then architecture, then epics.
6. **Memlog:** Prefer `{doc_workspace}` beside the canonical file's directory (same folder as the deliverable or an existing run folder already tied to that deliverable). Do not open a unrelated new run folder under `{planning_artifacts}/briefs/` or `{planning_artifacts}/prds/` for gate deliverables.

## Forbidden

- A second gate deliverable with the same role (two briefs, two PRDs, two spines, two `epics.md` trees).
- Leaving the old canonical file `Approved` while writing the feature content to a new path.
- Skipping `status: In Review` after editing an previously `Approved` canonical deliverable.

## When greenfield Create still applies

- No canonical file exists yet for that phase, **or**
- Explicit new product / new `_acl-output` tree / user chose Create for a brand-new initiative.
