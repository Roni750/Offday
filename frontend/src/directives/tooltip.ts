import type { Directive } from 'vue';

/**
 * `v-tooltip`: a small floating tooltip that replaces the browser's `title` attribute.
 *
 *   <span v-tooltip="'Approved requests can’t be modified'">…</span>
 *   <span v-tooltip.truncated="row.reason">…</span>        only when the text is cut off by `truncate`
 *   <div v-tooltip="{ title: 'Oct', rows: [{ label: 'Approved', value: '12', swatch: 'bg-chart-approved' }] }">
 *
 * One tooltip element is shared by the whole app. It opens on mouse hover (after a short delay, instantly
 * when moving between targets) and on keyboard focus, and closes on leave, click, scroll and Escape.
 * Content is always set as text, never HTML, so user input (e.g. a request reason) can't inject markup.
 * While open it's linked to its target with `aria-describedby`, so screen readers announce it.
 */

export interface TooltipRow {
  label: string;
  value?: string;
  /** Class of a small color square before the label, e.g. a chart color. */
  swatch?: string;
}

export type TooltipContent = string | { title?: string; rows: TooltipRow[] } | null | undefined;

interface TooltipState {
  content: TooltipContent;
  truncatedOnly: boolean;
  cleanup: () => void;
}

const OPEN_DELAY_MS = 350;
/** Moving from one target to another within this time opens the next tooltip right away. */
const WARM_MS = 400;
const GAP = 8;
const EDGE = 8;
const TOOLTIP_ID = 'app-tooltip';

const states = new WeakMap<HTMLElement, TooltipState>();
let tip: HTMLDivElement | null = null;
let current: HTMLElement | null = null;
let openTimer: ReturnType<typeof setTimeout> | undefined;
let lastClosedAt = 0;

const isEmpty = (content: TooltipContent): boolean =>
  !content || (typeof content === 'string' ? !content.trim() : !content.title && !content.rows.length);

function ensureTip(): HTMLDivElement {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = TOOLTIP_ID;
  tip.className = 'app-tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.dataset.state = 'closed';
  document.body.appendChild(tip);

  // Anything that moves the page under the tooltip closes it, instead of leaving it floating out of place.
  window.addEventListener('scroll', () => hide(), { capture: true, passive: true });
  window.addEventListener('resize', () => hide());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) hide();
  });
  return tip;
}

function render(el: HTMLDivElement, content: Exclude<TooltipContent, null | undefined>): void {
  el.replaceChildren();
  if (typeof content === 'string') {
    el.textContent = content;
    return;
  }
  if (content.title) {
    const title = document.createElement('div');
    title.className = 'app-tooltip-title';
    title.textContent = content.title;
    el.appendChild(title);
  }
  for (const row of content.rows) {
    const line = document.createElement('div');
    line.className = 'app-tooltip-row';
    if (row.swatch) {
      const swatch = document.createElement('span');
      swatch.className = `app-tooltip-swatch ${row.swatch}`;
      line.appendChild(swatch);
    }
    const label = document.createElement('span');
    label.className = 'app-tooltip-label';
    label.textContent = row.label;
    line.appendChild(label);
    if (row.value !== undefined) {
      const value = document.createElement('span');
      value.className = 'app-tooltip-value';
      value.textContent = row.value;
      line.appendChild(value);
    }
    el.appendChild(line);
  }
}

/** Above the target, centered; below when there's no room above; always inside the viewport. */
function position(target: HTMLElement, el: HTMLDivElement): void {
  const rect = target.getBoundingClientRect();
  const { width, height } = el.getBoundingClientRect();
  const above = rect.top - GAP - height;
  const placeBelow = above < EDGE && rect.bottom + GAP + height <= window.innerHeight - EDGE;
  const top = placeBelow ? rect.bottom + GAP : Math.max(EDGE, above);
  const left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - EDGE);
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  el.dataset.side = placeBelow ? 'bottom' : 'top';
}

function linkDescription(target: HTMLElement, linked: boolean): void {
  const ids = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== TOOLTIP_ID);
  if (linked) ids.push(TOOLTIP_ID);
  if (ids.length) target.setAttribute('aria-describedby', ids.join(' '));
  else target.removeAttribute('aria-describedby');
}

function show(target: HTMLElement): void {
  const state = states.get(target);
  if (!state || isEmpty(state.content)) return;
  if (state.truncatedOnly && target.scrollWidth <= target.clientWidth && target.scrollHeight <= target.clientHeight) return;

  const el = ensureTip();
  if (current && current !== target) linkDescription(current, false);
  current = target;
  render(el, state.content!);
  el.dataset.state = 'measuring';
  position(target, el);
  el.dataset.state = 'open';
  linkDescription(target, true);
}

function hide(): void {
  clearTimeout(openTimer);
  if (!current) return;
  linkDescription(current, false);
  current = null;
  lastClosedAt = Date.now();
  if (tip) tip.dataset.state = 'closed';
}

function scheduleShow(target: HTMLElement): void {
  clearTimeout(openTimer);
  const warm = current !== null || Date.now() - lastClosedAt < WARM_MS;
  if (warm) show(target);
  else openTimer = setTimeout(() => show(target), OPEN_DELAY_MS);
}

function attach(target: HTMLElement): () => void {
  // Touch has no hover: a tap would open and immediately cover what was tapped.
  const onEnter = (event: PointerEvent) => event.pointerType !== 'touch' && scheduleShow(target);
  const onLeave = () => current === target ? hide() : clearTimeout(openTimer);
  // Only keyboard focus opens it; focus that comes from a click shouldn't.
  const onFocus = () => target.matches(':focus-visible') && show(target);
  const onBlur = () => current === target && hide();
  const onDown = () => hide();

  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('focusin', onFocus);
  target.addEventListener('focusout', onBlur);
  target.addEventListener('pointerdown', onDown);
  return () => {
    target.removeEventListener('pointerenter', onEnter);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('focusin', onFocus);
    target.removeEventListener('focusout', onBlur);
    target.removeEventListener('pointerdown', onDown);
  };
}

export const vTooltip: Directive<HTMLElement, TooltipContent> = {
  mounted(el, binding) {
    states.set(el, { content: binding.value, truncatedOnly: !!binding.modifiers.truncated, cleanup: attach(el) });
  },
  updated(el, binding) {
    const state = states.get(el);
    if (!state) return;
    state.content = binding.value;
    if (current !== el) return;
    if (isEmpty(binding.value)) hide();
    else show(el);
  },
  beforeUnmount(el) {
    if (current === el) hide();
    states.get(el)?.cleanup();
    states.delete(el);
  },
};

// Registered globally in main.ts; this types `v-tooltip` in every template.
declare module 'vue' {
  interface GlobalDirectives {
    vTooltip: typeof vTooltip;
  }
}
