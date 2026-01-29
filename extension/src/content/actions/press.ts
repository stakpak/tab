/**
 * Press Action
 * Presses a key, optionally on a specific element
 */

import type { RefRegistry } from '../../shared/types';
import {
    isElementVisible,
    scrollIntoViewIfNeeded,
    delay,
    FOCUS_DELAY_MS,
} from './utils';

/**
 * Press a key
 * @param params - Object containing key and optional ref
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found or not visible
 */
export async function pressKey(
    params: { key: string; ref?: string },
    registry: RefRegistry
): Promise<void> {
    const { key, ref } = params;
    let target: EventTarget = document.activeElement || document.body;

    if (ref) {
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
        (element as HTMLElement).focus();
        await delay(FOCUS_DELAY_MS);
        target = element;
    }

    const eventInit = {
        key,
        bubbles: true,
        cancelable: true,
    };

    target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    target.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    target.dispatchEvent(new KeyboardEvent('keyup', eventInit));
}
