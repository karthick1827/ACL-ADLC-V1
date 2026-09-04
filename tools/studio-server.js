const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PORT = 3333;
const SAMPLE_DIR = path.resolve('C:/Users/karthick.natarajan/sample');
const PROJECT_ROOT = process.env.ACL_PROJECT_ROOT || (fs.existsSync(SAMPLE_DIR) ? SAMPLE_DIR : process.cwd());
const ACL_OUTPUT_DIR = path.join(PROJECT_ROOT, '_acl-output');

// Recursive scanner for .md files on disk
function getDiskMarkdownFiles() {
  const list = [];
  if (!fs.existsSync(ACL_OUTPUT_DIR)) {
    fs.mkdirSync(ACL_OUTPUT_DIR, { recursive: true });
  }

  const seenPaths = new Set();

  function scan(dir, relPath) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name === 'markdown.html' ||
        entry.name === 'src' ||
        entry.name === 'tools' ||
        entry.name === 'docs'
      )
        continue;
      const full = path.join(dir, entry.name);
      const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scan(full, rel);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !entry.name.startsWith('.') &&
        ![
          'skill.md',
          'agents.md',
          'readme.md',
          'changelog.md',
          'claude.md',
          'contributing.md',
          'security.md',
          'addendum.md',
          'sources.md',
          'review-triage.md',
          'patch-plan.md',
          'research.md',
        ].includes(entry.name.toLowerCase())
      ) {
        if (seenPaths.has(full)) continue;
        seenPaths.add(full);

        const content = fs.readFileSync(full, 'utf8');
        const stat = fs.statSync(full);
        let status = 'In Review';
        const match = content.match(/status:\s*([^\n\r]+)/i);
        if (match && match[1]) {
          const raw = match[1].trim().toLowerCase();
          if (raw.includes('accept') || raw.includes('approved') || raw.includes('final')) status = 'Approved';
          else if (raw.includes('reject')) status = 'Rejected';
          else status = 'In Review';
        }
        const folderPath = path.dirname(rel).replaceAll('\\', '/');
        list.push({
          id: rel.replaceAll(/[^a-zA-Z0-9_-]/g, '_'),
          folderPath: folderPath === '.' ? 'root' : folderPath,
          filename: entry.name,
          fullPath: rel,
          status: status,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
          content: content,
          diskPath: full,
        });
      }
    }
  }

  // Scan exclusively _acl-output/
  scan(ACL_OUTPUT_DIR, '');
  return list;
}

// ============================================================================
// Intelligent Upstream Context Analyzer & Figma Bridge Deliverable Synthesizer
// ============================================================================

function readUpstreamArtifacts() {
  const artifacts = {
    projectContext: null,
    brief: null,
    prd: null,
    architecture: null,
    ux: null,
    epics: null,
  };

  const files = getDiskMarkdownFiles();

  for (const file of files) {
    const lowerPath = file.fullPath.toLowerCase();
    const lowerName = file.filename.toLowerCase();

    if ((lowerPath.includes('brief') || lowerName.includes('brief')) && !artifacts.brief) {
      artifacts.brief = { relPath: file.fullPath, content: file.content };
    } else if ((lowerPath.includes('prd') || lowerName.includes('prd')) && !artifacts.prd) {
      artifacts.prd = { relPath: file.fullPath, content: file.content };
    } else if ((lowerPath.includes('architecture') || lowerName.includes('architecture')) && !artifacts.architecture) {
      artifacts.architecture = { relPath: file.fullPath, content: file.content };
    } else if ((lowerPath.includes('ux') || lowerName.includes('ux') || lowerPath.includes('design')) && !artifacts.ux) {
      artifacts.ux = { relPath: file.fullPath, content: file.content };
    } else if ((lowerPath.includes('epic') || lowerName.includes('epic')) && !artifacts.epics) {
      artifacts.epics = { relPath: file.fullPath, content: file.content };
    } else if ((lowerPath.includes('context') || lowerName.includes('context')) && !artifacts.projectContext) {
      artifacts.projectContext = { relPath: file.fullPath, content: file.content };
    }
  }

  return artifacts;
}

