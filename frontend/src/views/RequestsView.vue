<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { type LocationQueryRaw, useRoute, useRouter } from 'vue-router';
import * as officeApi from '@/api/office';
import * as requestsApi from '@/api/requests';
import type { ReviewPage, UserSummary, VacationRequest } from '@/api/types';
import PageHeader from '@/components/layout/PageHeader.vue';
import DecisionButtons from '@/components/requests/DecisionButtons.vue';
import DataTable from '@/components/ui/DataTable.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import SegmentedTabs from '@/components/ui/SegmentedTabs.vue';
import SelectMenu from '@/components/ui/SelectMenu.vue';
import StatusPill from '@/components/ui/StatusPill.vue';
import type { SegmentedOption, TableColumn } from '@/components/ui/types';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useOfficeTime } from '@/composables/useOfficeTime';
import { useMyRequestsStore } from '@/stores/myRequests';
import { useReviewStore } from '@/stores/review';
import { formatDays, periodsOverlap, toUtcIso } from '@/utils/dates';
import { PAGE_SIZE, STATUS_TABS, type StatusTab, firstName, reasonText, tabToStatus, tripLabel, tripTooltip } from '@/utils/requests';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';

/** The queue opens on Pending; "All" is explicit in the URL. */
const DEFAULT_TAB: StatusTab = 'Pending';

const route = useRoute();
const router = useRouter();
const review = useReviewStore();
const mine = useMyRequestsStore();
const time = useOfficeTime();

// ---- Filters live in the URL (?status=&user=&page=) ----------------------------

const status = computed<StatusTab>(() => {
  const value = route.query.status;
  return STATUS_TABS.find((tab) => tab === value) ?? DEFAULT_TAB;
});
const userId = computed<number | null>(() => Number(route.query.user) || null);
const page = computed(() => Math.max(1, Number(route.query.page) || 1));
const hasFilters = computed(() => userId.value !== null || status.value !== 'All');

function setQuery(patch: { status?: StatusTab; user?: number | null; page?: number }): void {
  const next = {
    status: patch.status ?? status.value,
    user: patch.user !== undefined ? patch.user : userId.value,
    page: patch.page ?? 1,
  };
  const query: LocationQueryRaw = {};
  if (next.status !== DEFAULT_TAB) query.status = next.status;
  if (next.user) query.user = String(next.user);
  if (next.page > 1) query.page = String(next.page);
  void router.replace({ query });
}

const activeTab = computed({
  get: () => status.value,
  set: (tab: StatusTab) => setQuery({ status: tab }),
});

const employeeOptions = computed(() => [
  { value: '', label: 'All employees' },
  ...users.value.map((user) => ({ value: String(user.id), label: user.name })),
]);

const selectedUser = computed({
  get: () => (userId.value === null ? '' : String(userId.value)),
  set: (value: string) => setQuery({ user: value ? Number(value) : null }),
});

// ---- Data -------------------------------------------------------------------

const result = ref<ReviewPage | null>(null);
const users = ref<UserSummary[]>([]);
const loading = ref(false);
/** request id → names of approved teammates off during it. */
const overlaps = ref<Map<number, string[]>>(new Map());
let seq = 0;

async function loadOverlaps(items: VacationRequest[]): Promise<void> {
  const pending = items.filter((r) => r.status === 'Pending');
  if (!pending.length) {
    overlaps.value = new Map();
    return;
  }
  const from = pending.map((r) => r.startDate).sort()[0] ?? '';
  const to = pending.map((r) => r.endDate).sort().at(-1) ?? '';
  try {
    const calendar = await officeApi.getTeamCalendar(
      toUtcIso(time.toLocal(from)),
      toUtcIso(time.toLocal(to)),
    );
    const approved = calendar.requests.filter((r) => r.status === 'Approved').map((r) => ({ r, p: time.period(r) }));
    const map = new Map<number, string[]>();
    for (const request of pending) {
      const p = time.period(request);
      const names = approved
        // Companions on the same trip are going together, not "off" on their own.
        .filter(({ r }) => !(request.group && r.group?.id === request.group.id))
        .filter(({ r, p: other }) => r.user.id !== request.user.id && periodsOverlap(p.start, p.end, other.start, other.end))
        .map(({ r }) => r.user.name);
      if (names.length) map.set(request.id, [...new Set(names)]);
    }
    overlaps.value = map;
  } catch {
    overlaps.value = new Map();
  }
}

