/**
 * Content Script Entry Point
 * Listens for messages from background script and executes actions
 */

import type { ContentRequest, ContentResponse } from '../shared/messages';
import { executeAction } from './executor';

/**
 * Validate message as ContentRequest
 */
function isValidContentRequest(message: unknown): message is ContentRequest {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const msg = message as Record<string, unknown>;
  const validActions = [
    'snapshot', 'click', 'dblclick', 'fill', 'type', 'press', 'hover', 'focus', 'check', 'uncheck', 'select', 'get', 'is',
    'drag', 'upload', 'scroll', 'scrollintoview', 'wait', 'eval', 'find', 'mouse'
  ];

  if (typeof msg.action !== 'string' || !validActions.includes(msg.action)) {
    return false;
  }

  const params = msg.params;
  if (params !== undefined && (typeof params !== 'object' || params === null)) {
    return false;
  }

  if (msg.action === 'snapshot') {
    if (params === undefined) {
      return true;
    }
    const timeout = (params as Record<string, unknown>).timeout;
    return timeout === undefined || typeof timeout === 'number';
  }

  if (msg.action === 'click' || msg.action === 'dblclick' || msg.action === 'hover' || msg.action === 'focus' || msg.action === 'check' || msg.action === 'uncheck') {
    if (!params) {
      return false;
    }
    return typeof (params as Record<string, unknown>).ref === 'string';
  }

  if (msg.action === 'fill') {
    if (!params) {
      return false;
    }
    const paramRecord = params as Record<string, unknown>;
    return typeof paramRecord.ref === 'string' && typeof paramRecord.value === 'string';
  }

  if (msg.action === 'type') {
    if (!params) {
      return false;
    }
    const paramRecord = params as Record<string, unknown>;
    return (
      typeof paramRecord.ref === 'string' &&
      typeof paramRecord.text === 'string' &&
      (paramRecord.delay === undefined || typeof paramRecord.delay === 'number')
    );
  }

  if (msg.action === 'press') {
    if (!params) {
      return false;
    }
    const paramRecord = params as Record<string, unknown>;
    return (
      typeof paramRecord.key === 'string' &&
      (paramRecord.ref === undefined || typeof paramRecord.ref === 'string')
    );
  }

  if (msg.action === 'select') {
    if (!params) {
      return false;
    }
    const paramRecord = params as Record<string, unknown>;
    return typeof paramRecord.ref === 'string' && typeof paramRecord.value === 'string';
  }

  if (msg.action === 'get') {
    if (!params) {
      return false;
    }
    const paramRecord = params as Record<string, unknown>;
    return typeof paramRecord.what === 'string';
  }

  if (msg.action === 'is') {
    if (!params) {
      return false;
    }
    const paramRecord = params as Record<string, unknown>;
    return typeof paramRecord.what === 'string' && typeof paramRecord.ref === 'string';
  }

  if (msg.action === 'scroll') {
    if (!params) return false;
    const p = params as Record<string, unknown>;
    return typeof p.direction === 'string' && (p.pixels === undefined || typeof p.pixels === 'number');
  }

  if (msg.action === 'scrollintoview') {
    if (!params) return false;
    return typeof (params as Record<string, unknown>).ref === 'string';
  }

  if (msg.action === 'wait') {
    if (!params) return true; // wait can have no params (default wait)
    const p = params as Record<string, unknown>;
    return (
      (p.ms === undefined || typeof p.ms === 'number') &&
      (p.ref === undefined || typeof p.ref === 'string') &&
      (p.selector === undefined || typeof p.selector === 'string')
    );
  }

  // Placeholder validation for other actions
  if (['drag', 'upload', 'find', 'mouse'].includes(msg.action)) {
    return true;
  }

  return false;
}

/**
 * Initialize content script
 * - Set up chrome.runtime message listener
 * - Handle incoming action requests
 */
function init(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle ping (used to check if content script is loaded)
    if (message && typeof message === 'object' && (message as Record<string, unknown>).action === 'ping') {
      sendResponse({ success: true, pong: true });
      return true;
    }

    // Validate message
    if (!isValidContentRequest(message)) {
      console.error('[Content Script] Invalid message format:', message);
      sendResponse({
        success: false,
        error: 'Invalid message format',
      } as ContentResponse);
      return true; // Keep channel open for consistency
    }

    // Execute action asynchronously
    executeAction(message)
      .then((response) => {
        console.log('[Content Script] Action completed:', message.action);
        sendResponse(response);
      })
      .catch((error) => {
        console.error('[Content Script] Action failed:', message.action, error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        } as ContentResponse);
      });

    // Return true to indicate we'll send response asynchronously
    return true;
  });

  console.log('[Content Script] Initialized');
}

// Initialize on load
init();
