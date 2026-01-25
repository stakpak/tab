// src/content/actions/snapshot.ts
var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
  "tab",
  "tablist",
  "combobox",
  "listbox",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "gridcell",
  "columnheader",
  "rowheader",
  "treeitem",
  "dialog"
]);
var STRUCTURAL_ROLES = /* @__PURE__ */ new Set([
  "main",
  "navigation",
  "complementary",
  "region",
  "banner",
  "contentinfo",
  "article",
  "search",
  "form",
  "dialog",
  "alertdialog",
  "progressbar"
]);
var TEXT_ROLES = /* @__PURE__ */ new Set([
  "heading",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "status",
  "alert",
  "paragraph",
  "listitem"
]);
var SKIP_TAGS = /* @__PURE__ */ new Set([
  "script",
  "style",
  "noscript",
  "meta",
  "link",
  "base",
  "title",
  "svg",
  "path",
  "defs",
  "clippath",
  "lineargradient",
  "radialgradient"
]);
function createRefRegistry() {
  const entries = /* @__PURE__ */ new Map();
  return {
    entries,
    clear() {
      entries.clear();
    },
    set(ref, element) {
      entries.set(ref, element);
    },
    get(ref) {
      return entries.get(ref);
    }
  };
}
async function generateSnapshot(timeout = 5e3) {
  const clampedTimeout = Math.max(500, Math.min(6e4, timeout));
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        snapshot: "(snapshot timed out)",
        refRegistry: createRefRegistry()
      });
    }, clampedTimeout);
    try {
      const result = buildSnapshot();
      clearTimeout(timer);
      resolve(result);
    } catch (error) {
      clearTimeout(timer);
      resolve({
        snapshot: `(snapshot error: ${String(error)})`,
        refRegistry: createRefRegistry()
      });
    }
  });
}
function buildSnapshot() {
  const state = {
    refCounter: 0,
    lines: [],
    registry: createRefRegistry()
  };
  const rootElement = document.body || document.documentElement;
  if (!rootElement) {
    return {
      snapshot: "(no document)",
      refRegistry: state.registry
    };
  }
  const rootName = document.title?.trim() ? cleanText(document.title) : null;
  state.refCounter++;
  const rootRef = `e${state.refCounter}`;
  state.registry.set(rootRef, document.documentElement || rootElement);
  state.lines.push(buildElementLine("RootWebArea", rootName, rootRef, 0));
  traverseDOM(rootElement, 1, state);
  return {
    snapshot: state.lines.length > 0 ? state.lines.join("\n") : "(empty page)",
    refRegistry: state.registry
  };
}
function traverseDOM(element, depth, state, insideInteractive = false) {
  const tag = element.tagName.toLowerCase();
  if (SKIP_TAGS.has(tag)) {
    return;
  }
  if (!isElementVisible(element)) {
    return;
  }
  const role = getAccessibilityRole(element);
  const isInteractive2 = role !== null && INTERACTIVE_ROLES.has(role);
  const isStructural = role !== null && STRUCTURAL_ROLES.has(role);
  const isTextRole = role !== null && TEXT_ROLES.has(role);
  const isClickable = isElementClickable(element);
  const name = getAccessibleName(element);
  const isGeneric = !role || role === "generic";
  const skipBecauseNested = insideInteractive && isGeneric && !isInteractive2;
  const shouldInclude = !skipBecauseNested && (isInteractive2 || isStructural || isTextRole || isClickable || Boolean(name));
  let ref;
  if ((isInteractive2 || isClickable) && !insideInteractive) {
    state.refCounter++;
    ref = `e${state.refCounter}`;
    state.registry.set(ref, element);
  }
  if (shouldInclude) {
    const displayRole = role || "generic";
    const line = buildElementLine(displayRole, name, ref, depth);
    state.lines.push(line);
  }
  const nextDepth = shouldInclude ? depth + 1 : depth;
  const nextInsideInteractive = insideInteractive || isInteractive2 || isClickable && !isGeneric;
  for (const child of element.children) {
    traverseDOM(child, nextDepth, state, nextInsideInteractive);
  }
}
function isElementVisible(element) {
  const tag = element.tagName.toLowerCase();
  if (tag === "head") {
    return false;
  }
  try {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (style.opacity === "0") {
      return false;
    }
  } catch {
    return true;
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  return true;
}
function isElementClickable(element) {
  const tag = element.tagName.toLowerCase();
  const htmlElement = element;
  if (tag === "iframe") {
    return true;
  }
  const tabindex = element.getAttribute("tabindex");
  if (tabindex !== null && tabindex !== "-1") {
    return true;
  }
  if (element.hasAttribute("onclick")) {
    return true;
  }
  const testId = element.getAttribute("data-testid");
  if (testId && (testId.includes("button") || testId.includes("Button") || testId.includes("click") || testId.includes("link"))) {
    return true;
  }
  try {
    const style = window.getComputedStyle(element);
    if (style.cursor === "pointer") {
      const rect = element.getBoundingClientRect();
      if (rect.width > 10 && rect.height > 10) {
        return true;
      }
    }
  } catch {
  }
  if (htmlElement.isContentEditable) {
    return true;
  }
  return false;
}
function getAccessibilityRole(element) {
  const explicitRole = element.getAttribute("role");
  if (explicitRole) {
    return explicitRole.toLowerCase();
  }
  return getImplicitRole(element);
}
function getImplicitRole(element) {
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "button":
      return "button";
    case "a":
      return element.hasAttribute("href") ? "link" : null;
    case "input":
      return getInputRole(element);
    case "textarea":
      return "textbox";
    case "select":
      return "combobox";
    case "option":
      return "option";
    case "h1":
      return "heading1";
    case "h2":
      return "heading2";
    case "h3":
      return "heading3";
    case "h4":
      return "heading4";
    case "h5":
      return "heading5";
    case "h6":
      return "heading6";
    case "p":
      return "paragraph";
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "header":
      return "banner";
    case "footer":
      return "contentinfo";
    case "article":
      return "article";
    case "aside":
      return "complementary";
    case "section":
      return "region";
    case "form":
      return "form";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "table":
      return "table";
    case "tr":
      return "row";
    case "td":
      return "gridcell";
    case "th":
      return "columnheader";
    case "img":
      return element.hasAttribute("alt") ? "img" : null;
    case "dialog":
      return "dialog";
    default:
      return null;
  }
}
function getInputRole(input) {
  const type = input.type || "text";
  switch (type) {
    case "checkbox":
      return "checkbox";
    case "radio":
      return "radio";
    case "range":
      return "slider";
    case "number":
      return "spinbutton";
    case "search":
      return "searchbox";
    case "submit":
    case "button":
    case "reset":
      return "button";
    case "hidden":
      return "";
    default:
      return "textbox";
  }
}
function getAccessibleName(element) {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) {
    return cleanText(ariaLabel);
  }
  const ariaLabelledby = element.getAttribute("aria-labelledby");
  if (ariaLabelledby) {
    const names = ariaLabelledby.split(" ").map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
    if (names.length > 0) {
      return cleanText(names.join(" "));
    }
  }
  const tag = element.tagName.toLowerCase();
  const title = element.getAttribute("title");
  if (title?.trim()) {
    return cleanText(title);
  }
  if (tag === "img") {
    const alt = element.getAttribute("alt");
    if (alt?.trim()) {
      return cleanText(alt);
    }
  }
  if (tag === "input") {
    const input = element;
    if (input.placeholder?.trim()) {
      return cleanText(input.placeholder);
    }
  }
  if (tag === "textarea") {
    const textarea = element;
    if (textarea.placeholder?.trim()) {
      return cleanText(textarea.placeholder);
    }
  }
  if (tag === "input") {
    const input = element;
    const label = findLabelFor(input);
    if (label) {
      return cleanText(label);
    }
  }
  const text = getDirectTextContent(element);
  if (text) {
    return cleanText(text);
  }
  const role = element.getAttribute("role");
  const isInteractiveElement = role && INTERACTIVE_ROLES.has(role.toLowerCase());
  const isClickableElement = element.hasAttribute("tabindex") || element.style?.cursor === "pointer";
  if (isInteractiveElement || isClickableElement || tag === "button" || tag === "a") {
    const htmlElement = element;
    if ("innerText" in htmlElement) {
      const innerTextValue = htmlElement.innerText?.trim();
      if (innerTextValue && innerTextValue.length < 200 && !looksLikeCode(innerTextValue)) {
        return cleanText(innerTextValue);
      }
    }
  }
  if (tag === "input" || tag === "textarea" || tag === "select") {
    const value = element.value;
    if (value?.trim()) {
      return cleanText(value);
    }
  }
  return null;
}
function getDirectTextContent(element) {
  let directText = "";
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        directText += (directText ? " " : "") + text;
      }
    }
  }
  if (directText && !looksLikeCode(directText)) {
    return directText;
  }
  return null;
}
function findLabelFor(input) {
  const parentLabel = input.closest("label");
  if (parentLabel) {
    const labelText = parentLabel.textContent?.trim();
    if (labelText) {
      return labelText;
    }
  }
  const id = input.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) {
      const labelText = label.textContent?.trim();
      if (labelText) {
        return labelText;
      }
    }
  }
  return null;
}
function looksLikeCode(text) {
  if (text.length > 200) {
    return true;
  }
  if (/[<>]/.test(text)) {
    return true;
  }
  const lowered = text.toLowerCase();
  if (lowered.includes("<style") || lowered.includes("<script") || lowered.includes("::-webkit") || lowered.includes("input::placeholder")) {
    return true;
  }
  const codePatterns = [
    /^\s*[\{\[]/,
    // Starts with { or [
    /[{};]\s*$/,
    // Ends with { } or ;
    /:\s*[a-z-]+\s*;/,
    // CSS property pattern
    /\{\s*\n/,
    // Multi-line block
    /^\s*\/[\/*]/,
    // Comment start
    /^\s*@(media|import|keyframes|font-face)/,
    // CSS at-rules
    /^\s*(function|const|let|var|import|export)\s/,
    // JS keywords
    /::\w+/,
    // CSS pseudo-elements
    /\([^)]*:[^)]*\)/
    // Function with colon (like url())
  ];
  return codePatterns.some((pattern) => pattern.test(text));
}
function cleanText(text) {
  let cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned;
}
function buildElementLine(role, name, ref, depth) {
  const indent = "  ".repeat(depth);
  let line = `${indent}- ${role}`;
  if (name) {
    const escapedName = name.replace(/"/g, '\\"');
    line += ` "${escapedName}"`;
  }
  if (ref) {
    line += ` [ref=${ref}]`;
  }
  return line;
}

// src/content/actions/utils.ts
var SCROLL_DELAY_MS = 300;
var FOCUS_DELAY_MS = 100;
var MIN_VIEWPORT_RATIO = 0.5;
function isElementVisible2(element) {
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  if ("offsetParent" in element) {
    const htmlElement = element;
    if (htmlElement.offsetParent === null) {
      if (style.position !== "fixed" && style.position !== "sticky") {
        const tag = element.tagName.toLowerCase();
        if (tag !== "body" && tag !== "html") {
          return false;
        }
      }
    }
  }
  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  return true;
}
function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const visibleTop = Math.max(0, rect.top);
  const visibleLeft = Math.max(0, rect.left);
  const visibleBottom = Math.min(viewportHeight, rect.bottom);
  const visibleRight = Math.min(viewportWidth, rect.right);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const visibleArea = visibleWidth * visibleHeight;
  const totalArea = rect.width * rect.height;
  if (totalArea === 0) {
    return false;
  }
  return visibleArea / totalArea >= MIN_VIEWPORT_RATIO;
}
function isElementDisabled(element) {
  if ("disabled" in element && element.disabled) {
    return true;
  }
  if (element.getAttribute("aria-disabled") === "true") {
    return true;
  }
  return false;
}
async function scrollIntoViewIfNeeded(element) {
  if (isInViewport(element)) {
    return false;
  }
  element.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  await delay(SCROLL_DELAY_MS);
  return true;
}
function getElementCenter(element) {
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  return {
    clientX,
    clientY,
    screenX: window.screenX + clientX,
    screenY: window.screenY + clientY
  };
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/content/actions/click.ts
async function clickElement(ref, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  if (isElementDisabled(element)) {
    throw new Error(`Element with ref "${ref}" is disabled`);
  }
  await scrollIntoViewIfNeeded(element);
  const coords = getElementCenter(element);
  const commonEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX: coords.clientX,
    clientY: coords.clientY,
    screenX: coords.screenX,
    screenY: coords.screenY
  };
  element.dispatchEvent(new PointerEvent("pointerdown", { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousedown", commonEventInit));
  element.dispatchEvent(new PointerEvent("pointerup", { ...commonEventInit, buttons: 0, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...commonEventInit, buttons: 0 }));
  const clickEvent = new MouseEvent("click", { ...commonEventInit, buttons: 0 });
  const cancelled = !element.dispatchEvent(clickEvent);
  if (!cancelled && typeof element.click === "function") {
    element.click();
  }
}

// src/content/actions/dblclick.ts
async function dblclickElement(ref, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  if (isElementDisabled(element)) {
    throw new Error(`Element with ref "${ref}" is disabled`);
  }
  await scrollIntoViewIfNeeded(element);
  const coords = getElementCenter(element);
  const commonEventInit = {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: coords.clientX,
    clientY: coords.clientY,
    screenX: coords.screenX,
    screenY: coords.screenY
  };
  element.dispatchEvent(new PointerEvent("pointerdown", { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousedown", commonEventInit));
  element.dispatchEvent(new PointerEvent("pointerup", { ...commonEventInit, buttons: 0, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...commonEventInit, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("click", { ...commonEventInit, buttons: 0, detail: 1 }));
  element.dispatchEvent(new PointerEvent("pointerdown", { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mousedown", commonEventInit));
  element.dispatchEvent(new PointerEvent("pointerup", { ...commonEventInit, buttons: 0, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { ...commonEventInit, buttons: 0 }));
  element.dispatchEvent(new MouseEvent("click", { ...commonEventInit, buttons: 0, detail: 2 }));
  const dblClickEvent = new MouseEvent("dblclick", { ...commonEventInit, buttons: 0, detail: 2 });
  element.dispatchEvent(dblClickEvent);
}

// src/content/actions/fill.ts
var NON_FILLABLE_INPUT_TYPES = /* @__PURE__ */ new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "file",
  "image",
  "range",
  "color"
]);
async function fillElement(ref, value, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  const fillableCheck = isFillableElement(element);
  if (!fillableCheck.fillable) {
    throw new Error(`Element with ref "${ref}" is not fillable: ${fillableCheck.reason}`);
  }
  await scrollIntoViewIfNeeded(element);
  const htmlElement = element;
  htmlElement.focus();
  await delay(FOCUS_DELAY_MS);
  element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true }));
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = value;
  } else if (htmlElement.isContentEditable) {
    htmlElement.innerText = value;
  }
  const inputEvent = new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: value
  });
  element.dispatchEvent(inputEvent);
  element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true }));
  const changeEvent = new Event("change", {
    bubbles: true,
    cancelable: true
  });
  element.dispatchEvent(changeEvent);
}
function isFillableElement(element) {
  if (element instanceof HTMLInputElement) {
    const type = element.type?.toLowerCase() || "text";
    if (NON_FILLABLE_INPUT_TYPES.has(type)) {
      return { fillable: false, reason: `input type "${type}" is not fillable` };
    }
    if (element.readOnly) {
      return { fillable: false, reason: "input is read-only" };
    }
    if (element.disabled) {
      return { fillable: false, reason: "input is disabled" };
    }
    return { fillable: true };
  }
  if (element instanceof HTMLTextAreaElement) {
    if (element.readOnly) {
      return { fillable: false, reason: "textarea is read-only" };
    }
    if (element.disabled) {
      return { fillable: false, reason: "textarea is disabled" };
    }
    return { fillable: true };
  }
  if (element.isContentEditable) {
    return { fillable: true };
  }
  return { fillable: false, reason: "element is not an input, textarea, or contenteditable" };
}

