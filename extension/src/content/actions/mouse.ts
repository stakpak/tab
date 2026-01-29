/**
 * Mouse Action
 * Performs low-level mouse interactions
 */

import type { MouseParams } from '../../shared/types';

/**
 * Get element at coordinates or throw error
 */
function getElementAtPoint(x: number, y: number): Element {
    const element = document.elementFromPoint(x, y);
    if (!element) {
        throw new Error(`No element found at coordinates (${x}, ${y})`);
    }
    return element;
}

/**
 * Perform mouse action
 * @param params - Mouse parameters
 */
export async function mouseAction(params: MouseParams): Promise<void> {
    const { action, x = 0, y = 0, button = 0, dx = 0, dy = 0 } = params;

    switch (action) {
        case 'move': {
            const target = getElementAtPoint(x, y);
            const event = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y
            });
            target.dispatchEvent(event);
            break;
        }

        case 'down': {
            const target = getElementAtPoint(x, y);
            const event = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: button
            });
            target.dispatchEvent(event);
            break;
        }

        case 'up': {
            const target = getElementAtPoint(x, y);
            const event = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: button
            });
            target.dispatchEvent(event);
            break;
        }

        case 'wheel': {
            const target = document.elementFromPoint(x, y);
            const event = new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                deltaX: dx,
                deltaY: dy
            });
            if (target) {
                target.dispatchEvent(event);
            } else {
                // No element at point, scroll the window directly
                window.scrollBy(dx, dy);
            }
            break;
        }

        default: {
            throw new Error(`Unknown mouse action: ${action}`);
        }
    }
}
