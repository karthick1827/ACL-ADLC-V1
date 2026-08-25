/**
 * ACL-ADLC OpenType Font Metrics & Baseline Normalizer (Layer 7a)
 * Extracts exact font ascender, descender, cap-height, and computes
 * CSS leading-trim / text-box-trim rules to lock text baselines without 1px web shifting.
 */

const FigmaFontMetricsEngine = {
  /**
   * Known standard OpenType metric ratios for common UI fonts
   */
  getFontMetrics(fontFamily = 'Inter') {
    const registry = {
      Inter: { unitsPerEm: 2048, ascender: 1984, descender: -494, capHeight: 1490, xHeight: 1118 },
      Roboto: { unitsPerEm: 2048, ascender: 1900, descender: -500, capHeight: 1456, xHeight: 1082 },
      'Fira Code': { unitsPerEm: 1000, ascender: 950, descender: -250, capHeight: 700, xHeight: 520 },
      'SF Pro Display': { unitsPerEm: 1000, ascender: 980, descender: -220, capHeight: 720, xHeight: 530 },
      'Plus Jakarta Sans': { unitsPerEm: 1000, ascender: 970, descender: -260, capHeight: 710, xHeight: 520 },
    };

    const cleanName = fontFamily.replaceAll(/['"]/g, '').trim();
    return registry[cleanName] || registry['Inter'];
  },

  /**
   * Compute exact baseline correction offsets and CSS leading-trim rules
   */
  computeBaselineCorrection(fontSize = 16, lineHeightPx = 24, fontFamily = 'Inter') {
    const metrics = this.getFontMetrics(fontFamily);
    const scale = fontSize / metrics.unitsPerEm;
    const actualCapHeightPx = metrics.capHeight * scale;
    const actualAscenderPx = metrics.ascender * scale;
    const halfLeading = (lineHeightPx - fontSize) / 2;

    // Top trim and bottom trim compensations
    const topTrimPx = Number((actualAscenderPx - actualCapHeightPx - halfLeading).toFixed(2));
    const bottomTrimPx = Number((halfLeading - Math.abs(metrics.descender * scale)).toFixed(2));

    return {
      fontFamily,
      fontSize,
      lineHeightPx,
      actualCapHeightPx: Number(actualCapHeightPx.toFixed(2)),
      topTrimPx,
      bottomTrimPx,
      cssProperties: {
        textBoxTrim: 'both',
        textBoxEdge: 'cap alphabetic',
        // Fallback margin trims for older browser engines
        fallbackMarginTop: `${-topTrimPx}px`,
        fallbackMarginBottom: `${-bottomTrimPx}px`,
      },
      tailwindClass: `leading-[${lineHeightPx}px] text-[${fontSize}px] tracking-normal`,
    };
  },

  /**
   * Scan node tree and generate typography baseline rules
   */
  compile(figmaDoc) {
    const root = figmaDoc.document || figmaDoc;
    const textRules = [];

    const traverse = (node) => {
      if (!node || node.visible === false) return;
      if (node.type === 'TEXT' && node.style) {
        const correction = this.computeBaselineCorrection(
          node.style.fontSize || 16,
          node.style.lineHeightPx || 24,
          node.style.fontFamily || 'Inter',
        );
        textRules.push({
          nodeId: node.id,
          nodeName: node.name,
          ...correction,
        });
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(root);

    return {
      totalTextNodes: textRules.length,
      textRules,
      summary: 'OpenType baseline trims computed with cap-height alphabetic alignment.',
    };
  },
};

module.exports = { FigmaFontMetricsEngine };
