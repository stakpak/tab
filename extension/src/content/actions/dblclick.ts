/**
 * Double Click Action
 * Double-clicks an element by its ref identifier
 */

import type { RefRegistry } from '../../shared/types';
import {
    isElementVisible,
    isElementDisabled,
    scrollIntoViewIfNeeded,
    getElementCenter,
} from './utils';

/**
 * Double-click an element identified by ref
 * @param ref - The reference ID from a previous snapshot
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found, not in DOM, disabled, or cannot be clicked
 */
export async function dblclickElement(ref: string, registry: RefRegistry): Promise<void> {
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

    const commonEventInit: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: coords.clientX,
        clientY: coords.clientY,
        screenX: coords.screenX,
        screenY: coords.screenY,
    };

    // First click
    element.dispatchEvent(new PointerEvent('pointerdown', { ...commonEventInit, isPrimary: true }));
    element.dispatchEvent(new MouseEvent('mousedown', commonEventInit));
    element.dispatchEvent(new PointerEvent('pointerup', { ...commonEventInit, buttons: 0, isPrimary: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...commonEventInit, buttons: 0 }));
    element.dispatchEvent(new MouseEvent('click', { ...commonEventInit, buttons: 0, detail: 1 }));

    // Second click
    element.dispatchEvent(new PointerEvent('pointerdown', { ...commonEventInit, isPrimary: true }));
    element.dispatchEvent(new MouseEvent('mousedown', commonEventInit));
    element.dispatchEvent(new PointerEvent('pointerup', { ...commonEventInit, buttons: 0, isPrimary: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { ...commonEventInit, buttons: 0 }));
    element.dispatchEvent(new MouseEvent('click', { ...commonEventInit, buttons: 0, detail: 2 }));

    // Double click event
    const dblClickEvent = new MouseEvent('dblclick', { ...commonEventInit, buttons: 0, detail: 2 });
    element.dispatchEvent(dblClickEvent);
}
