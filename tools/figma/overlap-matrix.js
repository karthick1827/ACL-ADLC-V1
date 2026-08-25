/**
 * ACL-ADLC Figma Overlap, Z-Index & Edge-Case Matrix Compiler (Layer 3)
 * Detects negative margins, absolute overlays, badge placements, and fixed-width truncations.
 */

const FigmaOverlapMatrix = {
  /**
   * Analyze child nodes inside a frame for overlapping bounding boxes or special constraints
   */
  analyzeNode(node, depth = 0, results = []) {
    if (!node || node.visible === false) return results;

    const isContainer = node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP';

    if (isContainer && Array.isArray(node.children) && node.children.length > 1) {
      const isHorizontal = node.layoutMode === 'HORIZONTAL';
      const isVertical = node.layoutMode === 'VERTICAL';
      const gap = node.itemSpacing || 0;

      // 1. Negative Spacing (Avatar stacks, overlapping chips)
      if (gap < 0) {
        results.push({
          containerId: node.id,
          containerName: node.name,
          issueType: 'NEGATIVE_SPACING_STACK',
          cssResolution: `-space-${isHorizontal ? 'x' : 'y'}-[${Math.abs(gap)}px] flex ${isHorizontal ? 'flex-row' : 'flex-col'}`,
          zIndexRule: 'Sequential z-[1], z-[2], z-[3] on children',
          details: `Detected negative itemSpacing (${gap}px). Stack requires negative margin and incrementing z-index.`,
        });
      }

      // 2. Absolute Overlays (Badges, Floating Action Buttons, Close Icons)
      const nonAutoChildren = node.children.filter((c) => c.isAbsolute || (node.layoutMode === 'NONE' && c.absoluteBoundingBox));
      if (nonAutoChildren.length > 0 && (isHorizontal || isVertical)) {
        for (const child of nonAutoChildren) {
          results.push({
            containerId: node.id,
            containerName: node.name,
            childId: child.id,
            childName: child.name,
            issueType: 'ABSOLUTE_OVERLAY',
            cssResolution: 'Parent needs relative; Child needs absolute top-X right-X z-10',
            zIndexRule: 'z-10 or z-20 overlay',
            details: `Child '${child.name}' is positioned absolutely inside Auto-Layout '${node.name}'.`,
          });
        }
      }

      // 3. Text Truncation and Fixed-Width Clamping
      for (const child of node.children) {
        if (child.type === 'TEXT' && child.textAutoResize === 'NONE') {
          results.push({
            containerId: node.id,
            containerName: node.name,
            childId: child.id,
            childName: child.name,
            issueType: 'FIXED_TEXT_TRUNCATION',
            cssResolution: 'truncate or line-clamp-2 max-w-full',
            zIndexRule: 'none',
            details: `Text '${child.name}' has fixed dimensions. Apply truncate or line-clamp to prevent container blowout.`,
          });
        }
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.analyzeNode(child, depth + 1, results);
      }
    }

    return results;
  },

  /**
   * Generate Markdown Table of Edge-Case Matrix
   */
  toMarkdownTable(matrix) {
    if (!matrix || matrix.length === 0) {
      return '> No complex layout collisions or negative overlaps detected. Standard Flexbox Auto-Layout applies.\n';
    }

    const rows = [
      '| Target Container | Child Element | Issue / Collision Type | Computed CSS Rule | Z-Index / Invariant |',
      '| :--- | :--- | :--- | :--- | :--- |',
    ];

    for (const item of matrix) {
      rows.push(
        '| `' +
          item.containerName +
          '` | `' +
          (item.childName || '-') +
          '` | **' +
          item.issueType +
          '** | `' +
          item.cssResolution +
          '` | ' +
          item.zIndexRule +
          ' |',
      );
    }

    return rows.join('\n');
  },

  /**
   * Compile edge-case matrix from Figma Document
   */
  compile(figmaDoc) {
    const root = figmaDoc.document || figmaDoc;
    const matrix = this.analyzeNode(root);
    const markdownTable = this.toMarkdownTable(matrix);
    return {
      matrix,
      markdownTable,
      totalIssues: matrix.length,
    };
  },
};

module.exports = { FigmaOverlapMatrix };
