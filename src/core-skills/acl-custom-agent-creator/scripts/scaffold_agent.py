#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# ///
"""Scaffolding helper for creating custom ACL-ADLC agents."""

import argparse
import json
import os
import sys
from pathlib import Path

sys.dont_write_bytecode = True

UNIVERSAL_PHASE_GATE = """## 🚦 Universal Phase Gate Precondition (Mandatory & Non-Negotiable)
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
"""


def generate_skill_md(
    slug: str,
    name: str,
    title: str,
    icon: str,
    role: str,
    identity: str,
    style: str,
    principles: list[str],
    output_type: str,
    phase: str,
) -> str:
    skill_name = f"acl-agent-{slug}" if not slug.startswith("acl-agent-") else slug
    use_when = f"Use when the user requests {title.lower()} tasks, asks to talk to {name}, or needs {output_type} workflows."

    type_instructions = ""
    if output_type == "markdown":
        type_instructions = f"""## Deliverables & Markdown Output
- Target Output Directory: `_acl-output/{phase}/`
- Document Status: Generated documents MUST always be initialized with frontmatter `status: In Review`.
- Never self-approve or mark documents as `Approved`. Wait for Manager sign-off via Markdown Studio."""
    elif output_type == "reviewer":
        type_instructions = f"""## Review & Audit Protocol
- Inspect target codebases and files against defined rules in `./rules/`.
- Provide two execution modes:
  - `[RO]` Report Only: Generate audit report in `_acl-output/{phase}/` with citable file:line references and diffs.
  - `[RF]` Report & Fix: Generate audit report AND apply targeted remediation to source files while preserving tests.
- Prohibit generic or hallucinated feedback."""
    else:  # generator
        type_instructions = f"""## Implementation & Code Generation Protocol
- **Gate Check**: Verify target story or spec in `_acl-output/4-implementation/` has `status: Approved`.
- If missing or `In Review`: HALT IMMEDIATELY. Output the Gate Locked banner. Do NOT touch application code.
- If `Approved`: Execute implementation using Test-Driven Development (Red -> Green -> Refactor).
- Validate all acceptance criteria in the story spec."""

    return f"""---
name: {skill_name}
description: {title}. {role} {use_when}
---

{UNIVERSAL_PHASE_GATE}

# {name} — {title}

## Overview

You are {name}, the {title}. {identity}

{type_instructions}

## Conventions

- Bare paths resolve from this skill's installed directory.
- `{{project-root}}`-prefixed paths resolve from the project working directory.
- `{{skill-name}}` resolves to `{skill_name}`.

## On Activation

### Step 1: Resolve the Agent Block
Run: `python3 {{project-root}}/_acl/scripts/resolve_customization.py --skill {{skill-root}} --key agent`
If the script is unavailable, read `./customize.toml` directly.

### Step 2: Execute Prepend Steps
Execute each entry in `{{agent.activation_steps_prepend}}` in order.

### Step 3: Adopt Persona
Embody {name}:
- Role: `{{agent.role}}`
- Identity: `{{agent.identity}}`
- Style: `{{agent.communication_style}}`
- Principles: `{{agent.principles}}`

Always prefix your greeting and all subsequent messages with `{icon}`.

### Step 4: Load Persistent Facts
Treat every entry in `{{agent.persistent_facts}}` as foundational context for the session.

### Step 5: Greet the User
Greet the user warmly with `{icon}` as {name}, and present your capability menu.

### Step 6: Dispatch Menu Action
Render `{{agent.menu}}` and wait for user selection or direct intent dispatch.
"""


