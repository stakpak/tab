/**
 * Drag Action
 * Simulates drag and drop between two elements
 */

import type { RefRegistry, DragParams } from '../../shared/types';
import { scrollIntoViewIfNeeded } from './utils';

/**
 * Perform drag and drop
 * @param params - Drag parameters
 * @param registry - The ref registry
 * @throws Error if elements not found
 */
export async function dragAndDrop(params: DragParams, registry: RefRegistry): Promise<void> {
    const { src, dst } = params;

    const srcEl = registry.get(src);
    const dstEl = registry.get(dst);

    if (!srcEl) throw new Error(`Source element "${src}" not found`);
    if (!dstEl) throw new Error(`Destination element "${dst}" not found`);

    await scrollIntoViewIfNeeded(srcEl);
    await scrollIntoViewIfNeeded(dstEl);

    const srcRect = srcEl.getBoundingClientRect();
    const dstRect = dstEl.getBoundingClientRect();

    const startX = srcRect.left + srcRect.width / 2;
    const startY = srcRect.top + srcRect.height / 2;
    const endX = dstRect.left + dstRect.width / 2;
    const endY = dstRect.top + dstRect.height / 2;

    // Dispatch drag events
    const dataTransfer = new DataTransfer();

    srcEl.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    }));

    srcEl.dispatchEvent(new DragEvent('drag', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    }));

    dstEl.dispatchEvent(new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    }));

    dstEl.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    }));

    dstEl.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    }));

    srcEl.dispatchEvent(new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer
    }));
}
