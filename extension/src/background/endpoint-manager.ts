/**
 * Endpoint Manager
 * 
 * High-level orchestrator for daemon endpoint discovery.
 * Coordinates between native messaging (bootstrap/recovery) and storage (caching).
 * 
 * Flow:
 * 1. On startup: check cache → if miss, request via native messaging → cache result
 * 2. On connection loss: request via native messaging → update cache → reconnect
 */

import type { BrowserEndpoint, RegistrationResponse } from './native-messaging';
import { registerExtension, isNativeMessagingAvailable } from './native-messaging';
import { getCachedEndpoint, setCachedEndpoint, getCachedSessionId, setCachedSessionId } from './storage';

// =============================================================================
// Types
// =============================================================================

export interface EndpointWithSession {
  endpoint: BrowserEndpoint;
  sessionId: string;
}

export interface EndpointManager {
  /**
   * Get the daemon endpoint and session ID (from cache or via native messaging).
   * Called at startup and on connection loss.
   */
  getEndpointWithSession(): Promise<EndpointWithSession>;

  /**
   * Force refresh the endpoint and session via native messaging (register_extension).
   * Called when connection fails or on fresh startup.
   */
  refreshEndpoint(): Promise<EndpointWithSession>;

  /**
   * Build WebSocket URL from endpoint and session ID.
   */
  buildWebSocketUrl(endpoint: BrowserEndpoint, sessionId: string): string;

  /**
   * Get cached session ID if available.
   */
  getSessionId(): Promise<string | null>;
}

export interface EndpointManagerCallbacks {
  /** Called when endpoint is retrieved (cached or fresh) */
  onEndpointResolved?: (endpoint: BrowserEndpoint, fromCache: boolean) => void;
  /** Called when endpoint refresh fails */
  onEndpointError?: (error: Error) => void;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Minimum interval between native messaging requests (debounce)
 */
const MIN_REQUEST_INTERVAL_MS = 5000;

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an endpoint manager instance.
 * 
 * @param callbacks - Optional callbacks for endpoint events
 * @returns EndpointManager instance
 */
export function createEndpointManager(callbacks?: EndpointManagerCallbacks): EndpointManager {
  let lastRequestTime = 0;
  let pendingRequest: Promise<EndpointWithSession> | null = null;

  async function fetchFromNativeMessaging(): Promise<EndpointWithSession> {
    // Check if native messaging is available
    if (!isNativeMessagingAvailable()) {
      throw new Error('Native messaging is not available');
    }

    // Debounce: check time since last request
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Update last request time
    lastRequestTime = Date.now();

    // Register extension with daemon to get assigned session
    const registration = await registerExtension();

    const endpoint: BrowserEndpoint = { ip: registration.ip, port: registration.port };
    const sessionId = registration.sessionId;

    // Cache the results
    await setCachedEndpoint(endpoint);
    await setCachedSessionId(sessionId);

    return { endpoint, sessionId };
  }

  const manager: EndpointManager = {
    async getEndpointWithSession(): Promise<EndpointWithSession> {
      // Check cache first
      const cachedEndpoint = await getCachedEndpoint();
      const cachedSessionId = await getCachedSessionId();

      if (cachedEndpoint && cachedSessionId) {
        console.log('[EndpointManager] Using cached endpoint and session:', cachedEndpoint, cachedSessionId);
        callbacks?.onEndpointResolved?.(cachedEndpoint, true);
        return { endpoint: cachedEndpoint, sessionId: cachedSessionId };
      }

      // Cache miss - register via native messaging
      console.log('[EndpointManager] Cache miss, registering via native messaging');
      return manager.refreshEndpoint();
    },

    async refreshEndpoint(): Promise<EndpointWithSession> {
      // If there's already a pending request, return it (coalesce concurrent calls)
      if (pendingRequest) {
        console.log('[EndpointManager] Returning pending request');
        return pendingRequest;
      }

      try {
        pendingRequest = fetchFromNativeMessaging();
        const result = await pendingRequest;

        console.log('[EndpointManager] Registered via native messaging:', result);
        callbacks?.onEndpointResolved?.(result.endpoint, false);

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('[EndpointManager] Failed to register:', err.message);
        callbacks?.onEndpointError?.(err);
        throw err;
      } finally {
        pendingRequest = null;
      }
    },

    buildWebSocketUrl(endpoint: BrowserEndpoint, sessionId: string): string {
      return `ws://${endpoint.ip}:${endpoint.port}/ws/session/${sessionId}`;
    },

    async getSessionId(): Promise<string | null> {
      return getCachedSessionId();
    },
  };

  return manager;
}
