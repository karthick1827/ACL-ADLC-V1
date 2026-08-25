---
name: acl-figma-bridge
description: 8-Layer Figma Precision Engine for 100% deterministic, pixel-perfect code generation. Use when given a Figma URL, Figma design, or Figma MCP data to generate UI components.
---

## 🚦 Universal Phase Gate Precondition (Mandatory & Non-Negotiable)
Before executing any actions, adopting any persona, greeting the user, or producing output:
1. Scan all existing markdown files in `_acl-output/` (or run `node tools/adlc-gate-guard.cjs`).
2. If ANY markdown file has `status: In Review` or `status: Rejected` (or is unapproved):
   - **HALT IMMEDIATELY. DO NOT PROCEED. DO NOT ADOPT PERSONA. DO NOT GENERATE FILES.**
   - **DO NOT suggest or ask the user/developer to self-approve or edit the review status.**
   - Output the official waiting message:
     "========================================================================\n⏳ [GATE LOCKED]: Awaiting Manager Sign-Off (ACL-ADLC Protocol)\n========================================================================\n📄 Document in Review: One or more prerequisite documents in _acl-output/ are currently IN REVIEW / PENDING.\n\n⚠️ STATUS:\n   As per the ACL-ADLC sequential delivery framework, this document is currently awaiting official review and sign-off by your Manager.\n\n👉 NEXT STEP:\n   Please wait for your manager to review and mark this document as 'Accepted' or 'Rejected' in Markdown Studio before proceeding with downstream tasks.\n========================================================================"
3. Only proceed if ALL existing documents in `_acl-output/` have `status: Accepted`.



# ACL-ADLC Figma Precision Bridge (8-Layer Engine)

This skill enables agents to translate Figma designs into 100% mathematically and visually accurate React / Tailwind code without dropping paddings, margins, typography baselines, vector icons, image matrix placements, overlapping layouts, interactive variants, or spring dynamics.

## Phase Gate Guard Precondition (Mandatory)
Before generating or modifying UI components or downloading Figma production assets:
1. Verify that Phase 2 (PRD) and Phase 3 (Architecture Spine) are marked `status: Accepted` (or execute `node tools/adlc-gate-guard.cjs phase4`).
2. If prerequisite artifacts are `In Review` or `Rejected`:
   - **HALT IMMEDIATELY. DO NOT GENERATE UI CODE.**
   - Output structured gate blocked error:
     "❌ [ADLC GATE REJECTED / BLOCKED]: Cannot proceed with Figma Code Generation.
      Prerequisite artifacts in Phase 2/3 must be reviewed and marked 'Accepted' by your manager in Markdown Studio before Figma translation can start."

## The 8-Layer Precision Pipeline

When given a Figma URL, Node ID, or raw Figma MCP data:

### Layer 1: AST Normalizer & CSS Box-Model Compiler
- Always run `FigmaCompiler.compile(figmaData)` to extract exact Flexbox/Grid directions, pre-computed paddings (`p-[24px]`, `gap-4`), alignments, borders, and corner radii.
- Never guess coordinates; use the compiled Tailwind/CSS classes directly.

### Layer 2: Automated Asset & Image Placement Engine
- Run `FigmaAssetPipeline.process(figmaData)` to download all vector curves and high-resolution images into `src/assets/figma/` and `public/images/`.
- Run `FigmaImagePlacementEngine.compileImageNode(node)` on every image node to extract:
  1. **Exact Affine Transform Crop (`imageTransform`):** Converts 2x3 matrices into CSS `object-position: X% Y%` / `object-[X%_Y%]`.
  2. **Scale Mode Translation (`scaleMode`):** Maps `FILL` (`object-cover`), `FIT` (`object-contain`), `CROP` (`object-none`).
  3. **Aspect Ratio Lock:** Pre-computes `aspect-[W/H]` so images never stretch or distort across breakpoints.
  4. **Mask Group Resolution:** Calculates relative clipping offsets `(img.x - mask.x, img.y - mask.y)` for multi-layer shape masks.
  5. **Asymmetric Masonry Clustering:** Converts scattered collage coordinates into structured Flex Columns (`w-[274px] h-[382px]`).

### Layer 3: Overlap & Z-Index Invariant Matrix
- Inspect the compiled Overlap Matrix table.
- Apply `-space-x-X` with sequential `z-[1], z-[2]` on avatar stacks.
- Apply `relative` on parent and `absolute top-X right-X z-10` on floating badges and modals.

### Layer 4: Design Tokens & Theme Variables
- Load extracted color hex codes and shadows from `theme.css` or Tailwind extensions.
- Ensure linear gradients match the exact stop percentages and rotation angles.

### Layer 5: Multi-Modal Visual Diffing
- Run the visual audit prompt against the rendered browser output to inspect visual dimensions before code finalization.

### Layer 6: Sub-Pixel Regression & Auto-Tuning Engine
- Run `FigmaPixelDiffEngine.compile(figmaData, liveContext)` to compute pixel-by-pixel SSIM diffs against headless browser snapshots.
- Apply suggested micro-adjustments to eliminate 0.5px–1px sub-pixel rendering shifts until reaching 0px delta.

### Layer 7: OpenType Baseline Normalizer & CDP DOM Reconciler
- Run `FigmaFontMetricsEngine.compile(figmaData)` to compute OpenType font cap-height ascents/descents and CSS `text-box-trim` rules.
- Run `FigmaDOMReconciler.compile(figmaData, liveDomMap)` to verify live DOM `getBoundingClientRect()` with sub-millimeter precision.

### Layer 8: Multi-State Variants & Spring Motion Engine
- Run `FigmaVariantsCompiler.compile(figmaData)` to map component set variants (`hover:`, `active:`, `disabled:`, `dark:`) into typed React props and Tailwind modifiers.
- Run `FigmaMotionEngine.compile(figmaData)` to extract Smart Animate transitions and spring physics (`stiffness`, `damping`, `mass`) into Framer Motion transition props.
