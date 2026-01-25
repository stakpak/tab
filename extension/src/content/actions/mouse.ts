/**
 * Mouse Action
 * Performs low-level mouse interactions
 */

import type { MouseParams } from '../../shared/types';

/**
 * Perform mouse action
 * @param params - Mouse parameters
 */
export async function mouseAction(params: MouseParams): Promise<void> {
    const { action, x = 0, y = 0, button = 0, dx = 0, dy = 0 } = params;

    switch (action) {
        case 'move': {
            const event = new MouseEvent('mousemove', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y
            });
            document.elementFromPoint(x, y)?.dispatchEvent(event);
            break;
        }

        case 'down': {
            const event = new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: button
            });
            document.elementFromPoint(x, y)?.dispatchEvent(event);
            break;
        }

        case 'up': {
            const event = new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                button: button
            });
            document.elementFromPoint(x, y)?.dispatchEvent(event);
            break;
        }

        case 'wheel': {
            const event = new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                deltaX: dx,
                deltaY: dy
            });
            document.elementFromPoint(x, y)?.dispatchEvent(event);
            // Also actually scroll if it's a wheel event on the window/body
            if (!document.elementFromPoint(x, y)) {
                window.scrollBy(dx, dy);
            }
            break;
        }
    }
}
