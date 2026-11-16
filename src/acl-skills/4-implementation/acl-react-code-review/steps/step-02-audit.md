# Step 2: Audit React & JavaScript Code Against Standards

## Goal
Perform a rigorous, line-by-line verification of the scoped files against the rules in `{skill-root}/rules/react-best-practices.md`.

## Execution Procedure

1. **Verify Against Rule Catalog**:
   - **Component Declarations**: Check that no component is declared inside another component.
   - **DOM Structure**: Verify that Fragments `<>...</>` are used instead of redundant `<div>` tags.
   - **Hooks Rules**:
     - Check for conditional or looped hook calls.
     - Verify all dependencies in `useEffect`, `useCallback`, `useMemo` are complete.
     - Verify timers, event listeners, and subscriptions have return cleanup functions.
     - Check if `useEffect` is erroneously used to calculate derived state.
     - Check that `ref.current` is not read/written during the render pass.
   - **State Immutability**:
     - Flag all direct mutations (`arr.push()`, `obj.foo = bar`).
     - Flag state updates dependent on previous state that do not use updater callbacks (`setState(prev => ...)`).
   - **List Rendering & Keys**:
     - Check all `.map(...)` list renders for unique, stable keys. Flag any array index keys.
   - **Conditional Rendering**:
     - Flag unsafe boolean evaluation (e.g. `items.length && <Component />`).
   - **Modern JavaScript**:
     - Check for `===`, `??`, `?.`, `const`/`let`, and async `try/catch`.
   - **Accessibility**:
     - Check for semantic HTML elements and missing `aria-label`/`<label>`.

2. **Categorize and Structure Findings**:
   - Classify each identified issue by severity:
     - 🔴 **Critical**: Bugs, memory leaks, state loss, infinite render loops.
     - 🟡 **Warning**: Missing cleanups, unmemoized expensive operations, redundant state.
     - 🟢 **Suggestion**: Semantic markup, optional chaining, code readability.
   - Record exact file path, line number, problematic code snippet, recommended fix snippet, and technical justification.

3. **Proceed**:
   - Move immediately to `step-03-generate-report.md`.