// src/content/actions/type.ts
async function typeElement(params, registry) {
  const { ref, text, delay: charDelay = 0 } = params;
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  await scrollIntoViewIfNeeded(element);
  const htmlElement = element;
  htmlElement.focus();
  await delay(FOCUS_DELAY_MS);
  for (const char of text) {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      key: char,
      bubbles: true,
      cancelable: true
    }));
    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, char);
    if (!inserted) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        const start = element.selectionStart || 0;
        const end = element.selectionEnd || 0;
        const val = element.value;
        element.value = val.slice(0, start) + char + val.slice(end);
        element.selectionStart = element.selectionEnd = start + 1;
        element.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: char
        }));
      } else if (htmlElement.isContentEditable) {
        htmlElement.innerText += char;
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(htmlElement);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
    element.dispatchEvent(new KeyboardEvent("keyup", {
      key: char,
      bubbles: true,
      cancelable: true
    }));
    if (charDelay > 0) {
      await delay(charDelay);
    }
  }
  element.dispatchEvent(new Event("change", {
    bubbles: true,
    cancelable: true
  }));
}

// src/content/actions/focus.ts
async function focusElement(ref, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  await scrollIntoViewIfNeeded(element);
  const htmlElement = element;
  htmlElement.focus();
  await delay(FOCUS_DELAY_MS);
}

