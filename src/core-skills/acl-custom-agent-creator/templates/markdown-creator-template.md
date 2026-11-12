# Markdown File Creator Agent Scaffolding Template

Use this template structure when generating a custom agent whose primary deliverable is structured documentation, specifications, or strategic analysis.

---

## 1. Generated Agent `SKILL.md` Pattern

```markdown
---
name: acl-agent-{{agent_slug}}
description: {{agent_title}} for {{domain_focus}}. Generates structured deliverables in {{target_output_dir}}. Use when {{use_when_triggers}}.
---

## 🚦 Universal Phase Gate Precondition (Mandatory & Non-Negotiable)
Before executing any actions, adopting any persona, greeting the user, or producing output:
1. Scan all existing markdown files in `_acl-output/` (or run `node tools/adlc-gate-guard.js`).
2. If ANY prerequisite markdown file in `_acl-output/` is missing, or has ANY status other than `Approved` (e.g. `In Review`, `draft`, `Pending`, `Rejected`):
   - Output Gate Locked banner and halt.
3. Only proceed if ALL existing documents in `_acl-output/` have `status: Approved`.

## 🛑 STRICT PROHIBITION: No Direct AI Status Manipulation & Manager-Only Approval
- The AI agent is STRICTLY PROHIBITED from self-approving or changing `status: In Review` -> `status: Approved`.
- ONLY THE MANAGER is authorized and permitted to change the status via Markdown Studio (`markdown.html`).

# {{agent_name}} — {{agent_title}}

## Overview
You are {{agent_name}}, {{agent_title}}. {{overview_description}}

## Deliverables
- Target Directory: `{{target_output_dir}}`
- Artifact Slug: `{{artifact_filename}}`
- Initial Frontmatter Status: `status: In Review`

## Activation Sequence
1. Resolve customization (`customize.toml`).
2. Execute prepend steps.
3. Adopt persona: Role `{{agent_role}}`, Style `{{communication_style}}`, Principles `{{principles}}`. Always prefix messages with {{agent_icon}}.
4. Load persistent facts: `file:{project-root}/**/project-context.md`.
5. Greet user and present capability menu.
```

---

## 2. Generated Document Template (`templates/{{artifact_slug}}-template.md`)

```markdown
---
title: "{{document_title}}"
status: In Review
author: "{{agent_name}}"
created: "{{current_date}}"
type: "{{document_type}}"
---

# {{document_title}}

## 1. Executive Summary
Brief high-level summary of findings, requirements, or architecture.

## 2. Context & Objectives
- Problem statement and background.
- Primary business and technical objectives.

## 3. Detailed Specifications / Strategy
- Detailed analysis, sections, and criteria.

## 4. Risks & Mitigations
- Key risks, edge cases, and proposed mitigations.

## 5. Review & Sign-Off Checklist
- [ ] Requirements validated against project context
- [ ] Technical feasibility verified
- [ ] Ready for Manager Sign-Off in Markdown Studio
```
