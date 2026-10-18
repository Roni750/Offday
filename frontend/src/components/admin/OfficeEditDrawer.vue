<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { DateTime } from 'luxon';
import * as officeApi from '@/api/office';
import type { OfficeDetails, Role, UserSummary } from '@/api/types';
import OfficeInvitations from '@/components/admin/OfficeInvitations.vue';
import RoleBoard from '@/components/admin/RoleBoard.vue';
import AppButton from '@/components/ui/AppButton.vue';
import SearchSelect from '@/components/ui/SearchSelect.vue';
import type { SearchOption } from '@/components/ui/types';
import { useDialog } from '@/composables/useDialog';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { useConfirmStore } from '@/stores/confirm';
import { useMyRequestsStore } from '@/stores/myRequests';
import { formatOffset } from '@/utils/dates';
import { ROLE_DESCRIPTIONS, roleLabel } from '@/utils/roles';
import { WEEKDAYS, describeWeek, sameWeek } from '@/utils/workWeek';

/** Edits one office of the workspace: time zone, work week and the role of each person. */
const props = defineProps<{ officeId: number | null }>();
const emit = defineEmits<{ close: []; changed: [] }>();

const auth = useAuthStore();
const mine = useMyRequestsStore();
const toast = useToast();
const { confirm } = useConfirmStore();

const office = ref<OfficeDetails | null>(null);
const users = ref<UserSummary[]>([]);
const loadingUsers = ref(false);
const selectedZone = ref('');
const selectedDays = ref<number[]>([]);
const savingZone = ref(false);
const savingWeek = ref(false);
const savingUserId = ref<number | null>(null);
const now = ref(DateTime.now());
const clock = setInterval(() => (now.value = DateTime.now()), 15_000);
onUnmounted(() => clearInterval(clock));

const isOpen = computed(() => props.officeId !== null);
const panel = ref<HTMLElement | null>(null);
const busy = computed(() => savingZone.value || savingWeek.value || savingUserId.value !== null);
const isMyOffice = computed(() => !!office.value && office.value.id === auth.me?.office.id);

function close(): void {
  if (!busy.value) emit('close');
}

useDialog(isOpen, panel, { onClose: close });

let seq = 0;
watch(
  () => props.officeId,
  async (id) => {
    const current = ++seq;
    office.value = null;
    users.value = [];
    if (id === null) return;
    loadingUsers.value = true;
    try {
      const [details, people] = await Promise.all([officeApi.getWorkspaceOffice(id), officeApi.listUsersOfOffice(id)]);
      if (current !== seq) return;
      office.value = details;
      users.value = people;
      selectedZone.value = details.timezone;
      selectedDays.value = [...details.workDays];
    } catch {
      // Toast already shown by the HTTP interceptor.
      if (current === seq) emit('close');
    } finally {
      if (current === seq) loadingUsers.value = false;
    }
  },
  { immediate: true },
);

/** The signed-in admin's own office drives every date in the app: reload the user and their data. */
async function afterOfficeSettingsChanged(): Promise<void> {
  emit('changed');
  if (!isMyOffice.value) return;
  await auth.refreshMe({ silent: true });
  void mine.refresh();
}

// ---- Time zone ----------------------------------------------------------------

/** Every IANA zone the browser knows, plus the current one in case it's missing. */
const zoneOptions = computed<SearchOption[]>(() => {
  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  if (office.value) zones.add(office.value.timezone);
  return [...zones].sort().map((zone) => ({ value: zone, label: zone, hint: formatOffset(zone, now.value) }));
});

const zoneDirty = computed(() => !!office.value && selectedZone.value !== office.value.timezone);

function localTime(zone: string): string {
  const dt = now.value.setZone(zone);
  return dt.isValid ? dt.toFormat('HH:mm · ccc d LLL') : '—';
}

async function saveZone(): Promise<void> {
  if (!office.value || !zoneDirty.value) return;
  const name = office.value.name;
  const confirmed = await confirm({
    title: `Switch ${name} to ${selectedZone.value}?`,
    body: `Everyone in ${name} will see and enter times in ${selectedZone.value}, and "after today" will follow it. Existing requests keep their exact moments, so their displayed times shift.`,
    confirmLabel: 'Change time zone',
  });
  if (!confirmed) return;

  savingZone.value = true;
  try {
    office.value = await officeApi.updateTimezoneOf(office.value.id, selectedZone.value);
    selectedZone.value = office.value.timezone;
    toast.success('Time zone updated', `${name} now runs on ${office.value.timezone}.`);
    await afterOfficeSettingsChanged();
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    savingZone.value = false;
  }
}

