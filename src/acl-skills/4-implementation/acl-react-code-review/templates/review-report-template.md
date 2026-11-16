---
title: "React & JavaScript Code Review: {TARGET_NAME}"
agent: "acl-react-code-review"
date: "{DATETIME}"
mode: "Report Only"
target_scope: "{TARGET_SCOPE}"
status: "In Review"
issues_summary:
  critical: {CRITICAL_COUNT}
  warning: {WARNING_COUNT}
  suggestion: {SUGGESTION_COUNT}
  total: {TOTAL_COUNT}
---

# ⚛️ React & JavaScript Code Review Report (Report Only)

**Skill:** `acl-react-code-review`  
**Date:** {DATETIME}  
**Execution Mode:** Report Only (No files modified)  
**Target Scope:** `{TARGET_SCOPE}`  

---

## 📊 Executive Summary

| Category | Count | Health Status |
| :--- | :---: | :--- |
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
- **Rule Reference:** `{RULE_CATEGORY}`
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

## 🛠️ Remediation Plan

This report was generated in **Report Only** mode. None of the files in your codebase have been modified.

To have these fixes applied automatically to your codebase, run `acl-react-code-fix` or select `[RF]` in Rachel's menu.

---

## 🚀 Recommended Next Actions

1. {NEXT_STEP_1}
2. {NEXT_STEP_2}
3. {NEXT_STEP_3}
