import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { MockWebSocketServer } from './helpers/mock-server';

const EXTENSION_PATH = path.resolve(__dirname, '../..');

// Use a global port counter to avoid EADDRINUSE
let globalPortCounter = 9200;

async function setupTest() {
    const port = globalPortCounter++;
    const mockServer = new MockWebSocketServer({ port });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-tabs-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
        ],
    });

    const extensionId = await getExtensionId(context);

    // Connect via popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
    await popupPage.locator('#ws-url').fill(`ws://localhost:${port}`);
    await popupPage.locator('#save-url-btn').click();
    await popupPage.locator('#connect-btn').click();
    await mockServer.waitForConnection(10000);
    await expect(popupPage.locator('#status-text')).toHaveText('Connected', { timeout: 10000 });
    await popupPage.close();

    return { mockServer, context, userDataDir };
}

async function cleanupTest(mockServer: MockWebSocketServer, context: BrowserContext, userDataDir: string) {
    await context.close();
    await mockServer.stop();
    if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
}

test.describe('Tab Management E2E', () => {
    test('lists open tabs', async () => {
        const { mockServer, context, userDataDir } = await setupTest();
        try {
            const page1 = await context.newPage();
            await page1.goto('https://example.com');

            const page2 = await context.newPage();
            await page2.goto('https://example.org');

            const response = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-list-1',
                type: 'tab',
                params: { action: 'list' }
            });

            const result = response as { success: boolean; data?: { tabs: any[] } };
            expect(result.success).toBe(true);

            const urls = result.data?.tabs.map(t => t.url) || [];
            expect(urls.some((u: string) => u.includes('example.com'))).toBe(true);
            expect(urls.some((u: string) => u.includes('example.org'))).toBe(true);
        } finally {
            await cleanupTest(mockServer, context, userDataDir);
        }
    });

    test('opens a new tab', async () => {
        const { mockServer, context, userDataDir } = await setupTest();
        try {
            const response = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-new-1',
                type: 'tab',
                params: { action: 'new', url: 'https://example.org' }
            });

            expect((response as any).success).toBe(true);

            // Give it a moment to open and load
            await new Promise(r => setTimeout(r, 2000));

            const pages = context.pages();
            const urls = pages.map(p => p.url());
            expect(urls.some(u => u.includes('example.org'))).toBe(true);
        } finally {
            await cleanupTest(mockServer, context, userDataDir);
        }
    });

    test('switches between tabs', async () => {
        const { mockServer, context, userDataDir } = await setupTest();
        try {
            const page1 = await context.newPage();
            await page1.goto('https://example.com');

            const page2 = await context.newPage();
            await page2.goto('https://example.org');

            const listResp = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-list-2',
                type: 'tab',
                params: { action: 'list' }
            });

            const tabs = (listResp as any).data.tabs;
            const tab1 = tabs.find((t: any) => t.url.includes('example.com'));
            const tab2 = tabs.find((t: any) => t.url.includes('example.org'));

            const switchResp = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-switch-1',
                type: 'tab',
                params: { action: 'switch', tabId: tab1.id }
            });

            expect((switchResp as any).success).toBe(true);

            const listResp2 = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-list-3',
                type: 'tab',
                params: { action: 'list' }
            });
            const tabs2 = (listResp2 as any).data.tabs;
            const activeTab = tabs2.find((t: any) => t.active);
            expect(activeTab.id).toBe(tab1.id);
        } finally {
            await cleanupTest(mockServer, context, userDataDir);
        }
    });

    test('closes a tab', async () => {
        const { mockServer, context, userDataDir } = await setupTest();
        try {
            const page1 = await context.newPage();
            await page1.goto('https://example.com');

            const listResp = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-list-4',
                type: 'tab',
                params: { action: 'list' }
            });

            const tabs = (listResp as any).data.tabs;
            const tab1 = tabs.find((t: any) => t.url.includes('example.com'));

            const closeResp = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-close-1',
                type: 'tab',
                params: { action: 'close', tabId: tab1.id }
            });

            expect((closeResp as any).success).toBe(true);

            const listResp2 = await mockServer.sendCommandAndWaitForResponse({
                id: 'tab-list-5',
                type: 'tab',
                params: { action: 'list' }
            });
            const tabs2 = (listResp2 as any).data.tabs;
            expect(tabs2.find((t: any) => t.id === tab1.id)).toBeUndefined();
        } finally {
            await cleanupTest(mockServer, context, userDataDir);
        }
    });
});

async function getExtensionId(context: BrowserContext): Promise<string> {
    const existingWorkers = context.serviceWorkers();
    if (existingWorkers.length > 0) {
        return new URL(existingWorkers[0].url()).host;
    }
    const serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    return new URL(serviceWorker.url()).host;
}
