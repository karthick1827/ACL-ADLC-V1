---
name: review-and-fix
description: Audit React & JS codebase, generate markdown report, AND apply recommended fixes directly to the codebase
menu-code: RF
---

# Menu Item [RF]: React & JavaScript Code Review & Automated Remediation

## Goal
Perform an exhaustive code review of the React and JavaScript codebase or user-specified components against modern React 18/19 standards, Hook safety rules, component composition idioms, and modern JavaScript practices. Generate a detailed markdown review report under `_acl-output/acl-react-code-review/{agent-output}.md`, **AND automatically apply the recommended refactorings directly into the codebase files for the user**.

---

## Execution Workflow

### Step 1: Identify Review Scope
1. Determine the target files to review:
   - If the user specified a file, component, or code snippet in their prompt, review and remediate that specific target.
   - If no specific file is mentioned, default to scanning the React components and JavaScript modules in `{project-root}/src` (specifically `.jsx`, `.js`, `.tsx`, `.ts` files).
2. Read the source code of all target files completely.

### Step 2: In-Depth Rule Verification
Evaluate the target code against the criteria in `{skill-root}/rules/react-best-practices.md`:
1. **Component Architecture & Composition**:
   - Check for components declared inside other components (extract them to top level or dedicated modules).
   - Eliminate redundant wrapper `<div>` soup using `<>...</>`.
   - Fix controlled/uncontrolled input inconsistencies.
2. **React Hooks Discipline**:
   - Fix missing dependencies in `useEffect`, `useCallback`, `useMemo`.
   - Add required cleanup functions to prevent memory leaks and unhandled subscriptions.
   - Replace derived-state `useEffect` calls with inline render calculations.
   - Ensure `useRef` is not read or written during render.
3. **State Management & Immutability**:
   - Eliminate direct array/object mutations; replace with functional immutable updates.
   - Ensure functional state updates (`setX(prev => ...)`) when dependent on prior state.
4. **Rendering & List Performance**:
   - Replace array indexes used as `key` props with stable unique IDs.
   - Fix unsafe conditional rendering (`count && <Comp />` -> `count > 0 && <Comp />`).
5. **Modern JavaScript (ES6+) Standards**:
   - Upgrade loose `==` to strict `===`.
   - Apply optional chaining `?.` and nullish coalescing `??`.
   - Add proper `try/catch` and async error handling.
   - Replace `var` with `const` or `let`.
   - Clean up dead code, unused imports, and stray debug `console.log` statements.
6. **Accessibility (a11y) & Semantic Markup**:
   - Replace clickable `<div>` elements with accessible `<button>` elements.
   - Attach `<label>` or `aria-label` to form inputs.

### Step 3: Ensure Output Directory Exists
Ensure directory `{project-root}/_acl-output/acl-react-code-review/` exists. If not, create it.

### Step 4: Generate Markdown Review Report
1. Select output file path:
   - Format: `{project-root}/_acl-output/acl-react-code-review/react-code-review-{scope_or_date}.md`
   - Example: `_acl-output/acl-react-code-review/react-code-review-report.md`
2. Write the markdown report following `{skill-root}/templates/review-report-template.md`:
   - Set YAML frontmatter with `mode: "Report and Fix"`.
   - Include Executive Summary, Quality Scorecard, and detailed File-by-File findings.
   - Document the planned code modifications with before/after snippets.
   - Include the **Remediation Summary** detailing all changes that are being applied to the codebase.

### Step 5: Apply Code Changes to Codebase
1. Systematically update the target files in `{project-root}/src` using targeted, safe edits:
   - Preserve existing coding conventions, indentations, and imports.
   - Preserve all business logic comments and existing documentation.
   - Never break existing functional contracts or design tokens.
2. Ensure updated files are completely valid syntactically.

### Step 6: Verify Code Integrity
1. Run available project checks:
   - If tests or linter exist, run them (e.g. `npm run lint` or `npm run build` or `npm test`).
   - Ensure no syntax errors or breaking regressions were introduced.
2. If any test/lint issues arise from the changes, fix them immediately.

### Step 7: Present Results to User
1. Present a clear, structured summary in the chat:
   - Mode: **[RF] (Report and Automated Fixes Applied)**
   - Clickable link to the generated markdown report: `[react-code-review-report.md](file:///{project-root}/_acl-output/acl-react-code-review/{filename}.md)`
   - List of all modified files with clickable file links: `[File.jsx](file:///{project-root}/src/components/File.jsx)`
   - Key improvements made (e.g., hooks stabilized, memory leaks plugged, component composition corrected, accessibility improved).
   - Current health status of the codebase.
