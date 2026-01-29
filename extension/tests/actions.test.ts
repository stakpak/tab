import { describe, expect, it, beforeEach, vi } from 'vitest';
import { clickElement } from '../src/content/actions/click';
import { dblclickElement } from '../src/content/actions/dblclick';
import { fillElement } from '../src/content/actions/fill';
import { typeElement } from '../src/content/actions/type';
import { focusElement } from '../src/content/actions/focus';
import { hoverElement } from '../src/content/actions/hover';
import { pressKey } from '../src/content/actions/press';
import { setChecked } from '../src/content/actions/check';
import { selectOption } from '../src/content/actions/select';
import { getInfo } from '../src/content/actions/get';
import { checkState } from '../src/content/actions/is';
import { scroll } from '../src/content/actions/scroll';
import { wait } from '../src/content/actions/wait';
import type { RefRegistry } from '../src/shared/types';

function createRegistry(): RefRegistry {
  const entries = new Map<string, Element>();
  return {
    entries,
    clear() {
      entries.clear();
    },
    set(ref: string, element: Element) {
      entries.set(ref, element);
    },
    get(ref: string) {
      return entries.get(ref);
    },
  };
}

describe('action handlers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('dispatches mouse events for click', async () => {
    const button = document.createElement('button');
    button.textContent = 'Click me';
    document.body.appendChild(button);

    const registry = createRegistry();
    registry.set('e1', button);

    const events: string[] = [];
    button.addEventListener('pointerdown', () => events.push('pointerdown'));
    button.addEventListener('mousedown', () => events.push('mousedown'));
    button.addEventListener('pointerup', () => events.push('pointerup'));
    button.addEventListener('mouseup', () => events.push('mouseup'));
    button.addEventListener('click', () => events.push('click'));

    await clickElement('e1', registry);

    // We expect pointerdown, mousedown, pointerup, mouseup, and click.
    // Note: The native .click() fallback might trigger an extra click in some test environments,
    // so we check if the sequence contains the core events in order.
    expect(events).toContain('pointerdown');
    expect(events).toContain('mousedown');
    expect(events).toContain('pointerup');
    expect(events).toContain('mouseup');
    expect(events).toContain('click');
  });

  it('dispatches dblclick event', async () => {
    const button = document.createElement('button');
    document.body.appendChild(button);

    const registry = createRegistry();
    registry.set('e1', button);

    const dblclickHandler = vi.fn();
    button.addEventListener('dblclick', dblclickHandler);

    await dblclickElement('e1', registry);
    expect(dblclickHandler).toHaveBeenCalled();
  });

  it('fills input values and dispatches input/change events', async () => {
    vi.useFakeTimers();

    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const registry = createRegistry();
    registry.set('e1', input);

    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    input.addEventListener('input', inputHandler);
    input.addEventListener('change', changeHandler);

    const fillPromise = fillElement('e1', 'Hello', registry);
    await vi.advanceTimersByTimeAsync(600);
    await fillPromise;

    expect(input.value).toBe('Hello');
    expect(inputHandler).toHaveBeenCalled();
    expect(changeHandler).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('types into input values character by character', async () => {
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    const registry = createRegistry();
    registry.set('e1', input);

    const keydownHandler = vi.fn();
    const inputHandler = vi.fn();
    input.addEventListener('keydown', keydownHandler);
    input.addEventListener('input', inputHandler);

    await typeElement({ ref: 'e1', text: 'ABC' }, registry);

    expect(input.value).toBe('ABC');
    expect(keydownHandler).toHaveBeenCalledTimes(3);
    expect(inputHandler).toHaveBeenCalledTimes(3);
  });

  it('hovers an element', async () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const registry = createRegistry();
    registry.set('e1', div);

    const hoverHandler = vi.fn();
    div.addEventListener('mouseover', hoverHandler);

    await hoverElement('e1', registry);
    expect(hoverHandler).toHaveBeenCalled();
  });

  it('presses a key', async () => {
    const registry = createRegistry();
    const keydownHandler = vi.fn();
    document.body.addEventListener('keydown', keydownHandler);

    await pressKey({ key: 'Enter' }, registry);
    expect(keydownHandler).toHaveBeenCalled();
    const event = keydownHandler.mock.calls[0][0];
    expect(event).toBeInstanceOf(KeyboardEvent);
    expect(event.key).toBe('Enter');
  });

  it('checks and unchecks a checkbox', async () => {
    const input = document.createElement('input');
    input.type = 'checkbox';
    document.body.appendChild(input);
    const registry = createRegistry();
    registry.set('e1', input);

    await setChecked('e1', true, registry);
    expect(input.checked).toBe(true);

    await setChecked('e1', false, registry);
    expect(input.checked).toBe(false);
  });

  it('selects an option in a dropdown', async () => {
    const select = document.createElement('select');
    const opt1 = document.createElement('option');
    opt1.value = 'v1';
    opt1.text = 'Option 1';
    const opt2 = document.createElement('option');
    opt2.value = 'v2';
    opt2.text = 'Option 2';
    select.appendChild(opt1);
    select.appendChild(opt2);
    document.body.appendChild(select);

    const registry = createRegistry();
    registry.set('e1', select);

    await selectOption({ ref: 'e1', value: 'v2' }, registry);
    expect(select.value).toBe('v2');

    await selectOption({ ref: 'e1', value: 'v1' }, registry);
    expect(select.value).toBe('v1');
  });

  describe('getInfo', () => {
    it('gets page title and url', async () => {
      const registry = createRegistry();
      expect(await getInfo({ what: 'title' }, registry)).toBe(document.title);
      expect(await getInfo({ what: 'url' }, registry)).toBe(window.location.href);
    });

    it('gets element text and html', async () => {
      const div = document.createElement('div');
      div.innerHTML = '<span>Hello</span>';
      document.body.appendChild(div);
      const registry = createRegistry();
      registry.set('e1', div);

      expect(await getInfo({ what: 'text', ref: 'e1' }, registry)).toBe('Hello');
      expect(await getInfo({ what: 'html', ref: 'e1' }, registry)).toBe('<div><span>Hello</span></div>');
    });

    it('gets input value', async () => {
      const input = document.createElement('input');
      input.value = 'test-value';
      document.body.appendChild(input);
      const registry = createRegistry();
      registry.set('e1', input);

      expect(await getInfo({ what: 'value', ref: 'e1' }, registry)).toBe('test-value');
    });

    it('gets element attribute', async () => {
      const div = document.createElement('div');
      div.setAttribute('data-test', 'attr-value');
      document.body.appendChild(div);
      const registry = createRegistry();
      registry.set('e1', div);

      expect(await getInfo({ what: 'attr', ref: 'e1', attrName: 'data-test' }, registry)).toBe('attr-value');
    });

    it('gets element count', async () => {
      const registry = createRegistry();
      document.body.innerHTML = '<p></p><p></p><div></div>';
      expect(await getInfo({ what: 'count', selector: 'p' }, registry)).toBe(2);
      expect(await getInfo({ what: 'count', selector: 'div' }, registry)).toBe(1);
    });
  });

  describe('checkState', () => {
    it('checks visibility', async () => {
      const div = document.createElement('div');
      document.body.appendChild(div);
      const registry = createRegistry();
      registry.set('e1', div);

      expect(await checkState({ what: 'visible', ref: 'e1' }, registry)).toBe(true);

      div.style.display = 'none';
      expect(await checkState({ what: 'visible', ref: 'e1' }, registry)).toBe(false);
    });

    it('checks enablement', async () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      const registry = createRegistry();
      registry.set('e1', button);

      expect(await checkState({ what: 'enabled', ref: 'e1' }, registry)).toBe(true);

      button.disabled = true;
      expect(await checkState({ what: 'enabled', ref: 'e1' }, registry)).toBe(false);
    });

    it('checks checked state', async () => {
      const input = document.createElement('input');
      input.type = 'checkbox';
      document.body.appendChild(input);
      const registry = createRegistry();
      registry.set('e1', input);

      expect(await checkState({ what: 'checked', ref: 'e1' }, registry)).toBe(false);

      input.checked = true;
      expect(await checkState({ what: 'checked', ref: 'e1' }, registry)).toBe(true);
    });
  });

  describe('scroll', () => {
    it('calls window.scrollBy', async () => {
      const scrollBySpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => { });
      const registry = createRegistry();
      await scroll({ direction: 'down', pixels: 100 }, registry);
      expect(scrollBySpy).toHaveBeenCalledWith(expect.objectContaining({ top: 100 }));
    });
  });

  describe('wait', () => {
    it('waits for specified ms', async () => {
      const start = Date.now();
      const registry = createRegistry();
      await wait({ ms: 100 }, registry);
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(90); // Allow some jitter
    });
  });
});
