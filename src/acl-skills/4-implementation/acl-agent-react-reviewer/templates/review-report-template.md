# React & JavaScript Code Review Template

Use this template structure when generating reports into `_acl-output/acl-react-code-review/{agent-output}.md`.

```markdown
---
title: "React & JavaScript Code Review: {TARGET_NAME}"
agent: "Rachel (acl-agent-react-reviewer)"
date: "{DATETIME}"
mode: "{MODE}" # "Report Only" or "Report and Fix"
target_scope: "{TARGET_SCOPE}"
status: "In Review"
issues_summary:
  critical: {CRITICAL_COUNT}
  warning: {WARNING_COUNT}
  suggestion: {SUGGESTION_COUNT}
  total: {TOTAL_COUNT}
---

# ⚛️ React & JavaScript Code Review Report

**Reviewer:** Rachel — Senior React & JavaScript Code Reviewer  
**Date:** {DATETIME}  
**Execution Mode:** {MODE}  
**Target Scope:** `{TARGET_SCOPE}`  

---

## 📊 Executive Summary

| Category | Count | Status / Health |
| :--- | :--- | :--- |
| 🔴 **Critical Bugs & Breaking Antipatterns** | {CRITICAL_COUNT} | {CRITICAL_STATUS} |
| 🟡 **Warnings & Performance Pitfalls** | {WARNING_COUNT} | {WARNING_STATUS} |
| 🟢 **Code Quality & Best Practice Suggestions** | {SUGGESTION_COUNT} | {SUGGESTION_STATUS} |
| **Total Issues Flagged** | **{TOTAL_COUNT}** | **{OVERALL_HEALTH}** |

{EXECUTIVE_SUMMARY_TEXT}

---

## 🎯 Component Quality Scorecard

| Area | Score | Notes |
| :--- | :---: | :--- |
| **Component Architecture & Purity** | {SCORE_ARCH}/10 | {NOTES_ARCH} |
| **React Hooks Discipline & Safety** | {SCORE_HOOKS}/10 | {NOTES_HOOKS} |
| **State Immutability & Data Flow** | {SCORE_STATE}/10 | {NOTES_STATE} |
| **Rendering Performance & Keys** | {SCORE_PERF}/10 | {NOTES_PERF} |
| **Modern JS & Clean Code** | {SCORE_JS}/10 | {NOTES_JS} |
| **Accessibility (a11y) & Semantics** | {SCORE_A11Y}/10 | {NOTES_A11Y} |

---

## 🔍 Detailed File-by-File Findings

### 1. `{FILE_PATH}`

#### 🔴/🟡/🟢 [ISSUE-ID]: {ISSUE_TITLE}
- **Location:** Line `{LINE_NUMBER}`
- **Severity:** `Critical` | `Warning` | `Suggestion`
- **Rule Reference:** `{RULE_CATEGORY}` (e.g., *Rule 1.1 Never Define Components Inside Components*)
- **Problem Explanation:**
  {DETAILED_EXPLANATION}

- **Current Problematic Code:**
  ```{ext}
  // Line {LINE_NUMBER}
  {PROBLEMATIC_SNIPPET}
  ```

- **Recommended Fix:**
  ```{ext}
  // Recommended revision
  {FIX_SNIPPET}
  ```

- **Why This Matters:**
  {IMPACT_AND_JUSTIFICATION}

---

## 🛠️ Remediation Summary

{REMEDIATION_SUMMARY_TEXT}

{APPLIED_CHANGES_SECTION_IF_MODE_IS_REPORT_AND_FIX}

---

## 🚀 Recommended Next Actions

1. {NEXT_STEP_1}
2. {NEXT_STEP_2}
3. {NEXT_STEP_3}
```
