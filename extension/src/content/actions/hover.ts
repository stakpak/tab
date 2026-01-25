/**
 * Hover Action
 * Hovers an element by its ref identifier
 */

import type { RefRegistry } from '../../shared/types';
import {
    isElementVisible,
    scrollIntoViewIfNeeded,
} from './utils';

/**
 * Hover an element identified by ref
 * @param ref - The reference ID from a previous snapshot
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found or not visible
 */
export async function hoverElement(ref: string, registry: RefRegistry): Promise<void> {
    const element = registry.get(ref);
    if (!element) {
        throw new Error(`Element with ref "${ref}" not found in registry`);
    }

    if (!document.contains(element)) {
        throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
    }

    if (!isElementVisible(element)) {
        throw new Error(`Element with ref "${ref}" is not visible`);
    }

    await scrollIntoViewIfNeeded(element);

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const commonEventInit = {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        screenX: clientX,
        screenY: clientY,
    };

    // Dispatch pointer events
    element.dispatchEvent(new PointerEvent('pointerover', { ...commonEventInit, isPrimary: true }));
    element.dispatchEvent(new PointerEvent('pointerenter', { ...commonEventInit, isPrimary: true }));
    element.dispatchEvent(new PointerEvent('pointermove', { ...commonEventInit, isPrimary: true }));

    // Dispatch mouse events
    element.dispatchEvent(new MouseEvent('mouseover', commonEventInit));
    element.dispatchEvent(new MouseEvent('mouseenter', commonEventInit));
    element.dispatchEvent(new MouseEvent('mousemove', commonEventInit));
}
