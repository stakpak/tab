/**
 * Focus Action
 * Focuses an element by its ref identifier
 */

import type { RefRegistry } from '../../shared/types';
import {
    isElementVisible,
    scrollIntoViewIfNeeded,
    delay,
    FOCUS_DELAY_MS,
} from './utils';

/**
 * Focus an element identified by ref
 * @param ref - The reference ID from a previous snapshot
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found or not visible
 */
export async function focusElement(ref: string, registry: RefRegistry): Promise<void> {
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

    const htmlElement = element as HTMLElement;
    htmlElement.focus();
    await delay(FOCUS_DELAY_MS);
}
