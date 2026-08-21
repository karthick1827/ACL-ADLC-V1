/**
 * ACL-ADLC Figma Image Placement & Geometry Compiler
 * Computes exact affine transform focal points, object-position percentages,
 * mask group relative offsets, aspect ratios, and masonry geometry.
 */

class FigmaImagePlacementEngine {
  /**
   * Translate Figma 2x3 affine imageTransform matrix into CSS object-position percentage
   * Figma matrix format: [[scaleX, skewX, transX], [skewY, scaleY, transY]]
   */
  static parseImageTransform(imageTransform) {
    if (!Array.isArray(imageTransform) || imageTransform.length < 2) {
      return { objectPosition: 'center', tailwindPosition: 'object-center', focalX: 50, focalY: 50 };
    }

    const [[scaleX, skewX, transX], [skewY, scaleY, transY]] = imageTransform;

    // In Figma affine transforms, translation represents normalized crop offset
    let focalX = Math.round(Math.abs(transX || 0) * 100);
    let focalY = Math.round(Math.abs(transY || 0) * 100);

    // Default bounds check
    if (focalX === 0 && focalY === 0) {
      return { objectPosition: 'center', tailwindPosition: 'object-center', focalX: 50, focalY: 50 };
    }

    focalX = Math.min(100, Math.max(0, focalX));
    focalY = Math.min(100, Math.max(0, focalY));

    return {
      objectPosition: `${focalX}% ${focalY}%`,
      tailwindPosition: `object-[${focalX}%_${focalY}%]`,
      focalX,
      focalY,
    };
  }

  /**
   * Parse scaleMode (FILL, FIT, CROP, TILE) into CSS object-fit & rules
   */
  static parseScaleMode(scaleMode) {
    switch (scaleMode) {
      case 'FIT':
        return { objectFit: 'contain', tailwindFit: 'object-contain' };
      case 'CROP':
        return { objectFit: 'none', tailwindFit: 'object-none' };
      case 'TILE':
        return { objectFit: 'repeat', tailwindFit: 'bg-repeat' };
      case 'FILL':
      default:
        return { objectFit: 'cover', tailwindFit: 'object-cover' };
    }
  }

  /**
   * Compute exact aspect ratio from node bounding box
   */
  static parseAspectRatio(bounds) {
    if (!bounds || !bounds.width || !bounds.height) return null;
    const w = Math.round(bounds.width);
    const h = Math.round(bounds.height);

    // Reduce fraction
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(w, h);
    const aspectW = Math.round(w / divisor);
    const aspectH = Math.round(h / divisor);

    return {
      width: w,
      height: h,
      aspectRatio: `${aspectW} / ${aspectH}`,
      tailwindAspect: `aspect-[${w}/${h}]`,
    };
  }

  /**
   * Analyze Mask Groups: Bounding container vs Inner Image offsets
   */
  static parseMaskGroup(maskNode, imageNode) {
    if (!maskNode || !imageNode) return null;

    const maskBox = maskNode.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
    const imgBox = imageNode.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };

    const offsetX = Math.round(imgBox.x - maskBox.x);
    const offsetY = Math.round(imgBox.y - maskBox.y);
    const scaleWidth = Math.round(imgBox.width);
    const scaleHeight = Math.round(imgBox.height);

    return {
      container: {
        width: Math.round(maskBox.width),
        height: Math.round(maskBox.height),
        overflow: 'hidden',
        position: 'relative',
      },
      imagePlacement: {
        width: scaleWidth,
        height: scaleHeight,
        transform: `translate(${offsetX}px, ${offsetY}px)`,
        tailwindClasses: `absolute left-[${offsetX}px] top-[${offsetY}px] max-w-none w-[${scaleWidth}px] h-[${scaleHeight}px]`,
      },
    };
  }

  /**
   * Compile Asymmetric Masonry Clusters into ordered Flex Columns
   */
  static compileMasonryCluster(nodes, gap = 16) {
    if (!Array.isArray(nodes) || nodes.length === 0) return { columns: [] };

    // Group nodes by X coordinate proximity (within 30px threshold)
    const sorted = [...nodes].sort((a, b) => (a.absoluteBoundingBox?.x || 0) - (b.absoluteBoundingBox?.x || 0));
    const columns = [];
    let currentColumn = [];
    let currentX = null;

    for (const node of sorted) {
      const box = node.absoluteBoundingBox || { x: 0, y: 0, width: 200, height: 200 };
      if (currentX === null || Math.abs(box.x - currentX) < 40) {
        currentColumn.push(node);
        if (currentX === null) currentX = box.x;
      } else {
        // Sort items inside column vertically by Y coordinate
        currentColumn.sort((a, b) => (a.absoluteBoundingBox?.y || 0) - (b.absoluteBoundingBox?.y || 0));
        columns.push(currentColumn);
        currentColumn = [node];
        currentX = box.x;
      }
    }

    if (currentColumn.length > 0) {
      currentColumn.sort((a, b) => (a.absoluteBoundingBox?.y || 0) - (b.absoluteBoundingBox?.y || 0));
      columns.push(currentColumn);
    }

    return {
      totalColumns: columns.length,
      columns: columns.map((col, idx) => ({
        columnIndex: idx + 1,
        itemCount: col.length,
        items: col.map((item) => ({
          name: item.name,
          id: item.id,
          width: Math.round(item.absoluteBoundingBox?.width || 0),
          height: Math.round(item.absoluteBoundingBox?.height || 0),
          aspectRatio: this.parseAspectRatio(item.absoluteBoundingBox),
          tailwindClass: `w-[${Math.round(item.absoluteBoundingBox?.width || 0)}px] h-[${Math.round(item.absoluteBoundingBox?.height || 0)}px] object-cover rounded-md`,
        })),
      })),
    };
  }

  /**
   * Process a node's image fill with complete placement metadata
   */
  static compileImageNode(node) {
    if (!node) return null;
    const imgFill = Array.isArray(node.fills) ? node.fills.find((f) => f.type === 'IMAGE') : null;
    if (!imgFill) return null;

    const scale = this.parseScaleMode(imgFill.scaleMode);
    const transform = this.parseImageTransform(imgFill.imageTransform);
    const aspect = this.parseAspectRatio(node.absoluteBoundingBox);

    const tailwindClasses = ['w-full', 'h-full', scale.tailwindFit, transform.tailwindPosition, aspect ? aspect.tailwindAspect : '']
      .filter(Boolean)
      .join(' ');

    return {
      nodeId: node.id,
      nodeName: node.name,
      imageRef: imgFill.imageRef,
      scale,
      transform,
      aspect,
      tailwindClasses,
      style: {
        objectFit: scale.objectFit,
        objectPosition: transform.objectPosition,
      },
    };
  }
}

module.exports = { FigmaImagePlacementEngine };
