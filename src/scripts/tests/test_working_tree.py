"""Tests for working_tree.py. Run: python -m unittest src/scripts/tests/test_working_tree.py"""
import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import working_tree  # noqa: E402


def write_doc(root: Path, rel: str, status: str = "In Review", project_type: str | None = None) -> None:
    path = root / "_acl-output" / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    pt = f"project_type: {project_type}\n" if project_type else ""
    path.write_text(f"---\ntitle: Doc\n{pt}status: {status}\n---\n# Doc\n", encoding="utf-8")


class WorkingTreeTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.tree = self.root / "_acl-output" / "working-tree.md"

    def tearDown(self):
        self._tmp.cleanup()

    def run_cli(self, *argv):
        with contextlib.redirect_stdout(io.StringIO()):
            return working_tree.main([*argv, "--root", str(self.root)])

    def rows(self):
        return working_tree.load(self.tree)[1]

    def meta(self):
        return working_tree.load(self.tree)[0]

    def test_track_brief_classifies_greenfield_and_credits_agent(self):
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md", project_type="greenfield")
        self.run_cli("track", "--agent", "analyst", "--file", "1-analysis/acl-product-brief/brief.md")
        self.assertEqual(self.meta()["project_type"], "greenfield")
        rows = self.rows()
        self.assertEqual([r["Event"] for r in rows], ["classified", "created"])
        self.assertIn("Mary", rows[1]["Agent"])
        self.assertEqual(rows[1]["Skill"], "acl-product-brief")
        self.assertEqual(rows[1]["Doc Status"], "In Review")

    def test_project_context_first_classifies_brownfield(self):
        write_doc(self.root, "project-context.md")
        self.run_cli("sync")
        self.assertEqual(self.meta()["project_type"], "brownfield")

    def test_classification_is_sticky(self):
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md")
        self.run_cli("sync")
        write_doc(self.root, "project-context.md")
        self.run_cli("sync")
        self.assertEqual(self.meta()["project_type"], "greenfield")

    def test_tracker_has_no_status_frontmatter(self):
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md")
        self.run_cli("sync")
        frontmatter = self.tree.read_text(encoding="utf-8").split("---")[1]
        self.assertNotIn("status:", frontmatter)

    def test_log_is_append_only_and_second_track_is_update(self):
        write_doc(self.root, "2-plan-workflows/acl-prd/prd.md")
        self.run_cli("track", "--skill", "acl-prd", "--file", "_acl-output/2-plan-workflows/acl-prd/prd.md")
        first = self.rows()
        self.run_cli("track", "--skill", "acl-prd", "--file", "_acl-output/2-plan-workflows/acl-prd/prd.md")
        second = self.rows()
        self.assertEqual(second[: len(first)], first)
        self.assertEqual(second[-1]["Event"], "updated")
        self.assertIn("John", second[-1]["Agent"])

    def test_sync_backfills_and_records_status_change_once(self):
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md")
        self.run_cli("sync")
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md", status="Approved")
        self.run_cli("sync")
        self.run_cli("sync")
        events = [r["Event"] for r in self.rows()]
        self.assertEqual(events, ["classified", "created", "status"])
        self.assertEqual(self.rows()[-1]["Note"], "In Review → Approved")

    def test_internal_files_are_not_tracked(self):
        write_doc(self.root, "1-analysis/acl-product-brief/addendum.md")
        write_doc(self.root, "1-analysis/acl-product-brief/.memlog.md")
        self.run_cli("sync")
        self.assertEqual([r for r in self.rows() if r["Event"] == "created"], [])

    def test_pipe_in_note_round_trips(self):
        self.run_cli("track", "--agent", "dev", "--note", "a | b")
        self.assertEqual(self.rows()[-1]["Note"], "a | b")
        self.assertEqual(self.rows()[-1]["Event"], "invoked")

    def test_position_waits_on_first_unapproved_gate(self):
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md", status="Approved")
        write_doc(self.root, "2-plan-workflows/acl-prd/prd.md")
        docs = working_tree.scan(self.root / "_acl-output")
        self.assertIn("prd.md", working_tree.current_position("greenfield", docs))

    def approve_planning(self, stories=("1.1", "1.2")):
        for rel in ("1-analysis/acl-product-brief/brief.md", "2-plan-workflows/acl-prd/prd.md",
                    "3-solutioning/acl-architecture/architecture-spine.md"):
            write_doc(self.root, rel, status="Approved")
        epics = self.root / "_acl-output" / "3-solutioning/acl-create-epics-and-stories/epics.md"
        epics.parent.mkdir(parents=True, exist_ok=True)
        headings = "".join(f"### Story {s}: Title\n\n" for s in stories)
        epics.write_text(f"---\nstatus: Approved\n---\n# Epics\n\n{headings}", encoding="utf-8")

    def test_spec_files_satisfy_the_story_gate_story_by_story(self):
        self.approve_planning()
        write_doc(self.root, "4-implementation/spec-1-1-foundation.md", status="Approved")
        docs = working_tree.scan(self.root / "_acl-output")
        self.assertIn("Story 1.2 (1/2", working_tree.current_position("greenfield", docs))

    def test_all_stories_approved_moves_to_validate_and_release(self):
        self.approve_planning()
        write_doc(self.root, "4-implementation/spec-1-1-foundation.md", status="Approved")
        write_doc(self.root, "4-implementation/story-1-2.md", status="Approved")
        docs = working_tree.scan(self.root / "_acl-output")
        pos = working_tree.current_position("greenfield", docs)
        self.assertIn("acl-qa-generate-e2e-tests", pos)
        self.assertIn("Amelia", pos)

    def test_test_summary_without_status_completes_validation(self):
        self.approve_planning(stories=("1.1",))
        write_doc(self.root, "4-implementation/spec-1-1-foundation.md", status="Approved")
        summary = self.root / "_acl-output" / "4-implementation/tests/test-summary.md"
        summary.parent.mkdir(parents=True, exist_ok=True)
        summary.write_text("# Test Automation Summary\n", encoding="utf-8")
        docs = working_tree.scan(self.root / "_acl-output")
        self.assertIn("ready for release", working_tree.current_position("greenfield", docs))

    def test_file_without_status_never_blocks_a_gate(self):
        write_doc(self.root, "1-analysis/acl-product-brief/brief.md", status="Approved")
        write_doc(self.root, "2-plan-workflows/acl-prd/prd.md", status="Approved")
        rubric = self.root / "_acl-output" / "2-plan-workflows/acl-prd/review-rubric.md"
        rubric.write_text("# PRD Quality Rubric Review\n", encoding="utf-8")
        docs = working_tree.scan(self.root / "_acl-output")
        self.assertNotIn("review-rubric", working_tree.current_position("greenfield", docs))

    def test_position_brownfield_without_tier_asks_for_tier(self):
        write_doc(self.root, "project-context.md", status="Approved")
        docs = working_tree.scan(self.root / "_acl-output")
        self.assertIn("choose Tier 1", working_tree.current_position("brownfield", docs))


if __name__ == "__main__":
    unittest.main()
