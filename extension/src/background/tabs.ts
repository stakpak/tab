/**
 * Tab Management
 * Handles tab-related commands using the chrome.tabs API
 */

import type { TabParams, AgentResponse, TabInfo } from '../shared/types';

/**
 * Handle tab-related commands
 * @param params - Tab command parameters
 * @returns Response data
 */
export async function handleTabCommand(
    params: TabParams,
    windowId: number
): Promise<Omit<AgentResponse, 'id'>> {
    let { action, url, tabId } = params;

    switch (action) {
        case 'new': {
            await chrome.tabs.create({ url, windowId });
            return { success: true, data: { executed: true } };
        }

        case 'list': {
            const tabs = await chrome.tabs.query({ windowId });

            const tabList: TabInfo[] = tabs.map((t) => ({
                id: t.id,
                url: t.url,
                title: t.title,
                active: t.active,
            }));

            const activeTabId = await getActiveTabId(windowId);

            return { success: true, data: { tabs: tabList, activeTabId } };
        }
                    
        case 'close': {
            tabId = tabId ?? (await getActiveTabId(windowId));

            if (tabId === undefined) {
                throw new Error('No active tab found to close');
            }

            const tab = await chrome.tabs.get(tabId);
            if (tab.windowId !== windowId) {
                throw new Error('tabId does not belong to the current window');
            }

            await chrome.tabs.remove(tabId);
            return { success: true, data: { executed: true } };
        }

        case 'switch': {
            if (tabId === undefined) throw new Error('tabId required for switch action');
            const tab = await chrome.tabs.get(tabId);
            if (tab.windowId !== windowId) {
                throw new Error('tabId does not belong to the current window');
            }
            await chrome.tabs.update(tabId, { active: true });

            // Also ensure the window is focused if needed
            if (tab.windowId) {
                await chrome.windows.update(tab.windowId, { focused: true });
            }
            return { success: true, data: { executed: true } };
        }

        default:
            throw new Error(`Unknown tab action: ${action}`);
    }
}

/**
 * Get the active tab ID for a given window
 */
async function getActiveTabId(windowId: number): Promise<number | undefined> {
    const tabs = await chrome.tabs.query({ windowId, active: true });
    return tabs[0]?.id;
}
