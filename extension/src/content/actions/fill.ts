/**
 * Fill Action
 * Fills an input element by its ref identifier
 */

import type { RefRegistry } from '../../shared/types';
import {
  isElementVisible,
  scrollIntoViewIfNeeded,
  delay,
  FOCUS_DELAY_MS,
} from './utils';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Input types that cannot be filled with text */
const NON_FILLABLE_INPUT_TYPES = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'file',
  'image',
  'range',
  'color',
]);

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Fill an input element identified by ref
 * @param ref - The reference ID from a previous snapshot
 * @param value - The value to fill
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found, not fillable, or cannot be filled
 */
export async function fillElement(ref: string, value: string, registry: RefRegistry): Promise<void> {
  // Look up element in registry
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }

  // Verify element is still in DOM
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }

  // Verify element is still visible
  if (!isElementVisible(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }

  // Verify element is fillable
  const fillableCheck = isFillableElement(element);
  if (!fillableCheck.fillable) {
    throw new Error(`Element with ref "${ref}" is not fillable: ${fillableCheck.reason}`);
  }

  // Scroll into view if needed
  await scrollIntoViewIfNeeded(element);

  // Focus element and wait for focus to settle
  const htmlElement = element as HTMLElement;
  htmlElement.focus();
  await delay(FOCUS_DELAY_MS);

  // Dispatch keydown for frameworks that listen to it
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));

  // Set value based on element type
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
  } else if (htmlElement.isContentEditable) {
    // contenteditable element - use innerText to preserve line breaks
    htmlElement.innerText = value;
  }

  // Dispatch InputEvent for better framework compatibility
  const inputEvent = new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: value,
  });
  element.dispatchEvent(inputEvent);

  // Dispatch keyup
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true }));

  // Dispatch change event
  const changeEvent = new Event('change', {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(changeEvent);
}

// =============================================================================
// HELPERS
// =============================================================================

interface FillableCheck {
  fillable: boolean;
  reason?: string;
}

/**
 * Check if an element is fillable (input, textarea, or contenteditable)
 * Returns detailed reason if not fillable
 */
function isFillableElement(element: Element): FillableCheck {
  if (element instanceof HTMLInputElement) {
    const type = element.type?.toLowerCase() || 'text';

    if (NON_FILLABLE_INPUT_TYPES.has(type)) {
      return { fillable: false, reason: `input type "${type}" is not fillable` };
    }
    if (element.readOnly) {
      return { fillable: false, reason: 'input is read-only' };
    }
    if (element.disabled) {
      return { fillable: false, reason: 'input is disabled' };
    }
    return { fillable: true };
  }

  if (element instanceof HTMLTextAreaElement) {
    if (element.readOnly) {
      return { fillable: false, reason: 'textarea is read-only' };
    }
    if (element.disabled) {
      return { fillable: false, reason: 'textarea is disabled' };
    }
    return { fillable: true };
  }

  // Check for contenteditable
  if ((element as HTMLElement).isContentEditable) {
    return { fillable: true };
  }

  return { fillable: false, reason: 'element is not an input, textarea, or contenteditable' };
}
