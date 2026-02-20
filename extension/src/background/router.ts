import type { AgentCommand, AgentResponse, ResponseData } from '../shared/types';
import type { ContentRequest, ContentResponse, ActionType } from '../shared/messages';

const lastTargetTabIds = new Map<number, number>();

/**
 * Clear the last target tab ID if it matches the given tab ID
 * Called when a tab is closed to prevent commands running on wrong tabs
 */
export function clearTargetTabIfMatch(tabId: number, windowId: number): void {
  const lastTabId = lastTargetTabIds.get(windowId);
  if (lastTabId === tabId) {
    lastTargetTabIds.delete(windowId);
  }
}

export async function routeCommand(command: AgentCommand, windowId: number): Promise<AgentResponse> {

  const tab = await getTargetTab(command.type, windowId);

  if (!tab) {
    return {
      id: command.id,
      success: false,
      error: 'No active tab found',
    };
  }

  if (!tab.id) {
    return {
      id: command.id,
      success: false,
      error: 'Tab has no ID',
    };
  }

  // Skip URL validation for 'open' command - it's meant to navigate away from any page
  if (command.type !== 'open' && (!tab.url || !isValidTabUrl(tab.url))) {
    return {
      id: command.id,
      success: false,
      error: 'Tab has invalid URL (likely a browser page)',
    };
  }

  if (command.type === 'snapshot') {
    lastTargetTabIds.set(windowId, tab.id!);
  }

  if (command.type === 'open') {
    const url = (command.params as any)?.url;
    if (!url) {
      return { id: command.id, success: false, error: 'Missing URL for open command' };
    }
    await chrome.tabs.update(tab.id, { url });
    lastTargetTabIds.set(windowId, tab.id!);
    return { id: command.id, success: true, data: { executed: true } };
  }

  if (command.type === 'back') {
    await chrome.tabs.goBack(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }

  if (command.type === 'forward') {
    await chrome.tabs.goForward(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }

  if (command.type === 'reload') {
    await chrome.tabs.reload(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }

  if (command.type === 'close') {
    await chrome.tabs.remove(tab.id);
    return { id: command.id, success: true, data: { executed: true } };
  }

  if (command.type === 'screenshot') {
    if (tab.windowId === undefined) {
      return { id: command.id, success: false, error: 'Tab has no associated window' };
    }
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      return { id: command.id, success: true, data: { screenshot: dataUrl } };
    } catch (error) {
      return { 
        id: command.id, 
        success: false, 
        error: error instanceof Error ? error.message : 'Screenshot capture failed (window may be minimized or not visible)' 
      };
    }
  }

  const contentRequest: ContentRequest = {
    action: command.type as ActionType,
    params: command.params as ContentRequest['params'],
  };

  try {
    const contentResponse = await sendToContentScript(tab.id, contentRequest);
    return {
      id: command.id,
      success: contentResponse.success,
      data: contentResponse.data as ResponseData | undefined,
      error: contentResponse.error,
    };
  } catch (error) {
    return {
      id: command.id,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message to content script',
    };
  }
}

async function getActiveTab(windowId: number): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({
    active: true,
    windowId,
  });
  return tabs[0] || null;
}

async function getTargetTab(commandType: AgentCommand['type'], windowId: number): Promise<chrome.tabs.Tab | null> {
  const lastTargetTabId = lastTargetTabIds.get(windowId) ?? null;
  if (commandType !== 'snapshot' && lastTargetTabId !== null) {
    try {
      const previousTab = await chrome.tabs.get(lastTargetTabId);
      if (previousTab?.url && isValidTabUrl(previousTab.url)) {
        return previousTab;
      }
    } catch {
      // Fall back to active tab
    }
  }

  return getActiveTab(windowId);
}

function isValidTabUrl(url: string): boolean {
  // Allow about:blank as it's a common starting point
  if (url === 'about:blank') return true;

  // Exclude browser internal pages
  return !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://') &&
    !url.startsWith('about:') &&
    !url.startsWith('edge://') &&
    !url.startsWith('moz-extension://') &&
    !url.startsWith('devtools://');
}

async function pingContentScript(tabId: number): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  // Try to ping the content script first
  if (await pingContentScript(tabId)) {
    return;
  }

  // Content script not present, inject it
  console.log('[Router] Content script not found, injecting...');
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['dist/content.js'],
  });

  // Retry ping with exponential backoff to verify injection succeeded
  const maxRetries = 5;
  for (let i = 0; i < maxRetries; i++) {
    const delay = 100 * Math.pow(2, i); // 100, 200, 400, 800, 1600ms
    await new Promise((resolve) => setTimeout(resolve, delay));
    
    if (await pingContentScript(tabId)) {
      console.log('[Router] Content script injected and responding');
      return;
    }
  }

  throw new Error('Content script failed to initialize after injection');
}

async function sendToContentScript(tabId: number, request: ContentRequest): Promise<ContentResponse> {
  // Ensure content script is injected first
  await ensureContentScriptInjected(tabId);

  return new Promise((resolve, reject) => {
    // Set a timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error('Content script message timeout'));
    }, 10000); // 10 second timeout

    chrome.tabs.sendMessage(tabId, request, (response) => {
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response) {
        resolve(response as ContentResponse);
      } else {
        reject(new Error('No response from content script'));
      }
    });
  });
}