async function load(): Promise<void> {
  const id = ++seq;
  loading.value = true;
  try {
    const data = await requestsApi.listOfficeRequests({
      status: tabToStatus(status.value),
      userId: userId.value ?? undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    });
    if (id !== seq) return;
    // A decision can empty the last page: step back instead of showing nothing.
    if (!data.items.length && page.value > 1) {
      setQuery({ page: Math.max(1, Math.ceil(data.total / PAGE_SIZE)) });
      return;
    }
    result.value = data;
    void loadOverlaps(data.items);
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    if (id === seq) loading.value = false;
  }
}

watch([status, userId, page, () => review.revision, () => mine.revision], load, { immediate: true });

onMounted(async () => {
  try {
    users.value = await officeApi.listOfficeUsers();
  } catch {
    users.value = [];
  }
});

// ---- View -------------------------------------------------------------------

const tabOptions = computed<SegmentedOption<StatusTab>[]>(() => {
  const counts = result.value?.counts;
  return STATUS_TABS.map((tab) => ({
    value: tab,
    label: tab,
    count: counts ? (tab === 'All' ? counts.all : counts[tab]) : null,
  }));
});

const columns: TableColumn[] = [
  { key: 'employee', label: 'Employee', width: 'minmax(170px,1.4fr)' },
  { key: 'dates', label: 'Dates', width: 'minmax(140px,1.2fr)' },
  { key: 'days', label: 'Days', width: '56px' },
  { key: 'reason', label: 'Reason', width: 'minmax(110px,1.6fr)' },
  { key: 'submitted', label: 'Submitted', width: '92px' },
  { key: 'status', label: 'Status', width: '108px' },
  { key: 'decision', label: 'Decision', width: '168px', align: 'right' },
];

function overlapText(names: string[]): string {
  return names.length === 1 ? `${firstName(names[0] ?? '')} is off` : `${names.length} others off`;
}

// ---- Trips: "Approve all" / "Reject all" (decisions.md #15) ----------------------

const auth = useAuthStore();

/**
 * The trip actions show once per trip on the page, under its first row, when the reviewer may decide it
 * (not on the trip) and someone on it is still pending. Per-person buttons stay on every row.
 */
const tripActions = computed(() => {
  const shown = new Map<number, { rowId: number; pending: number }>();
  for (const row of result.value?.items ?? []) {
    const group = row.group;
    if (!group || shown.has(group.id)) continue;
    if (group.members.some((m) => m.userId === auth.me?.id)) continue;
    const pending = group.members.filter((m) => m.status === 'Pending').length;
    if (pending) shown.set(group.id, { rowId: row.id, pending });
  }
  return shown;
});

function tripActionFor(row: VacationRequest) {
  const action = row.group ? tripActions.value.get(row.group.id) : undefined;
  return action && action.rowId === row.id ? action : null;
}
</script>

