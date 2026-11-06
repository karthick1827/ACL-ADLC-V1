# React & JavaScript Code Review Standards & Best Practices

This document defines the exhaustive quality, correctness, and architectural criteria that **Rachel (Senior React & JavaScript Code Reviewer)** enforces when reviewing code.

---

## 1. React Component Architecture & Composition

### 1.1 Never Define Components Inside Other Components (CRITICAL)
- **Problem**: Declaring a component inside the render body of another component causes the nested component to receive a brand new function reference on every parent render. React treats this as an entirely new component type, causing complete DOM unmounting, loss of internal state, loss of input focus, and severe re-render thrashing.
- **Bad**:
  ```jsx
  function ParentList({ items }) {
    // ❌ ANTI-PATTERN: Recreated on every ParentList render!
    function ItemRow({ item }) {
      return <li>{item.name}</li>;
    }
    return <ul>{items.map(i => <ItemRow key={i.id} item={i} />)}</ul>;
  }
  ```
- **Good**:
  ```jsx
  // ✅ Extract to top-level or separate module file
  function ItemRow({ item }) {
    return <li>{item.name}</li>;
  }

  function ParentList({ items }) {
    return <ul>{items.map(i => <ItemRow key={i.id} item={i} />)}</ul>;
  }
  ```

### 1.2 Avoid Redundant DOM Wrapper Soup
- Use React Fragments (`<>...</>`) instead of redundant `<div>` containers that clutter the DOM, break CSS grid/flexbox layouts, and degrade accessibility.
- Only introduce a wrapper `<div>` if it carries semantic meaning, ARIA roles, or CSS styling.

