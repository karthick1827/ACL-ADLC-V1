# Step 3: Generate Markdown Review & Remediation Report

## Goal
Document all findings and planned code changes in `{workflow.report_folder}/{filename}.md`.

## Execution Procedure

1. **Verify Output Directory**:
   - Ensure `{workflow.report_folder}/` exists.

2. **Determine File Name**:
   - Determine output path: `{workflow.report_folder}/react-code-review-{scope_or_timestamp}.md`
   - Example default: `{workflow.report_folder}/react-code-review-report.md`

3. **Format Report**:
   - Populate `{skill-root}/templates/review-report-template.md`:
     - Set frontmatter `mode: "Report and Fix"`.
     - Fill Executive Summary, Quality Scorecard, and detailed File-by-File findings with original vs applied fix snippets.
     - Document all files being remediated in the Remediation Summary section.

4. **Write Report**:
   - Write the markdown document to `{workflow.report_folder}/{filename}.md`.

5. **Proceed**:
   - Move immediately to `step-04-apply-fixes.md`.
