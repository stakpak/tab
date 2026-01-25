/**
 * Type Action
 * Types text into an element by its ref identifier
 */

import type { RefRegistry, TypeParams } from '../../shared/types';
import {
    isElementVisible,
    scrollIntoViewIfNeeded,
    delay,
    FOCUS_DELAY_MS,
} from './utils';

/**
 * Type text into an element identified by ref
 * @param params - Type parameters
 * @param registry - The ref registry from the last snapshot
 * @throws Error if element not found or not visible
 */
export async function typeElement(
    params: TypeParams,
    registry: RefRegistry
): Promise<void> {
    const { ref, text, delay: charDelay = 0 } = params;
    // Look up element in registry
    const element = registry.get(ref);
    if (!element) {
        throw new Error(`Element with ref "${ref}" not found in registry`);
    }

    // Verify element is still in DOM
    if (!document.contains(element)) {
        throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
    }

    // Verify element is still visible
    if (!isElementVisible(element)) {
        throw new Error(`Element with ref "${ref}" is not visible`);
    }

    // Scroll into view if needed
    await scrollIntoViewIfNeeded(element);

    // Focus element and wait for focus to settle
    const htmlElement = element as HTMLElement;
    htmlElement.focus();
    await delay(FOCUS_DELAY_MS);

    // Type character by character
    for (const char of text) {
        // Dispatch keydown
        element.dispatchEvent(new KeyboardEvent('keydown', {
            key: char,
            bubbles: true,
            cancelable: true,
        }));

        // Insert character
        // We use execCommand if possible as it handles selection/cursor automatically
        // and triggers all necessary framework events (React, etc.)
        const inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, char);

        if (!inserted) {
            // Fallback for elements where execCommand might fail
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                const start = element.selectionStart || 0;
                const end = element.selectionEnd || 0;
                const val = element.value;
                element.value = val.slice(0, start) + char + val.slice(end);
                element.selectionStart = element.selectionEnd = start + 1;

                // Manual input event if execCommand failed
                element.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    inputType: 'insertText',
                    data: char,
                }));
            } else if (htmlElement.isContentEditable) {
                htmlElement.innerText += char;
                // Move cursor to end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(htmlElement);
                range.collapse(false);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        }

        // Dispatch keyup
        element.dispatchEvent(new KeyboardEvent('keyup', {
            key: char,
            bubbles: true,
            cancelable: true,
        }));

        if (charDelay > 0) {
            await delay(charDelay);
        }
    }

    // Dispatch change event at the end
    element.dispatchEvent(new Event('change', {
        bubbles: true,
        cancelable: true,
    }));
}
