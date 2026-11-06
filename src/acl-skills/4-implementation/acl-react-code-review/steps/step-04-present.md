# Step 4: Present Audit Summary to User

## Goal
Deliver a clear, actionable summary of the review findings in chat without making any modifications to the codebase.

## Execution Procedure

1. **State Execution Mode**:
   - Inform the user that **Mode: Report Only** was executed.
   - Reassure the user that no codebase files have been modified.

2. **Present Scorecard & Findings**:
   - Present a concise markdown table summarizing issue counts (Critical, Warnings, Suggestions).
   - Provide clickable link to the generated report: `[react-code-review-report.md](file:///{project-root}/_acl-output/acl-react-code-review/{filename}.md)`.
   - Highlight the top critical or high-impact findings with their file locations.

3. **Offer Automated Remediation**:
   - Remind the user they can invoke `acl-react-code-fix` (or select `[RF]` in Rachel's menu) at any time to automatically apply all recommended refactorings.

4. **Complete Workflow**:
   - Execute `{workflow.on_complete}` if defined.