function parseEpicsAndStories(md) {
  if (!md) return [];
  const epics = [];
  const epicRegex = /##\s+Epic\s+(\d+)[:\s]+([^\r\n]+)/gi;
  let match;
  const epicMatches = [];
  while ((match = epicRegex.exec(md)) !== null) {
    epicMatches.push({ num: Number.parseInt(match[1], 10), title: match[2].trim(), index: match.index });
  }

  for (let i = 0; i < epicMatches.length; i++) {
    const current = epicMatches[i];
    const nextIndex = i + 1 < epicMatches.length ? epicMatches[i + 1].index : md.length;
    const epicSection = md.slice(current.index, nextIndex);

    const storyRegex = /-\s+\*\*Story\s+(\d+\.\d+)[:*]+\s*([^\r\n]+)([\s\S]*?)(?=(?:-\s+\*\*Story|\n##|$))/gi;
    let storyMatch;
    const stories = [];
    while ((storyMatch = storyRegex.exec(epicSection)) !== null) {
      const storyId = storyMatch[1];
      const storyTitle = storyMatch[2].replaceAll('*', '').trim();
      const storyBody = storyMatch[3] || '';

      const tasksMatch = storyBody.match(/\*Tasks\*[:\s]+([^\r\n]+)/i);
      const acMatch = storyBody.match(/\*Acceptance Criteria\*[:\s]+([^\r\n]+)/i);

      stories.push({
        id: storyId,
        epicNum: current.num,
        epicTitle: current.title,
        title: storyTitle,
        tasks: tasksMatch ? tasksMatch[1].trim() : 'Implement component layout and tokens in src/components/',
        acceptanceCriteria: acMatch ? acMatch[1].trim() : 'Visually identical to Figma spec with sub-200ms latency',
      });
    }

    epics.push({
      epicNum: current.num,
      title: current.title,
      stories: stories,
    });
  }
  return epics;
}

function getImplementationProgress() {
  const upstream = readUpstreamArtifacts();
  const epicsContent = upstream.epics ? upstream.epics.content : null;
  const epicsList = parseEpicsAndStories(epicsContent);

  const allStories = [];
  for (const epic of epicsList) {
    for (const story of epic.stories) {
      allStories.push(story);
    }
  }

  const diskFiles = getDiskMarkdownFiles();
  const implFiles = diskFiles.filter(
    (f) => f.folderPath.includes('4-implementation') || f.filename.includes('story-') || f.filename.includes('step-'),
  );

  const storyStatusMap = {};
  for (const file of implFiles) {
    const match = file.filename.match(/story-(\d+\.\d+)/i) || file.content.match(/story_id:\s*"?(\d+\.\d+)"?/i);
    if (match) {
      const storyId = match[1];
      storyStatusMap[storyId] = {
        storyId: storyId,
        file: file,
        status: file.status,
      };
    }
  }

  let nextStoryToGenerate = null;
  let activeStory = null;
  let gateLocked = false;
  let gateReason = '';

  for (let i = 0; i < allStories.length; i++) {
    const story = allStories[i];
    const existing = storyStatusMap[story.id];

    if (existing) {
      activeStory = { ...story, ...existing };
      if (existing.status !== 'Approved') {
        gateLocked = true;
        gateReason = `Story ${story.id} is currently ${existing.status}. Manager sign-off is required.`;
        break;
      }
    } else {
      if (i === 0) {
        nextStoryToGenerate = story;
      } else {
        const prevStory = allStories[i - 1];
        const prevExisting = storyStatusMap[prevStory.id];
        if (prevExisting && prevExisting.status === 'Approved') {
          nextStoryToGenerate = story;
        } else {
          gateLocked = true;
          gateReason = `Story ${prevStory.id} must be Approved before Story ${story.id} can be generated.`;
        }
      }
      break;
    }
  }

  return {
    epics: epicsList,
    allStories: allStories,
    generatedCount: Object.keys(storyStatusMap).length,
    totalCount: allStories.length,
    activeStory: activeStory,
    nextStoryToGenerate: nextStoryToGenerate,
    gateLocked: gateLocked,
    gateReason: gateReason,
    allCompleted:
      allStories.length > 0 &&
      Object.keys(storyStatusMap).length === allStories.length &&
      allStories.every((s) => storyStatusMap[s.id] && storyStatusMap[s.id].status === 'Approved'),
  };
}

function parseDocumentSections(rawContent) {
  if (!rawContent) return null;

  let body = rawContent;
  if (body.startsWith('---')) {
    const parts = body.split('---');
    if (parts.length >= 3) {
      body = parts.slice(2).join('---').trim();
    }
  }

  const titleMatch = body.match(/^#\s+([^\r\n]+)/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Project Delivery';

  const figmaRegex = /https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\/([a-zA-Z0-9_-]+)[^\s)"]*/gi;
  const figmaLinks = [...new Set(body.match(figmaRegex) || [])];

  const hexRegex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  const colorTokens = [...new Set(body.match(hexRegex) || [])];

  const bulletPoints = [];
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s+/.test(trimmed)) {
      const clean = trimmed.replace(/^[-*]|\d+\./, '').trim();
      if (clean.length > 5 && !clean.startsWith('[ ]') && !clean.startsWith('[x]')) {
        bulletPoints.push(clean);
      }
    }
  }

  // Extract paragraphs for summary
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('-') && !p.startsWith('*') && !p.startsWith('```') && p.length > 20);

  const summary = paragraphs.length > 0 ? paragraphs[0] : 'High-impact feature delivery aligned with verified design specifications.';

  return {
    raw: rawContent,
    body: body,
    title: title,
    summary: summary,
    figmaLinks: figmaLinks,
    colorTokens: colorTokens,
    features: bulletPoints.slice(0, 12),
  };
}

