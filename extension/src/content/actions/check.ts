/**
 * Check/Uncheck Action
 * Sets the checked state of a checkbox or radio button
 */

import type { RefRegistry } from '../../shared/types';
import {
    isElementVisible,
    scrollIntoViewIfNeeded,
} from './utils';

/**
 * Set the checked state of an element
 * @param ref - The reference ID from a previous snapshot
 * @param checked - The desired checked state
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found, not visible, or not a checkbox/radio
 */
export async function setChecked(
    ref: string,
    checked: boolean,
    registry: RefRegistry
): Promise<void> {
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

    if (!(element instanceof HTMLInputElement)) {
        throw new Error(`Element with ref "${ref}" is not an input element`);
    }

    const type = element.type?.toLowerCase();
    if (type !== 'checkbox' && type !== 'radio') {
        throw new Error(`Element with ref "${ref}" is not a checkbox or radio button (type: ${type})`);
    }

    if (element.checked === checked) {
        return; // Already in desired state
    }

    await scrollIntoViewIfNeeded(element);

    // We simulate a click to trigger all side effects (React state changes, etc.)
    // but we also ensure the state is set correctly if click doesn't do it.
    element.click();

    // If click didn't change it (e.g. event.preventDefault()), we might need to force it
    // but usually click is what we want to simulate.
    if (element.checked !== checked) {
        element.checked = checked;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
