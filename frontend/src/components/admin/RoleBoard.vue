<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Role, UserSummary } from '@/api/types';
import SelectMenu from '@/components/ui/SelectMenu.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { ALL_ROLES, roleLabel } from '@/utils/roles';

/**
 * The people of an office grouped by role. Dragging a card onto another group proposes a role change;
 * each card also has a "Move to" menu, for keyboards and screen readers. The parent decides and saves.
 */
const props = defineProps<{
  users: UserSummary[];
  meId: number | null;
  /** A change is being saved; no other move starts meanwhile. */
  savingId: number | null;
  loading?: boolean;
}>();

const emit = defineEmits<{ move: [user: UserSummary, role: Role] }>();

const GROUPS: { role: Role; title: string; hint: string }[] = [
  { role: 'Requester', title: 'Requesters', hint: 'Submit their own requests' },
  { role: 'Validator', title: 'Validators', hint: 'Also review the office requests' },
  { role: 'WorkspaceAdmin', title: 'Workspace admins', hint: 'Also manage roles and office settings' },
];

const byRole = computed(() =>
  Object.fromEntries(ALL_ROLES.map((role) => [role, props.users.filter((u) => u.role === role)])) as Record<Role, UserSummary[]>,
);

const locked = (user: UserSummary) => user.id === props.meId || props.savingId !== null;

// ---- Dragging ----------------------------------------------------------------------
// Pointer events instead of the HTML drag-and-drop API: the card really follows the pointer, it works
// with touch (from the ⠿ handle), and Chrome doesn't cancel the drag when the board restyles itself.

/** Pixels the pointer must move before a press becomes a drag, so clicks stay clicks. */
const DRAG_THRESHOLD = 4;
/** Distance from the scroll area's top or bottom edge where dragging scrolls it. */
const SCROLL_EDGE = 56;

interface Drag {
  user: UserSummary;
  pointerId: number;
  source: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  active: boolean;
}

const drag = ref<Drag | null>(null);
const dragging = computed(() => (drag.value?.active ? drag.value.user : null));
const overRole = ref<Role | null>(null);
const zones = new Map<Role, HTMLElement>();
let scrollFrame = 0;

const canDropOn = (role: Role) => !!dragging.value && dragging.value.role !== role;

function setZone(role: Role, el: unknown): void {
  if (el instanceof HTMLElement) zones.set(role, el);
  else zones.delete(role);
}

function onPointerDown(event: PointerEvent, user: UserSummary): void {
  if (event.button !== 0 || locked(user) || drag.value) return;
  const target = event.target as HTMLElement;
  // The "Move to" menu keeps working as a normal control.
  if (target.closest('select, button, a, input')) return;
  // On touch, only the handle drags, so swiping over the cards still scrolls the drawer.
  if (event.pointerType === 'touch' && !target.closest('[data-drag-handle]')) return;

  const source = event.currentTarget as HTMLElement;
  const rect = source.getBoundingClientRect();
  drag.value = {
    user,
    pointerId: event.pointerId,
    source,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    active: false,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('keydown', onKeydown, true);
}

function onPointerMove(event: PointerEvent): void {
  const d = drag.value;
  if (!d || event.pointerId !== d.pointerId) return;
  d.x = event.clientX;
  d.y = event.clientY;
  if (!d.active) {
    if (Math.hypot(d.x - d.startX, d.y - d.startY) < DRAG_THRESHOLD) return;
    d.active = true;
    document.documentElement.classList.add('is-dragging');
    autoScroll();
  }
  event.preventDefault();
  overRole.value = zoneAt(d.x, d.y);
}

function zoneAt(x: number, y: number): Role | null {
  for (const [role, el] of zones) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return canDropOn(role) ? role : null;
  }
  return null;
}

/** While dragging near the top or bottom of the drawer's scroll area, scroll it toward the pointer. */
function autoScroll(): void {
  const d = drag.value;
  if (!d?.active) return;
  const scroller = d.source.closest<HTMLElement>('.overflow-auto');
  if (scroller) {
    const r = scroller.getBoundingClientRect();
    const speed =
      d.y < r.top + SCROLL_EDGE ? d.y - (r.top + SCROLL_EDGE) : d.y > r.bottom - SCROLL_EDGE ? d.y - (r.bottom - SCROLL_EDGE) : 0;
    if (speed) {
      scroller.scrollTop += Math.max(-18, Math.min(18, speed / 3));
      overRole.value = zoneAt(d.x, d.y);
    }
  }
  scrollFrame = requestAnimationFrame(autoScroll);
}

function onPointerUp(event: PointerEvent): void {
  const d = drag.value;
  if (!d || event.pointerId !== d.pointerId) return;
  const role = d.active ? zoneAt(event.clientX, event.clientY) : null;
  const user = d.user;
  cancelDrag();
  if (role) emit('move', user, role);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !drag.value?.active) return;
  // Escape cancels only the drag; it mustn't also close the drawer.
  event.preventDefault();
  event.stopPropagation();
  cancelDrag();
}

