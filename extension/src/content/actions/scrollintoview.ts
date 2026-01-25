/**
 * Scroll Into View Action
 * Scrolls an element into the visible area of the browser window
 */

import type { RefRegistry } from '../../shared/types';
import { scrollIntoViewIfNeeded } from './utils';

/**
 * Scroll element into view
 * @param ref - The reference ID from a previous snapshot
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found
 */
export async function scrollIntoView(ref: string, registry: RefRegistry): Promise<void> {
    const element = registry.get(ref);
    if (!element) {
        throw new Error(`Element with ref "${ref}" not found in registry`);
    }

    await scrollIntoViewIfNeeded(element);
}