<template>
  <PageHeader title="Requests" />

  <section class="card overflow-hidden">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line-divider px-5 py-3.5">
      <SegmentedTabs v-model="activeTab" :options="tabOptions" label="Filter by status" />
      <div class="flex flex-wrap items-center gap-2.5">
        <label for="employee-filter" class="text-[13px] text-ink-3">Employee</label>
        <SelectMenu
          id="employee-filter"
          v-model="selectedUser"
          :options="employeeOptions"
          class="w-[210px]"
        />
        <button
          v-if="hasFilters"
          type="button"
          class="h-9 cursor-pointer px-2.5 text-[13px] text-ink-2 underline hover:text-ink"
          @click="setQuery({ status: 'All', user: null })"
        >
          Reset
        </button>
      </div>
    </div>

    <DataTable
      :columns="columns"
      :rows="result?.items ?? []"
      :loading="loading"
      :min-width="1000"
      :skeleton-rows="PAGE_SIZE"
      dense
      empty-text="No requests match these filters."
    >
      <template #cell-employee="{ row }">
        <div class="flex min-w-0 items-center gap-2.5">
          <UserAvatar :id="row.user.id" :name="row.user.name" />
          <div class="flex min-w-0 flex-col">
            <span class="whitespace-nowrap font-medium">{{ row.user.name }}</span>
            <span class="truncate text-[12px] text-muted">{{ row.user.email }}</span>
            <span
              v-if="row.group"
              class="mt-1 inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full bg-accent-tint px-2 py-[2px] text-[11px] font-medium text-ink"
              tabindex="0"
              v-tooltip="tripTooltip(row)"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-accent-mark" aria-hidden="true" />{{ tripLabel(row) }}
            </span>
          </div>
        </div>
      </template>
      <template #cell-dates="{ row }">
        <div class="flex flex-col gap-[3px]">
          <span class="font-medium" v-tooltip="time.times(row)">{{ time.range(row) }}</span>
          <span
            v-if="overlaps.get(row.id)"
            class="flex items-center gap-[5px] text-[12px] text-pending-warn"
            v-tooltip="overlaps.get(row.id)?.join(', ')"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-pending-dot" />{{ overlapText(overlaps.get(row.id) ?? []) }}
          </span>
        </div>
      </template>
      <template #cell-days="{ row }">
        <span class="font-mono">{{ formatDays(row.days) }}d</span>
      </template>
      <template #cell-reason="{ row }">
        <span class="block truncate" :class="row.reason ? 'text-ink' : 'text-faint'" v-tooltip.truncated="row.reason">
          {{ reasonText(row) }}
        </span>
      </template>
      <template #cell-submitted="{ row }">
        <span class="font-mono text-[12px] text-ink-3">{{ time.day(row.createdAt) }}</span>
      </template>
      <template #cell-status="{ row }">
        <StatusPill :status="row.status" />
      </template>
      <template #cell-decision="{ row }">
        <DecisionButtons v-if="row.status === 'Pending'" :request="row" />
        <span v-else-if="row.decidedAt" class="font-mono text-[12px] text-muted" v-tooltip="row.decidedBy ? `Decided by ${row.decidedBy.name}` : null">
          on {{ time.day(row.decidedAt) }}
        </span>
      </template>
      <template #below="{ row }">
        <div
          v-if="row.status === 'Rejected' && row.comments"
          class="ml-[42px] rounded-control bg-danger-tint px-3 py-2 text-[13px] leading-[1.45] text-ink-2"
        >
          {{ row.comments }}
        </div>
        <div
          v-if="row.group && tripActionFor(row)"
          class="ml-[42px] flex flex-wrap items-center justify-between gap-3 rounded-control border border-line-divider bg-surface-subtle px-3 py-2 text-[13px]"
        >
          <span class="text-ink-2">
            <span class="font-medium text-ink">{{ tripLabel(row) }}</span>
            · {{ tripActionFor(row)!.pending }} of {{ row.group.members.length }} still pending
          </span>
          <div class="flex gap-2">
            <AppButton
              size="xs"
              variant="reject"
              :disabled="review.busyGroups.has(row.group.id)"
              @click="review.openReject(row, 'group')"
            >
              Reject all
            </AppButton>
            <AppButton size="xs" variant="primary" :loading="review.busyGroups.has(row.group.id)" @click="review.approveGroup(row)">
              Approve all ({{ tripActionFor(row)!.pending }})
            </AppButton>
          </div>
        </div>
      </template>
    </DataTable>

    <PaginationBar
      v-if="result"
      :page="result.page"
      :page-size="result.pageSize"
      :total="result.total"
      @update:page="(p) => setQuery({ page: p })"
    />
  </section>
</template>