// src/content/actions/hover.ts
async function hoverElement(ref, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  await scrollIntoViewIfNeeded(element);
  const rect = element.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const commonEventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    screenX: clientX,
    screenY: clientY
  };
  element.dispatchEvent(new PointerEvent("pointerover", { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new PointerEvent("pointerenter", { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new PointerEvent("pointermove", { ...commonEventInit, isPrimary: true }));
  element.dispatchEvent(new MouseEvent("mouseover", commonEventInit));
  element.dispatchEvent(new MouseEvent("mouseenter", commonEventInit));
  element.dispatchEvent(new MouseEvent("mousemove", commonEventInit));
}

// src/content/actions/press.ts
async function pressKey(key, ref, registry) {
  let target = document.activeElement || document.body;
  if (ref) {
    const element = registry.get(ref);
    if (!element) {
      throw new Error(`Element with ref "${ref}" not found in registry`);
    }
    if (!document.contains(element)) {
      throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
    }
    if (!isElementVisible2(element)) {
      throw new Error(`Element with ref "${ref}" is not visible`);
    }
    await scrollIntoViewIfNeeded(element);
    element.focus();
    await delay(FOCUS_DELAY_MS);
    target = element;
  }
  const eventInit = {
    key,
    bubbles: true,
    cancelable: true
  };
  target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
  target.dispatchEvent(new KeyboardEvent("keypress", eventInit));
  target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
}

// src/content/actions/check.ts
async function setChecked(ref, checked, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Element with ref "${ref}" is not an input element`);
  }
  const type = element.type?.toLowerCase();
  if (type !== "checkbox" && type !== "radio") {
    throw new Error(`Element with ref "${ref}" is not a checkbox or radio button (type: ${type})`);
  }
  if (element.checked === checked) {
    return;
  }
  await scrollIntoViewIfNeeded(element);
  element.click();
  if (element.checked !== checked) {
    element.checked = checked;
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// src/content/actions/select.ts
async function selectOption(params, registry) {
  const { ref, value } = params;
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  if (!document.contains(element)) {
    throw new Error(`Element with ref "${ref}" is no longer in the DOM`);
  }
  if (!isElementVisible2(element)) {
    throw new Error(`Element with ref "${ref}" is not visible`);
  }
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Element with ref "${ref}" is not a select element`);
  }
  await scrollIntoViewIfNeeded(element);
  let optionToSelect = null;
  for (let i = 0; i < element.options.length; i++) {
    const opt = element.options[i];
    if (opt.value === value || opt.text.trim() === value) {
      optionToSelect = opt;
      break;
    }
  }
  if (!optionToSelect) {
    throw new Error(`Option with value or text "${value}" not found in select element`);
  }
  if (element.value === optionToSelect.value) {
    return;
  }
  element.value = optionToSelect.value;
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

// src/content/actions/get.ts
async function getInfo(params, registry) {
  const { what, ref, selector, attrName } = params;
  if (what === "title") {
    return document.title;
  }
  if (what === "url") {
    return window.location.href;
  }
  if (what === "count") {
    if (!selector) {
      throw new Error("Missing selector for count action");
    }
    return document.querySelectorAll(selector).length;
  }
  if (!ref) {
    throw new Error(`Missing ref for "get ${what}" action`);
  }
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  switch (what) {
    case "text":
      return element.innerText || element.textContent || "";
    case "html":
      return element.outerHTML;
    case "value":
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return element.value;
      }
      throw new Error(`Element with ref "${ref}" does not have a value`);
    case "attr":
      if (!attrName) {
        throw new Error("Missing attrName for attr action");
      }
      return element.getAttribute(attrName);
    case "box": {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left
      };
    }
    default:
      throw new Error(`Unknown get info type: ${what}`);
  }
}

