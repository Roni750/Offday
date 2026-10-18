<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Role, UserSummary } from '@/api/types';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { ALL_ROLES, roleLabel } from '@/utils/roles';

/**
 * The people of an office grouped by role. Dragging a card onto another group proposes a role change;
 * each card also has a "Move to" menu, for keyboards and touch screens. The parent decides and saves.
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

const dragging = ref<UserSummary | null>(null);
const overRole = ref<Role | null>(null);

const locked = (user: UserSummary) => user.id === props.meId || props.savingId !== null;

function onDragStart(event: DragEvent, user: UserSummary): void {
  if (locked(user)) {
    event.preventDefault();
    return;
  }
  dragging.value = user;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(user.id));
  }
}

function onDragEnd(): void {
  dragging.value = null;
  overRole.value = null;
}

const canDropOn = (role: Role) => !!dragging.value && dragging.value.role !== role;

function onDragOver(event: DragEvent, role: Role): void {
  if (!canDropOn(role)) return;
  // Accepting the drop requires cancelling dragover.
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  overRole.value = role;
}

function onDragLeave(event: DragEvent, role: Role): void {
  // Moving between children of the zone fires dragleave too; only leaving the zone itself counts.
  const next = event.relatedTarget as Node | null;
  if (overRole.value === role && !(event.currentTarget as HTMLElement).contains(next)) overRole.value = null;
}

function onDrop(role: Role): void {
  const user = dragging.value;
  onDragEnd();
  if (user && user.role !== role) emit('move', user, role);
}

function onMenu(user: UserSummary, event: Event): void {
  const select = event.target as HTMLSelectElement;
  const role = select.value as Role;
  // The menu is a trigger, not a field: it always shows "Move to…" again.
  select.value = '';
  if (role) emit('move', user, role);
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
    <section
      v-for="group in GROUPS"
      :key="group.role"
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
      @dragover="onDragOver($event, group.role)"
      @dragleave="onDragLeave($event, group.role)"
      @drop.prevent="onDrop(group.role)"
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
          :draggable="!locked(user)"
          class="flex items-center gap-2.5 rounded-control border border-line bg-surface px-2.5 py-2 transition-opacity"
          :class="[
            locked(user) ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
            dragging?.id === user.id ? 'opacity-40' : '',
            savingId === user.id ? 'opacity-60' : '',
          ]"
          :title="user.id === meId ? `You can't change your own role` : 'Drag to another group to change the role'"
          @dragstart="onDragStart($event, user)"
          @dragend="onDragEnd"
        >
          <span v-if="!locked(user)" class="select-none text-[12px] leading-none text-faint" aria-hidden="true">⠿</span>
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
          <select
            v-else-if="user.id !== meId"
            :value="''"
            :disabled="savingId !== null"
            :aria-label="`Move ${user.name} to another role`"
            class="h-7 w-[86px] shrink-0 cursor-pointer rounded-lg border border-line-input bg-surface px-1.5 text-[12px] text-ink-2 outline-none focus:border-ink disabled:cursor-not-allowed"
            @change="onMenu(user, $event)"
          >
            <option value="" disabled>Move to…</option>
            <option v-for="role in ALL_ROLES.filter((r) => r !== user.role)" :key="role" :value="role">{{ roleLabel(role) }}</option>
          </select>
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
</template>
