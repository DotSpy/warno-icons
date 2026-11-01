export type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, any> | null,
  ...kids: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'selected', 'readOnly'].includes(k)) (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}

export function append(el: Node, kids: (Child | Child[])[]) {
  for (const k of kids) {
    if (Array.isArray(k)) append(el, k);
    else if (k === null || k === undefined || k === false) continue;
    else el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
}

export function clear(el: Node, ...kids: (Child | Child[])[]) {
  while (el.firstChild) el.removeChild(el.firstChild);
  append(el, kids);
}

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text).catch(() => {});
}

export function download(filename: string, text: string) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
