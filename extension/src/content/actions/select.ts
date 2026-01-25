/**
 * Select Action
 * Selects an option in a dropdown by its ref identifier
 */

import type { RefRegistry, SelectParams } from '../../shared/types';
import {
    isElementVisible,
    scrollIntoViewIfNeeded,
} from './utils';

/**
 * Select an option in a dropdown
 * @param params - Select parameters
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found, not visible, or not a select element
 */
export async function selectOption(
    params: SelectParams,
    registry: RefRegistry
): Promise<void> {
    const { ref, value } = params;
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

    if (!(element instanceof HTMLSelectElement)) {
        throw new Error(`Element with ref "${ref}" is not a select element`);
    }

    await scrollIntoViewIfNeeded(element);

    // Try to find option by value first, then by text
    let optionToSelect: HTMLOptionElement | null = null;

    for (let i = 0; i < element.options.length; i++) {
        const opt = element.options[i];
        if (opt.value === value || opt.text.trim() === value) {
            optionToSelect = opt;
            break;
        }
    }

    if (!optionToSelect) {
        throw new Error(`Option with value or text "${value}" not found in select element`);
    }

    if (element.value === optionToSelect.value) {
        return; // Already selected
    }

    element.value = optionToSelect.value;

    // Dispatch events
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
}
