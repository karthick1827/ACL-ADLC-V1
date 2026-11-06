---
name: review-only
description: Audit React & JS codebase / components and generate markdown report in _acl-output/acl-react-code-review/ (Report Only)
menu-code: RO
---

# Menu Item [RO]: React & JavaScript Code Review (Report Only)

## Goal
Perform an exhaustive code review of the React and JavaScript codebase or user-specified components against modern React 18/19 standards, Hook safety rules, component composition idioms, and modern JavaScript practices. Generate a detailed markdown review report under `_acl-output/acl-react-code-review/{agent-output}.md` detailing all findings, exact line references, and before/after code snippets **WITHOUT modifying the user's code files**.

---

## Execution Workflow

### Step 1: Identify Review Scope
1. Determine the target files to review:
   - If the user specified a file, component, or code snippet in their prompt, review that specific target.
   - If no specific file is mentioned, default to scanning the React components and JavaScript modules in `{project-root}/src` (specifically `.jsx`, `.js`, `.tsx`, `.ts` files).
2. Read the source code of all target files completely.

### Step 2: In-Depth Rule Verification
Evaluate the target code against the criteria in `{skill-root}/rules/react-best-practices.md`:
1. **Component Architecture & Composition**:
   - Check for components declared inside other components (Critical!).
   - Check for redundant wrapper `<div>` soup vs Fragments `<>...</>`.
   - Verify controlled vs uncontrolled input consistency.
   - Check component size and single responsibility.
2. **React Hooks Discipline**:
   - Verify Rules of Hooks (no conditional or nested hooks).
   - Verify exhaustive dependency arrays for `useEffect`, `useCallback`, `useMemo`.
   - Ensure all event subscriptions, intervals, and async timers return cleanup functions.
   - Flag any `useEffect` being used to sync derived state that should be computed during render.
   - Verify `useRef` is not read/written during render.
3. **State Management & Immutability**:
   - Flag any direct mutations of state or props (e.g. `array.push()`, `obj.x = y`).
   - Check for missing functional state updates (`setX(prev => ...)`).
   - Identify redundant, duplicated, or out-of-sync state.
4. **Rendering & List Performance**:
   - Flag any dynamic lists using array index as `key`.
   - Flag conditional rendering bugs (`count && <Component />` rendering `0`).
   - Flag premature or missing memoization.
5. **Modern JavaScript (ES6+) Standards**:
   - Verify strict equality `===` vs loose `==`.
   - Check for optional chaining `?.` and nullish coalescing `??`.
   - Check for unhandled asynchronous errors and missing `try/catch`.
   - Check for `var` or unused/dead code.
6. **Accessibility (a11y) & Semantic Markup**:
   - Verify clickable elements use `<button>` or semantic interactive elements with accessible names/labels.
   - Verify form controls have associated `<label>` or `aria-label`.
   - Verify image `alt` attributes.

### Step 3: Ensure Output Directory Exists
Ensure directory `{project-root}/_acl-output/acl-react-code-review/` exists. If not, create it.

### Step 4: Generate Markdown Review Report
1. Select output file path:
   - Format: `{project-root}/_acl-output/acl-react-code-review/react-code-review-{scope_or_date}.md`
   - Example: `_acl-output/acl-react-code-review/react-code-review-report.md`
2. Write the markdown file using the template structure from `{skill-root}/templates/review-report-template.md`:
   - Include YAML frontmatter with `title`, `agent`, `date`, `mode: "Report Only"`, `target_scope`, `status: "In Review"`, and `issues_summary`.
   - Include Executive Summary table.
   - Include Component Quality Scorecard.
   - Detail every flagged issue with:
     - Exact file path and line number
     - Severity rating (🔴 Critical, 🟡 Warning, 🟢 Suggestion)
     - Rule category reference
     - Thorough explanation of why it is problematic
     - Current problematic code block
     - Recommended fix code block
     - Technical impact / justification
   - Provide summary of next steps.

### Step 5: Present Summary to User
1. Remind the user: **Mode [RO] (Report Only)** was executed; no codebase files have been modified.
2. Present a high-level executive summary in the chat:
   - Total issues identified (Critical, Warnings, Suggestions)
   - Clickable link to the generated markdown report: `[react-code-review-report.md](file:///{project-root}/_acl-output/acl-react-code-review/{filename}.md)`
   - Highlight the top critical findings that need immediate attention.
   - Offer the user the option to switch to Menu Item **[RF]** if they would like the agent to apply these fixes automatically.
