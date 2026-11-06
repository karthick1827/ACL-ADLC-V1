# Step 1: Gather Context & Scope Target Files

## Goal
Identify all React components and JavaScript modules to be audited and refactored, reading their contents completely.

## Execution Procedure

1. **Check for User-Specified Targets**:
   - Check if the user specified a specific file, component, or snippet (e.g. `TaskItem.jsx`, `src/components/`, or a code block).
   - If specific targets were requested, restrict scope to those targets.

2. **Default Workspace Discovery**:
   - If no specific files were specified, locate all React and JavaScript source files in `{project-root}/src`:
     - Component files: `src/**/*.jsx`, `src/**/*.tsx`
     - Hook & module files: `src/**/*.js`, `src/**/*.ts`
     - Exclude test files (`*.test.*`, `*.spec.*`) unless the user explicitly requested test reviews.

3. **Read Target Files**:
   - Read each target file completely.

4. **Proceed**:
   - Move immediately to `step-02-audit.md`.
