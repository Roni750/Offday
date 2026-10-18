<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import * as officeApi from '@/api/office';
import type { Role, UserSummary } from '@/api/types';
import PageHeader from '@/components/layout/PageHeader.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import SegmentedTabs from '@/components/ui/SegmentedTabs.vue';
import type { SegmentedOption, TableColumn } from '@/components/ui/types';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useToast } from '@/composables/useToast';
import { useMediaQuery } from '@/composables/useMediaQuery';
import { useAuthStore } from '@/stores/auth';
import { useConfirmStore } from '@/stores/confirm';
import { ALL_ROLES, ROLE_DESCRIPTIONS, roleLabel } from '@/utils/roles';

type RoleFilter = 'All' | Role;

const auth = useAuthStore();
const toast = useToast();
const { confirm } = useConfirmStore();
// On phones the descriptive "Access" column is dropped so each name stays next to its role control.
const isNarrow = useMediaQuery('(max-width: 640px)');

const users = ref<UserSummary[]>([]);
const loading = ref(true);
const savingId = ref<number | null>(null);
const filter = ref<RoleFilter>('All');

onMounted(async () => {
  try {
    users.value = await officeApi.listOfficeUsers();
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    loading.value = false;
  }
});

const filterOptions = computed<SegmentedOption<RoleFilter>[]>(() => [
  { value: 'All', label: 'All', count: users.value.length },
  ...ALL_ROLES.map((role) => ({
    value: role,
    label: roleLabel(role),
    count: users.value.filter((u) => u.role === role).length,
  })),
]);

const rows = computed(() => (filter.value === 'All' ? users.value : users.value.filter((u) => u.role === filter.value)));

const columns = computed<TableColumn[]>(() => [
  { key: 'person', label: 'Person', width: isNarrow.value ? 'minmax(0,1fr)' : 'minmax(220px,1.4fr)' },
  ...(isNarrow.value ? [] : [{ key: 'access', label: 'Access', width: 'minmax(220px,2fr)' }]),
  { key: 'role', label: 'Role', width: isNarrow.value ? '150px' : '180px', align: 'right' as const },
]);

/** Picking a value only proposes the change; nothing is saved until it's confirmed. */
async function changeRole(user: UserSummary, event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement;
  const role = select.value as Role;
  if (role === user.role) return;
  if (savingId.value !== null) {
    select.value = user.role;
    return;
  }

  const toAdmin = role === 'OfficeAdmin';
  const confirmed = await confirm({
    title: `Make ${user.name} ${roleLabel(role).toLowerCase()}?`,
    body: toAdmin
      ? `${user.name} will be able to change roles and settings in every office of the workspace. ${ROLE_DESCRIPTIONS[role]}`
      : `${ROLE_DESCRIPTIONS[role]} The change applies right away, even if they're signed in.`,
    confirmLabel: `Make ${roleLabel(role).toLowerCase()}`,
    tone: toAdmin ? 'danger' : 'primary',
  });
  if (!confirmed) {
    select.value = user.role;
    return;
  }

  savingId.value = user.id;
  try {
    const updated = await officeApi.updateUserRole(user.id, role);
    users.value = users.value.map((u) => (u.id === updated.id ? updated : u));
    toast.success('Role updated', `${updated.name} is now ${roleLabel(updated.role).toLowerCase()}.`);
  } catch {
    // Toast already shown; put the select back to the saved role.
    select.value = user.role;
  } finally {
    savingId.value = null;
  }
}
</script>

<template>
  <PageHeader title="Users & roles" />

  <div class="flex flex-col gap-[18px]">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
      <div v-for="role in ALL_ROLES" :key="role" class="card flex flex-col gap-1.5 px-5 py-4">
        <span class="eyebrow">{{ roleLabel(role) }}</span>
        <p class="text-[13px] leading-[1.45] text-ink-3">{{ ROLE_DESCRIPTIONS[role] }}</p>
      </div>
    </div>

    <section class="card overflow-hidden">
      <CardHeader :title="`People in ${auth.me?.office.name ?? 'your office'}`" subtitle="Pick a role to change it; you'll confirm before it's saved. You can't change your own.">
        <SegmentedTabs v-model="filter" :options="filterOptions" label="Filter by role" />
      </CardHeader>

      <DataTable :columns="columns" :rows="rows" :loading="loading" :min-width="isNarrow ? 0 : 720" empty-text="Nobody has this role.">
        <template #cell-person="{ row }">
          <div class="flex min-w-0 items-center gap-2.5">
            <UserAvatar :id="row.id" :name="row.name" />
            <div class="flex min-w-0 flex-col">
              <span class="truncate font-medium">{{ row.name }}{{ row.id === auth.me?.id ? ' (you)' : '' }}</span>
              <span class="truncate text-[12px] text-muted">{{ row.email }}</span>
            </div>
          </div>
        </template>
        <template #cell-access="{ row }">
          <span class="block truncate text-[13px] text-ink-3" :title="ROLE_DESCRIPTIONS[row.role]">
            {{ ROLE_DESCRIPTIONS[row.role] }}
          </span>
        </template>
        <template #cell-role="{ row }">
          <div class="flex items-center gap-2">
            <span
              v-if="savingId === row.id"
              class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-r-transparent"
              aria-hidden="true"
            />
            <select
              :value="row.role"
              :disabled="row.id === auth.me?.id"
              :aria-busy="savingId === row.id"
              :aria-label="`Role for ${row.name}`"
              :title="row.id === auth.me?.id ? `You can't change your own role` : undefined"
              class="h-8 w-[150px] cursor-pointer rounded-lg border border-line-input bg-surface px-2 text-[13px] text-ink outline-none focus:border-ink disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted"
              @change="changeRole(row, $event)"
            >
              <option v-for="role in ALL_ROLES" :key="role" :value="role">{{ roleLabel(role) }}</option>
            </select>
          </div>
        </template>
      </DataTable>
    </section>
  </div>
</template>
