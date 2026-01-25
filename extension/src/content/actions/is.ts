/**
 * Check State Action
 * Checks the state of an element
 */

import type { RefRegistry, IsParams } from '../../shared/types';
import { isElementVisible, isElementDisabled } from './utils';

/**
 * Check state based on params
 * @param params - Is parameters
 * @param registry - The ref registry from the last snapshot
 * @returns Boolean indicating the state
 * @throws Error if element not found or invalid parameters
 */
export async function checkState(params: IsParams, registry: RefRegistry): Promise<boolean> {
    const { what, ref } = params;

    const element = registry.get(ref);
    if (!element) {
        throw new Error(`Element with ref "${ref}" not found in registry`);
    }

    switch (what) {
        case 'visible':
            return isElementVisible(element);

        case 'enabled':
            return !isElementDisabled(element);

        case 'checked':
            if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
                return element.checked;
            }
            throw new Error(`Element with ref "${ref}" is not a checkbox or radio button`);

        default:
            throw new Error(`Unknown check state type: ${what}`);
    }
}
