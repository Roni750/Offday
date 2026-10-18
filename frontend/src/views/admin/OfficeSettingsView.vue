<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { DateTime } from 'luxon';
import * as officeApi from '@/api/office';
import type { WorkspaceOffice } from '@/api/types';
import OfficeEditDrawer from '@/components/admin/OfficeEditDrawer.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import type { TableColumn } from '@/components/ui/types';
import { useMediaQuery } from '@/composables/useMediaQuery';
import { useAuthStore } from '@/stores/auth';
import { formatOffset } from '@/utils/dates';
import { describeWeek } from '@/utils/workWeek';

const auth = useAuthStore();
// On phones only the office and its edit button stay; the details are in the drawer.
const isNarrow = useMediaQuery('(max-width: 640px)');

const offices = ref<WorkspaceOffice[]>([]);
const loading = ref(true);
const editingId = ref<number | null>(null);
const now = ref(DateTime.now());
const clock = setInterval(() => (now.value = DateTime.now()), 15_000);
onUnmounted(() => clearInterval(clock));

async function load(): Promise<void> {
  try {
    offices.value = await officeApi.listWorkspaceOffices();
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const myOffice = computed(() => offices.value.find((o) => o.isMine) ?? null);
const headcount = computed(() => offices.value.reduce((sum, o) => sum + o.people.total, 0));

const columns = computed<TableColumn[]>(() => [
  { key: 'office', label: 'Office', width: isNarrow.value ? 'minmax(0,1fr)' : 'minmax(160px,1.2fr)' },
  ...(isNarrow.value
    ? []
    : [
        { key: 'zone', label: 'Time zone', width: 'minmax(190px,1.4fr)' },
        { key: 'week', label: 'Work week', width: 'minmax(100px,0.8fr)' },
        { key: 'people', label: 'People', width: 'minmax(170px,1.2fr)' },
      ]),
  { key: 'edit', label: '', width: '80px', align: 'right' as const },
]);
</script>

<template>
  <PageHeader title="Office settings" />

  <div class="flex flex-col gap-[18px]">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
      <KpiCard label="Workspace" size="md" :value="auth.me?.workspace.name ?? null" hint="Company account" :loading="loading" />
      <KpiCard
        label="Offices"
        size="md"
        :value="loading ? null : String(offices.length)"
        :hint="`${headcount} people in total`"
        :loading="loading"
      />
      <KpiCard label="Your office's time" tone="accent" size="md" :loading="!myOffice">
        <template #value>
          <span v-if="myOffice" class="font-mono text-[28px] font-medium tracking-[-0.02em]">
            {{ now.setZone(myOffice.timezone).toFormat('HH:mm') }}
          </span>
        </template>
        <span v-if="myOffice" class="text-[12px]">{{ myOffice.name }} · {{ myOffice.timezone }} · {{ formatOffset(myOffice.timezone, now) }}</span>
      </KpiCard>
    </div>

    <section class="card overflow-hidden">
      <CardHeader
        :title="`Offices in ${auth.me?.workspace.name ?? 'your workspace'}`"
        subtitle="As a workspace admin you manage every office of the workspace: its time zone, work week and who reviews requests."
      />
      <DataTable :columns="columns" :rows="offices" :loading="loading" :min-width="isNarrow ? 0 : 760" :skeleton-rows="2" empty-text="No offices yet.">
        <template #cell-office="{ row }">
          <div class="flex min-w-0 flex-col">
            <span class="flex items-center gap-2 font-medium">
              <span class="truncate">{{ row.name }}</span>
              <span v-if="row.isMine" class="shrink-0 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-medium">Your office</span>
            </span>
            <span v-if="isNarrow" class="truncate text-[12px] text-muted">
              {{ row.timezone }} · {{ describeWeek(row.workDays) }} · {{ row.people.total }} people
            </span>
          </div>
        </template>
        <template #cell-zone="{ row }">
          <div class="flex min-w-0 flex-col">
            <span class="truncate">{{ row.timezone }}</span>
            <span class="font-mono text-[12px] text-muted">{{ now.setZone(row.timezone).toFormat('HH:mm') }} · {{ formatOffset(row.timezone, now) }}</span>
          </div>
        </template>
        <template #cell-week="{ row }">
          <span class="text-ink-2">{{ describeWeek(row.workDays) }}</span>
        </template>
        <template #cell-people="{ row }">
          <div class="flex min-w-0 flex-col">
            <span>{{ row.people.total }} {{ row.people.total === 1 ? 'person' : 'people' }}</span>
            <span class="truncate text-[12px] text-muted">
              {{ row.people.Requester }} req · {{ row.people.Validator }} val · {{ row.people.WorkspaceAdmin }} admin
            </span>
          </div>
        </template>
        <template #cell-edit="{ row }">
          <AppButton size="sm" :aria-label="`Edit ${row.name}`" @click="editingId = row.id">Edit</AppButton>
        </template>
      </DataTable>
    </section>
  </div>

  <OfficeEditDrawer :office-id="editingId" @close="editingId = null" @changed="load" />
</template>
