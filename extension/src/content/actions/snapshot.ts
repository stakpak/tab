/**
 * Snapshot Action
 * Generates an AI-optimized DOM snapshot with ref assignments
 * Adapted from Playwright's _snapshotForAI approach
 */

import type { RefRegistry } from '../../shared/types';

// =============================================================================
// TYPES
// =============================================================================

export interface SnapshotResult {
  snapshot: string;
  refRegistry: RefRegistry;
}

interface TraversalState {
  refCounter: number;
  lines: string[];
  registry: RefRegistry;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** ARIA roles that should get reference IDs (interactive elements) */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'tablist',
  'combobox',
  'listbox',
  'option',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'gridcell',
  'columnheader',
  'rowheader',
  'treeitem',
  'dialog',
]);

/** Structural roles that should be included to show page structure */
const STRUCTURAL_ROLES = new Set([
  'main',
  'navigation',
  'complementary',
  'region',
  'banner',
  'contentinfo',
  'article',
  'search',
  'form',
  'dialog',
  'alertdialog',
  'progressbar',
]);

/** Roles that should show their text content */
const TEXT_ROLES = new Set([
  'heading',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
  'status',
  'alert',
  'paragraph',
  'listitem',
]);

/** Tags to skip entirely (including their children) */
const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'meta',
  'link',
  'base',
  'title',
  'svg',
  'path',
  'defs',
  'clippath',
  'lineargradient',
  'radialgradient',
]);

// =============================================================================
// REF REGISTRY FACTORY
// =============================================================================

export function createRefRegistry(): RefRegistry {
  const entries = new Map<string, Element>();
  return {
    entries,
    clear() {
      entries.clear();
    },
    set(ref: string, element: Element) {
      entries.set(ref, element);
    },
    get(ref: string) {
      return entries.get(ref);
    },
  };
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Generate a snapshot of the current page DOM
 * - Traverses visible elements
 * - Assigns refs to interactive elements
 * - Returns compact text representation for LLM consumption
 */
export async function generateSnapshot(timeout: number = 5000): Promise<SnapshotResult> {
  const clampedTimeout = Math.max(500, Math.min(60_000, timeout));

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        snapshot: '(snapshot timed out)',
        refRegistry: createRefRegistry(),
      });
    }, clampedTimeout);

    try {
      const result = buildSnapshot();
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      resolve({
        snapshot: `(snapshot error: ${String(error)})`,
        refRegistry: createRefRegistry(),
      });
    }
  });
}

// =============================================================================
// CORE ALGORITHM
// =============================================================================

function buildSnapshot(): SnapshotResult {
  const state: TraversalState = {
    refCounter: 0,
    lines: [],
    registry: createRefRegistry(),
  };

  const rootElement = document.body || document.documentElement;
  if (!rootElement) {
    return {
      snapshot: '(no document)',
      refRegistry: state.registry,
    };
  }

  const rootName = document.title?.trim() ? cleanText(document.title) : null;
  state.refCounter++;
  const rootRef = `e${state.refCounter}`;
  state.registry.set(rootRef, document.documentElement || rootElement);
  state.lines.push(buildElementLine('RootWebArea', rootName, rootRef, 0));

  traverseDOM(rootElement, 1, state);

  return {
    snapshot: state.lines.length > 0 ? state.lines.join('\n') : '(empty page)',
    refRegistry: state.registry,
  };
}

// =============================================================================
// DOM TRAVERSAL
// =============================================================================

function traverseDOM(element: Element, depth: number, state: TraversalState, insideInteractive: boolean = false): void {
  const tag = element.tagName.toLowerCase();

  // Skip certain tags entirely
  if (SKIP_TAGS.has(tag)) {
    return;
  }

  // Check visibility
  if (!isElementVisible(element)) {
    return;
  }

  const role = getAccessibilityRole(element);
  const isInteractive = role !== null && INTERACTIVE_ROLES.has(role);
  const isStructural = role !== null && STRUCTURAL_ROLES.has(role);
  const isTextRole = role !== null && TEXT_ROLES.has(role);
  const isClickable = isElementClickable(element);
  const name = getAccessibleName(element);

  // Determine if this element should be included in output
  // Skip generic elements inside interactive parents (they just add noise)
  const isGeneric = !role || role === 'generic';
  const skipBecauseNested = insideInteractive && isGeneric && !isInteractive;

  const shouldInclude = !skipBecauseNested && (isInteractive || isStructural || isTextRole || isClickable || Boolean(name));

  // Assign ref to interactive elements (but not to nested children of interactive elements)
  let ref: string | undefined;
  if ((isInteractive || isClickable) && !insideInteractive) {
    state.refCounter++;
    ref = `e${state.refCounter}`;
    state.registry.set(ref, element);
  }

  // Output this element if it should be included
  if (shouldInclude) {
    const displayRole = role || 'generic';
    const line = buildElementLine(displayRole, name, ref, depth);
    state.lines.push(line);
  }

  // Recurse into children - mark as inside interactive if this element is interactive
  const nextDepth = shouldInclude ? depth + 1 : depth;
  const nextInsideInteractive = insideInteractive || isInteractive || (isClickable && !isGeneric);

  for (const child of element.children) {
    traverseDOM(child, nextDepth, state, nextInsideInteractive);
  }
}

