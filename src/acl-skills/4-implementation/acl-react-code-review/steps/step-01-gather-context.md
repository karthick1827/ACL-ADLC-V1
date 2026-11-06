# Step 1: Gather Context & Scope Target Files

## Goal
Identify all React components and JavaScript modules to be audited, and read their contents completely into memory.

## Execution Procedure

1. **Check for User-Specified Targets**:
   - Check if the user specified a specific file, component, or snippet (e.g., `TaskInput.jsx`, `src/components/`, or raw code).
   - If specific targets were requested, restrict the scope to those targets.

2. **Default Workspace Discovery**:
   - If no specific files were specified, locate all React and JavaScript source files in `{project-root}/src`:
     - Component files: `src/**/*.jsx`, `src/**/*.tsx`
     - Hook & module files: `src/**/*.js`, `src/**/*.ts`
     - Exclude test files (`*.test.*`, `*.spec.*`) unless the user explicitly requested test reviews.

3. **Read Target Files**:
   - Read each target file completely.
   - Note the total number of files and their relative paths.

4. **Proceed**:
   - Move immediately to `step-02-audit.md`.
