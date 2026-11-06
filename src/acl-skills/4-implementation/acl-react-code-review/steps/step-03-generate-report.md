# Step 3: Generate Markdown Review Report

## Goal
Write the comprehensive review report to `{project-root}/_acl-output/acl-react-code-review/{filename}.md`.

## Execution Procedure

1. **Verify Output Directory**:
   - Ensure `{project-root}/_acl-output/acl-react-code-review/` exists.

2. **Determine File Name**:
   - Determine output path: `{project-root}/_acl-output/acl-react-code-review/react-code-review-{scope_or_timestamp}.md`
   - Example default: `_acl-output/acl-react-code-review/react-code-review-report.md`

3. **Format Report**:
   - Populate `{skill-root}/templates/review-report-template.md` with:
     - Frontmatter containing `title`, `agent`, `date`, `mode: "Report Only"`, `target_scope`, `status: "In Review"`, and `issues_summary`.
     - Executive summary table with total counts.
     - Component quality scorecard (scores out of 10 across the 6 major dimensions).
     - File-by-file detailed findings with line numbers and before/after code blocks.
     - Remediation plan noting that no files were modified in Report Only mode.
     - Recommended next actions.

4. **Write File**:
   - Write the completed report to the target path.

5. **Proceed**:
   - Move immediately to `step-04-present.md`.
