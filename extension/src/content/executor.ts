/**
 * Action Executor
 * Dispatches incoming requests to appropriate action handlers
 */

import type { ContentRequest, ContentResponse } from '../shared/messages';
import type { RefRegistry } from '../shared/types';
import { generateSnapshot, createRefRegistry } from './actions/snapshot';
import { clickElement } from './actions/click';
import { dblclickElement } from './actions/dblclick';
import { fillElement } from './actions/fill';
import { typeElement } from './actions/type';
import { focusElement } from './actions/focus';
import { hoverElement } from './actions/hover';
import { pressKey } from './actions/press';
import { setChecked } from './actions/check';
import { selectOption } from './actions/select';
import { getInfo } from './actions/get';
import { checkState } from './actions/is';
import { scroll } from './actions/scroll';
import { scrollIntoView } from './actions/scrollintoview';
import { wait } from './actions/wait';
import { findElement } from './actions/find';
import { mouseAction } from './actions/mouse';
import { dragAndDrop } from './actions/drag';

// Module-level ref registry (snapshot-local, cleared on each snapshot)
let currentRegistry: RefRegistry = createRefRegistry();

/**
 * Execute an action request from the background script
 */
export async function executeAction(request: ContentRequest): Promise<ContentResponse> {
  try {
    switch (request.action) {
      case 'snapshot': {
        const timeout = (request.params?.timeout as number | undefined) || 5000;
        const result = await generateSnapshot(timeout);
        currentRegistry = result.refRegistry;
        // Expose registry for background script (e.g. for upload)
        (window as any).__REF_REGISTRY__ = currentRegistry;
        return {
          success: true,
          data: {
            snapshot: result.snapshot,
            url: window.location.href,
            title: document.title,
          },
        };
      }

      case 'click': {
        if (!currentRegistry) {
          return {
            success: false,
            error: 'No active snapshot - call snapshot action first',
          };
        }
        const ref = request.params?.ref as string | undefined;
        if (!ref) {
          return {
            success: false,
            error: 'Missing ref parameter for click action',
          };
        }
        await clickElement(ref, currentRegistry);
        return {
          success: true,
          data: { executed: true },
        };
      }

      case 'dblclick': {
        if (!currentRegistry) {
          return {
            success: false,
            error: 'No active snapshot - call snapshot action first',
          };
        }
        const ref = request.params?.ref as string | undefined;
        if (!ref) {
          return {
            success: false,
            error: 'Missing ref parameter for dblclick action',
          };
        }
        await dblclickElement(ref, currentRegistry);
        return {
          success: true,
          data: { executed: true },
        };
      }

      case 'fill': {
        if (!currentRegistry) {
          return {
            success: false,
            error: 'No active snapshot - call snapshot action first',
          };
        }
        const ref = request.params?.ref as string | undefined;
        const value = request.params?.value as string | undefined;
        if (!ref || value === undefined) {
          return {
            success: false,
            error: 'Missing ref or value parameter for fill action',
          };
        }
        await fillElement(ref, value, currentRegistry);
        return {
          success: true,
          data: { executed: true },
        };
      }

      case 'type': {
        if (!currentRegistry) {
          return {
            success: false,
            error: 'No active snapshot - call snapshot action first',
          };
        }
        const ref = request.params?.ref;
        const text = request.params?.text;
        const delay = request.params?.delay;
        if (!ref || text === undefined) return { success: false, error: 'Missing ref or text' };
        await typeElement({ ref, text, delay }, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'focus': {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: 'Missing ref' };
        await focusElement(ref, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'hover': {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: 'Missing ref' };
        await hoverElement(ref, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'press': {
        const key = request.params?.key;
        const ref = request.params?.ref;
        if (!key) return { success: false, error: 'Missing key' };
        await pressKey({ key, ref }, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'check': {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: 'Missing ref' };
        await setChecked(ref, true, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'uncheck': {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: 'Missing ref' };
        await setChecked(ref, false, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'select': {
        const ref = request.params?.ref;
        const value = request.params?.value;
        if (!ref || value === undefined) return { success: false, error: 'Missing ref or value' };
        await selectOption({ ref, value }, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'get': {
        const what = request.params?.what as any;
        const ref = request.params?.ref;
        const selector = request.params?.selector;
        const attrName = request.params?.attrName;
        if (!what) return { success: false, error: 'Missing what' };
        const result = await getInfo(
          { what, ref, selector, attrName },
          currentRegistry
        );
        return { success: true, data: { result } };
      }

      case 'is': {
        const what = request.params?.what as any;
        const ref = request.params?.ref;
        if (!what || !ref) return { success: false, error: 'Missing what or ref' };
        const result = await checkState(
          { what, ref },
          currentRegistry
        );
        return { success: true, data: { result } };
      }

      case 'scroll': {
        const direction = request.params?.direction as any;
        const pixels = request.params?.pixels;
        await scroll({ direction, pixels }, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'scrollintoview': {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: 'Missing ref' };
        await scrollIntoView(ref, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'wait': {
        const ms = request.params?.ms;
        const ref = request.params?.ref;
        const selector = request.params?.selector;
        await wait({ ms, ref, selector }, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'drag': {
        const src = request.params?.src;
        const dst = request.params?.dst;
        if (!src || !dst) return { success: false, error: 'Missing src or dst' };
        await dragAndDrop({ src, dst }, currentRegistry);
        return { success: true, data: { executed: true } };
      }

      case 'find': {
        const locator = request.params?.locator as any;
        const value = request.params?.value;
        if (!locator || !value) return { success: false, error: 'Missing locator or value' };
        const ref = await findElement(
          { locator, value, text: request.params?.text },
          currentRegistry
        );
        return { success: true, data: { result: ref } };
      }

      case 'mouse': {
        const action = request.params?.action as any;
        if (!action) return { success: false, error: 'Missing action' };
        await mouseAction({
          action,
          x: request.params?.x,
          y: request.params?.y,
          button: request.params?.button,
          dx: request.params?.dx,
          dy: request.params?.dy
        });
        return { success: true, data: { executed: true } };
      }

      case 'upload': {
        return { success: false, error: `Action "${request.action}" not yet implemented` };
      }

      default: {
        const _exhaustive: never = request.action;
        return {
          success: false,
          error: `Unknown action: ${_exhaustive}`,
        };
      }
    }
  } catch (error) {
    console.error('[Executor] Action failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clear the current ref registry
 */
export function clearRegistry(): void {
  currentRegistry = null;
}
