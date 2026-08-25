/**
 * ACL-ADLC Spring Physics & Motion Engine (Layer 8b)
 * Compiles Figma Smart Animate transitions, cubic-bezier curves, and spring dynamics
 * into Framer Motion transition props and Tailwind transition classes.
 */

const FigmaMotionEngine = {
  /**
   * Translate Figma easing type to CSS cubic-bezier / Tailwind transition
   */
  parseEasing(easing) {
    if (!easing) return { cssTiming: 'ease', tailwindEasing: 'ease-out', framerEase: 'easeInOut' };

    switch (easing.type) {
      case 'EASE_IN': {
        return { cssTiming: 'ease-in', tailwindEasing: 'ease-in', framerEase: 'easeIn' };
      }
      case 'EASE_OUT': {
        return { cssTiming: 'ease-out', tailwindEasing: 'ease-out', framerEase: 'easeOut' };
      }
      case 'EASE_IN_AND_OUT': {
        return { cssTiming: 'ease-in-out', tailwindEasing: 'ease-in-out', framerEase: 'easeInOut' };
      }
      case 'LINEAR': {
        return { cssTiming: 'linear', tailwindEasing: 'linear', framerEase: 'linear' };
      }
      case 'CUSTOM_CUBIC_BEZIER': {
        const { x1, y1, x2, y2 } = easing.cubicBezier || { x1: 0.4, y1: 0, x2: 0.2, y2: 1 };
        return {
          cssTiming: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`,
          tailwindEasing: `[transition-timing-function:cubic-bezier(${x1},${y1},${x2},${y2})]`,
          framerEase: [x1, y1, x2, y2],
        };
      }
      default: {
        return { cssTiming: 'cubic-bezier(0.4, 0, 0.2, 1)', tailwindEasing: 'ease-out', framerEase: 'easeInOut' };
      }
    }
  },

  /**
   * Convert Figma Spring physics parameters to Framer Motion spring object
   */
  parseSpringDynamics(spring) {
    const mass = spring?.mass || 1;
    const stiffness = spring?.stiffness || 300;
    const damping = spring?.damping || 25;

    return {
      type: 'spring',
      mass,
      stiffness,
      damping,
      framerCode: `transition={{ type: 'spring', mass: ${mass}, stiffness: ${stiffness}, damping: ${damping} }}`,
    };
  },

  /**
   * Compile motion and interaction metadata from prototype transitions
   */
  compile(figmaDoc) {
    const root = figmaDoc.document || figmaDoc;
    const transitions = [];

    const traverse = (node) => {
      if (!node || node.visible === false) return;
      if (node.transitionNodeID || node.transitionDuration || node.transitionEasing) {
        const durationMs = Math.round((node.transitionDuration || 0.3) * 1000);
        const easing = this.parseEasing(node.transitionEasing);

        transitions.push({
          nodeId: node.id,
          nodeName: node.name,
          targetNodeId: node.transitionNodeID,
          durationMs,
          easing,
          tailwindTransition: `transition-all duration-[${durationMs}ms] ${easing.tailwindEasing}`,
          framerTransition: {
            duration: durationMs / 1000,
            ease: easing.framerEase,
          },
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
      totalTransitions: transitions.length,
      transitions,
      defaultSpring: this.parseSpringDynamics({ mass: 1, stiffness: 320, damping: 28 }),
      summary: `${transitions.length} micro-interaction transition(s) compiled with spring physics and easing curves.`,
    };
  },
};

module.exports = { FigmaMotionEngine };
