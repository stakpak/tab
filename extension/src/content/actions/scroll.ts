/**
 * Scroll Action
 * Scrolls the page or an element
 */

import type { RefRegistry, ScrollParams } from '../../shared/types';

const VALID_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

/**
 * Scroll based on params
 * @param params - Scroll parameters
 * @param _registry - The ref registry from the last snapshot (reserved for future element scrolling)
 */
export async function scroll(params: ScrollParams, _registry: RefRegistry | null): Promise<void> {
    const { direction, pixels = 300 } = params;

    if (!direction || !VALID_DIRECTIONS.includes(direction as any)) {
        throw new Error(`Invalid scroll direction: "${direction}". Must be one of: ${VALID_DIRECTIONS.join(', ')}`);
    }

    let x = 0;
    let y = 0;

    switch (direction) {
        case 'up': y = -pixels; break;
        case 'down': y = pixels; break;
        case 'left': x = -pixels; break;
        case 'right': x = pixels; break;
    }

    window.scrollBy({
        left: x,
        top: y,
        behavior: 'smooth'
    });
}