// ---- Work week ----------------------------------------------------------------

const weekDirty = computed(() => !!office.value && !sameWeek(selectedDays.value, office.value.workDays));

function toggleDay(day: number): void {
  selectedDays.value = selectedDays.value.includes(day)
    ? selectedDays.value.filter((d) => d !== day)
    : [...selectedDays.value, day].sort((a, b) => a - b);
}

async function saveWeek(): Promise<void> {
  if (!office.value || !weekDirty.value || !selectedDays.value.length) return;
  const name = office.value.name;
  const confirmed = await confirm({
    title: `Change ${name}'s work week to ${describeWeek(selectedDays.value)}?`,
    body: 'Day counts and leave balances are recalculated for every request in the office, and the calendar shades the new days off. New requests must include at least one working day.',
    confirmLabel: 'Change work week',
  });
  if (!confirmed) return;

  savingWeek.value = true;
  try {
    office.value = await officeApi.updateWorkWeekOf(office.value.id, selectedDays.value);
    selectedDays.value = [...office.value.workDays];
    toast.success('Work week updated', `${name} now works ${describeWeek(office.value.workDays)}.`);
    await afterOfficeSettingsChanged();
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    savingWeek.value = false;
  }
}

// ---- People and roles ----------------------------------------------------------

/**
 * Requester ↔ validator moves apply right away (the card moves first and goes back if saving fails).
 * Anything involving the admin role grants or removes control over the whole workspace, so it's confirmed.
 */
