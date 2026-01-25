/**
 * Shared utilities for DOM actions
 */

// =============================================================================
// CONSTANTS
// =============================================================================

/** Delay after scrolling to allow animation to complete (ms) */
export const SCROLL_DELAY_MS = 300;

/** Delay after focusing an element (ms) */
export const FOCUS_DELAY_MS = 100;

/** Minimum visibility ratio to consider element "in viewport" (0-1) */
const MIN_VIEWPORT_RATIO = 0.5;

// =============================================================================
// VISIBILITY CHECKS
// =============================================================================

/**
 * Check if an element is visible on the page
 * Checks display, visibility, offsetParent, and aria-hidden
 */
export function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  // Check if element has layout (offsetParent is null for hidden elements)
  // Note: Need to handle both HTMLElement and SVGElement
  if ('offsetParent' in element) {
    const htmlElement = element as HTMLElement;
    if (htmlElement.offsetParent === null) {
      // Fixed/sticky elements have null offsetParent but are still visible
      if (style.position !== 'fixed' && style.position !== 'sticky') {
        // Exception for body/html which always have null offsetParent
        const tag = element.tagName.toLowerCase();
        if (tag !== 'body' && tag !== 'html') {
          return false;
        }
      }
    }
  }

  if (element.getAttribute('aria-hidden') === 'true') {
    return false;
  }

  return true;
}

/**
 * Check if an element is sufficiently visible in the viewport
 * Uses intersection ratio rather than requiring full visibility
 */
export function isInViewport(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  // Calculate how much of the element is visible
  const visibleTop = Math.max(0, rect.top);
  const visibleLeft = Math.max(0, rect.left);
  const visibleBottom = Math.min(viewportHeight, rect.bottom);
  const visibleRight = Math.min(viewportWidth, rect.right);

  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const visibleArea = visibleWidth * visibleHeight;

  const totalArea = rect.width * rect.height;
  if (totalArea === 0) {
    return false;
  }

  // Element is considered "in viewport" if at least MIN_VIEWPORT_RATIO is visible
  return visibleArea / totalArea >= MIN_VIEWPORT_RATIO;
}

/**
 * Check if an element is disabled
 * Handles native disabled attribute and ARIA disabled state
 */
export function isElementDisabled(element: Element): boolean {
  // Check native disabled property
  if ('disabled' in element && (element as HTMLButtonElement).disabled) {
    return true;
  }

  // Check aria-disabled
  if (element.getAttribute('aria-disabled') === 'true') {
    return true;
  }

  return false;
}

// =============================================================================
// SCROLL HELPERS
// =============================================================================

/**
 * Scroll element into view if not sufficiently visible
 * Returns true if scrolling was performed
 */
export async function scrollIntoViewIfNeeded(element: Element): Promise<boolean> {
  if (isInViewport(element)) {
    return false;
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  await delay(SCROLL_DELAY_MS);
  return true;
}

// =============================================================================
// ELEMENT GEOMETRY
// =============================================================================

/**
 * Get the center coordinates of an element for mouse events
 */
export function getElementCenter(element: Element): { clientX: number; clientY: number; screenX: number; screenY: number } {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  
  return {
    clientX,
    clientY,
    screenX: window.screenX + clientX,
    screenY: window.screenY + clientY,
  };
}

// =============================================================================
// TIMING HELPERS
// =============================================================================

/**
 * Promise-based delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