function generateDeliverableTemplate(stepKey, mode = 'greenfield', defaultTitle = 'Project Delivery', options = {}) {
  const nowIso = new Date().toISOString();
  const isBrownfield = (mode || '').toLowerCase() === 'brownfield';
  const modeLabel = isBrownfield ? 'Brownfield' : 'Greenfield';

  const upstream = readUpstreamArtifacts();
  const briefData = parseDocumentSections(upstream.brief ? upstream.brief.content : null);
  const prdData = parseDocumentSections(upstream.prd ? upstream.prd.content : null);
  const archData = parseDocumentSections(upstream.architecture ? upstream.architecture.content : null);
  const uxData = parseDocumentSections(upstream.ux ? upstream.ux.content : null);

  const projectTitle = (briefData && briefData.title) || (prdData && prdData.title) || defaultTitle;
  const projectSummary =
    (briefData && briefData.summary) || (prdData && prdData.summary) || 'High-precision delivery aligned with verified specifications.';

  const allFigmaLinks = [
    ...new Set([...(briefData ? briefData.figmaLinks : []), ...(prdData ? prdData.figmaLinks : []), ...(uxData ? uxData.figmaLinks : [])]),
  ];

  const featuresList = (briefData && briefData.features.length > 0 && briefData.features) ||
    (prdData && prdData.features.length > 0 && prdData.features) || [
      'Interactive User Interface with responsive multi-breakpoint fidelity',
      'Secure data handling with localized state and persistence synchronization',
      'End-to-end component validation conforming to verified design specs',
    ];

  switch (stepKey) {
    case 'project_context': {
      return {
        folderPath: '0-context/acl-generate-project-context',
        filename: 'project-context.md',
        phaseName: 'Phase 0: Context Discovery',
        content: `---
status: In Review
phase: Phase 0 - Codebase Context Discovery
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Project Context & Codebase Conventions (${modeLabel})

## 1. Executive Summary
- **Project**: ${projectTitle}
- **Overview**: Codebase baseline discovery and established convention mapping.
- **Goal**: Enable structured, agent-assisted delivery adhering strictly to repository architecture.

## 2. Technology Stack & Runtime Standards
- **Runtime / Language**: TypeScript / Node.js
- **Frontend Framework**: React, Modern Component Architecture, Tailwind CSS / CSS Modules
- **State Management & Data Layer**: React Hooks, Context API / Local State, REST & JSON APIs
- **Tooling & Code Quality**: Prettier, ESLint, conventional commits, automated validation

## 3. Directory Layout & Key Conventions
- \`/src/components\`: UI design system and atomic components.
- \`/src/hooks\`: Custom React hooks for data management and lifecycle flows.
- \`/src/services\`: API client handlers and backend integration.
- \`/src/types\`: Centralized TypeScript interfaces and domain schemas.
- \`/src/assets/figma\`: Vector assets, icons, and media extracted via Figma Bridge.

## 4. Invariants & Delivery Boundaries
- Never bypass existing validation layers or state stores.
- Downstream deliverables require explicit Manager approval in Markdown Studio.
- Zero-regression policy on existing codebase APIs.
`,
      };
    }

    case 'brief': {
      const figmaSection =
        allFigmaLinks.length > 0
          ? allFigmaLinks.map((l) => `- [Figma Design Reference](${l})`).join('\n')
          : '- [Figma Design File](https://www.figma.com/file/sample-project-spec)';

      return {
        folderPath: '1-analysis/acl-product-brief',
        filename: 'brief.md',
        phaseName: 'Phase 1: Analysis (Product Brief)',
        content: `---
status: In Review
phase: Phase 1 - Analysis (Product Brief)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Product Brief: ${projectTitle}

## 1. Executive Summary & Problem Statement
- **Project**: ${projectTitle} (${modeLabel})
- **Overview**: ${projectSummary}
- **Problem Statement**: Target users require a seamless, intuitive interface with high reliability and zero-friction execution.

## 2. Figma Design References & Visual Specification
${figmaSection}

## 3. Target Users & Personas
- **Primary Persona**: End users seeking streamlined workflow execution and interactive responsiveness.
- **Secondary Persona**: Product Managers & Reviewers verifying adherence to business and UX goals.

## 4. Key Features & Core Capabilities
${featuresList.map((f, i) => `${i + 1}. **${f.replaceAll('**', '')}**`).join('\n')}

## 5. Success Metrics & Quality Criteria
- 100% adherence to Figma design tokens and component hierarchy.
- Sub-200ms interaction latency for critical user actions.
- Zero breaking changes to existing flows.

## 6. Next Steps
- Awaiting Manager sign-off in Markdown Studio before proceeding to Phase 2 (PRD).
`,
      };
    }

    case 'prd': {
      const figmaSection =
        allFigmaLinks.length > 0
          ? allFigmaLinks.map((l) => `- **Design Source**: [Figma Spec](${l})`).join('\n')
          : '- **Design Source**: Integrated with Figma Design Tokens and Component Specs';

      const storiesMd = featuresList
        .map(
          (f, idx) => `### Story ${idx + 1}: ${f.slice(0, 60)}
- **As a** user,
- **I want to** experience ${f.toLowerCase()},
- **So that** I can complete my tasks efficiently and accurately.
- **Acceptance Criteria**:
  - [ ] GIVEN the user navigates to the interface, WHEN interacting with this feature, THEN the system responds within 200ms with verified visual state.
  - [ ] GIVEN invalid input or edge case, WHEN submitted, THEN actionable validation feedback is displayed.
`,
        )
        .join('\n');

      const frsMd = featuresList
        .map((f, idx) => `- **FR-${idx + 1}**: System must implement ${f.toLowerCase()} matching verified Figma screen specs.`)
        .join('\n');

      return {
        folderPath: '2-plan-workflows/acl-prd',
        filename: 'prd.md',
        phaseName: 'Phase 2: Planning (PRD)',
        content: `---
status: In Review
phase: Phase 2 - Planning (PRD)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Product Requirements Document (PRD): ${projectTitle}

## 1. Document Control & Overview
- **Document Status**: \`In Review\` (Awaiting Manager Sign-off)
- **Prerequisite**: Phase 1 Product Brief (\`brief.md\`) - Approved
- **Workflow Mode**: ${modeLabel}
- **Executive Summary**: ${projectSummary}

## 2. Figma Design Specification & UI Mapping
${figmaSection}
- **Design Fidelity Engine**: \`acl-figma-bridge\` (8-Layer Precision Mapping)
- **Target Viewports**: Desktop (1280px+), Tablet (768px), Mobile (375px)

## 3. User Stories & Acceptance Criteria
${storiesMd}

## 4. Functional Requirements (FRs)
${frsMd}

## 5. Non-Functional Requirements (NFRs)
- **Performance**: Initial screen render < 1.0s; interactive actions < 200ms.
- **Visual Accuracy**: 100% pixel alignment with Figma design tokens, spacing scale, and corner radii.
- **Accessibility**: WCAG 2.1 Level AA compliance (minimum 4.5:1 text contrast ratio, keyboard navigability).
- **Security & Reliability**: Robust input sanitization and zero-downtime client-side state handling.

## 6. Phase Gate Invariant
- Downstream solutioning (Architecture Spine and UX Design System) is locked until this PRD is marked \`Approved\` by the Manager.
`,
      };
    }

    case 'architecture': {
      let archFolder = '3-solutioning/acl-architecture';
      const sampleArchDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'architecture');
      if (fs.existsSync(sampleArchDir)) {
        const subdirs = fs.readdirSync(sampleArchDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        if (subdirs.length > 0) {
          archFolder = `planning-artifacts/architecture/${subdirs[0].name}`;
        } else {
          archFolder = 'planning-artifacts/architecture';
        }
      }

      const entityModels = featuresList
        .slice(0, 4)
        .map((f, idx) => {
          const name = f.replaceAll(/[^a-zA-Z]/g, '').slice(0, 15) || `Entity${idx + 1}`;
          const pascal = name.charAt(0).toUpperCase() + name.slice(1);
          return `interface ${pascal}Model {
  id: string;
  title: string;
  status: 'active' | 'pending' | 'completed';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}`;
        })
        .join('\n\n');

      const capabilityRows = featuresList
        .slice(0, 4)
        .map((f, idx) => {
          const slug = f
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, '-')
            .slice(0, 20);
          return `| CAP-${idx + 1}: ${f.slice(0, 35)} | \`src/components/${slug}\` | AD-${(idx % 3) + 1}, Naming Convention |`;
        })
        .join('\n');

      return {
        folderPath: archFolder,
        filename: 'architecture.md',
        phaseName: 'Phase 3A: Solutioning (Architecture)',
        content: `---
name: "${projectTitle}"
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: "Component-Centric Layered Architecture (React + Tailwind + Local State Sync)"
scope: "${projectTitle}"
status: In Review
created: "${nowIso}"
updated: "${nowIso}"
reviewed_by: Pending Manager Review
---

# Architecture Spine — ${projectTitle}

## Design Paradigm

The system adopts a **Decoupled Layered Architecture** separating presentation components, local reactive state controllers, and synchronized disk/API adapters.

\`\`\`mermaid
graph TD
    UI[Presentation Layer: React / Tailwind] --> State[State Layer: Context & Hooks]
    State --> Client[API Client & Storage Adapters]
    Client --> Disk[Local Disk / Remote Service API]
\`\`\`

## Invariants & Rules

### AD-1 — Strict Presentation & State Boundary Decoupling
- **Binds:** \`src/components/*\`, \`src/hooks/*\`
- **Prevents:** Direct disk or raw asynchronous fetches embedded within presentation components.
- **Rule:** UI components must receive reactive state and event handlers strictly via custom React hooks or Context providers.

### AD-2 — Atomic State Synchronization & Gate Guard
- **Binds:** All data mutations and deliverable file updates
- **Prevents:** Partial disk writes, corrupted JSON metadata, or unapproved stage bypassing.
- **Rule:** File operations must verify upstream gate approval (\`status: Approved\`) and execute atomically with complete payload verification.

### AD-3 — Design Token Alignment via Figma Bridge
- **Binds:** \`src/assets/figma/*\`, design variables, responsive layout containers
- **Prevents:** Hardcoded arbitrary hex colors and broken responsive layouts.
- **Rule:** Spacing scales, color tokens, and font typography must conform strictly to verified Figma design tokens.

## Consistency Conventions

| Concern | Convention |
| :--- | :--- |
| **Naming** | PascalCase for React components (\`UserCard.jsx\`), kebab-case for assets and folders (\`brief-fleet-360\`), camelCase for utility functions. |
| **Data & Formats** | ISO 8601 timestamps (\`YYYY-MM-DDTHH:mm:ssZ\`), UUIDv4 / normalized slug identifiers, JSON payload envelopes. |
| **State & Errors** | Local optimistic state with toast notifications on error, non-blocking asynchronous dispatchers. |

## Stack

| Name | Version / Specification |
| :--- | :--- |
| **Runtime** | Node.js (v20+ / v22+) / Modern Browser Runtime |
| **Frontend Framework** | React 18+ (Hooks, Context API, Suspense) |
| **Styling & Design System** | Tailwind CSS / CSS Modules with Figma Bridge Token Engine |
| **Build & Tooling** | Vite / Prettier / ESLint (Strict Validation) |

## Structural Seed

\`\`\`text
src/
  components/       # Reusable atomic UI components conforming to Figma specs
  hooks/            # Reactive data management and workflow state hooks
  services/         # API client adapters and disk synchronization handlers
  types/            # Centralized TypeScript interface schemas
  assets/figma/     # Extracted vector icons, typography scales, and imagery
\`\`\`

### Domain Models & TypeScript Interfaces

\`\`\`typescript
${entityModels}
\`\`\`

## Capability → Architecture Map

| Capability / Area | Lives in | Governed by |
| :--- | :--- | :--- |
${capabilityRows}

## Deferred
- Multi-region distributed clustering (owned by enterprise infrastructure tier).
- Complex custom plugin execution sandbox (scheduled for v2 expansion).
`,
      };
    }

    case 'ux': {
      let uxFolder = '3-solutioning/acl-ux';
      const sampleUxDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'ux');
      if (fs.existsSync(sampleUxDir)) {
        const subdirs = fs.readdirSync(sampleUxDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        if (subdirs.length > 0) {
          uxFolder = `planning-artifacts/ux/${subdirs[0].name}`;
        } else {
          uxFolder = 'planning-artifacts/ux';
        }
      }

      const colors =
        briefData && briefData.colorTokens.length > 0
          ? briefData.colorTokens
              .slice(0, 6)
              .map((c, i) => `- Token ${i + 1}: \`${c}\``)
              .join('\n')
          : `- Primary Accent: \`#0969da\` (Brand Blue)
- Canvas Background: \`#ffffff\` / \`#f6f8fa\`
- Surface Card: \`#ffffff\` (Border: \`#d0d7de\`)
- Success / Approved: \`#1a7f37\` (Badge: \`#dafbe1\`)
- Warning / In Review: \`#9a6700\` (Badge: \`#fff8c5\`)
- Danger / Rejected: \`#cf222e\` (Badge: \`#ffebe9\`)`;

      const figmaRef = allFigmaLinks.length > 0 ? allFigmaLinks[0] : 'https://www.figma.com/design/project-spec';

      return {
        folderPath: uxFolder,
        filename: 'ux.md',
        phaseName: 'Phase 3B: Solutioning (UX & Design System)',
        content: `---
status: In Review
phase: Phase 3B - Solutioning (UX & Design System)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# UX Specification & Design System: ${projectTitle}

## 1. Figma Precision Bridge Alignment (\`acl-figma-bridge\`)
- **Figma Source**: [Open Figma Design Spec](${figmaRef})
- **8-Layer Precision Engine**:
  1. **Layer 1: AST Normalizer & CSS Box-Model Compiler**: Flexbox/Grid layouts, exact paddings, and corner radii.
  2. **Layer 2: Asset & Image Placement Engine**: Vector SVGs and high-res assets structured under \`src/assets/figma/\`.
  3. **Layer 3: Overlap & Z-Index Invariant Matrix**: Modal sheets, dropdown overlays, floating badges (\`z-10\`, \`z-50\`).
  4. **Layer 4: Design Tokens & Theme Variables**: Hex color values, shadow elevations, typography scale.
  5. **Layer 5: Multi-Modal Visual Diffing**: Automated screenshot comparison against Figma canvas.
  6. **Layer 6: Sub-Pixel Precision Engine**: Zero sub-pixel drift across standard and Retina displays.
  7. **Layer 7: OpenType Font Metrics & Breakpoints**: Mobile (375px), Tablet (768px), Desktop (1280px).
  8. **Layer 8: Multi-State Variants & Motion**: Default, Hover, Active, Disabled, Focus-Visible states.

## 2. Design Tokens & Visual Hierarchy
### Color Palette
${colors}

### Typography Scale
- **Headings**: Inter / System Sans, Bold (24px, 20px, 16px)
- **Body UI**: Inter, Regular/Medium (14px, 13px)
- **Code & Metadata**: Fira Code / Monospace (12px, 11px)

## 3. Screen Layouts & User Journeys
${featuresList
  .map(
    (f, i) => `### Screen ${i + 1}: ${f.slice(0, 50)}
- **Layout Model**: Flex column container with responsive max-width.
- **Key Components**: Header toolbar, interactive content card, action buttons.
- **States**: \`Loading\`, \`Ready\`, \`Success\`, \`Error\`.`,
  )
  .join('\n\n')}

## 4. Interactive Component States & Micro-Interactions
- **Action Buttons**: Hover lift (\`translate-y-[-1px]\`), active press (\`scale-[0.98]\`), disabled opacity (50%).
- **Status Pills**: Color-coded indicator dots with high-contrast text labels.
- **Modals & Overlays**: Backdrop blur (\`backdrop-filter: blur(4px)\`) and smooth fade-in transitions (150ms ease-out).
`,
      };
    }

    case 'epics_stories': {
      const epicsMd = featuresList
        .map(
          (f, idx) => `## Epic ${idx + 1}: ${f.replaceAll('**', '')}
- **Story ${idx + 1}.1**: UI Component Construction (Figma Precision Bridge).
  - *Tasks*: Implement layout structure, design tokens, and responsive styles in \`src/components/\`.
  - *Acceptance Criteria*: Visually identical to Figma spec across mobile and desktop.
- **Story ${idx + 1}.2**: State Management & Business Logic Integration.
  - *Tasks*: Wire React hooks and API integration handlers.
  - *Acceptance Criteria*: Correct data flow with error boundary protection.
- **Story ${idx + 1}.3**: Verification, Automated Testing & Quality Checks.
  - *Tasks*: Add unit/integration tests and run lint/format checks.
  - *Acceptance Criteria*: 100% tests pass, zero warnings.
`,
        )
        .join('\n');

      return {
        folderPath: '3-solutioning/acl-create-epics-and-stories',
        filename: 'epics.md',
        phaseName: 'Phase 3C: Solutioning (Epics & Stories)',
        content: `---
status: In Review
phase: Phase 3C - Solutioning (Epics & Stories)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Epics & User Stories Breakdown: ${projectTitle}

## 1. Delivery Roadmap Overview
- **Project**: ${projectTitle}
- **Workflow Mode**: ${modeLabel}
- **Prerequisites**: PRD (\`prd.md\`) & Architecture/UX Solutions Approved

${epicsMd}

## Definition of Done (DoD)
1. All stories verified against Figma design specifications and acceptance criteria.
2. Code strictly passes \`npm run quality\` (ESLint, Prettier, skill validation).
3. Manager review and sign-off recorded in Markdown Studio.
`,
      };
    }

    case 'implementation_scaffold': {
      return {
        folderPath: '4-implementation/acl-dev-auto',
        filename: 'step-01-scaffold.md',
        phaseName: 'Phase 4: Implementation (Code Delivery)',
        content: `---
status: In Review
phase: Phase 4 - Implementation (Code Delivery)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Implementation Plan & Precision Scaffold: ${projectTitle}

## 1. File Checklist & Scaffolding
- [ ] \`src/components/\`: UI components with \`acl-figma-bridge\` design token alignment.
- [ ] \`src/hooks/\`: Data fetching and reactive state management.
- [ ] \`src/services/\`: Backend API contract handlers.
- [ ] \`src/types/\`: TypeScript domain definitions.

## 2. Step-by-Step Execution Sequence
- **Step 1**: Scaffold design tokens, color variables, and base layout.
- **Step 2**: Implement core UI components matching Figma design specs.
- **Step 3**: Connect state stores and API endpoints.
- **Step 4**: Execute automated test suites and verify zero regressions.
`,
      };
    }

    case 'quick_dev': {
      return {
        folderPath: '4-implementation/acl-quick-dev',
        filename: 'quick-dev.md',
        phaseName: 'Phase 4: Brownfield Quick Implementation',
        content: `---
status: In Review
phase: Phase 4 - Implementation (Quick Dev Delta)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Targeted Patch Plan & Quick Implementation: ${projectTitle}

## 1. Targeted Codebase Delta
- **Target Scope**: In-place feature enhancements following established conventions.
- **Design Tokens**: Conforming to \`acl-figma-bridge\` design standards.

## 2. Step-by-Step Patch Sequence
- Step 1: Implement delta components and update routes.
- Step 2: Integrate backend data handlers.
- Step 3: Run pre-push quality checks (\`npm run quality\`).
`,
      };
    }

    case 'story_impl': {
      const progress = getImplementationProgress();
      const targetStory =
        options && options.targetStoryId
          ? progress.allStories.find((s) => s.id === options.targetStoryId)
          : progress.nextStoryToGenerate ||
            (progress.allStories.length > 0
              ? progress.allStories[0]
              : {
                  id: '1.1',
                  epicNum: 1,
                  epicTitle: 'Core Capabilities',
                  title: 'UI & State Construction',
                  tasks: 'Implement layout and components in src/components/',
                  acceptanceCriteria: 'Visually identical to Figma spec',
                });

      const storyId = targetStory ? targetStory.id : '1.1';
      const epicNum = targetStory ? targetStory.epicNum : 1;
      const epicTitle = targetStory ? targetStory.epicTitle : 'Core Feature Implementation';
      const storyTitle = targetStory ? targetStory.title : 'UI & State Construction';
      const storyTasks =
        targetStory && targetStory.tasks ? targetStory.tasks : 'Implement UI components in src/components/ matching Figma layout.';
      const storyAc =
        targetStory && targetStory.acceptanceCriteria
          ? targetStory.acceptanceCriteria
          : 'Visually identical to Figma spec with sub-200ms latency.';

      const nextIndex = progress.allStories.findIndex((s) => s.id === storyId) + 1;
      const nextStoryObj = nextIndex < progress.allStories.length ? progress.allStories[nextIndex] : null;
      const nextStoryLabel = nextStoryObj ? `Story ${nextStoryObj.id}` : 'Final Code Deployment';

      return {
        folderPath: `4-implementation/epic-${epicNum}`,
        filename: `story-${storyId}-spec.md`,
        phaseName: `Phase 4: Implementation (Story ${storyId})`,
        content: `---
status: In Review
phase: Phase 4 - Implementation (Story ${storyId})
epic_number: ${epicNum}
story_id: "${storyId}"
story_title: "${storyTitle}"
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Story ${storyId} Specification: ${storyTitle}

<intent-contract>

## Intent
**Problem:** ${epicTitle.slice(0, 180)}
**Approach:** ${storyTitle} — Execute targeted implementation with strict adherence to Figma design tokens and component boundaries.

## Boundaries & Constraints
- **Always:** Conform to \`acl-figma-bridge\` design tokens, spacing scales (4px/8px), and sub-200ms interaction latency.
- **Block If:** Upstream architecture decisions (AD-1, AD-2) or PRD requirements are violated.
- **Never:** Mutate upstream contracts without manager review or introduce unhandled promise rejections.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| :--- | :--- | :--- | :--- |
| **Happy Path** | Valid user interaction with Story ${storyId} components | State updates reactively with smooth transition | No error expected |
| **Network Timeout** | Backend request delayed > 3000ms | Displays accessible loading skeleton / inline retry | Graceful fallback without UI crash |
| **Invalid Input** | Malformed data or empty required field | Inline validation feedback rendered with focus ring | Blocks submission with clear error message |

</intent-contract>

## Code Map
- \`src/components/common/\` -- Atomic UI elements conforming to Figma tokens.
- \`src/components/auth/\` or \`src/components/landing/\` -- Domain feature components for Story ${storyId}.
- \`src/hooks/\` -- Custom React hooks for data fetching, state, and lifecycle management.
- \`src/styles/\` -- CSS modules / utility styling aligned with design system variables.

## Tasks & Acceptance

**Execution Tasks:**
- \`src/components/\` -- ${storyTasks}
- \`src/hooks/\` -- Connect reactive state machine and custom data handlers with error boundary protection.
- \`tests/\` -- Add unit verification test suite and run \`npm run quality\`.

**Acceptance Criteria:**
- Given user navigates to the feature interface, when interacting with Story ${storyId} components, then: ${storyAc}.
- Given invalid input or edge case, when submitted, then actionable validation feedback is rendered without crashing.

## Design Notes & Figma Alignment
- **Figma Source**: Conforming to \`acl-figma-bridge\` 8-layer precision mapping.
- **Tokens**: Brand accent (\`#E50026\` / \`#0066FF\`), canvas surface, and typography scale.
- **Breakpoints**: Mobile (375px), Tablet (768px), Desktop (1280px+).

## Verification
**Commands:**
- \`npm run quality\` -- expected: 0 errors, 0 warnings (ESLint, Prettier, and skill checks pass).
- \`npm run build\` -- expected: Clean production build with zero type or syntax errors.

## Phase Gate Approval Invariant
- **Sequential Invariant**: This story specification must be reviewed and marked \`status: Approved\` by the Manager in Markdown Studio before development proceeds to **${nextStoryLabel}**.
`,
      };
    }

    default: {
      return {
        folderPath: '1-analysis/acl-product-brief',
        filename: 'brief.md',
        phaseName: 'Phase 1: Analysis (Product Brief)',
        content: `---
status: In Review
phase: Phase 1 - Analysis (Product Brief)
workflow_mode: ${modeLabel}
created_at: ${nowIso}
reviewed_by: Pending Manager Review
---

# Product Brief: ${projectTitle}
${projectSummary}
`,
      };
    }
  }
}

