/**
 * Storage Module
 * 
 * Handles caching and retrieval of session ID from chrome.storage.local.
 * Session IDs are cached per windowId to support multiple windows.
 * ONE WINDOW = ONE SESSION.
 */

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_PREFIX = 'session_';

// =============================================================================
// Public API
// =============================================================================

/**
 * Get cached session ID for a specific window.
 * 
 * @param windowId - The Chrome window ID
 * @returns Promise resolving to cached session ID, or null if not cached
 */
export function getCachedSessionId(windowId: number): Promise<string | null> {
  const key = `${STORAGE_KEY_PREFIX}${windowId}`;
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      const stored = result[key];
      if (typeof stored === 'string' && stored.length > 0) {
        resolve(stored);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Cache session ID for a specific window.
 * 
 * @param windowId - The Chrome window ID
 * @param sessionId - The session ID to cache
 * @returns Promise resolving when cached
 */
export function setCachedSessionId(windowId: number, sessionId: string): Promise<void> {
  const key = `${STORAGE_KEY_PREFIX}${windowId}`;
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: sessionId }, () => {
      resolve();
    });
  });
}

/**
 * Clear cached session ID for a specific window.
 * 
 * @param windowId - The Chrome window ID
 * @returns Promise resolving when cleared
 */
export function clearCachedSessionId(windowId: number): Promise<void> {
  const key = `${STORAGE_KEY_PREFIX}${windowId}`;
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => {
      resolve();
    });
  });
}
