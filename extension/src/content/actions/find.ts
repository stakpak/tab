/**
 * Find Action
 * Locates elements based on various criteria
 */

import type { RefRegistry, FindParams } from '../../shared/types';
import { isElementVisible } from './utils';

// Counter for generating unique refs
let findRefCounter = 0;

/**
 * Find element based on params
 * @param params - Find parameters
 * @param registry - The ref registry to populate
 * @returns The ref of the found element
 */
export async function findElement(params: FindParams, registry: RefRegistry): Promise<string | null> {
    const { locator, value, text } = params;

    let elements: Element[] = [];

    switch (locator) {
        case 'role':
            // Very basic role search
            elements = Array.from(document.querySelectorAll(`[role="${value}"], ${value}`));
            break;

        case 'text':
            elements = Array.from(document.querySelectorAll('*')).filter(el =>
                el.textContent?.trim().includes(value) && el.children.length === 0
            );
            break;

        case 'label':
            elements = Array.from(document.querySelectorAll('label')).filter(l =>
                l.textContent?.trim().includes(value)
            ).map(l => {
                if (l.htmlFor) return document.getElementById(l.htmlFor);
                return l.querySelector('input, select, textarea');
            }).filter((el): el is Element => el !== null);
            break;

        case 'placeholder':
            elements = Array.from(document.querySelectorAll(`[placeholder*="${value}"]`));
            break;

        case 'alt':
            elements = Array.from(document.querySelectorAll(`[alt*="${value}"]`));
            break;

        case 'title':
            elements = Array.from(document.querySelectorAll(`[title*="${value}"]`));
            break;

        case 'testid':
            elements = Array.from(document.querySelectorAll(`[data-testid="${value}"], [data-test-id="${value}"], [data-test="${value}"]`));
            break;

        case 'first':
            elements = [document.querySelector(value)].filter((el): el is Element => el !== null);
            break;

        case 'last': {
            const all = document.querySelectorAll(value);
            elements = all.length > 0 ? [all[all.length - 1]] : [];
            break;
        }

        case 'nth': {
            const n = parseInt(text || '0');
            const all = document.querySelectorAll(value);
            elements = all.length > n ? [all[n]] : [];
            break;
        }
    }

    // Filter for visible and interactive if possible
    const found = elements.find(el => isElementVisible(el));

    if (found) {
        // Check if it's already in registry
        for (const [ref, el] of (registry as any).entries.entries()) {
            if (el === found) return ref;
        }

        // Assign new ref if not found - use counter + timestamp for uniqueness
        const newRef = `f${Date.now()}_${++findRefCounter}`;
        registry.set(newRef, found);
        return newRef;
    }

    return null;
}
