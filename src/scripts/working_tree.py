#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# ///
"""working_tree — the project-level delivery tracker behind the Studio "Working Tree" tab.

Every time an ACL-ADLC agent creates or updates a phase deliverable in `_acl-output/`,
it records that here. The result is one file, `_acl-output/working-tree.md`, that tells
a manager at a glance where the project is: greenfield or brownfield, which agents ran,
which documents they produced, what each document's review status is, and which gate is
next.

The file has two parts:

  1. `## Current Position` — a text tree regenerated on every write from the log and the
     deliverables on disk. Never edit it by hand; it is rewritten each time.
  2. `## Activity Log` — an append-only markdown table, one row per event, in the order
     the events happened. Rows are never edited, reordered, or removed.

The file carries NO `status` frontmatter: it is an internal tracker, not a gated
deliverable, so phase gates never evaluate it.

Commands:
  track --file PATH [--agent A] [--skill S] [--event E] [--note N] [--project-type T]
        record one agent action on a deliverable (agent/skill inferred from the path if omitted)
  sync  record every deliverable on disk the log has not seen yet, plus any review-status
        change since the last recorded row (backfill for work done without `track`)
  show  print the current tree to stdout

All commands accept `--root DIR` (project root, default: cwd). Writes are atomic
(temp + fsync + rename) and every command echoes one line of JSON.
"""
from __future__ import annotations  # keep type-hint syntax lazy so the script runs on 3.8+

import argparse
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

OUTPUT_DIRNAME = "_acl-output"
TREE_FILENAME = "working-tree.md"
LOG_HEADER = "## Activity Log"
TREE_HEADER = "## Current Position"
COLUMNS = ["#", "When", "Event", "Agent", "Skill", "Deliverable", "Doc Status", "Note"]

AGENTS = {
    "analyst": {"name": "Mary", "title": "Business Analyst", "icon": "📊"},
    "tech-writer": {"name": "Paige", "title": "Technical Writer", "icon": "📚"},
    "pm": {"name": "John", "title": "Product Manager", "icon": "📋"},
    "ux-designer": {"name": "Sally", "title": "UX Designer", "icon": "🎨"},
    "architect": {"name": "Winston", "title": "System Architect", "icon": "🏗️"},
    "dev": {"name": "Amelia", "title": "Senior Software Engineer", "icon": "💻"},
}

SKILL_AGENT = {
    "acl-product-brief": "analyst",
    "acl-prfaq": "analyst",
    "acl-brainstorming": "analyst",
    "acl-deep-recon": "analyst",
    "acl-document-project": "analyst",
    "acl-prd": "pm",
    "acl-spec": "pm",
    "acl-create-epics-and-stories": "pm",
    "acl-check-implementation-readiness": "pm",
    "acl-correct-course": "pm",
    "acl-ux": "ux-designer",
    "acl-architecture": "architect",
    "acl-generate-project-context": "architect",
    "acl-quick-dev": "dev",
    "acl-dev-auto": "dev",
    "acl-code-review": "dev",
    "acl-qa-generate-e2e-tests": "dev",
    "acl-sprint-planning": "dev",
    "acl-retrospective": "dev",
    "acl-checkpoint-preview": "dev",
}

PHASES = [
    ("context", "Project Context"),
    ("analysis", "Phase 1 · Analysis"),
    ("planning", "Phase 2 · Planning"),
    ("solutioning", "Phase 3 · Solutioning"),
    ("implementation", "Phase 4 · Implementation"),
    ("validation", "Validate & Release"),
    ("other", "Other Documents"),
]

# Internal working files that are never tracked as deliverables (mirrors the Studio filters).
EXCLUDED = {
    "skill.md", "agents.md", "readme.md", "changelog.md", "claude.md", "contributing.md",
    "security.md", "addendum.md", "sources.md", "review-triage.md", "patch-plan.md",
    "research.md", "sprint-status.md", TREE_FILENAME,
}

# Document kinds that satisfy a gate. Stories are implemented through quick-dev, which may name the
# per-story document `story-<e>-<s>.md` or `spec-<e>-<s>-<slug>.md`; both count for the story gate.
GATE_KINDS = {"story": ("story", "spec")}

STORY_HEADING = re.compile(r"^#{2,4}\s+Story\s+(\d+)\.(\d+)\b", re.IGNORECASE | re.MULTILINE)
STORY_FILE = re.compile(r"^(?:story|spec)[-_](\d+)[-_.](\d+)(?:[-_.]|$)")

