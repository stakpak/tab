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

    if (!srcEl) throw new Error(`Source element "${src}" not found in registry`);
    if (!dstEl) throw new Error(`Destination element "${dst}" not found in registry`);

    // Verify elements are still in the DOM
    if (!document.contains(srcEl)) {
        throw new Error(`Source element "${src}" is no longer in the DOM`);
    }
    if (!document.contains(dstEl)) {
        throw new Error(`Destination element "${dst}" is no longer in the DOM`);
    }

    await scrollIntoViewIfNeeded(srcEl);
    await scrollIntoViewIfNeeded(dstEl);

    const srcRect = srcEl.getBoundingClientRect();
    const dstRect = dstEl.getBoundingClientRect();

    // Calculate center coordinates for the drag events
    const startX = srcRect.left + srcRect.width / 2;
    const startY = srcRect.top + srcRect.height / 2;
    const endX = dstRect.left + dstRect.width / 2;
    const endY = dstRect.top + dstRect.height / 2;

    // Dispatch drag events with proper coordinates
    const dataTransfer = new DataTransfer();

    srcEl.dispatchEvent(new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: startX,
        clientY: startY
    }));

    srcEl.dispatchEvent(new DragEvent('drag', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: startX,
        clientY: startY
    }));

    dstEl.dispatchEvent(new DragEvent('dragenter', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: endX,
        clientY: endY
    }));

    dstEl.dispatchEvent(new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: endX,
        clientY: endY
    }));

    dstEl.dispatchEvent(new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: endX,
        clientY: endY
    }));

    srcEl.dispatchEvent(new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        clientX: endX,
        clientY: endY
    }));
}
