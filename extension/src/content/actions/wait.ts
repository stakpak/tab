/**
 * Wait Action
 * Waits for a specified time or for an element to appear/become visible
 */

import type { RefRegistry, WaitParams } from '../../shared/types';
import { isElementVisible } from './utils';

/**
 * Wait based on params
 * @param params - Wait parameters
 * @param registry - The ref registry from the last snapshot
 */
export async function wait(params: WaitParams, registry: RefRegistry): Promise<void> {
    const { ms, ref, selector } = params;

    if (ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    if (ref) {
        // Wait for element in registry to be visible
        // Note: Registry is snapshot-local, so if it's not there now, it won't be there later
        // unless we take a new snapshot. But we can check visibility of an existing ref.
        const element = registry.get(ref);
        if (!element) {
            throw new Error(`Element with ref "${ref}" not found in registry`);
        }

        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timeout = 10000; // 10s default

            const check = () => {
                if (isElementVisible(element)) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject(new Error(`Timeout waiting for element ${ref} to become visible`));
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    if (selector) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timeout = 10000;

            const check = () => {
                const element = document.querySelector(selector);
                if (element && isElementVisible(element)) {
                    resolve();
                } else if (Date.now() - start > timeout) {
                    reject(new Error(`Timeout waiting for selector "${selector}" to appear and be visible`));
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }
}
