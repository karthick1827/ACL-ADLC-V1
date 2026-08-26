---
name: acl-customize
description: Authors and updates customization overrides for installed ACL skills. Use when the user says 'customize acl', 'override a skill', 'change agent behavior', or 'customize a workflow'.
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


# ACL Customize

Translate the user's intent into a correctly-placed TOML override file under `{project-root}/_acl/custom/` for a customizable agent or workflow skill. Discover, route, author, write, verify.

Scope v1: per-skill `[agent]` overrides (`acl-agent-<role>.toml` / `.user.toml`) and per-skill `[workflow]` overrides (`acl-<workflow>.toml` / `.user.toml`). Central config (`{project-root}/_acl/custom/config.toml`) is out of scope — point users at the [How to Customize ACL guide](https://docs.acl-adlc.org/how-to/customize-acl/).

When the target's `customize.toml` doesn't expose what the user wants, say so plainly. Don't invent fields.

## Preflight

- No `{project-root}/_acl/` → ACL isn't installed. Say so, stop.
- `{project-root}/_acl/scripts/resolve_customization.py` missing → continue, but Step 6 verify falls back to manual merge.
- Both present → proceed.

## Activation

Load `_acl/config.toml` and `_acl/config.user.toml` from `{project-root}` for `user_name` (default `ACL`) and `communication_language` (default `English`). Greet. If the user's invocation already names a target skill AND a specific change, jump to Step 3.

## Step 1: Classify intent

- **Directed** — specific skill + specific change → Step 3.
- **Exploratory** — "what can I customize?" → Step 2.
- **Audit/iterate** — wants to review or change something already customized → Step 2, lead with skills that have existing overrides; read the existing override in Step 3 before composing.
- **Cross-cutting** — could live on multiple surfaces → Step 3, choose agent vs workflow explicitly with the user.

## Step 2: Discovery

```
uv run {skill-root}/scripts/list_customizable_skills.py --project-root {project-root}
```

Use `--extra-root <path>` (repeatable) if the user has skills installed in additional locations.

Group the returned `agents` and `workflows` for the user; for each show name, description, whether `has_team_override` or `has_user_override` is true. Surface any `errors[]`. For audit/iterate intents, lead with already-overridden entries.

Empty list: show `scanned_roots`, ask whether skills live elsewhere (offer `--extra-root`); otherwise stop.

## Step 3: Determine the right surface

Read the target's `customize.toml`. Top-level `[agent]` or `[workflow]` block defines the surface.

If a team or user override already exists, read it first and summarize what's already overridden before composing.

**Cross-cutting intent — walk both surfaces with the user:**
- Every workflow a given agent runs → agent surface (e.g. `acl-agent-pm.toml` with `persistent_facts`, `principles`).
- One workflow only → workflow surface (e.g. `acl-prd.toml` with `activation_steps_prepend`).
- Several specific workflows → multiple workflow overrides in sequence, not an agent override.

**Single-surface heuristic:**
- Workflow-level: template swap, output path, step-specific behavior, or a named scalar already exposed (`*_template`, `on_complete`). Surgical, reliable.
- Agent-level: persona, communication style, org-wide facts, menu changes, behavior that should apply to every workflow the agent dispatches.

When ambiguous, present both with tradeoff, recommend one, let the user decide.

Intent outside the exposed surface (step logic, ordering, anything not in `customize.toml`): say so; offer `activation_steps_prepend`/`append` or `persistent_facts` as approximations, or recommend `acl-builder` to create a custom skill.

## Step 4: Compose the override

Translate plain-English into TOML against the target's `customize.toml` fields. If an existing override was read, frame the change as additive.

Merge semantics:
- **Scalars** (`icon`, `role`, `*_template`, `on_complete`) — override wins.
- **Append arrays** (`persistent_facts`, `activation_steps_prepend`/`append`, `principles`) — team/user entries append in order.
- **Keyed arrays of tables** (menu items with `code` or `id`) — matching keys replace, new keys append.

Overrides are sparse: only the fields being changed. Never copy the whole `customize.toml`.

**Template swap** (`*_template` scalar): offer to copy the default template to `{project-root}/_acl/custom/{skill-name}-{purpose}-template.md`, point the override at the new path, offer to help edit it.

## Step 5: Team or user placement

Under `{project-root}/_acl/custom/`:
- `{skill-name}.toml` — team, committed. Policies, org conventions, compliance.
- `{skill-name}.user.toml` — user, gitignored. Personal tone, private facts, shortcuts.

Default by character (policy → team, personal → user), confirm before writing.

## Step 6: Show, confirm, write, verify

1. Show the full TOML. If the file exists, show a diff. Never silently overwrite.
2. Wait for explicit yes.
3. Write. Create `{project-root}/_acl/custom/` if needed.
4. Verify:
   ```
   uv run {project-root}/_acl/scripts/resolve_customization.py --skill <install-path> --key <agent-or-workflow>
   ```
   Show the merged output, point out the changed fields.

   **Resolver missing or fails:** read whichever layers exist — `<install-path>/customize.toml` (base), `{project-root}/_acl/custom/{skill-name}.toml` (team), `{project-root}/_acl/custom/{skill-name}.user.toml` (user) — apply base → team → user with the same merge rules (scalars override, tables deep-merge, `code`/`id`-keyed arrays merge by key, all other arrays append), describe how the changed fields resolve.

   **Verify shows override didn't land** (field unchanged, merge conflict, file not picked up): re-enter Step 4 with the verify output as context. Usually wrong field name, wrong merge mode (scalar vs array), or wrong scope.
5. Summarize what changed, where the file lives, how to iterate. Remind the user to commit team overrides.

## Complete when

- Override file written (or user explicitly aborted).
- User has seen resolver output (or manual fallback merge summary).
- User has acknowledged the summary.

Otherwise the skill isn't done — finish or tell the user they're exiting incomplete.

## When this skill can't help

- **Central config** (`{project-root}/_acl/custom/config.toml`) — see the [How to Customize ACL guide](https://docs.acl-adlc.org/how-to/customize-acl/).
- **Step logic, ordering, behavior not in `customize.toml`** — open a feature request, or use `acl-builder` to create a custom skill. Offer to help with either.
- **Skills without a `customize.toml`** — not customizable.
