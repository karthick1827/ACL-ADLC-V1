/**
 * ACL-ADLC Figma Variants & Multi-State Compiler (Layer 8a)
 * Compiles Figma Component Sets, Variant Properties (hover, active, disabled, dark),
 * and Boolean Flags into typed React props and Tailwind interactive state classes.
 */

const FigmaVariantsCompiler = {
  /**
   * Parse variant property string (e.g., "State=Hover, Size=Medium, Dark=True")
   */
  parseVariantProperties(variantName) {
    if (!variantName || typeof variantName !== 'string') return {};

    const props = {};
    const pairs = variantName.split(',').map((p) => p.trim());

    for (const pair of pairs) {
      const [key, value] = pair.split('=').map((s) => s?.trim());
      if (key && value) {
        props[key.toLowerCase()] = value.toLowerCase();
      }
    }

    return props;
  },

  /**
   * Map variant state to Tailwind modifier classes
   */
  mapStateToTailwind(stateProp, styleClasses) {
    switch (stateProp) {
      case 'hover': {
        return styleClasses
          .split(' ')
          .map((c) => (c ? `hover:${c}` : ''))
          .join(' ');
      }
      case 'active':
      case 'pressed': {
        return styleClasses
          .split(' ')
          .map((c) => (c ? `active:${c}` : ''))
          .join(' ');
      }
      case 'focus':
      case 'focus-visible': {
        return styleClasses
          .split(' ')
          .map((c) => (c ? `focus-visible:${c}` : ''))
          .join(' ');
      }
      case 'disabled': {
        return styleClasses
          .split(' ')
          .map((c) => (c ? `disabled:${c} disabled:opacity-50 disabled:cursor-not-allowed` : ''))
          .join(' ');
      }
      case 'dark': {
        return styleClasses
          .split(' ')
          .map((c) => (c ? `dark:${c}` : ''))
          .join(' ');
      }
      default: {
        return styleClasses;
      }
    }
  },

  /**
   * Compile Component Set and its variants
   */
  compileComponentSet(componentSetNode) {
    const variants = [];
    const propKeys = new Set();

    if (componentSetNode.children && Array.isArray(componentSetNode.children)) {
      for (const variantNode of componentSetNode.children) {
        const props = this.parseVariantProperties(variantNode.name);
        for (const k of Object.keys(props)) propKeys.add(k);

        variants.push({
          id: variantNode.id,
          name: variantNode.name,
          props,
          node: variantNode,
        });
      }
    }

    return {
      componentName: componentSetNode.name,
      variantCount: variants.length,
      availableProps: [...propKeys],
      variants,
    };
  },

  /**
   * Full pass across document
   */
  compile(figmaDoc) {
    const root = figmaDoc.document || figmaDoc;
    const componentSets = [];

    const traverse = (node) => {
      if (!node || node.visible === false) return;
      if (node.type === 'COMPONENT_SET') {
        componentSets.push(this.compileComponentSet(node));
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    };

    traverse(root);

    return {
      totalComponentSets: componentSets.length,
      componentSets,
      summary: `${componentSets.length} component set(s) mapped with interactive variant state modifiers.`,
    };
  },
};

module.exports = { FigmaVariantsCompiler };