const DEFAULT_NVIDIA_API_KEY = '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';
const DEFAULT_NVIDIA_MODEL = 'meta/llama-3.2-11b-vision-instruct';

function readSkillInstructions(stepKey) {
  const FRAMEWORK_ROOT = path.resolve(__dirname, '..');
  const skillMap = {
    project_context: 'src/acl-skills/0-context/acl-generate-project-context/SKILL.md',
    brief: 'src/acl-skills/1-analysis/acl-product-brief/SKILL.md',
    prd: 'src/acl-skills/2-plan-workflows/acl-prd/SKILL.md',
    architecture: 'src/acl-skills/3-solutioning/acl-architecture/SKILL.md',
    ux: 'src/acl-skills/3-solutioning/acl-ux/SKILL.md',
    epics_stories: 'src/acl-skills/3-solutioning/acl-create-epics-and-stories/SKILL.md',
    implementation_scaffold: 'src/acl-skills/4-implementation/acl-dev-auto/SKILL.md',
    quick_dev: 'src/acl-skills/4-implementation/acl-quick-dev/SKILL.md',
    story_impl: 'src/acl-skills/4-implementation/acl-dev-auto/SKILL.md',
  };

  const rel = skillMap[stepKey];
  if (!rel) return '';
  const full = path.join(FRAMEWORK_ROOT, rel);
  let content = '';
  if (fs.existsSync(full)) {
    try {
      content = fs.readFileSync(full, 'utf8');
      // Trim down to first 3000 chars to avoid prompt bloat and keep generation under 10 seconds
      if (content.length > 3000) {
        content = content.slice(0, 3000);
      }
    } catch (error) {
      console.warn(`[Studio Server] Could not read skill file: ${rel}`, error.message);
    }
  }

  if (stepKey === 'ux') {
    const figmaBridgePath = path.join(FRAMEWORK_ROOT, 'src/core-skills/acl-figma-bridge/SKILL.md');
    if (fs.existsSync(figmaBridgePath)) {
      try {
        content += '\n\n# FIGMA BRIDGE 8-LAYER RULES:\n' + fs.readFileSync(figmaBridgePath, 'utf8').slice(0, 2000);
      } catch (error) {
        console.warn(`[Studio Server] Could not read figma bridge skill:`, error.message);
      }
    }
  }

  return content;
}

