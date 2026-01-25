/**
 * Click Action
 * Clicks an element by its ref identifier
 */

import type { RefRegistry } from '../../shared/types';
import {
  isElementVisible,
  isElementDisabled,
  scrollIntoViewIfNeeded,
  getElementCenter,
} from './utils';

/**
 * Click an element identified by ref
 * @param ref - The reference ID from a previous snapshot
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found, not in DOM, disabled, or cannot be clicked
 */
export async function clickElement(ref: string, registry: RefRegistry): Promise<void> {
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

  // Verify element is not disabled
  if (isElementDisabled(element)) {
    throw new Error(`Element with ref "${ref}" is disabled`);
  }

  // Scroll element into view if needed
  await scrollIntoViewIfNeeded(element);

  // Get element center coordinates for realistic mouse events
  const coords = getElementCenter(element);

  // Dispatch full event sequence: pointerdown -> mousedown -> pointerup -> mouseup -> click
  // This is more realistic and compatible with modern frameworks (React, etc.)
  const commonEventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX: coords.clientX,
    clientY: coords.clientY,
    screenX: coords.screenX,
    screenY: coords.screenY,
  };

  // Pointer events (modern standard)
  element.dispatchEvent(new PointerEvent('pointerdown', { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new MouseEvent('mousedown', commonEventInit));

  // Release
  element.dispatchEvent(new PointerEvent('pointerup', { ...commonEventInit, buttons: 0, isPrimary: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { ...commonEventInit, buttons: 0 }));

  // Final click
  const clickEvent = new MouseEvent('click', { ...commonEventInit, buttons: 0 });
  const cancelled = !element.dispatchEvent(clickEvent);

  // If the event wasn't cancelled but nothing happened, try the native .click() method
  // This is often needed for native links and buttons in some browsers
  if (!cancelled && typeof (element as HTMLElement).click === 'function') {
    (element as HTMLElement).click();
  }
}
