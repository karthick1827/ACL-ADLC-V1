# Step 5: Verify Changes & Present Final Summary to User

## Goal
Verify the refactored code passes project quality checks, and present the final summary with clickable diff links.

## Execution Procedure

1. **Integrity & Quality Verification**:
   - Run available quality checks if configured (e.g. `npm run lint` or `npm run build` or `npm test`).
   - If any lint or test failures arise from the refactored code, resolve them immediately.

2. **Present Final Summary**:
   - Inform the user that **Mode: Report & Fix** was executed successfully.
   - Provide clickable link to the generated markdown report: `[react-code-review-report.md](file:///{project-root}/_acl-output/acl-react-code-review/{filename}.md)`.
   - List all modified files with clickable file links: `[File.jsx](file:///{project-root}/src/components/File.jsx)`.
   - Summarize the specific enhancements made (e.g. hook leak fixes, immutable state updates, optional chaining, semantic markup).

3. **Complete Workflow**:
   - Execute `{workflow.on_complete}` if defined.
