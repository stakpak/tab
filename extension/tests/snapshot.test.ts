import { describe, expect, it, beforeEach } from 'vitest';
import { generateSnapshot } from '../src/content/actions/snapshot';

describe('generateSnapshot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  it('includes root and assigns refs to interactive elements', async () => {
    document.title = 'Test Page';
    document.body.innerHTML = `
      <main>
        <button aria-label="Sign in">Sign in</button>
      </main>
    `;

    const result = await generateSnapshot(1000);

    expect(result.snapshot).toContain('RootWebArea "Test Page" [ref=e1]');
    expect(result.snapshot).toContain('- main');
    expect(result.snapshot).toContain('- button "Sign in" [ref=e2]');
    expect(result.refRegistry.get('e2')).toBeInstanceOf(Element);
  });

  it('prefers aria-label over placeholder for accessible names', async () => {
    document.body.innerHTML = `
      <main>
        <input aria-label="Search Docs" placeholder="Search" />
      </main>
    `;

    const result = await generateSnapshot(1000);
    expect(result.snapshot).toContain('- textbox "Search Docs"');
  });
});
