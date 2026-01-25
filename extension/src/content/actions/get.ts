/**
 * Get Info Action
 * Retrieves information about elements or the page
 */

import type { RefRegistry, GetParams } from '../../shared/types';
import { isElementVisible } from './utils';

/**
 * Get information based on params
 * @param params - Get parameters
 * @param registry - The ref registry from the last snapshot
 * @returns The requested information
 * @throws Error if element not found or invalid parameters
 */
export async function getInfo(params: GetParams, registry: RefRegistry): Promise<any> {
    const { what, ref, selector, attrName } = params;

    // Page-level info
    if (what === 'title') {
        return document.title;
    }
    if (what === 'url') {
        return window.location.href;
    }

    // Selector-based info
    if (what === 'count') {
        if (!selector) {
            throw new Error('Missing selector for count action');
        }
        return document.querySelectorAll(selector).length;
    }

    // Element-based info (requires ref)
    if (!ref) {
        throw new Error(`Missing ref for "get ${what}" action`);
    }

    const element = registry.get(ref);
    if (!element) {
        throw new Error(`Element with ref "${ref}" not found in registry`);
    }

    switch (what) {
        case 'text':
            return (element as HTMLElement).innerText || element.textContent || '';

        case 'html':
            return element.outerHTML;

        case 'value':
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
                return element.value;
            }
            throw new Error(`Element with ref "${ref}" does not have a value`);

        case 'attr':
            if (!attrName) {
                throw new Error('Missing attrName for attr action');
            }
            return element.getAttribute(attrName);

        case 'box': {
            const rect = element.getBoundingClientRect();
            return {
                x: rect.left + window.scrollX,
                y: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
            };
        }

        default:
            throw new Error(`Unknown get info type: ${what}`);
    }
}