function resolveDeliverableFolder(stepKey, options = {}) {
  switch (stepKey) {
    case 'project_context': {
      return { folderPath: '0-context/acl-generate-project-context', filename: 'project-context.md' };
    }
    case 'brief': {
      const sampleBriefDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'briefs');
      if (fs.existsSync(sampleBriefDir)) {
        const subdirs = fs.readdirSync(sampleBriefDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        if (subdirs.length > 0) return { folderPath: `planning-artifacts/briefs/${subdirs[0].name}`, filename: 'brief.md' };
      }
      return { folderPath: '1-analysis/acl-product-brief', filename: 'brief.md' };
    }
    case 'prd': {
      const samplePrdDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'prds');
      if (fs.existsSync(samplePrdDir)) {
        const subdirs = fs.readdirSync(samplePrdDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        if (subdirs.length > 0) return { folderPath: `planning-artifacts/prds/${subdirs[0].name}`, filename: 'prd.md' };
      }
      return { folderPath: '2-plan-workflows/acl-prd', filename: 'prd.md' };
    }
    case 'architecture': {
      const sampleArchDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'architecture');
      if (fs.existsSync(sampleArchDir)) {
        const subdirs = fs.readdirSync(sampleArchDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        if (subdirs.length > 0) return { folderPath: `planning-artifacts/architecture/${subdirs[0].name}`, filename: 'architecture.md' };
      }
      return { folderPath: '3-solutioning/acl-architecture', filename: 'architecture.md' };
    }
    case 'ux': {
      const sampleUxDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'ux');
      if (fs.existsSync(sampleUxDir)) {
        const subdirs = fs.readdirSync(sampleUxDir, { withFileTypes: true }).filter((d) => d.isDirectory());
        if (subdirs.length > 0) return { folderPath: `planning-artifacts/ux/${subdirs[0].name}`, filename: 'ux.md' };
      }
      return { folderPath: '3-solutioning/acl-ux', filename: 'ux.md' };
    }
    case 'epics_stories': {
      const sampleEpicsDir = path.join(ACL_OUTPUT_DIR, 'planning-artifacts', 'epics');
      if (fs.existsSync(sampleEpicsDir)) {
        return { folderPath: 'planning-artifacts/epics', filename: 'epics.md' };
      }
      return { folderPath: '3-solutioning/acl-create-epics-and-stories', filename: 'epics.md' };
    }
    case 'story_impl': {
      const progress = getImplementationProgress();
      const targetStory =
        options && options.targetStoryId
          ? progress.allStories.find((s) => s.id === options.targetStoryId)
          : progress.nextStoryToGenerate || (progress.allStories.length > 0 ? progress.allStories[0] : { id: '1.1', epicNum: 1 });
      const epicNum = targetStory ? targetStory.epicNum : 1;
      const storyId = targetStory ? targetStory.id : '1.1';
      return { folderPath: `4-implementation/epic-${epicNum}`, filename: `story-${storyId}-spec.md` };
    }
    case 'implementation_scaffold': {
      return { folderPath: '4-implementation/acl-dev-auto', filename: 'step-01-scaffold.md' };
    }
    case 'quick_dev': {
      return { folderPath: '4-implementation/acl-quick-dev', filename: 'quick-dev.md' };
    }
    default: {
      return { folderPath: '1-analysis/acl-product-brief', filename: 'brief.md' };
    }
  }
}