// =============================================================================
// VISIBILITY CHECK
// =============================================================================

function isElementVisible(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  // head is never visible
  if (tag === 'head') {
    return false;
  }

  try {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }

    // Check opacity (but allow very low opacity as it might still be interactive)
    if (style.opacity === '0') {
      return false;
    }

    // Note: We removed the offsetParent check as it's too aggressive for modern SPAs
    // Many Twitter/X elements have offsetParent === null but are still visible and interactive
  } catch {
    // getComputedStyle can throw in some edge cases
    return true;
  }

  if (element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  return true;
}

// =============================================================================
// CLICKABILITY CHECK
// =============================================================================

/**
 * Check if element is clickable (has click handlers or is focusable)
 * This catches elements that don't have explicit ARIA roles but are still interactive
 */
function isElementClickable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  const htmlElement = element as HTMLElement;

  // Iframes are almost always interactive
  if (tag === 'iframe') {
    return true;
  }

  // Check for tabindex (makes element focusable/clickable)
  const tabindex = element.getAttribute('tabindex');
  if (tabindex !== null && tabindex !== '-1') {
    return true;
  }

  // Check for onclick attribute
  if (element.hasAttribute('onclick')) {
    return true;
  }

  // Check for data-testid that suggests interactivity (common in Twitter/X)
  const testId = element.getAttribute('data-testid');
  if (testId && (testId.includes('button') || testId.includes('Button') || testId.includes('click') || testId.includes('link'))) {
    return true;
  }

  // Check for cursor: pointer which often indicates clickability
  try {
    const style = window.getComputedStyle(element);
    if (style.cursor === 'pointer') {
      // Only count as clickable if it also has some text or is meaningfully sized
      const rect = element.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        return true;
      }
    }
  } catch {
    // Ignore style errors
  }

  // Check for contenteditable
  if (htmlElement.isContentEditable) {
    return true;
  }

  return false;
}

// =============================================================================
// ACCESSIBILITY PROPERTIES
// =============================================================================

function getAccessibilityRole(element: Element): string | null {
  // Check explicit ARIA role first
  const explicitRole = element.getAttribute('role');
  if (explicitRole) {
    return explicitRole.toLowerCase();
  }

  // Get implicit role from tag
  return getImplicitRole(element);
}

function getImplicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();

  switch (tag) {
    case 'button':
      return 'button';
    case 'a':
      return element.hasAttribute('href') ? 'link' : null;
    case 'input':
      return getInputRole(element as HTMLInputElement);
    case 'textarea':
      return 'textbox';
    case 'select':
      return 'combobox';
    case 'option':
      return 'option';
    case 'h1':
      return 'heading1';
    case 'h2':
      return 'heading2';
    case 'h3':
      return 'heading3';
    case 'h4':
      return 'heading4';
    case 'h5':
      return 'heading5';
    case 'h6':
      return 'heading6';
    case 'p':
      return 'paragraph';
    case 'nav':
      return 'navigation';
    case 'main':
      return 'main';
    case 'header':
      return 'banner';
    case 'footer':
      return 'contentinfo';
    case 'article':
      return 'article';
    case 'aside':
      return 'complementary';
    case 'section':
      return 'region';
    case 'form':
      return 'form';
    case 'ul':
    case 'ol':
      return 'list';
    case 'li':
      return 'listitem';
    case 'table':
      return 'table';
    case 'tr':
      return 'row';
    case 'td':
      return 'gridcell';
    case 'th':
      return 'columnheader';
    case 'img':
      return element.hasAttribute('alt') ? 'img' : null;
    case 'dialog':
      return 'dialog';
    default:
      return null;
  }
}

function getInputRole(input: HTMLInputElement): string {
  const type = input.type || 'text';
  switch (type) {
    case 'checkbox':
      return 'checkbox';
    case 'radio':
      return 'radio';
    case 'range':
      return 'slider';
    case 'number':
      return 'spinbutton';
    case 'search':
      return 'searchbox';
    case 'submit':
    case 'button':
    case 'reset':
      return 'button';
    case 'hidden':
      return "";
    default:
      return 'textbox';
  }
}