// src/content/actions/is.ts
async function checkState(params, registry) {
  const { what, ref } = params;
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  switch (what) {
    case "visible":
      return isElementVisible2(element);
    case "enabled":
      return !isElementDisabled(element);
    case "checked":
      if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
        return element.checked;
      }
      throw new Error(`Element with ref "${ref}" is not a checkbox or radio button`);
    default:
      throw new Error(`Unknown check state type: ${what}`);
  }
}

// src/content/actions/scroll.ts
async function scroll(params, registry) {
  const { direction, pixels = 300 } = params;
  let x = 0;
  let y = 0;
  switch (direction) {
    case "up":
      y = -pixels;
      break;
    case "down":
      y = pixels;
      break;
    case "left":
      x = -pixels;
      break;
    case "right":
      x = pixels;
      break;
  }
  window.scrollBy({
    left: x,
    top: y,
    behavior: "smooth"
  });
}

// src/content/actions/scrollintoview.ts
async function scrollIntoView(ref, registry) {
  const element = registry.get(ref);
  if (!element) {
    throw new Error(`Element with ref "${ref}" not found in registry`);
  }
  await scrollIntoViewIfNeeded(element);
}

// src/content/actions/wait.ts
async function wait(params, registry) {
  const { ms, ref, selector } = params;
  if (ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  if (ref) {
    const element = registry.get(ref);
    if (!element) {
      throw new Error(`Element with ref "${ref}" not found in registry`);
    }
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timeout = 1e4;
      const check = () => {
        if (isElementVisible2(element)) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for element ${ref} to become visible`));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
  if (selector) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timeout = 1e4;
      const check = () => {
        const element = document.querySelector(selector);
        if (element && isElementVisible2(element)) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for selector "${selector}" to appear and be visible`));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

// src/content/actions/find.ts
async function findElement(params, registry) {
  const { locator, value, text } = params;
  let elements = [];
  switch (locator) {
    case "role":
      elements = Array.from(document.querySelectorAll(`[role="${value}"], ${value}`));
      break;
    case "text":
      elements = Array.from(document.querySelectorAll("*")).filter(
        (el) => el.textContent?.trim().includes(value) && el.children.length === 0
      );
      break;
    case "label":
      elements = Array.from(document.querySelectorAll("label")).filter(
        (l) => l.textContent?.trim().includes(value)
      ).map((l) => {
        if (l.htmlFor) return document.getElementById(l.htmlFor);
        return l.querySelector("input, select, textarea");
      }).filter((el) => el !== null);
      break;
    case "placeholder":
      elements = Array.from(document.querySelectorAll(`[placeholder*="${value}"]`));
      break;
    case "alt":
      elements = Array.from(document.querySelectorAll(`[alt*="${value}"]`));
      break;
    case "title":
      elements = Array.from(document.querySelectorAll(`[title*="${value}"]`));
      break;
    case "testid":
      elements = Array.from(document.querySelectorAll(`[data-testid="${value}"], [data-test-id="${value}"], [data-test="${value}"]`));
      break;
    case "first":
      elements = [document.querySelector(value)].filter((el) => el !== null);
      break;
    case "last": {
      const all = document.querySelectorAll(value);
      elements = all.length > 0 ? [all[all.length - 1]] : [];
      break;
    }
    case "nth": {
      const n = parseInt(text || "0");
      const all = document.querySelectorAll(value);
      elements = all.length > n ? [all[n]] : [];
      break;
    }
  }
  const found = elements.find((el) => isElementVisible2(el));
  if (found) {
    for (const [ref, el] of registry.entries.entries()) {
      if (el === found) return ref;
    }
    const newRef = `f${Math.floor(Math.random() * 1e4)}`;
    registry.set(newRef, found);
    return newRef;
  }
  return null;
}

// src/content/actions/mouse.ts
async function mouseAction(params) {
  const { action, x = 0, y = 0, button = 0, dx = 0, dy = 0 } = params;
  switch (action) {
    case "move": {
      const event = new MouseEvent("mousemove", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
      });
      document.elementFromPoint(x, y)?.dispatchEvent(event);
      break;
    }
    case "down": {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button
      });
      document.elementFromPoint(x, y)?.dispatchEvent(event);
      break;
    }
    case "up": {
      const event = new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        button
      });
      document.elementFromPoint(x, y)?.dispatchEvent(event);
      break;
    }
    case "wheel": {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        deltaX: dx,
        deltaY: dy
      });
      document.elementFromPoint(x, y)?.dispatchEvent(event);
      if (!document.elementFromPoint(x, y)) {
        window.scrollBy(dx, dy);
      }
      break;
    }
  }
}

