/**
 * ACL-ADLC Figma AST Normalizer & CSS Box-Model Compiler (Layer 1)
 * Transforms raw Figma node trees into clean, exact CSS and Tailwind classes.
 */

const FigmaCompiler = {
  /**
   * Convert Figma color object (0-1 float) to Hex / RGBA CSS string
   */
  colorToCss(color, opacity = 1) {
    if (!color) return 'transparent';
    const r = Math.round((color.r || 0) * 255);
    const g = Math.round((color.g || 0) * 255);
    const b = Math.round((color.b || 0) * 255);
    const a = color.a === undefined ? opacity : color.a * opacity;

    if (a < 1) {
      return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(2))})`;
    }
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  },

  /**
   * Convert Figma Fill array into CSS background / color
   */
  parseFills(fills) {
    if (!Array.isArray(fills) || fills.length === 0) return { bgCss: 'transparent', bgTailwind: '', isGradient: false };

    const visibleFill = fills.find((f) => f.visible !== false);
    if (!visibleFill) return { bgCss: 'transparent', bgTailwind: '', isGradient: false };

    if (visibleFill.type === 'SOLID') {
      const cssColor = this.colorToCss(visibleFill.color, visibleFill.opacity);
      return {
        bgCss: cssColor,
        bgTailwind: `bg-[${cssColor}]`,
        isGradient: false,
        rawColor: cssColor,
      };
    }

    if (visibleFill.type === 'GRADIENT_LINEAR') {
      const stops = (visibleFill.gradientStops || [])
        .map((s) => {
          const colorStr = this.colorToCss(s.color);
          const pos = Math.round((s.position || 0) * 100);
          return `${colorStr} ${pos}%`;
        })
        .join(', ');

      const gradientCss = `linear-gradient(135deg, ${stops})`;
      return {
        bgCss: gradientCss,
        bgTailwind: `bg-[${gradientCss}]`,
        isGradient: true,
        gradientStops: visibleFill.gradientStops,
      };
    }

    if (visibleFill.type === 'IMAGE') {
      return {
        bgCss: 'transparent',
        bgTailwind: 'bg-cover bg-center',
        isImage: true,
        imageRef: visibleFill.imageRef,
      };
    }

    return { bgCss: 'transparent', bgTailwind: '', isGradient: false };
  },

  /**
   * Convert Figma Stroke array to CSS border
   */
  parseStrokes(strokes, strokeWeight = 1) {
    if (!Array.isArray(strokes) || strokes.length === 0) return { borderCss: 'none', borderTailwind: '' };
    const visibleStroke = strokes.find((s) => s.visible !== false);
    if (!visibleStroke) return { borderCss: 'none', borderTailwind: '' };

    const color = this.colorToCss(visibleStroke.color, visibleStroke.opacity);
    return {
      borderCss: `${strokeWeight}px solid ${color}`,
      borderTailwind: `border border-[${color}]`,
      strokeWeight,
      color,
    };
  },

  /**
   * Convert Figma Effects (Drop Shadow, Inner Shadow, Blur) to CSS
   */
  parseEffects(effects) {
    if (!Array.isArray(effects) || effects.length === 0) return { shadowCss: 'none', shadowTailwind: '', blurCss: '' };

    const shadows = [];
    let blurCss = '';

    for (const effect of effects) {
      if (effect.visible === false) continue;

      if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
        const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : '';
        const x = effect.offset?.x || 0;
        const y = effect.offset?.y || 0;
        const radius = effect.radius || 0;
        const spread = effect.spread || 0;
        const color = this.colorToCss(effect.color);
        shadows.push(`${inset}${x}px ${y}px ${radius}px ${spread}px ${color}`);
      } else if (effect.type === 'BACKGROUND_BLUR' || effect.type === 'LAYER_BLUR') {
        blurCss = `backdrop-blur-[${effect.radius || 8}px]`;
      }
    }

    const shadowCss = shadows.length > 0 ? shadows.join(', ') : 'none';
    return {
      shadowCss,
      shadowTailwind: shadows.length > 0 ? `shadow-[${shadows[0]}]` : '',
      blurCss,
    };
  },

  /**
   * Convert Corner Radius to Tailwind class
   */
  parseCornerRadius(node) {
    if (node.rectangleCornerRadii && Array.isArray(node.rectangleCornerRadii)) {
      const [tl, tr, br, bl] = node.rectangleCornerRadii;
      return {
        radiusCss: `${tl}px ${tr}px ${br}px ${bl}px`,
        radiusTailwind: `rounded-tl-[${tl}px] rounded-tr-[${tr}px] rounded-br-[${br}px] rounded-bl-[${bl}px]`,
      };
    }

    const r = node.cornerRadius || 0;
    if (r === 0) return { radiusCss: '0px', radiusTailwind: '' };
    if (r <= 4) return { radiusCss: `${r}px`, radiusTailwind: 'rounded-sm' };
    if (r <= 6) return { radiusCss: `${r}px`, radiusTailwind: 'rounded' };
    if (r <= 8) return { radiusCss: `${r}px`, radiusTailwind: 'rounded-md' };
    if (r <= 12) return { radiusCss: `${r}px`, radiusTailwind: 'rounded-lg' };
    if (r <= 16) return { radiusCss: `${r}px`, radiusTailwind: 'rounded-xl' };
    if (r <= 24) return { radiusCss: `${r}px`, radiusTailwind: 'rounded-2xl' };
    if (r >= 999) return { radiusCss: '9999px', radiusTailwind: 'rounded-full' };

    return { radiusCss: `${r}px`, radiusTailwind: `rounded-[${r}px]` };
  },

  /**
   * Convert Typography styles to CSS & Tailwind
   */
  parseTypography(style, fills) {
    if (!style) return {};

    const fillInfo = this.parseFills(fills);
    const fontSize = style.fontSize || 16;
    const fontWeight = style.fontWeight || 400;
    const lineHeight = style.lineHeightPx ? `${Math.round(style.lineHeightPx)}px` : 'normal';
    const letterSpacing = style.letterSpacing ? `${Number(style.letterSpacing.toFixed(2))}px` : 'normal';
    const fontFamily = style.fontFamily || 'sans-serif';

    let weightTailwind = 'font-normal';
    if (fontWeight >= 700) weightTailwind = 'font-bold';
    else if (fontWeight >= 600) weightTailwind = 'font-semibold';
    else if (fontWeight >= 500) weightTailwind = 'font-medium';
    else if (fontWeight <= 300) weightTailwind = 'font-light';

    let alignTailwind = 'text-left';
    switch (style.textAlignHorizontal) {
      case 'CENTER': {
        alignTailwind = 'text-center';
        break;
      }
      case 'RIGHT': {
        alignTailwind = 'text-right';
        break;
      }
      case 'JUSTIFIED': {
        {
          alignTailwind = 'text-justify';
          // No default
        }
        break;
      }
    }

    return {
      fontFamily,
      fontSize: `${fontSize}px`,
      fontWeight,
      lineHeight,
      letterSpacing,
      color: fillInfo.rawColor || '#000000',
      tailwindClasses: [
        `text-[${fontSize}px]`,
        weightTailwind,
        style.lineHeightPx ? `leading-[${Math.round(style.lineHeightPx)}px]` : '',
        style.letterSpacing ? `tracking-[${Number(style.letterSpacing.toFixed(2))}px]` : '',
        fillInfo.rawColor ? `text-[${fillInfo.rawColor}]` : '',
        alignTailwind,
      ]
        .filter(Boolean)
        .join(' '),
    };
  },

  /**
   * Convert Figma Auto-Layout to precise Flexbox/Grid CSS and Tailwind
   */
  parseAutoLayout(node) {
    const isAutoLayout = node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL';
    if (!isAutoLayout) {
      return {
        isAutoLayout: false,
        layoutCss: 'display: block; position: relative;',
        layoutTailwind: 'relative block',
      };
    }

    const isHorizontal = node.layoutMode === 'HORIZONTAL';
    const classes = ['flex'];

    // 1. Direction
    classes.push(isHorizontal ? 'flex-row' : 'flex-col');

    // 2. Primary Alignment (Justify)
    switch (node.primaryAxisAlignItems) {
      case 'CENTER': {
        classes.push('justify-center');
        break;
      }
      case 'MAX': {
        classes.push('justify-end');
        break;
      }
      case 'SPACE_BETWEEN': {
        classes.push('justify-between');
        break;
      }
      default: {
        classes.push('justify-start');
      }
    }

    // 3. Counter Alignment (Align Items)
    switch (node.counterAxisAlignItems) {
      case 'CENTER': {
        classes.push('items-center');
        break;
      }
      case 'MAX': {
        classes.push('items-end');
        break;
      }
      case 'BASELINE': {
        classes.push('items-baseline');
        break;
      }
      default: {
        classes.push('items-start');
      }
    }

    // 4. Gap / Item Spacing
    const gap = node.itemSpacing || 0;
    if (gap > 0) {
      switch (gap) {
        case 4: {
          classes.push('gap-1');
          break;
        }
        case 8: {
          classes.push('gap-2');
          break;
        }
        case 12: {
          classes.push('gap-3');
          break;
        }
        case 16: {
          classes.push('gap-4');
          break;
        }
        case 20: {
          classes.push('gap-5');
          break;
        }
        case 24: {
          classes.push('gap-6');
          break;
        }
        case 32: {
          classes.push('gap-8');
          break;
        }
        default: {
          classes.push(`gap-[${gap}px]`);
        }
      }
    } else if (gap < 0) {
      classes.push(`-space-${isHorizontal ? 'x' : 'y'}-[${Math.abs(gap)}px]`);
    }

    // 5. Paddings
    const pt = node.paddingTop || 0;
    const pr = node.paddingRight || 0;
    const pb = node.paddingBottom || 0;
    const pl = node.paddingLeft || 0;

    if (pt === pr && pr === pb && pb === pl && pt > 0) {
      classes.push(`p-[${pt}px]`);
    } else {
      if (pt === pb && pt > 0) classes.push(`py-[${pt}px]`);
      else {
        if (pt > 0) classes.push(`pt-[${pt}px]`);
        if (pb > 0) classes.push(`pb-[${pb}px]`);
      }

      if (pr === pl && pr > 0) classes.push(`px-[${pr}px]`);
      else {
        if (pl > 0) classes.push(`pl-[${pl}px]`);
        if (pr > 0) classes.push(`pr-[${pr}px]`);
      }
    }

    // 6. Sizing & Grow/Shrink
    if (node.layoutGrow === 1) classes.push('flex-1');
    if (node.layoutAlign === 'STRETCH') classes.push('self-stretch');

    if (node.clipsContent) classes.push('overflow-hidden');

    return {
      isAutoLayout: true,
      direction: isHorizontal ? 'row' : 'column',
      gap,
      padding: { top: pt, right: pr, bottom: pb, left: pl },
      layoutTailwind: classes.join(' '),
    };
  },

  /**
   * Compile a Figma node recursively into a clean Design Model
   */
  compileNode(node, depth = 0) {
    if (!node || node.visible === false) return null;

    const fills = this.parseFills(node.fills);
    const strokes = this.parseStrokes(node.strokes, node.strokeWeight);
    const effects = this.parseEffects(node.effects);
    const radius = this.parseCornerRadius(node);
    const layout = this.parseAutoLayout(node);
    const typography = node.type === 'TEXT' ? this.parseTypography(node.style, node.fills) : null;

    // Combine all Tailwind classes for this node
    const combinedClasses = [
      layout.layoutTailwind,
      fills.bgTailwind,
      strokes.borderTailwind,
      effects.shadowTailwind,
      effects.blurCss,
      radius.radiusTailwind,
      typography ? typography.tailwindClasses : '',
    ]
      .filter(Boolean)
      .join(' ');

    const compiled = {
      id: node.id,
      name: node.name,
      type: node.type,
      depth,
      bounds: node.absoluteBoundingBox
        ? {
            width: Math.round(node.absoluteBoundingBox.width),
            height: Math.round(node.absoluteBoundingBox.height),
          }
        : null,
      tailwindClasses: combinedClasses,
      layout,
      fills,
      strokes,
      effects,
      radius,
      typography,
      children: [],
    };

    if (Array.isArray(node.children)) {
      compiled.children = node.children.map((child) => this.compileNode(child, depth + 1)).filter(Boolean);
    }

    return compiled;
  },

  /**
   * Compile whole Figma Document / Canvas
   */
  compile(figmaDoc) {
    if (!figmaDoc) return null;
    const rootNode = figmaDoc.document || figmaDoc;
    return this.compileNode(rootNode);
  },
};

module.exports = { FigmaCompiler };
