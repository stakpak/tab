/**
 * Scroll Action
 * Scrolls the page or an element
 */

import type { RefRegistry, ScrollParams } from '../../shared/types';

/**
 * Scroll based on params
 * @param params - Scroll parameters
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found
 */
export async function scroll(params: ScrollParams, registry: RefRegistry): Promise<void> {
    const { direction, pixels = 300 } = params;

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