async function callNvidiaChatCompletions({ apiKey, model, messages, maxTokens = 2000, temperature = 0.2 }) {
  return new Promise((resolve, reject) => {
    const https = require('node:https');
    const postData = JSON.stringify({
      model: model || DEFAULT_NVIDIA_MODEL,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
    });

    const req = https.request(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey || DEFAULT_NVIDIA_API_KEY}`,
        },
        timeout: 25_000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(body);
              if (json.choices && json.choices.length > 0 && json.choices[0].message) {
                return resolve(json.choices[0].message.content);
              }
            } catch (error) {
              return reject(error);
            }
          }
          reject(new Error(`NVIDIA API HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('NVIDIA API request timed out (25s)'));
    });
    req.write(postData);
    req.end();
  });
}

async function generateWithAgent(stepKey, mode, projectTitle, apiKey, model, options = {}) {
  const skillInstructions = readSkillInstructions(stepKey);
  const upstream = readUpstreamArtifacts();
  const folderInfo = resolveDeliverableFolder(stepKey, options);

  const agentNames = {
    project_context: 'Mary Analyst & System Architect',
    brief: 'Mary Analyst',
    prd: 'John PM',
    architecture: 'Winston Architect',
    ux: 'Sally UX Designer',
    epics_stories: 'Scrum Lead & Product Manager',
    implementation_scaffold: 'Amelia Developer',
    quick_dev: 'Amelia Developer',
    story_impl: 'Amelia Developer',
  };

  const deliverableBlueprints = {
    prd: `
MANDATORY STRUCTURAL BLUEPRINT (Must follow this exact enterprise depth):
1. Executive Summary & Strategic Vision: Compelling overview with a valid Mermaid diagram showing the user journey and module triage.
2. Target Personas & Stakeholders: A detailed markdown table with columns: | Persona | Role & Context | Primary Goals | Key Pain Points |.
3. User Journeys (UJ): Numbered narratives (UJ-1, UJ-2, UJ-3) with Protagonist, Entry state, Concrete step-by-step path beats, Climax, and Resolution.
4. Functional Requirements (FR) Grouped by Core Pillars: Group requirements into distinct functional pillars (e.g. Pillar A: Authentication & Security, Pillar B: Landing Hub Experience & Domain Modules). Every single requirement must have a unique stable ID (e.g. FR-AUTH-1, FR-AUTH-2, FR-LAND-1, FR-LAND-2) with detailed functional specs, UI states, field validations, and error behaviors.
5. Non-Functional Requirements (NFR): Explicit subsections for Performance & Responsiveness (with latency targets), Security & Privacy (token transmission, session rules), and Accessibility (WCAG 2.1 AA contrast, ARIA landmarks).
6. Assumptions & Dependencies: Numbered assumption tags [ASSUMPTION-1], [ASSUMPTION-2].
7. Success Metrics & Counter-Metrics: A markdown table with columns: | Metric | Target | Measurement Method |.
`,
    architecture: `
MANDATORY STRUCTURAL BLUEPRINT (Official ACL Architecture Spine):
1. Design Paradigm: Named architectural pattern with a valid Mermaid graph showing component, state, and client-server boundaries.
2. Invariants & Rules: Stable numbered Architectural Decisions (AD-1, AD-2, AD-3), each strictly defining Binds, Prevents, and Rule.
3. Consistency Conventions: Markdown table for Naming, Data & Formats, State & Error handling.
4. Stack: Markdown table of runtime, framework, UI library, and tooling with pinned versions.
5. Structural Seed: File tree block for src/ layout plus TypeScript domain models/interfaces.
6. Capability -> Architecture Map: Markdown table mapping CAP-1, CAP-2 to component paths and governing ADs.
7. Deferred: Explicitly deferred decisions.
`,
    ux: `
MANDATORY STRUCTURAL BLUEPRINT (8-Layer Figma Precision Engine):
1. Design System Tokens: Color hex palette, Typography scale, Spacing scale (4px/8px), Corner radii, Elevation shadows.
2. Screen-by-Screen Layouts & Visual Flow: Layout models, responsive viewports (Mobile 375px, Tablet 768px, Desktop 1280px+).
3. Component Hierarchy & Asset Placement: Mapping components and vector icons to src/assets/figma/.
4. Interactive Component States: Default, Hover, Active/Pressed, Focus ring, Disabled, Loading skeleton, Error states.
5. Accessibility & Contrast Verification: WCAG 2.1 AA ratios, keyboard tab order, ARIA attributes.
`,
    epics_stories: `
MANDATORY STRUCTURAL BLUEPRINT:
1. Delivery Roadmap Overview.
2. Numbered Epics (Epic 1, Epic 2, Epic 3) with numbered User Stories (Story 1.1, Story 1.2) containing technical tasks and Given/When/Then acceptance criteria.
3. Definition of Done (DoD) & Verification Checklist.
`,
    story_impl: `
MANDATORY STRUCTURAL BLUEPRINT (Story Implementation Specification):
1. Epic Context & Scope: Parent Epic number and title, Story ID, Story goal, and prerequisites.
2. Architectural & UX Invariants: Specific design tokens from acl-figma-bridge, state machine boundaries, and API schemas.
3. Step-by-Step Implementation Checklist:
   - Task 1 (UI Component): Concrete React component files and styles to create/update in src/components/.
   - Task 2 (State & Hooks): Reactive state, context hooks, and data handlers in src/hooks/.
   - Task 3 (Verification): Automated test cases and pre-push quality checks.
4. Acceptance Criteria: Numbered Given/When/Then criteria (AC-1, AC-2) with sub-200ms latency and error states.
5. Phase Gate Approval Invariant: Explicit gate rule requiring manager approval before the next story can be generated.
`,
  };

  const blueprint = deliverableBlueprints[stepKey] || '';
  const agentName = agentNames[stepKey] || 'ACL Delivery Agent';

  const systemPrompt = `You are ${agentName}, an elite specialist in the ACL-ADLC framework.
Your role instructions:
${skillInstructions || 'Produce a comprehensive, rigorous markdown specification adhering to ACL-ADLC standards.'}

${blueprint}

CRITICAL RULES:
1. Base all specifications strictly on the approved upstream project documents provided below.
2. Produce a thorough, complete, enterprise-grade specification without skipping sections or using placeholders.
3. Output proper markdown starting directly with YAML frontmatter:
---
status: In Review
phase: ${stepKey}
workflow_mode: ${mode || 'greenfield'}
created_at: ${new Date().toISOString()}
reviewed_by: Pending Manager Review
---
`;

  let userContext = `Approved upstream project documents:\n\n`;
  if (upstream.projectContext) {
    userContext += `## UPSTREAM PROJECT CONTEXT:\n${upstream.projectContext.content.slice(0, 2000)}\n\n`;
  }
  if (upstream.brief) {
    userContext += `## UPSTREAM PRODUCT BRIEF:\n${upstream.brief.content.slice(0, 3000)}\n\n`;
  }
  if (upstream.prd) {
    userContext += `## UPSTREAM PRD:\n${upstream.prd.content.slice(0, 3000)}\n\n`;
  }
  if (upstream.architecture) {
    userContext += `## UPSTREAM ARCHITECTURE:\n${upstream.architecture.content.slice(0, 3000)}\n\n`;
  }
  if (upstream.ux) {
    userContext += `## UPSTREAM UX DESIGN:\n${upstream.ux.content.slice(0, 3000)}\n\n`;
  }
  if (upstream.epics) {
    userContext += `## UPSTREAM EPICS & STORIES:\n${upstream.epics.content.slice(0, 3000)}\n\n`;
  }

  userContext += `Generate the full, complete, production-grade '${folderInfo.filename}' for this project following the mandatory structural blueprint.`;

  try {
    const rawAiOutput = await callNvidiaChatCompletions({
      apiKey: apiKey || DEFAULT_NVIDIA_API_KEY,
      model: model || DEFAULT_NVIDIA_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContext },
      ],
      maxTokens: 2000,
      temperature: 0.2,
    });

    let cleanContent = rawAiOutput.trim();
    if (cleanContent.startsWith('```markdown')) {
      cleanContent = cleanContent
        .replace(/^```markdown\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent
        .replace(/^```\w*\s*/, '')
        .replace(/```\s*$/, '')
        .trim();
    }

    if (cleanContent.startsWith('---')) {
      cleanContent = cleanContent.replace(/status:\s*[^\r\n]+/i, 'status: In Review');
    } else {
      cleanContent =
        `---\nstatus: In Review\nphase: ${stepKey}\nworkflow_mode: ${mode || 'greenfield'}\ncreated_at: ${new Date().toISOString()}\nreviewed_by: Pending Manager Review\n---\n\n` +
        cleanContent;
    }

    return {
      folderPath: folderInfo.folderPath,
      filename: folderInfo.filename,
      content: cleanContent,
      agentName: agentName,
      source: 'nvidia-ai',
    };
  } catch (error) {
    console.warn(`[Studio Server] NVIDIA AI call failed for '${stepKey}', using local synthesizer:`, error.message);
    const fallback = generateDeliverableTemplate(stepKey, mode, projectTitle, options);
    return {
      ...fallback,
      folderPath: folderInfo.folderPath,
      agentName: agentName,
      source: 'local-synthesizer',
    };
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/list-markdown-files') {
    const files = getDiskMarkdownFiles();
    let frameworkVersion = '6.11.12';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
      if (pkg && pkg.version) frameworkVersion = pkg.version;
    } catch {
      // Use fallback version
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, files: files, frameworkVersion: frameworkVersion, version: frameworkVersion }));
    return;
  }

  if (url.pathname === '/api/implementation-progress') {
    const progress = getImplementationProgress();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, progress: progress }));
    return;
  }

  if (url.pathname === '/api/generate-step' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { stepKey, mode, projectTitle, apiKey, model, targetStoryId } = payload;
        const options = { targetStoryId };

        const generated = await generateWithAgent(stepKey, mode, projectTitle, apiKey, model, options);
        if (!fs.existsSync(ACL_OUTPUT_DIR)) {
          fs.mkdirSync(ACL_OUTPUT_DIR, { recursive: true });
        }
        const baseDir = ACL_OUTPUT_DIR;
        const targetDir = path.join(baseDir, generated.folderPath);
        fs.mkdirSync(targetDir, { recursive: true });

        const targetFile = path.join(targetDir, generated.filename);
        let finalContent = generated.content;

        // If file already exists, don't overwrite if it was already created, unless force is passed
        if (fs.existsSync(targetFile) && !payload.overwrite) {
          finalContent = fs.readFileSync(targetFile, 'utf8');
        } else {
          fs.writeFileSync(targetFile, finalContent, 'utf8');
          console.log(
            `[Studio Server] Generated step '${stepKey}' via ${generated.agentName} (${generated.source}) to disk: ${targetFile}`,
          );
        }

        const relPath = path.relative(baseDir, targetFile).replaceAll('\\', '/');
        const fileId = relPath.replaceAll(/[^a-zA-Z0-9_-]/g, '_');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            agentName: generated.agentName,
            source: generated.source,
            file: {
              id: fileId,
              folderPath: generated.folderPath,
              filename: generated.filename,
              fullPath: relPath,
              status: 'In Review',
              content: finalContent,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        );
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (url.pathname === '/api/save-markdown' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { folderPath, filename, content, autoPush } = payload;

        if (!fs.existsSync(ACL_OUTPUT_DIR)) {
          fs.mkdirSync(ACL_OUTPUT_DIR, { recursive: true });
        }
        const baseDir = ACL_OUTPUT_DIR;
        const targetDir = folderPath && folderPath !== 'root' ? path.join(baseDir, folderPath) : baseDir;
        fs.mkdirSync(targetDir, { recursive: true });

        const targetFile = path.join(targetDir, filename);
        fs.writeFileSync(targetFile, content, 'utf8');
        console.log(`[Studio Server] Saved live to disk: ${targetFile}`);

        let gitPushed = false;
        if (autoPush) {
          try {
            execSync(
              `git add "${targetFile}" && git commit -m "docs(${filename}): update status and content via Markdown Studio" && git push`,
              {
                cwd: PROJECT_ROOT,
                stdio: 'pipe',
              },
            );
            gitPushed = true;
          } catch {
            console.warn('[Studio Server] Git auto-push skipped (no remote or git unconfigured).');
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, gitPushed: gitPushed }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  let servePath = path.join(ACL_OUTPUT_DIR, 'markdown.html');
  if (!fs.existsSync(servePath)) {
    servePath = path.join(PROJECT_ROOT, 'src', 'public', 'markdown.html');
  }
  if (!fs.existsSync(servePath)) {
    servePath = path.join(__dirname, '..', 'src', 'public', 'markdown.html');
  }
  if (!fs.existsSync(servePath)) {
    servePath = path.join(PROJECT_ROOT, 'markdown.html');
  }

  if ((url.pathname === '/' || url.pathname === '/markdown.html') && fs.existsSync(servePath)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(servePath, 'utf8'));
    return;
  }

  if (url.pathname === '/greenfield.svg' || url.pathname === '/brownfield.svg') {
    const svgFile = url.pathname.slice(1);
    let svgPath = path.join(__dirname, '..', 'src', 'public', svgFile);
    if (!fs.existsSync(svgPath)) {
      svgPath = path.join(PROJECT_ROOT, 'src', 'public', svgFile);
    }
    if (!fs.existsSync(svgPath)) {
      svgPath = path.join(PROJECT_ROOT, 'public', svgFile);
    }
    if (fs.existsSync(svgPath)) {
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(fs.readFileSync(svgPath));
      return;
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 ACL-ADLC Markdown Studio Live Server`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`⚡ 2-Way Live Sync Active with VS Code & Disk`);
  console.log(`======================================================\n`);
});
