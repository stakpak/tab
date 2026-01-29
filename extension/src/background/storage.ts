/**
 * Storage Module
 * 
 * Handles caching and retrieval of browser endpoint from chrome.storage.local.
 * The endpoint is cached to avoid unnecessary native messaging calls.
 */

import type { BrowserEndpoint } from './native-messaging';

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_ENDPOINT = 'daemon_endpoint';
const STORAGE_KEY_SESSION_ID = 'daemon_session_id';

// =============================================================================
// Public API
// =============================================================================

/**
 * Get cached browser endpoint from storage.
 * 
 * @returns Promise resolving to cached endpoint, or null if not cached
 */
export function getCachedEndpoint(): Promise<BrowserEndpoint | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY_ENDPOINT, (result) => {
      const stored = result[STORAGE_KEY_ENDPOINT];

      // Validate stored value
      if (
        stored &&
        typeof stored === 'object' &&
        typeof stored.ip === 'string' &&
        typeof stored.port === 'number'
      ) {
        resolve({ ip: stored.ip, port: stored.port });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Cache browser endpoint to storage.
 * 
 * @param endpoint - The endpoint to cache
 * @returns Promise resolving when cached
 */
export function setCachedEndpoint(endpoint: BrowserEndpoint): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY_ENDPOINT]: endpoint }, () => {
      resolve();
    });
  });
}

/**
 * Clear cached endpoint from storage.
 * 
 * @returns Promise resolving when cleared
 */
export function clearCachedEndpoint(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEY_ENDPOINT, () => {
      resolve();
    });
  });
}

/**
 * Get cached session ID from storage.
 * 
 * @returns Promise resolving to cached session ID, or null if not cached
 */
export function getCachedSessionId(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY_SESSION_ID, (result) => {
      const stored = result[STORAGE_KEY_SESSION_ID];
      if (typeof stored === 'string' && stored.length > 0) {
        resolve(stored);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Cache session ID to storage.
 * 
 * @param sessionId - The session ID to cache
 * @returns Promise resolving when cached
 */
export function setCachedSessionId(sessionId: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY_SESSION_ID]: sessionId }, () => {
      resolve();
    });
  });
}

/**
 * Clear cached session ID from storage.
 * 
 * @returns Promise resolving when cleared
 */
export function clearCachedSessionId(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(STORAGE_KEY_SESSION_ID, () => {
      resolve();
    });
  });
}
