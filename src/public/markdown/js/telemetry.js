function parseEpicsAndStoriesFromMarkdown(markdownText, allFiles = []) {
  if (!markdownText) return [];
  const lines = markdownText.split(/\r?\n/);
  const epics = [];
  let currentEpic = null;
  let currentStory = null;
  let inAC = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match Epic header: ## Epic 1: ... or ## EPIC-1 ...
    // Must require a number to prevent matching "## Epic List", "## Epics Overview", etc.
    const epicMatch = line.match(/^##\s+(?:Epic\s*(\d+)[:\-\s]*|EPIC-(\d+)[:\-\s]*)(.+)$/i);
    if (epicMatch) {
      const epicNum = epicMatch[1] || epicMatch[2];
      const rawTitle = epicMatch[3].trim().replace(/^[:\-]\s*/, '');
      currentEpic = {
        num: epicNum,
        title: rawTitle,
        stories: [],
      };
      epics.push(currentEpic);
      currentStory = null;
      inAC = false;
      continue;
    }

    // Match Story header, checkbox item, bold bullet item, or plain bullet item inside epic
    if (currentEpic) {
      const storyHeaderMatch = line.match(
        /^(?:###|####)\s*(?:\[([ xX])\]\s*)?(?:Story\s*([\d\.]+)[:\-\s]*|STORY-([\d\.]+)[:\-\s]*)(?:\[([ xX])\]\s*)?(.+)$/i,
      );
      const checkboxMatch = !inAC && line.match(/^-\s*\[([ xX])\]\s*(?:Story\s*([\d\.]+)[:\-\s]+|STORY-([\d\.]+)[:\-\s]+)(.+)$/i);
      const bulletBoldMatch =
        !inAC && line.match(/^(?:-\s*)?\*\*(?:\[([ xX])\]\s*)?(?:Story\s*([\d\.]+)[:\-\s]+|STORY-([\d\.]+)[:\-\s]+)(.+?)\*\*(.*)$/i);
      const bulletPlainMatch = !inAC && line.match(/^-\s*(?:Story\s*([\d\.]+)[:\-\s]+|STORY-([\d\.]+)[:\-\s]+)(.+)$/i);

      let sNum = null;
      let sTitle = null;
      let isCheckboxDone = false;

      if (storyHeaderMatch) {
        const cb1 = storyHeaderMatch[1];
        const cb2 = storyHeaderMatch[4];
        sNum = storyHeaderMatch[2] || storyHeaderMatch[3];
        const rawRest = (storyHeaderMatch[5] || '').trim().replace(/^[:\-]\s*/, '');
        const endCb = rawRest.match(/^\[([ xX])\]\s*(.+)$/i);
        if (endCb) {
          isCheckboxDone = endCb[1].toLowerCase() === 'x';
          sTitle = endCb[2].trim().replace(/^[:\-]\s*/, '');
        } else {
          isCheckboxDone = (cb1 && cb1.toLowerCase() === 'x') || (cb2 && cb2.toLowerCase() === 'x');
          sTitle = rawRest;
        }
      } else if (checkboxMatch) {
        isCheckboxDone = checkboxMatch[1].toLowerCase() === 'x';
        sNum = checkboxMatch[2];
        sTitle = checkboxMatch[3].trim().replace(/^[:\-]\s*/, '');
      } else if (bulletBoldMatch) {
        const cb1 = bulletBoldMatch[1];
        sNum = bulletBoldMatch[2] || bulletBoldMatch[3];
        const rest = (bulletBoldMatch[4] + (bulletBoldMatch[5] || '')).trim();
        isCheckboxDone = cb1 && cb1.toLowerCase() === 'x';
        sTitle = rest.replace(/^[:\-]\s*/, '');
      } else if (bulletPlainMatch) {
        sNum = bulletPlainMatch[1] || bulletPlainMatch[2];
        sTitle = bulletPlainMatch[3].trim().replace(/^[:\-]\s*/, '');
      }

      if (sTitle) {
        if (/[\(\[](?:done|completed)[\)\]]$/i.test(sTitle)) {
          isCheckboxDone = true;
          sTitle = sTitle.replace(/[\(\[](?:done|completed)[\)\]]$/i, '').trim();
        }

        let status = 'To Do';
        let isCompleted = false;
        let matchFile = null;

        // Cross-reference with live files in _acl-output
        if (Array.isArray(allFiles) && allFiles.length > 0) {
          const numSlug = sNum ? sNum.replace(/\./g, '-') : '';
          const dotSlug = sNum || '';
          matchFile = allFiles.find((f) => {
            const fn = (f.filename || '').toLowerCase();
            const fp = (f.fullPath || f.folderPath || f.path || '').toLowerCase();
            if (!numSlug) return false;
            const pattern = new RegExp(`(?:story|spec)[-_\\.]?${numSlug.replace(/-/g, '[-_\\.]')}(?![-_\\.]?\\d)`, 'i');
            return (
              pattern.test(fn) ||
              pattern.test(fp) ||
              fn.includes(`story-${numSlug}`) ||
              fn.includes(`story-${dotSlug}`) ||
              fn.includes(`spec-${numSlug}`) ||
              fn.includes(`spec-${dotSlug}`)
            );
          });

          if (matchFile) {
            const raw = (matchFile.status || '').trim().toLowerCase();
            if (raw.includes('accept') || raw.includes('approved') || raw.includes('final')) {
              status = 'Approved';
              isCompleted = true;
            } else if (raw.includes('reject')) {
              status = 'Rejected';
              isCompleted = false;
            } else {
              status = 'In Review';
              isCompleted = false;
            }
          }
        }

        currentStory = {
          num: sNum,
          title: sTitle,
          status: status,
          isCompleted: isCompleted,
          fileId: matchFile ? matchFile.id : null,
          filename: matchFile ? matchFile.filename : null,
          acceptanceCriteria: [],
          hasFileAC: false,
        };

        // If matchFile has AC, try reading from matchFile content
        if (matchFile && matchFile.content) {
          const parsedAcs = parseAcceptanceCriteriaFromSpec(matchFile.content);
          if (parsedAcs && parsedAcs.length > 0) {
            currentStory.acceptanceCriteria = parsedAcs;
            currentStory.hasFileAC = true;
          }
        }

        currentEpic.stories.push(currentStory);
        inAC = false;
        continue;
      }

      // Gather Acceptance Criteria for currentStory from epics.md
      if (currentStory && !currentStory.hasFileAC) {
        if (line.match(/(?:\*\*|\*|#+\s*)Acceptance Criteria:?(?:\*\*|\*)?/i)) {
          inAC = true;
          const afterAc = line.replace(/^.*Acceptance Criteria:?(?:\*\*|\*)?\s*/i, '').trim();
          if (afterAc.length > 0) {
            const checkMatch = afterAc.match(/^[-*]?\s*\[([ xX])\]\s*(.*)$/);
            if (checkMatch) {
              currentStory.acceptanceCriteria.push({
                isCompleted: checkMatch[1].toLowerCase() === 'x',
                text: checkMatch[2].trim(),
              });
            } else {
              currentStory.acceptanceCriteria.push({
                isCompleted: false,
                text: afterAc.replace(/^[-*•]\s*/, '').trim(),
              });
            }
          }
          continue;
        }
        if (line.startsWith('---') || line.startsWith('##') || line.startsWith('###') || line.match(/^-\s*\*\*/)) {
          inAC = false;
        }
        if (inAC && line.length > 0) {
          const trimmed = line.trim();
          const checkMatch = trimmed.match(/^[-*]?\s*\[([ xX])\]\s*(.*)$/);
          if (checkMatch) {
            currentStory.acceptanceCriteria.push({
              isCompleted: checkMatch[1].toLowerCase() === 'x',
              text: checkMatch[2].trim(),
            });
          } else if (trimmed.match(/^[-*•]\s+/)) {
            currentStory.acceptanceCriteria.push({
              isCompleted: false,
              text: trimmed.replace(/^[-*•]\s*/, '').trim(),
            });
          } else if (trimmed.length > 0 && currentStory.acceptanceCriteria.length > 0) {
            currentStory.acceptanceCriteria[currentStory.acceptanceCriteria.length - 1].text += ' ' + trimmed;
          }
        }
      }
    }
  }

  // Fallback: If no ## Epic headers were matched, look for stories anywhere
  if (epics.length === 0) {
    const fallbackStories = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const storyMatch = line.match(/^(?:###\s+Story\s*([\d\.]*)[:\-]?|###\s+|-\s*\[([ xX])\]\s*Story)\s*(.+)$/i);
      if (storyMatch) {
        const isDone = storyMatch[2] && storyMatch[2].toLowerCase() === 'x';
        fallbackStories.push({
          num: storyMatch[1] || null,
          title: storyMatch[3].trim(),
          status: isDone ? 'Approved' : 'To Do',
          isCompleted: isDone,
          fileId: null,
          filename: null,
          acceptanceCriteria: [],
        });
      }
    }
    if (fallbackStories.length > 0) {
      epics.push({
        num: '1',
        title: 'Implementation Backlog',
        stories: fallbackStories,
      });
    }
  }

  return epics;
}

let openAccordionEpicIndex = null;

function formatStoryTitle(title) {
  if (!title) return '';
  return title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /`([^`]+)`/g,
      '<code style="background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; font-family: monospace; font-size: 0.85em; color: #475569;">$1</code>',
    );
}

function normalizeAcItem(ac) {
  if (!ac) return { isCompleted: false, text: '' };
  if (typeof ac === 'string') {
    const checkMatch = ac.match(/^\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      return { isCompleted: checkMatch[1].toLowerCase() === 'x', text: checkMatch[2].trim() };
    }
    return { isCompleted: false, text: ac.replace(/^[•\-\*]\s*/, '').trim() };
  }
  return ac;
}

window.toggleEpicAccordion = function (index) {
  if (openAccordionEpicIndex === index) {
    openAccordionEpicIndex = null;
  } else {
    openAccordionEpicIndex = index;
  }
  openStoryKey = null;

  const groups = document.querySelectorAll('.epic-group');
  groups.forEach((group, idx) => {
    const gIdx = group.dataset.epicIndex !== undefined ? parseInt(group.dataset.epicIndex, 10) : idx;
    if (openAccordionEpicIndex !== null && openAccordionEpicIndex === gIdx) {
      group.classList.add('open');
    } else {
      group.classList.remove('open');
    }
  });

  const storyItems = document.querySelectorAll('.story-accordion-item');
  storyItems.forEach((item) => {
    item.classList.remove('open');
  });
};

function formatAcLine(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 4px; font-family: monospace; font-size: 0.72rem; color: #475569;">$1</code>',
    );
}

function parseAcceptanceCriteriaFromSpec(markdownText) {
  if (!markdownText) return [];
  const lines = markdownText.split(/\r?\n/);
  const items = [];
  let inAcSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.match(/^##+\s+Acceptance\s+Criteria/i)) {
      inAcSection = true;
      continue;
    }

    if (inAcSection && trimmed.match(/^##+\s+[^\s]/)) {
      break;
    }

    if (inAcSection) {
      const checkMatch = trimmed.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
      if (checkMatch) {
        items.push({
          isCompleted: checkMatch[1].toLowerCase() === 'x',
          text: checkMatch[2].trim(),
          raw: trimmed,
        });
      } else {
        const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
        if (bulletMatch && bulletMatch[1].trim()) {
          items.push({
            isCompleted: false,
            text: bulletMatch[1].trim(),
            raw: trimmed,
          });
        }
      }
    }
  }
  return items;
}

let openSpecElementId = null;
window.toggleSpecAccordion = function (elementId) {
  if (openSpecElementId === elementId) {
    openSpecElementId = null;
  } else {
    openSpecElementId = elementId;
  }
  const items = document.querySelectorAll('.story-accordion-item');
  items.forEach((el) => {
    if (el.id && el.id.startsWith('specDevItem_')) {
      const body = el.querySelector('.story-ac-body');
      if (el.id === openSpecElementId) {
        el.classList.add('open');
        if (body) body.style.display = 'block';
      } else {
        el.classList.remove('open');
        if (body) body.style.display = 'none';
      }
    }
  });
};