STATUS_ICON = {"Approved": "✅", "Rejected": "⛔", "In Review": "🟡"}


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def write_atomic(path: Path, text: str) -> None:
    """Temp + flush + fsync + atomic rename, so a crash never half-writes the tracker."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Deliverable discovery & classification
# ---------------------------------------------------------------------------

def classify(rel: str) -> dict:
    """Map a deliverable path (relative to _acl-output) to its kind, phase, and producing skill."""
    lower = rel.lower()
    name = lower.rsplit("/", 1)[-1]
    if name == "project-context.md":
        return {"kind": "project-context", "phase": "context", "skill": "acl-generate-project-context"}
    if name.startswith("story-") or name.startswith("story_"):
        return {"kind": "story", "phase": "implementation", "skill": "acl-quick-dev"}
    if name.startswith("spec-"):
        return {"kind": "spec", "phase": "implementation", "skill": "acl-quick-dev"}
    if name == "epics.md":
        return {"kind": "epics", "phase": "solutioning", "skill": "acl-create-epics-and-stories"}
    if "architecture" in name or "spine" in name:
        return {"kind": "architecture", "phase": "solutioning", "skill": "acl-architecture"}
    if name in ("prd.md", "reconcile-brief.md") or "/prds/" in lower or "acl-prd/" in lower:
        return {"kind": "prd", "phase": "planning", "skill": "acl-prd"}
    if name in ("ux.md", "design.md", "experience.md") or "ux-design" in lower or "/acl-ux/" in lower:
        return {"kind": "ux", "phase": "planning", "skill": "acl-ux"}
    if "prfaq" in lower:
        return {"kind": "prfaq", "phase": "analysis", "skill": "acl-prfaq"}
    if "brainstorm" in lower:
        return {"kind": "brainstorming", "phase": "analysis", "skill": "acl-brainstorming"}
    if name == "brief.md" or "product-brief" in lower or "/briefs/" in lower:
        return {"kind": "brief", "phase": "analysis", "skill": "acl-product-brief"}
    if re.search(r"(^|/)(tests?|e2e|qa|validate(-and-release)?)(/|$)", lower) or re.search(r"(e2e|qa-tests?)", name):
        return {"kind": "tests", "phase": "validation", "skill": "acl-qa-generate-e2e-tests"}
    return {"kind": "document", "phase": "other", "skill": None}


def is_deliverable(rel: str) -> bool:
    parts = rel.lower().split("/")
    name = parts[-1]
    if not name.endswith(".md") or name.startswith(".") or "memlog" in name:
        return False
    if name.startswith("readiness-report") or name in EXCLUDED:
        return False
    return not any(p.startswith(".") or p == "node_modules" for p in parts[:-1])


def frontmatter_value(text: str, key: str) -> str | None:
    if not text.startswith("---"):
        return None
    end = text.find("\n---", 3)
    block = text[3:end] if end != -1 else ""
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", block, re.MULTILINE)
    return m.group(1).strip().strip("'\"") if m else None


def norm_status(raw: str | None) -> str:
    low = (raw or "").lower()
    if "approved" in low or "accept" in low:
        return "Approved"
    if "reject" in low:
        return "Rejected"
    return "In Review"


def story_ids(epics_text: str) -> list[str]:
    """Story numbers ("1.1", "2.10", ...) declared by `### Story N.M` headings in epics.md, in order."""
    seen: list[str] = []
    for m in STORY_HEADING.finditer(epics_text):
        sid = f"{int(m.group(1))}.{int(m.group(2))}"
        if sid not in seen:
            seen.append(sid)
    return seen


def story_id(rel: str) -> str | None:
    m = STORY_FILE.match(rel.lower().rsplit("/", 1)[-1])
    return f"{int(m.group(1))}.{int(m.group(2))}" if m else None


def read_doc(out_dir: Path, rel: str) -> dict:
    path = out_dir / rel
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        text = ""
    info = classify(rel)
    raw_status = frontmatter_value(text, "status")
    info.update({
        "path": rel,
        "status": norm_status(raw_status),
        # Only documents that carry a `status` field are gated; child files (rubrics, test summaries) are not.
        "gated": raw_status is not None,
        "story_id": story_id(rel),
        "story_ids": story_ids(text) if info["kind"] == "epics" else [],
        "project_type": (frontmatter_value(text, "project_type") or "").lower() or None,
        "mtime": path.stat().st_mtime if path.exists() else 0,
        "exists": path.exists(),
    })
    return info


def scan(out_dir: Path) -> list[dict]:
    if not out_dir.is_dir():
        return []
    docs = []
    for p in sorted(out_dir.rglob("*.md")):
        rel = p.relative_to(out_dir).as_posix()
        if is_deliverable(rel):
            docs.append(read_doc(out_dir, rel))
    return docs


def to_rel(out_dir: Path, root: Path, file_arg: str) -> str:
    """Accept an absolute path, a project-relative path, or an _acl-output-relative path."""
    p = Path(file_arg)
    if not p.is_absolute():
        p = root / p if file_arg.replace("\\", "/").startswith(OUTPUT_DIRNAME + "/") else out_dir / p
    try:
        return p.resolve().relative_to(out_dir.resolve()).as_posix()
    except ValueError:
        return file_arg.replace("\\", "/")


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

def resolve_agent(agent: str | None, skill: str | None) -> str:
    """Return a display label like '📊 Mary (Business Analyst)' from a key, skill id, or name."""
    key = None
    if agent:
        a = agent.strip().lower().replace("acl-agent-", "")
        if a in AGENTS:
            key = a
        else:
            key = next((k for k, v in AGENTS.items() if v["name"].lower() == a or v["title"].lower() == a), None)
            if key is None:
                return agent.strip()
    elif skill:
        key = SKILL_AGENT.get(skill)
    if key is None:
        return "—"
    v = AGENTS[key]
    return f"{v['icon']} {v['name']} ({v['title']})"


# ---------------------------------------------------------------------------
# Tracker file I/O
# ---------------------------------------------------------------------------

def cell(value) -> str:
    return " ".join(str(value if value is not None else "").split()).replace("|", "\\|") or "—"


def split_row(line: str) -> list[str]:
    cells = re.split(r"(?<!\\)\|", line.strip().strip("|"))
    return [c.strip().replace("\\|", "|") for c in cells]


def load(tree_path: Path) -> tuple[dict, list[dict]]:
    meta: dict[str, str] = {}
    rows: list[dict] = []
    if not tree_path.exists():
        return meta, rows
    text = tree_path.read_text(encoding="utf-8")
    if text.startswith("---\n"):
        end = text.find("\n---", 4)
        for line in text[4:end].splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip().strip("'\"")
    in_log = False
    for line in text.splitlines():
        if line.startswith("## "):
            in_log = line.strip() == LOG_HEADER
            continue
        if not in_log or not line.startswith("|"):
            continue
        cells = split_row(line)
        if len(cells) < len(COLUMNS) or cells[0] == "#" or set(cells[0]) <= {"-", ":"}:
            continue
        rows.append(dict(zip(COLUMNS, cells)))
    return meta, rows


def resolve_project_type(meta: dict, docs: list[dict], explicit: str | None) -> str:
    """Greenfield vs brownfield is decided by whichever of brief / project-context came first."""
    if explicit:
        return explicit
    current = meta.get("project_type", "undetermined")
    if current in ("greenfield", "brownfield"):
        return current
    if any(d["project_type"] == "brownfield" for d in docs):
        return "brownfield"
    anchors = [d for d in docs if d["kind"] in ("brief", "project-context")]
    if not anchors:
        return "undetermined"
    first = min(anchors, key=lambda d: d["mtime"])
    return "brownfield" if first["kind"] == "project-context" else "greenfield"


def current_position(project_type: str, docs: list[dict]) -> str:
    by_kind: dict[str, list[dict]] = {}
    for d in docs:
        by_kind.setdefault(d["kind"], []).append(d)

    planned = next((d["story_ids"] for d in by_kind.get("epics", []) if d["story_ids"]), [])

    def gate(kind: str, label: str, skill: str):
        found = [d for k in GATE_KINDS.get(kind, (kind,)) for d in by_kind.get(k, [])]
        if kind == "story" and planned:
            covered = {d["story_id"] for d in found}
            missing = next((s for s in planned if s not in covered), None)
            if missing:
                done = sum(1 for s in planned if s in covered)
                return (f"Next: {resolve_agent(None, skill)} runs `{skill}` for Story {missing} "
                        f"({done}/{len(planned)} stories in `epics.md` have a spec)")
        if not found:
            return f"Next: {resolve_agent(None, skill)} runs `{skill}` to create the {label}"
        pending = [d for d in found if d["gated"] and d["status"] != "Approved"]
        if pending:
            d = pending[0]
            return f"Awaiting Manager sign-off: `{d['path']}` ({d['status']})"
        return None

    if project_type == "undetermined":
        return "Not started — waiting for a Product Brief (greenfield) or Project Context (brownfield)"
    cascade = [
        ("brief", "Product Brief", "acl-product-brief"),
        ("prd", "PRD", "acl-prd"),
        ("architecture", "Architecture Spine", "acl-architecture"),
        ("epics", "Epics & Stories", "acl-create-epics-and-stories"),
        ("story", "first story spec", "acl-quick-dev"),
        ("tests", "test plan (Validate & Release)", "acl-qa-generate-e2e-tests"),
    ]
    if project_type == "greenfield":
        chain = cascade
    else:
        chain = [("project-context", "Project Context", "acl-generate-project-context")] if by_kind.get("project-context") else []
        in_cascade = any(by_kind.get(k) for k, _, _ in cascade)
        if in_cascade:
            chain += cascade
        elif by_kind.get("spec"):
            chain.append(("spec", "Tier 1 spec", "acl-quick-dev"))
        else:
            return next((m for m in (gate(*s) for s in chain) if m), None) or (
                "Context ready — choose Tier 1 (spec) or Tier 2 (full cascade) via `quick dev`")
    for step in chain:
        msg = gate(*step)
        if msg:
            return msg
    if project_type == "brownfield" and not any(by_kind.get(k) for k, _, _ in cascade):
        return "Tier 1 spec approved — code implementation is unlocked"
    return "All phases complete — every story is implemented and validated; ready for release"


def render_tree(project_type: str, docs: list[dict], rows: list[dict]) -> str:
    last_by_path: dict[str, dict] = {}
    for r in rows:
        if r["Deliverable"] not in ("—", "") and r["Event"] in ("created", "updated"):
            last_by_path[r["Deliverable"]] = r

    label = {"greenfield": "🌱 Greenfield Project", "brownfield": "🍂 Brownfield Project"}.get(
        project_type, "❔ Project type pending (no brief or project-context yet)")
    lines = [label]
    groups = [(key, title, [d for d in docs if d["phase"] == key]) for key, title in PHASES]
    groups = [g for g in groups if g[2]]
    for gi, (_, title, items) in enumerate(groups):
        last_group = gi == len(groups) - 1
        lines.append(("└── " if last_group else "├── ") + title)
        pad = "    " if last_group else "│   "
        items = sorted(items, key=lambda d: (d["mtime"], d["path"]))
        for ii, d in enumerate(items):
            row = last_by_path.get(d["path"], {})
            agent = row.get("Agent") or resolve_agent(None, d["skill"])
            skill = row.get("Skill") or d["skill"] or "—"
            branch = "└── " if ii == len(items) - 1 else "├── "
            lines.append(f"{pad}{branch}{d['path']}  {STATUS_ICON[d['status']]} {d['status']}  ← {agent} · {skill}")
    return "\n".join(lines)


def save(tree_path: Path, meta: dict, rows: list[dict], docs: list[dict]) -> None:
    project_type = meta.get("project_type", "undetermined")
    meta = {
        "title": "ACL-ADLC Working Tree",
        "project_type": project_type,
        "updated": now(),
    }
    fm = "\n".join(f"{k}: {v}" for k, v in meta.items())
    table = ["| " + " | ".join(COLUMNS) + " |", "|" + "|".join("---" for _ in COLUMNS) + "|"]
    for i, r in enumerate(rows, 1):
        r["#"] = str(i)
        table.append("| " + " | ".join(cell(r.get(c)) for c in COLUMNS) + " |")
    body = (
        f"---\n{fm}\n---\n\n"
        "# ACL-ADLC Working Tree\n\n"
        "> Auto-maintained by `_acl/scripts/working_tree.py` and shown in Markdown Studio → 🌳 Working Tree.\n"
        "> Do not edit by hand: the position below is regenerated and the log is append-only.\n\n"
        f"{TREE_HEADER}\n\n"
        f"**📍 {current_position(project_type, docs)}**\n\n"
        "```text\n" + render_tree(project_type, docs, rows) + "\n```\n\n"
        f"{LOG_HEADER}\n\n" + "\n".join(table) + "\n"
    )
    write_atomic(tree_path, body)


def make_row(event: str, agent: str, skill: str | None, deliverable: str | None, status: str | None, note: str | None) -> dict:
    return {
        "When": now(), "Event": event, "Agent": agent, "Skill": skill or "—",
        "Deliverable": deliverable or "—", "Doc Status": status or "—", "Note": note or "",
    }


def classify_project(meta: dict, rows: list[dict], docs: list[dict], explicit: str | None) -> None:
    """Record the greenfield/brownfield decision once, as its own log row."""
    before = meta.get("project_type", "undetermined")
    after = resolve_project_type(meta, docs, explicit)
    if after != before:
        meta["project_type"] = after
        if after != "undetermined":
            rows.append(make_row("classified", "—", None, None, None, f"Project classified as {after}"))


def ack(tree_path: Path, meta: dict, rows: list[dict], **extra) -> None:
    print(json.dumps({
        "ok": True,
        "working_tree": str(tree_path),
        "project_type": meta.get("project_type", "undetermined"),
        "events": len(rows),
        **extra,
    }))


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def paths(args) -> tuple[Path, Path, Path]:
    root = Path(args.root).resolve()
    out_dir = root / OUTPUT_DIRNAME
    return root, out_dir, out_dir / TREE_FILENAME


def cmd_track(args) -> int:
    root, out_dir, tree_path = paths(args)
    meta, rows = load(tree_path)
    rel = to_rel(out_dir, root, args.file) if args.file else None
    doc = read_doc(out_dir, rel) if rel else None
    skill = args.skill or (doc["skill"] if doc else None)
    event = args.event or ("invoked" if not rel else "updated" if any(r["Deliverable"] == rel for r in rows) else "created")
    docs = scan(out_dir)
    classify_project(meta, rows, docs, args.project_type)
    rows.append(make_row(event, resolve_agent(args.agent, skill), skill, rel,
                         doc["status"] if doc and doc["exists"] else None, args.note))
    save(tree_path, meta, rows, docs)
    ack(tree_path, meta, rows, event=event, deliverable=rel)
    return 0


def cmd_sync(args) -> int:
    _, out_dir, tree_path = paths(args)
    meta, rows = load(tree_path)
    docs = scan(out_dir)
    classify_project(meta, rows, docs, None)
    last_status: dict[str, str] = {}
    for r in rows:
        if r["Deliverable"] not in ("—", "") and r["Doc Status"] not in ("—", ""):
            last_status[r["Deliverable"]] = r["Doc Status"]
    seen = {r["Deliverable"] for r in rows}
    added = 0
    for d in sorted(docs, key=lambda d: (d["mtime"], d["path"])):
        if d["path"] not in seen:
            rows.append(make_row("created", resolve_agent(None, d["skill"]), d["skill"], d["path"], d["status"],
                                 "Detected by sync"))
            added += 1
        elif last_status.get(d["path"]) not in (None, d["status"]):
            rows.append(make_row("status", "👤 Manager", None, d["path"], d["status"],
                                 f"{last_status[d['path']]} → {d['status']}"))
            added += 1
    save(tree_path, meta, rows, docs)
    ack(tree_path, meta, rows, added=added)
    return 0


def cmd_show(args) -> int:
    _, out_dir, tree_path = paths(args)
    meta, rows = load(tree_path)
    docs = scan(out_dir)
    project_type = resolve_project_type(meta, docs, None)
    print(f"📍 {current_position(project_type, docs)}\n")
    print(render_tree(project_type, docs, rows))
    return 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # tree glyphs and emoji on Windows consoles
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    pt = sub.add_parser("track", help="record one agent action on a deliverable")
    pt.add_argument("--file", help="deliverable path (absolute, project-relative, or _acl-output-relative)")
    pt.add_argument("--agent", help="agent key (analyst, pm, architect, ux-designer, dev, tech-writer) or name")
    pt.add_argument("--skill", help="skill id, e.g. acl-product-brief")
    pt.add_argument("--event", help="created | updated | invoked (default: inferred)")
    pt.add_argument("--note", help="one-line note")
    pt.add_argument("--project-type", choices=["greenfield", "brownfield"], help="override project classification")
    pt.set_defaults(func=cmd_track)

    ps = sub.add_parser("sync", help="backfill untracked deliverables and status changes from disk")
    ps.set_defaults(func=cmd_sync)

    pw = sub.add_parser("show", help="print the current tree")
    pw.set_defaults(func=cmd_show)

    for sp in (pt, ps, pw):
        sp.add_argument("--root", default=".", help="project root (default: cwd)")

    args = p.parse_args(argv)
    if args.cmd == "track" and not (args.file or args.agent or args.skill):
        p.error("track needs at least one of --file, --agent, --skill")
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
