# React & JavaScript Code Review Standards & Best Practices

This document defines the exhaustive quality, correctness, and architectural criteria enforced during React & JavaScript code reviews and remediation.

---

## 1. React Component Architecture & Composition

### 1.1 Never Define Components Inside Other Components (CRITICAL)
- **Problem**: Declaring a component inside another component's render body re-creates the function identity on every single render. React treats it as an entirely new component type on each cycle, completely unmounting the DOM subtree, wiping state, losing text selection/focus, and causing severe performance thrashing.
- **Rule**: All component definitions must reside at the module top level or in separate files.
- **Remediation**: Extract the inner component outside the parent function. Pass required parent variables via props.

### 1.2 Avoid Redundant Wrapper `<div>` Soup
- Use React Fragments (`<>...</>`) unless the wrapping container requires distinct CSS styling, flex/grid properties, or accessibility landmarks.

### 1.3 Controlled vs Uncontrolled Input Consistency
- Never allow an input to toggle from `undefined` (uncontrolled) to a defined string (controlled).
- Always initialize state with empty string defaults: `value={taskText ?? ''}`.

### 1.4 Single Responsibility Principle
- Components should focus on a single presentation or behavioral concern. Split components exceeding ~250 lines into child subcomponents or custom hooks.

---

## 2. React Hooks Discipline & Correctness

### 2.1 The Rules of Hooks
- Call hooks exclusively at the top level of React functions or custom hooks (`use*`).
- Never wrap hooks in conditionals (`if`), loops, or nested functions.

### 2.2 Exhaustive Effect Dependencies
- All reactive values (props, state, derived variables) used inside `useEffect`, `useCallback`, or `useMemo` must be listed in their dependency arrays.
- Do not suppress `eslint-plugin-react-hooks` without explicit architectural documentation.

### 2.3 Always Clean Up Side-Effects
- Effects that attach event listeners, start timers (`setTimeout`, `setInterval`), or make cancellable network requests must return a cleanup function to avoid memory leaks.
- When executing fixes, attach timer refs and cleanup listeners on unmount.

### 2.4 Do Not Use Effects for Derived State (CRITICAL)
- If a value can be computed from existing props or state, compute it directly during render. Using `useEffect` to sync state introduces redundant re-render passes and flash of outdated content.

### 2.5 Ref Usage Discipline
- Do not read or write `ref.current` during rendering. `useRef` modifications should occur inside event handlers or `useEffect`.

---

## 3. State Management & Immutability

### 3.1 Strict State Immutability
- Never mutate state arrays or objects directly (e.g. `state.push()`, `delete state.prop`).
- Always use immutable spreads: `[...state, item]` or `{ ...state, key: value }`.

### 3.2 Functional State Updates
- When updating state based on the current value, always use the updater callback:
  ```jsx
  setCount(prev => prev + 1);
  ```

### 3.3 Colocate State
- Keep state as close as possible to the components that consume it. Avoid lifting state prematurely.

---

## 4. Rendering & List Performance

### 4.1 Stable Keys for Dynamic Lists (CRITICAL)
- Never use array indices as `key` for lists that can be reordered, inserted, or removed.
- Use persistent, unique identifiers (e.g. `item.id`).

### 4.2 Safe Conditional Rendering (The `0` / `NaN` Bug)
- In JavaScript, `0 && <Component />` renders literal `0` into the DOM.
- Use explicit boolean expressions: `count > 0 && <Component />` or ternaries: `count > 0 ? <Component /> : null`.

### 4.3 Judicious Memoization
- Avoid premature `useMemo` on trivial calculations. Reserve `useMemo` and `useCallback` for expensive loops or when passing callbacks to memoized children (`React.memo`).

---

## 5. Modern JavaScript (ES6+) Standards

### 5.1 Strict Equality & Nullish Checking
- Always use `===` and `!==` instead of `==` and `!=`.
- Prefer nullish coalescing (`??`) over logical OR (`||`) when `0` or `""` are valid values.
- Prefer optional chaining (`obj?.prop`, `fn?.()`) over legacy logical AND checks (`obj && obj.prop`, `fn && fn()`).

### 5.2 Async/Await Error Safety
- Wrap `await` calls in `try/catch` blocks.
- Guard against updating unmounted components after async resolution.

### 5.3 Modern Scoping
- Always use `const` by default. Use `let` only when reassignment is strictly required. Never use `var`.
- Remove dead code, unused imports, and debugging statements (`console.log`) before shipping.

---

## 6. Accessibility (a11y) & Semantic Markup

### 6.1 Semantic Interactive Elements
- Use native `<button>` elements for click actions rather than `<div onClick={...}>`.
- If a custom element must be clickable, add `role="button"`, `tabIndex={0}`, and handle keyboard events (`Enter` / `Space`).

### 6.2 Accessible Inputs & Media
- Form controls must have associated `<label htmlFor="...">` or `aria-label`.
- All `<img>` tags must include descriptive `alt` attributes.