def generate_customize_toml(
    name: str,
    title: str,
    icon: str,
    role: str,
    identity: str,
    style: str,
    principles: list[str],
    menu_items: list[dict],
) -> str:
    principles_formatted = "\n".join(f'  "{p}",' for p in principles)
    menu_blocks = []
    for item in menu_items:
        code = item.get("code", "EX")
        desc = item.get("description", "Execute task")
        target_key = "skill" if "skill" in item else "prompt"
        target_val = item.get(target_key, "Execute action")
        menu_blocks.append(
            f"""[[agent.menu]]
code = "{code}"
description = "{desc}"
{target_key} = "{target_val}"
"""
        )

    menu_toml = "\n".join(menu_blocks)

    return f"""# {name}, {title}
[agent]
name = "{name}"
title = "{title}"
icon = "{icon}"

activation_steps_prepend = []
activation_steps_append = []

persistent_facts = [
  "file:{{project-root}}/**/project-context.md",
]

role = "{role}"
identity = "{identity}"
communication_style = "{style}"

principles = [
{principles_formatted}
]

{menu_toml}
"""


def generate_roster_snippet(
    slug: str, name: str, title: str, icon: str, team: str, description: str
) -> str:
    agent_code = f"acl-agent-{slug}" if not slug.startswith("acl-agent-") else slug
    return f"""# Add to {{project-root}}/_acl/custom/config.toml (or config.user.toml):
[agents.{agent_code}]
name = "{name}"
title = "{title}"
icon = "{icon}"
team = "{team}"
description = "{description}"
"""


def main():
    parser = argparse.ArgumentParser(description="Scaffold a custom ACL-ADLC agent")
    parser.add_argument("--slug", required=True, help="Agent slug (e.g. security-auditor)")
    parser.add_argument("--name", required=True, help="Agent name (e.g. Diana)")
    parser.add_argument("--title", required=True, help="Agent title (e.g. Security Auditor)")
    parser.add_argument("--icon", default="🤖", help="Avatar emoji icon")
    parser.add_argument("--team", default="software-development", help="Agent team")
    parser.add_argument(
        "--type",
        choices=["markdown", "reviewer", "generator"],
        default="markdown",
        help="Deliverable archetype",
    )
    parser.add_argument(
        "--phase",
        default="4-implementation",
        help="Target phase folder in _acl-output (e.g. 1-analysis, 2-plan-workflows, 3-solutioning, 4-implementation)",
    )
    parser.add_argument("--role", required=True, help="Agent role description")
    parser.add_argument("--identity", required=True, help="Agent identity and background")
    parser.add_argument("--style", required=True, help="Communication style")
    parser.add_argument("--output-dir", required=True, help="Target directory for generated skill")

    args = parser.parse_args()

    out_dir = Path(args.output_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    principles = [
        f"Maintain highest standards of {args.title.lower()} excellence.",
        "Strictly adhere to the ACL-ADLC phase gate protocol and Manager sign-off in Markdown Studio.",
        "Produce verified, actionable outputs with zero fluff.",
    ]

    menu_items = [
        {
            "code": "EX",
            "description": f"Execute primary {args.title.lower()} workflow",
            "prompt": f"Run the main {args.title.lower()} procedure.",
        }
    ]

    skill_content = generate_skill_md(
        slug=args.slug,
        name=args.name,
        title=args.title,
        icon=args.icon,
        role=args.role,
        identity=args.identity,
        style=args.style,
        principles=principles,
        output_type=args.type,
        phase=args.phase,
    )

    toml_content = generate_customize_toml(
        name=args.name,
        title=args.title,
        icon=args.icon,
        role=args.role,
        identity=args.identity,
        style=args.style,
        principles=principles,
        menu_items=menu_items,
    )

    (out_dir / "SKILL.md").write_text(skill_content, encoding="utf-8")
    (out_dir / "customize.toml").write_text(toml_content, encoding="utf-8")

    roster_snippet = generate_roster_snippet(
        slug=args.slug,
        name=args.name,
        title=args.title,
        icon=args.icon,
        team=args.team,
        description=f"{args.title}: {args.role}",
    )
    (out_dir / "roster-registration.toml").write_text(roster_snippet, encoding="utf-8")

    print(f"Successfully scaffolded custom agent at: {out_dir}")
    print(f"- SKILL.md: {out_dir / 'SKILL.md'}")
    print(f"- customize.toml: {out_dir / 'customize.toml'}")
    print(f"- roster-registration.toml: {out_dir / 'roster-registration.toml'}")


if __name__ == "__main__":
    main()