function cancelDrag(): void {
  cancelAnimationFrame(scrollFrame);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', cancelDrag);
  window.removeEventListener('keydown', onKeydown, true);
  document.documentElement.classList.remove('is-dragging');
  drag.value = null;
  overRole.value = null;
}

onBeforeUnmount(cancelDrag);

const ghostStyle = computed(() => {
  const d = drag.value;
  if (!d) return {};
  return { width: `${d.width}px`, transform: `translate(${d.x - d.offsetX}px, ${d.y - d.offsetY}px) rotate(1.5deg)` };
});
</script>

<template>
  <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
    <section
      v-for="group in GROUPS"
      :key="group.role"
      :ref="(el) => setZone(group.role, el)"
      :aria-label="group.title"
      class="flex min-h-[132px] flex-col gap-2 rounded-xl border-[1.5px] p-2.5 transition-colors"
      :class="[
        group.role === 'WorkspaceAdmin' ? 'col-span-2 max-sm:col-span-1' : '',
        overRole === group.role
          ? 'border-ink bg-accent-row'
          : canDropOn(group.role)
            ? 'border-dashed border-ink-3 bg-surface-subtle'
            : 'border-line-divider bg-surface-subtle',
      ]"
    >
      <header class="flex items-baseline justify-between gap-2 px-1">
        <h4 class="text-[13px] font-semibold">
          {{ group.title }} <span class="font-mono text-[12px] font-normal text-muted">{{ byRole[group.role].length }}</span>
        </h4>
        <span class="truncate text-[11px] text-muted">{{ group.hint }}</span>
      </header>

      <div v-if="loading" class="flex flex-col gap-1.5">
        <div v-for="n in 2" :key="n" class="h-[46px] animate-pulse rounded-control bg-canvas" />
      </div>

      <ul class="flex flex-col gap-1.5" :class="group.role === 'WorkspaceAdmin' ? 'sm:grid sm:grid-cols-2' : ''">
        <li
          v-for="user in byRole[group.role]"
          :key="user.id"
          class="flex select-none items-center gap-2.5 rounded-control border bg-surface px-2.5 py-2 transition-opacity"
          :class="[
            locked(user) ? 'cursor-default' : 'cursor-grab',
            dragging?.id === user.id ? 'border-dashed border-ink-3 opacity-40' : 'border-line',
            savingId === user.id ? 'opacity-60' : '',
          ]"
          v-tooltip="user.id === meId ? `You can't change your own role` : 'Drag to another group to change the role'"
          @pointerdown="onPointerDown($event, user)"
        >
          <span
            v-if="!locked(user)"
            data-drag-handle
            class="-m-1.5 touch-none p-1.5 text-[12px] leading-none text-faint"
            aria-hidden="true"
          >⠿</span>
          <UserAvatar :id="user.id" :name="user.name" :size="26" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-[13px] font-medium">{{ user.name }}{{ user.id === meId ? ' (you)' : '' }}</span>
            <span class="truncate text-[11px] text-muted">{{ user.email }}</span>
          </div>
          <span
            v-if="savingId === user.id"
            class="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-muted border-r-transparent"
            aria-hidden="true"
          />
          <SelectMenu
            v-else-if="user.id !== meId"
            trigger-label="Move to…"
            :options="ALL_ROLES.filter((r) => r !== user.role).map((r) => ({ value: r, label: roleLabel(r) }))"
            :label="`Move ${user.name} to another role`"
            size="sm"
            class="w-[100px] shrink-0"
            :menu-width="170"
            :disabled="savingId !== null"
            @select="(role) => emit('move', user, role as Role)"
          />
        </li>
      </ul>

      <p
        v-if="!loading && !byRole[group.role].length"
        class="flex flex-1 items-center justify-center rounded-control px-2 py-3 text-center text-[12px] text-muted"
      >
        {{ dragging ? `Drop here to make ${dragging.name.split(' ')[0]} ${roleLabel(group.role).toLowerCase()}` : 'Nobody yet' }}
      </p>
    </section>
  </div>

  <!-- The card under the pointer while dragging. -->
  <Teleport to="body">
    <div
      v-if="dragging"
      class="pointer-events-none fixed left-0 top-0 z-[70] flex items-center gap-2.5 rounded-control border border-ink bg-surface px-2.5 py-2 shadow-toast"
      :style="ghostStyle"
      aria-hidden="true"
    >
      <span class="text-[12px] leading-none text-faint">⠿</span>
      <UserAvatar :id="dragging.id" :name="dragging.name" :size="26" />
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-[13px] font-medium">{{ dragging.name }}</span>
        <span class="truncate text-[11px] text-muted">{{ dragging.email }}</span>
      </div>
    </div>
  </Teleport>
</template>
