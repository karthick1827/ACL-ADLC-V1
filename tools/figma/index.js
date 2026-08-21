/**
 * ACL-ADLC 5-Layer Figma Precision Engine
 * Main Unified Entry Point
 */

const { FigmaCompiler } = require('./figma-compiler');
const { FigmaAssetPipeline } = require('./asset-pipeline');
const { FigmaOverlapMatrix } = require('./overlap-matrix');
const { FigmaTokenGenerator } = require('./token-generator');
const { FigmaVisualVerifier } = require('./visual-verifier');
const { FigmaImagePlacementEngine } = require('./image-placement-engine');

class FigmaPrecisionEngine {
  /**
   * Process raw Figma JSON through all precision layers
   */
  static async process(figmaDoc, projectRoot = process.cwd()) {
    // Layer 1: AST Normalizer & CSS Box Model
    const compiledAst = FigmaCompiler.compile(figmaDoc);

    // Layer 2: Asset Pipeline & Local Import Mapper
    const assets = await FigmaAssetPipeline.process(figmaDoc, projectRoot);

    // Layer 3: Overlap & Edge-Case Matrix
    const overlapMatrix = FigmaOverlapMatrix.compile(figmaDoc);

    // Layer 4: Design Tokens & Theme Generator
    const tokens = FigmaTokenGenerator.compile(figmaDoc);

    // Layer 5: Visual Verification Prompt & Spec Generator
    const visionPrompt = FigmaVisualVerifier.generateVisionDiffPrompt(
      figmaDoc.name || 'Component',
      figmaDoc.name || 'Figma Frame',
      tokens.tokens,
    );

    return {
      compiledAst,
      assets,
      overlapMatrix,
      tokens,
      visionPrompt,
      summary: {
        totalLayers: 5,
        totalAssets: assets.totalAssets,
        totalEdgeCases: overlapMatrix.totalIssues,
        totalColors: tokens.tokens.colors.length,
        status: 'READY_FOR_PIXEL_PERFECT_GENERATION',
      },
    };
  }
}

module.exports = {
  FigmaPrecisionEngine,
  FigmaCompiler,
  FigmaAssetPipeline,
  FigmaOverlapMatrix,
  FigmaTokenGenerator,
  FigmaVisualVerifier,
  FigmaImagePlacementEngine,
};
