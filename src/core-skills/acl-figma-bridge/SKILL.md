---
name: acl-figma-bridge
description: 5-Layer Figma Precision Engine for pixel-perfect (98%+) code generation. Use when given a Figma URL, Figma design, or Figma MCP data to generate UI components.
---

# ACL-ADLC Figma Precision Bridge (5-Layer Engine)

This skill enables agents to translate Figma designs into pixel-perfect (98%+ accuracy) React / Tailwind code without dropping paddings, margins, typography, vector icons, image placements, or overlapping layouts.

## The 5-Layer Precision Pipeline

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

### Layer 5: Visual Self-Correction
- Run the visual audit prompt against the rendered browser output to ensure 100% pixel-perfect compliance before marking the story **Accepted**.