// src/content/actions/drag.ts
async function dragAndDrop(params, registry) {
  const { src, dst } = params;
  const srcEl = registry.get(src);
  const dstEl = registry.get(dst);
  if (!srcEl) throw new Error(`Source element "${src}" not found`);
  if (!dstEl) throw new Error(`Destination element "${dst}" not found`);
  await scrollIntoViewIfNeeded(srcEl);
  await scrollIntoViewIfNeeded(dstEl);
  const srcRect = srcEl.getBoundingClientRect();
  const dstRect = dstEl.getBoundingClientRect();
  const startX = srcRect.left + srcRect.width / 2;
  const startY = srcRect.top + srcRect.height / 2;
  const endX = dstRect.left + dstRect.width / 2;
  const endY = dstRect.top + dstRect.height / 2;
  const dataTransfer = new DataTransfer();
  srcEl.dispatchEvent(new DragEvent("dragstart", {
    bubbles: true,
    cancelable: true,
    dataTransfer
  }));
  srcEl.dispatchEvent(new DragEvent("drag", {
    bubbles: true,
    cancelable: true,
    dataTransfer
  }));
  dstEl.dispatchEvent(new DragEvent("dragenter", {
    bubbles: true,
    cancelable: true,
    dataTransfer
  }));
  dstEl.dispatchEvent(new DragEvent("dragover", {
    bubbles: true,
    cancelable: true,
    dataTransfer
  }));
  dstEl.dispatchEvent(new DragEvent("drop", {
    bubbles: true,
    cancelable: true,
    dataTransfer
  }));
  srcEl.dispatchEvent(new DragEvent("dragend", {
    bubbles: true,
    cancelable: true,
    dataTransfer
  }));
}