async function moveUser(user: UserSummary, role: Role): Promise<void> {
  if (savingUserId.value !== null || user.role === role) return;
  if (role === 'WorkspaceAdmin' || user.role === 'WorkspaceAdmin') {
    const toAdmin = role === 'WorkspaceAdmin';
    const confirmed = await confirm({
      title: `Make ${user.name} ${roleLabel(role).toLowerCase()}?`,
      body: toAdmin
        ? `${user.name} will be able to change roles and settings in every office of ${office.value?.workspace.name ?? 'the workspace'}.`
        : `${user.name} will no longer manage roles or office settings. ${ROLE_DESCRIPTIONS[role]}`,
      confirmLabel: `Make ${roleLabel(role).toLowerCase()}`,
      tone: toAdmin ? 'danger' : 'primary',
    });
    if (!confirmed) return;
  }

  const previous = users.value;
  users.value = users.value.map((u) => (u.id === user.id ? { ...u, role } : u));
  savingUserId.value = user.id;
  try {
    const updated = await officeApi.updateUserRole(user.id, role);
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    toast.success('Role updated', `${updated.name} is now ${roleLabel(updated.role).toLowerCase()}.`);
    emit('changed');
  } catch {
    // Toast already shown; put the card back.
    users.value = previous;
  } finally {
    savingUserId.value = null;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      enter-active-class="transition-opacity duration-200"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div v-if="isOpen" class="fixed inset-0 z-40 flex justify-end">
        <div class="absolute inset-0 bg-drawer-overlay" aria-hidden="true" @click="close" />
        <div
          ref="panel"
          class="relative flex h-full w-[640px] max-w-[100vw] flex-col bg-surface shadow-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="office-drawer-title"
          tabindex="-1"
        >
          <div class="flex items-start justify-between border-b border-line-divider px-6 py-[22px]">
            <div class="flex min-w-0 flex-col gap-1">
              <h2 id="office-drawer-title" class="text-[20px] font-semibold tracking-[-0.02em]">
                {{ office ? `Edit ${office.name}` : 'Loading office…' }}
              </h2>
              <p class="text-[13px] text-ink-3">
                <template v-if="office">
                  {{ office.workspace.name }} · {{ users.length }} {{ users.length === 1 ? 'person' : 'people' }} · local time
                  <span class="font-mono">{{ now.setZone(office.timezone).toFormat('HH:mm') }}</span>
                  <template v-if="isMyOffice"> · your office</template>
                </template>
                <template v-else>&nbsp;</template>
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              class="h-8 w-8 shrink-0 cursor-pointer rounded-lg bg-canvas text-[16px] text-ink hover:bg-line-divider"
              @click="close"
            >
              ×
            </button>
          </div>

          <div class="flex flex-1 flex-col gap-7 overflow-auto p-6">
            <form class="flex flex-col gap-3" @submit.prevent="saveZone">
              <div class="flex flex-col gap-1">
                <h3 class="text-[15px] font-semibold">Time zone</h3>
                <p class="text-[13px] text-ink-3">Dates and times are shown and entered in this zone for everyone in the office.</p>
              </div>
              <div v-if="!office" class="h-[42px] animate-pulse rounded-control bg-canvas" />
              <template v-else>
                <SearchSelect v-model="selectedZone" :options="zoneOptions" label="Time zone" placeholder="Search, e.g. Paris or New York" />
                <p class="font-mono text-[12px] text-ink-3">
                  {{ zoneDirty ? `${office.timezone} → ${selectedZone} · ${localTime(selectedZone)}` : localTime(office.timezone) }}
                </p>
                <div class="flex justify-end gap-2.5">
                  <AppButton size="sm" :disabled="!zoneDirty || savingZone" @click="selectedZone = office.timezone">Cancel</AppButton>
                  <AppButton size="sm" type="submit" variant="primary" :disabled="!zoneDirty" :loading="savingZone">Save time zone</AppButton>
                </div>
              </template>
            </form>

            <form class="flex flex-col gap-3 border-t border-line-divider pt-6" @submit.prevent="saveWeek">
              <div class="flex flex-col gap-1">
                <h3 class="text-[15px] font-semibold">Work week</h3>
                <p class="text-[13px] text-ink-3">Day counts, leave balances and the calendar follow it.</p>
              </div>
              <div v-if="!office" class="h-10 animate-pulse rounded-control bg-canvas" />
              <template v-else>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Working days">
                  <button
                    v-for="w in WEEKDAYS"
                    :key="w.day"
                    type="button"
                    :aria-pressed="selectedDays.includes(w.day)"
                    :aria-label="w.long"
                    class="h-9 min-w-[52px] cursor-pointer rounded-control border px-3 text-[13px] font-medium transition-colors"
                    :class="selectedDays.includes(w.day) ? 'border-ink bg-ink text-white' : 'border-line-input bg-surface text-ink-2 hover:border-ink'"
                    @click="toggleDay(w.day)"
                  >
                    {{ w.short }}
                  </button>
                </div>
                <p class="text-[13px] text-ink-3" aria-live="polite">
                  <span v-if="!selectedDays.length" class="text-danger">Pick at least one working day.</span>
                  <template v-else>{{ describeWeek(selectedDays) }} · {{ selectedDays.length }} {{ selectedDays.length === 1 ? 'day' : 'days' }} a week</template>
                </p>
                <div class="flex justify-end gap-2.5">
                  <AppButton size="sm" :disabled="!weekDirty || savingWeek" @click="selectedDays = [...office.workDays]">Cancel</AppButton>
                  <AppButton size="sm" type="submit" variant="primary" :disabled="!weekDirty || !selectedDays.length" :loading="savingWeek">
                    Save work week
                  </AppButton>
                </div>
              </template>
            </form>

            <section class="flex flex-col gap-3 border-t border-line-divider pt-6" aria-labelledby="office-drawer-people">
              <div class="flex flex-col gap-1">
                <h3 id="office-drawer-people" class="text-[15px] font-semibold">People and roles</h3>
                <p class="text-[13px] text-ink-3">
                  Drag someone to another group, or use “Move to”. Changes apply right away, even if they're signed in.
                </p>
              </div>
              <RoleBoard
                :users="users"
                :me-id="auth.me?.id ?? null"
                :saving-id="savingUserId"
                :loading="loadingUsers"
                @move="moveUser"
              />
            </section>

            <OfficeInvitations v-if="office" :key="office.id" :office="office" />
            <div v-else class="h-24 animate-pulse rounded-control bg-canvas" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