### 1.3 Controlled vs Uncontrolled Inputs
- Avoid mixing controlled and uncontrolled state (e.g., passing `undefined` initially then switching to a string, which triggers React's `"A component is changing an uncontrolled input to be controlled"` warning).
- Provide safe fallback default values: `value={form.name ?? ''}`.

### 1.4 Single Responsibility & Component Decomposition
- If a component exceeds 250-300 lines or manages multiple unrelated sub-features (e.g. data fetching, pagination, complex filtering, and modal management all in one file), decompose it into focused presentation components and custom hooks.

---

## 2. React Hooks Discipline & Correctness

### 2.1 The Rules of Hooks
- Call hooks **only at the top level** of React function components or custom hooks.
- **Never** call hooks inside conditional branches (`if`), loops (`for`, `while`), or nested functions.

### 2.2 Exhaustive Effect Dependencies
- All reactive values (props, state, and variables derived from them) accessed inside `useEffect`, `useCallback`, or `useMemo` must be declared in the dependency array.
- **Do not suppress ESLint `react-hooks/exhaustive-deps`** without an explicit, documented architectural justification.
- If an effect triggers too frequently because an object or function dependency changes on every render:
  1. Move the function or object inside the effect.
  2. Or memoize it with `useCallback` / `useMemo`.
  3. Or lift it outside the component if it does not depend on component scope.

### 2.3 Always Clean Up Side-Effects
- Effects that subscribe to events, start timers, open WebSocket connections, or initiate abortable network requests **must** return a cleanup function.
- **Good**:
  ```jsx
  useEffect(() => {
    const controller = new AbortController();
    fetchData({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchData]);

  useEffect(() => {
    const handler = (e) => handleKey(e);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  ```

### 2.4 Do Not Use Effects for Derived State (CRITICAL)
- **Problem**: Syncing state via `useEffect` introduces extra render cycles, flash of outdated content, and race conditions.
- **Bad**:
  ```jsx
  // ❌ Redundant state and extra re-render
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    setFullName(`${firstName} ${lastName}`);
  }, [firstName, lastName]);
  ```
- **Good**:
  ```jsx
  // ✅ Computed directly during render (zero extra cycles)
  const fullName = `${firstName} ${lastName}`;
  ```

### 2.5 Ref Usage Discipline
- `useRef` is for mutable values that do **not** trigger re-renders (DOM references, timer IDs, previous values).
- **Never read or write `ref.current` during rendering**. Reading or writing refs in render makes component output unpredictable under concurrent rendering.

---

## 3. State Management & Immutability

### 3.1 Strict State Immutability
- **Never mutate state directly**. Methods like `push()`, `splice()`, `pop()`, or assigning `state.foo = bar` fail to trigger re-renders and corrupt undo/redo stacks.
- **Bad**:
  ```jsx
  tasks.push(newTask);
  setTasks(tasks); // ❌ Same reference, React skips render!
  ```
- **Good**:
  ```jsx
  setTasks(prev => [...prev, newTask]); // ✅ New array reference
  ```

### 3.2 Functional Updates for Dependent State
- When setting state that depends on the previous state, always pass an updater callback `setState(prev => ...)` to avoid stale closure bugs in asynchronous handlers or batched updates.

### 3.3 State Colocation & Single Source of Truth
- Keep state as local as possible. Do not lift state to global stores or parent containers unless multiple decoupled components genuinely need access.
- Avoid duplicate state where one entity can be computed or retrieved from another.

---

## 4. Rendering & List Performance

### 4.1 Stable Keys for Dynamic Lists (CRITICAL)
- **Never use array index as `key`** for dynamic lists that can be reordered, filtered, inserted, or deleted.
- Array indexes cause subtle bugs where inputs retain state from other items, CSS animations apply to the wrong rows, and React cannot reconcile DOM elements efficiently.
- Use persistent, unique IDs (e.g. `item.id`).

### 4.2 Safe Conditional Rendering (The `0` & `NaN` Bug)
- **Problem**: In JavaScript, `0 && <Component />` evaluates to `0`, rendering a literal `0` into the DOM!
- **Bad**:
  ```jsx
  {items.length && <ItemList items={items} />} // ❌ Renders '0' if empty!
  ```
- **Good**:
  ```jsx
  {items.length > 0 && <ItemList items={items} />} // ✅ Boolean guard
  // OR
  {items.length > 0 ? <ItemList items={items} /> : null}
  ```

### 4.3 Judicious Memoization
- Avoid premature memoization on trivial computations (e.g. `useMemo(() => a + b, [a, b])`). The overhead of creating dependencies and caching exceeds the cost of simple arithmetic.
- Use `React.memo`, `useMemo`, and `useCallback` when:
  1. Passing callbacks to deeply nested, memoized child components.
  2. Performing genuinely heavy computations (filtering/sorting thousands of items).
  3. Preserving reference stability for effect dependencies.

---

## 5. Modern JavaScript (ES6+) Best Practices

### 5.1 Strict Equality & Nullish Checking
- Always use strict equality (`===` / `!==`) instead of loose equality (`==` / `!=`).
- Use Nullish Coalescing (`??`) for defaults where `0` or `""` are valid values, rather than Logical OR (`||`).
- Use Optional Chaining (`?.`) instead of nested `&&` checks to safely access deep properties.

### 5.2 Async/Await & Promise Safety
- Always wrap `await` calls in `try/catch` or use structured error boundaries.
- Avoid unhandled promise rejections.
- In components, handle the case where an asynchronous call finishes after the component has unmounted.

### 5.3 Clean Variables & Scope
- Always use `const` by default. Use `let` only when variable reassignment is required. **Never use `var`**.
- Remove dead code, unused imports, dangling commented-out blocks, and leftover `console.log` statements in production files.

---

## 6. Accessibility (a11y) & Semantic Markup

### 6.1 Semantic HTML
- Use `<button>` for clickable triggers, not `<div onClick={...}>`. A `div` is not focusable via keyboard, has no role, and fails screen readers.
- If a non-button element must be interactive, provide `role="button"`, `tabIndex={0}`, and handle `onKeyDown` for `Enter` and `Space`.

### 6.2 Forms & Inputs
- Every form control (`<input>`, `<select>`, `<textarea>`) must have an associated `<label>` using `htmlFor="<id>"` or an `aria-label`.

### 6.3 Images & Media
- Every `<img>` tag must include an informative `alt` attribute describing the content, or `alt=""` if strictly decorative.