// src/content/executor.ts
var currentRegistry = createRefRegistry();
async function executeAction(request) {
  try {
    switch (request.action) {
      case "snapshot": {
        const timeout = request.params?.timeout || 5e3;
        const result = await generateSnapshot(timeout);
        currentRegistry = result.refRegistry;
        window.__REF_REGISTRY__ = currentRegistry;
        return {
          success: true,
          data: {
            snapshot: result.snapshot,
            url: window.location.href,
            title: document.title
          }
        };
      }
      case "click": {
        if (!currentRegistry) {
          return {
            success: false,
            error: "No active snapshot - call snapshot action first"
          };
        }
        const ref = request.params?.ref;
        if (!ref) {
          return {
            success: false,
            error: "Missing ref parameter for click action"
          };
        }
        await clickElement(ref, currentRegistry);
        return {
          success: true,
          data: { executed: true }
        };
      }
      case "dblclick": {
        if (!currentRegistry) {
          return {
            success: false,
            error: "No active snapshot - call snapshot action first"
          };
        }
        const ref = request.params?.ref;
        if (!ref) {
          return {
            success: false,
            error: "Missing ref parameter for dblclick action"
          };
        }
        await dblclickElement(ref, currentRegistry);
        return {
          success: true,
          data: { executed: true }
        };
      }
      case "fill": {
        if (!currentRegistry) {
          return {
            success: false,
            error: "No active snapshot - call snapshot action first"
          };
        }
        const ref = request.params?.ref;
        const value = request.params?.value;
        if (!ref || value === void 0) {
          return {
            success: false,
            error: "Missing ref or value parameter for fill action"
          };
        }
        await fillElement(ref, value, currentRegistry);
        return {
          success: true,
          data: { executed: true }
        };
      }
      case "type": {
        if (!currentRegistry) {
          return {
            success: false,
            error: "No active snapshot - call snapshot action first"
          };
        }
        const ref = request.params?.ref;
        const text = request.params?.text;
        const delay2 = request.params?.delay;
        if (!ref || text === void 0) return { success: false, error: "Missing ref or text" };
        await typeElement({ ref, text, delay: delay2 }, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "focus": {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: "Missing ref" };
        await focusElement(ref, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "hover": {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: "Missing ref" };
        await hoverElement(ref, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "press": {
        const key = request.params?.key;
        const ref = request.params?.ref;
        if (!key) return { success: false, error: "Missing key" };
        await pressKey({ key, ref }, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "check": {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: "Missing ref" };
        await setChecked(ref, true, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "uncheck": {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: "Missing ref" };
        await setChecked(ref, false, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "select": {
        const ref = request.params?.ref;
        const value = request.params?.value;
        if (!ref || value === void 0) return { success: false, error: "Missing ref or value" };
        await selectOption({ ref, value }, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "get": {
        const what = request.params?.what;
        const ref = request.params?.ref;
        const selector = request.params?.selector;
        const attrName = request.params?.attrName;
        if (!what) return { success: false, error: "Missing what" };
        const result = await getInfo(
          { what, ref, selector, attrName },
          currentRegistry
        );
        return { success: true, data: { result } };
      }
      case "is": {
        const what = request.params?.what;
        const ref = request.params?.ref;
        if (!what || !ref) return { success: false, error: "Missing what or ref" };
        const result = await checkState(
          { what, ref },
          currentRegistry
        );
        return { success: true, data: { result } };
      }
      case "scroll": {
        const direction = request.params?.direction;
        const pixels = request.params?.pixels;
        await scroll({ direction, pixels }, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "scrollintoview": {
        const ref = request.params?.ref;
        if (!ref) return { success: false, error: "Missing ref" };
        await scrollIntoView(ref, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "wait": {
        const ms = request.params?.ms;
        const ref = request.params?.ref;
        const selector = request.params?.selector;
        await wait({ ms, ref, selector }, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "drag": {
        const src = request.params?.src;
        const dst = request.params?.dst;
        if (!src || !dst) return { success: false, error: "Missing src or dst" };
        await dragAndDrop({ src, dst }, currentRegistry);
        return { success: true, data: { executed: true } };
      }
      case "find": {
        const locator = request.params?.locator;
        const value = request.params?.value;
        if (!locator || !value) return { success: false, error: "Missing locator or value" };
        const ref = await findElement(
          { locator, value, text: request.params?.text },
          currentRegistry
        );
        return { success: true, data: { result: ref } };
      }
      case "mouse": {
        const action = request.params?.action;
        if (!action) return { success: false, error: "Missing action" };
        await mouseAction({
          action,
          x: request.params?.x,
          y: request.params?.y,
          button: request.params?.button,
          dx: request.params?.dx,
          dy: request.params?.dy
        });
        return { success: true, data: { executed: true } };
      }
      case "upload": {
        return { success: false, error: `Action "${request.action}" not yet implemented` };
      }
      default: {
        const _exhaustive = request.action;
        return {
          success: false,
          error: `Unknown action: ${_exhaustive}`
        };
      }
    }
  } catch (error) {
    console.error("[Executor] Action failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// src/content/index.ts
function isValidContentRequest(message) {
  if (!message || typeof message !== "object") {
    return false;
  }
  const msg = message;
  const validActions = [
    "snapshot",
    "click",
    "dblclick",
    "fill",
    "type",
    "press",
    "hover",
    "focus",
    "check",
    "uncheck",
    "select",
    "get",
    "is",
    "drag",
    "upload",
    "scroll",
    "scrollintoview",
    "wait",
    "eval",
    "find",
    "mouse"
  ];
  if (typeof msg.action !== "string" || !validActions.includes(msg.action)) {
    return false;
  }
  const params = msg.params;
  if (params !== void 0 && (typeof params !== "object" || params === null)) {
    return false;
  }
  if (msg.action === "snapshot") {
    if (params === void 0) {
      return true;
    }
    const timeout = params.timeout;
    return timeout === void 0 || typeof timeout === "number";
  }
  if (msg.action === "click" || msg.action === "dblclick" || msg.action === "hover" || msg.action === "focus" || msg.action === "check" || msg.action === "uncheck") {
    if (!params) {
      return false;
    }
    return typeof params.ref === "string";
  }
  if (msg.action === "fill") {
    if (!params) {
      return false;
    }
    const paramRecord = params;
    return typeof paramRecord.ref === "string" && typeof paramRecord.value === "string";
  }
  if (msg.action === "type") {
    if (!params) {
      return false;
    }
    const paramRecord = params;
    return typeof paramRecord.ref === "string" && typeof paramRecord.text === "string" && (paramRecord.delay === void 0 || typeof paramRecord.delay === "number");
  }
  if (msg.action === "press") {
    if (!params) {
      return false;
    }
    const paramRecord = params;
    return typeof paramRecord.key === "string" && (paramRecord.ref === void 0 || typeof paramRecord.ref === "string");
  }
  if (msg.action === "select") {
    if (!params) {
      return false;
    }
    const paramRecord = params;
    return typeof paramRecord.ref === "string" && typeof paramRecord.value === "string";
  }
  if (msg.action === "get") {
    if (!params) {
      return false;
    }
    const paramRecord = params;
    return typeof paramRecord.what === "string";
  }
  if (msg.action === "is") {
    if (!params) {
      return false;
    }
    const paramRecord = params;
    return typeof paramRecord.what === "string" && typeof paramRecord.ref === "string";
  }
  if (msg.action === "scroll") {
    if (!params) return false;
    const p = params;
    return typeof p.direction === "string" && (p.pixels === void 0 || typeof p.pixels === "number");
  }
  if (msg.action === "scrollintoview") {
    if (!params) return false;
    return typeof params.ref === "string";
  }
  if (msg.action === "wait") {
    if (!params) return true;
    const p = params;
    return (p.ms === void 0 || typeof p.ms === "number") && (p.ref === void 0 || typeof p.ref === "string") && (p.selector === void 0 || typeof p.selector === "string");
  }
  if (["drag", "upload", "find", "mouse"].includes(msg.action)) {
    return true;
  }
  return false;
}
function init() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && typeof message === "object" && message.action === "ping") {
      sendResponse({ success: true, pong: true });
      return true;
    }
    if (!isValidContentRequest(message)) {
      console.error("[Content Script] Invalid message format:", message);
      sendResponse({
        success: false,
        error: "Invalid message format"
      });
      return true;
    }
    executeAction(message).then((response) => {
      console.log("[Content Script] Action completed:", message.action);
      sendResponse(response);
    }).catch((error) => {
      console.error("[Content Script] Action failed:", message.action, error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    });
    return true;
  });
  console.log("[Content Script] Initialized");
}
init();
//# sourceMappingURL=content.js.map
