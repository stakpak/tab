import type { AgentCommand, AgentResponse, ResponseData } from '../shared/types';
import type { ContentRequest, ContentResponse, ActionType } from '../shared/messages';

let lastTargetTabId: number | null = null;

export async function routeCommand(command: AgentCommand): Promise<AgentResponse> {

  const tab = await getTargetTab(command.type);

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

  if (!tab.url || !isValidTabUrl(tab.url)) {
    return {
      id: command.id,
      success: false,
      error: 'Tab has invalid URL (likely a browser page)',
    };
  }

  if (command.type === 'snapshot') {
    lastTargetTabId = tab.id;
  }

  if (command.type === 'open') {
    const url = (command.params as any)?.url;
    if (!url) {
      return { id: command.id, success: false, error: 'Missing URL for open command' };
    }
    await chrome.tabs.update(tab.id, { url });
    lastTargetTabId = tab.id;
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
    // tab.windowId is guaranteed to exist for a valid tab object
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' });
    return { id: command.id, success: true, data: { screenshot: dataUrl } };
  }

  if (command.type === 'pdf') {
    return new Promise((resolve) => {
      const target = { tabId: tab.id! };
      chrome.debugger.attach(target, '1.3', async () => {
        if (chrome.runtime.lastError) {
          resolve({ id: command.id, success: false, error: chrome.runtime.lastError.message });
          return;
        }

        chrome.debugger.sendCommand(target, 'Page.printToPDF', {}, (result: any) => {
          const error = chrome.runtime.lastError;
          chrome.debugger.detach(target);

          if (error) {
            resolve({ id: command.id, success: false, error: error.message });
          } else {
            resolve({ id: command.id, success: true, data: { result: result.data } });
          }
        });
      });
    });
  }

  if (command.type === 'upload') {
    const ref = (command.params as any)?.ref;
    const files = (command.params as any)?.files;
    if (!ref || !files) return { id: command.id, success: false, error: 'Missing ref or files' };

    return new Promise((resolve) => {
      const target = { tabId: tab.id! };
      chrome.debugger.attach(target, '1.3', async () => {
        if (chrome.runtime.lastError) {
          resolve({ id: command.id, success: false, error: chrome.runtime.lastError.message });
          return;
        }

        // 1. Get the document to get the root nodeId
        chrome.debugger.sendCommand(target, 'DOM.getDocument', {}, async (doc: any) => {
          // 2. Find the element using a selector (we'll inject a temporary attribute to find it)
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (refId: string) => {
              // This is a bit hacky but works: find the element in the registry and mark it
              // @ts-ignore
              const el = window.__REF_REGISTRY__?.get(refId);
              if (el) el.setAttribute('data-upload-target', 'true');
            },
            args: [ref]
          });

          chrome.debugger.sendCommand(target, 'DOM.querySelector', {
            nodeId: doc.root.nodeId,
            selector: '[data-upload-target="true"]'
          }, (node: any) => {
            if (!node || !node.nodeId) {
              chrome.debugger.detach(target);
              resolve({ id: command.id, success: false, error: 'Could not find upload target element' });
              return;
            }

            // 3. Set the files
            chrome.debugger.sendCommand(target, 'DOM.setFileInputFiles', {
              nodeId: node.nodeId,
              files: files
            }, () => {
              const error = chrome.runtime.lastError;

              // Cleanup attribute
              chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.querySelector('[data-upload-target="true"]')?.removeAttribute('data-upload-target')
              });

              chrome.debugger.detach(target);
              if (error) {
                resolve({ id: command.id, success: false, error: error.message });
              } else {
                resolve({ id: command.id, success: true, data: { executed: true } });
              }
            });
          });
        });
      });
    });
  }

  if (command.type === 'eval') {
    const script = (command.params as any)?.script;
    if (!script) return { id: command.id, success: false, error: 'Missing script' };

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: (scriptStr: string) => {
          try {
            return new Function(scriptStr)();
          } catch (e) {
            return { error: e instanceof Error ? e.message : String(e) };
          }
        },
        args: [script]
      });

      const result = results[0]?.result;
      if (result && typeof result === 'object' && 'error' in result) {
        return { id: command.id, success: false, error: result.error };
      }

      return { id: command.id, success: true, data: { result } };
    } catch (error) {
      console.error('[Router] Eval failed:', error);
      return { id: command.id, success: false, error: error instanceof Error ? error.message : String(error) };
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

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tabs[0] || null;
}

async function getTargetTab(commandType: AgentCommand['type']): Promise<chrome.tabs.Tab | null> {
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

  return getActiveTab();
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

async function ensureContentScriptInjected(tabId: number): Promise<void> {
  try {
    // Try to ping the content script first
    await new Promise<void>((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  } catch {
    // Content script not present, inject it
    console.log('[Router] Content script not found, injecting...');
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['dist/content.js'],
    });
    // Give it a moment to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('[Router] Content script injected');
  }
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