function getAccessibleName(element: Element): string | null {
  // 1. aria-label (highest priority)
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) {
    return cleanText(ariaLabel);
  }

  // 2. aria-labelledby
  const ariaLabelledby = element.getAttribute('aria-labelledby');
  if (ariaLabelledby) {
    const names = ariaLabelledby
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (names.length > 0) {
      return cleanText(names.join(' '));
    }
  }

  const tag = element.tagName.toLowerCase();

  // 3. title attribute
  const title = element.getAttribute('title');
  if (title?.trim()) {
    return cleanText(title);
  }

  // 4. alt attribute (for images)
  if (tag === 'img') {
    const alt = element.getAttribute('alt');
    if (alt?.trim()) {
      return cleanText(alt);
    }
  }

  // 5. placeholder (for inputs)
  if (tag === 'input') {
    const input = element as HTMLInputElement;
    if (input.placeholder?.trim()) {
      return cleanText(input.placeholder);
    }
  }

  if (tag === 'textarea') {
    const textarea = element as HTMLTextAreaElement;
    if (textarea.placeholder?.trim()) {
      return cleanText(textarea.placeholder);
    }
  }

  // 6. Associated label (inputs)
  if (tag === 'input') {
    const input = element as HTMLInputElement;
    // Check for associated label
    const label = findLabelFor(input);
    if (label) {
      return cleanText(label);
    }
  }

  // 7. Direct text content (immediate children only)
  const text = getDirectTextContent(element);
  if (text) {
    return cleanText(text);
  }

  // 8. For interactive elements, fall back to innerText (includes nested text)
  // This handles buttons like <div role="button"><div><span>Click me</span></div></div>
  const role = element.getAttribute('role');
  const isInteractiveElement = role && INTERACTIVE_ROLES.has(role.toLowerCase());
  const isClickableElement = element.hasAttribute('tabindex') ||
    (element as HTMLElement).style?.cursor === 'pointer';

  if (isInteractiveElement || isClickableElement || tag === 'button' || tag === 'a') {
    const htmlElement = element as HTMLElement;
    if ('innerText' in htmlElement) {
      const innerTextValue = htmlElement.innerText?.trim();
      if (innerTextValue && innerTextValue.length < 200 && !looksLikeCode(innerTextValue)) {
        return cleanText(innerTextValue);
      }
    }
  }

  // 9. value (for form elements)
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const value = (element as HTMLInputElement).value;
    if (value?.trim()) {
      return cleanText(value);
    }
  }

  return null;
}

/**
 * Get direct text content, only from immediate child text nodes
 * This avoids grabbing text from deeply nested interactive elements
 */
function getDirectTextContent(element: Element): string | null {
  // Only collect text from direct text node children, not all descendants
  let directText = '';

  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        directText += (directText ? ' ' : '') + text;
      }
    }
  }

  if (directText && !looksLikeCode(directText)) {
    return directText;
  }

  return null;
}

/**
 * Find label text for an input element
 */
function findLabelFor(input: HTMLInputElement): string | null {
  // Check for label wrapping the input
  const parentLabel = input.closest('label');
  if (parentLabel) {
    const labelText = parentLabel.textContent?.trim();
    if (labelText) {
      return labelText;
    }
  }

  // Check for label with for attribute
  const id = input.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      const labelText = label.textContent?.trim();
      if (labelText) {
        return labelText;
      }
    }
  }

  return null;
}

/**
 * Check if text looks like code/CSS/script content
 */
function looksLikeCode(text: string): boolean {
  if (text.length > 200) {
    return true;
  }

  if (/[<>]/.test(text)) {
    return true;
  }

  const lowered = text.toLowerCase();
  if (
    lowered.includes('<style') ||
    lowered.includes('<script') ||
    lowered.includes('::-webkit') ||
    lowered.includes('input::placeholder')
  ) {
    return true;
  }

  // Check for common code patterns
  const codePatterns = [
    /^\s*[\{\[]/, // Starts with { or [
    /[{};]\s*$/, // Ends with { } or ;
    /:\s*[a-z-]+\s*;/, // CSS property pattern
    /\{\s*\n/, // Multi-line block
    /^\s*\/[\/*]/, // Comment start
    /^\s*@(media|import|keyframes|font-face)/, // CSS at-rules
    /^\s*(function|const|let|var|import|export)\s/, // JS keywords
    /::\w+/, // CSS pseudo-elements
    /\([^)]*:[^)]*\)/, // Function with colon (like url())
  ];

  return codePatterns.some((pattern) => pattern.test(text));
}

/**
 * Clean and truncate text for output
 */
function cleanText(text: string): string {
  // Normalize whitespace
  let cleaned = text.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// =============================================================================
// OUTPUT FORMATTING
// =============================================================================

function buildElementLine(
  role: string,
  name: string | null,
  ref: string | undefined,
  depth: number
): string {
  const indent = '  '.repeat(depth);
  let line = `${indent}- ${role}`;

  if (name) {
    // Escape quotes in name
    const escapedName = name.replace(/"/g, '\\"');
    line += ` "${escapedName}"`;
  }

  if (ref) {
    line += ` [ref=${ref}]`;
  }

  return line;
}
