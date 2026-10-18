<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import type { VacationRequest } from '@/api/types';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import DataTable from '@/components/ui/DataTable.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import PaginationBar from '@/components/ui/PaginationBar.vue';
import SegmentedTabs from '@/components/ui/SegmentedTabs.vue';
import StatusPill from '@/components/ui/StatusPill.vue';
import type { SegmentedOption, TableColumn } from '@/components/ui/types';
import { useOfficeTime } from '@/composables/useOfficeTime';
import { useAuthStore } from '@/stores/auth';
import { useConfirmStore } from '@/stores/confirm';
import { useMyRequestsStore } from '@/stores/myRequests';
import { useRequestDrawerStore } from '@/stores/requestDrawer';
import { daysUntil, formatDayCount, formatDays } from '@/utils/dates';
import {
  STATUS_TABS,
  type StatusTab,
  firstName,
  isTripMember,
  isTripOrganizer,
  reasonText,
  shortName,
  tripMates,
  tripTooltip,
  withText,
} from '@/utils/requests';

const auth = useAuthStore();
const mine = useMyRequestsStore();
const drawer = useRequestDrawerStore();
const time = useOfficeTime();
const { confirm, choose } = useConfirmStore();
const { list, counts, balance, listLoading } = storeToRefs(mine);

onMounted(() => {
  void mine.refresh();
});

// ---- KPIs -------------------------------------------------------------------

const balanceView = computed(() => {
  const b = balance.value;
  if (!b) return null;
  const pct = (days: number) => `${Math.max(0, Math.min(100, (days / b.allowance) * 100))}%`;
  const room = Math.max(0, b.allowance - b.usedDays);
  return {
    ...b,
    usedPct: pct(b.usedDays),
    pendingPct: pct(Math.min(b.pendingDays, room)),
  };
});

const nextTimeOff = computed(() => {
  const now = time.today();
  const next = [...mine.myUpcoming]
    .filter((r) => r.status !== 'Rejected' && time.toLocal(r.endDate) > now)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (!next) return null;
  const startsIn = daysUntil(time.toLocal(next.startDate), now);
  return {
    request: next,
    when: startsIn <= 0 ? 'happening now' : startsIn === 1 ? 'tomorrow' : `in ${startsIn} days`,
  };
});

// Count and days come from the same source and year (the leave balance), so they always agree.
async function confirmWithdraw(request: VacationRequest): Promise<void> {
  // The organizer of a trip chooses: leave it themselves, or cancel it for everyone still pending.
  const othersPending = tripMates(request, auth.me?.id).filter((m) => m.status === 'Pending');
  if (isTripOrganizer(request, auth.me?.id) && othersPending.length) {
    const pending = othersPending.length + 1;
    const choice = await choose({
      title: 'Withdraw from this trip?',
      body: `${time.range(request)} · you can withdraw just yourself and let the others keep their requests, or cancel the trip for everyone still pending. Decided requests stay as they are.`,
      alternativeLabel: 'Withdraw just me',
      confirmLabel: `Cancel for everyone (${pending} pending)`,
      tone: 'danger',
    });
    if (choice === 'alternative') await mine.withdraw(request, 'self');
    else if (choice === 'confirm') await mine.withdraw(request, 'group');
    return;
  }
  const ok = await confirm({
    title: 'Withdraw this request?',
    body: `${time.range(request)} will be removed. Validators won't review it, and you'd need to submit it again.`,
    confirmLabel: 'Withdraw request',
    tone: 'danger',
  });
  if (ok) await mine.withdraw(request);
}

/** A trip's dates are frozen once anyone on it has a decision (the API refuses the edit). */
function tripDecided(request: VacationRequest): boolean {
  return !!request.group?.members.some((m) => m.status !== 'Pending');
}

/** A colleague put me on their trip: I can't change its dates, only leave it. */
async function confirmLeave(request: VacationRequest): Promise<void> {
  const organizer = request.group?.organizer ? firstName(request.group.organizer.name) : 'The organizer';
  const ok = await confirm({
    title: 'Leave this trip?',
    body: `${time.range(request)} will be removed for you only. ${organizer} and the others stay on the trip.`,
    confirmLabel: 'Leave trip',
    tone: 'danger',
  });
  if (ok) await mine.withdraw(request);
}

const pendingCount = computed(() => balance.value?.pendingRequests ?? null);

// ---- Table ------------------------------------------------------------------

const tabOptions = computed<SegmentedOption<StatusTab>[]>(() =>
  STATUS_TABS.map((tab) => ({
    value: tab,
    label: tab,
    count: counts.value ? (tab === 'All' ? counts.value.all : counts.value[tab]) : null,
  })),
);

const activeTab = computed({
  get: () => mine.tab,
  set: (tab: StatusTab) => mine.setTab(tab),
});

const columns: TableColumn[] = [
  { key: 'dates', label: 'Dates', width: 'minmax(170px,1.3fr)' },
  { key: 'days', label: 'Days', width: '70px' },
  { key: 'reason', label: 'Reason', width: 'minmax(120px,2fr)' },
  { key: 'submitted', label: 'Submitted', width: '100px' },
  { key: 'status', label: 'Status', width: '112px' },
  { key: 'action', label: 'Action', width: '150px', align: 'right' },
];

function resubmit(request: VacationRequest): void {
  drawer.open({ reason: request.reason ?? '' });
}
</script>

<template>
  <PageHeader title="My requests">
    <template #actions>
      <AppButton variant="primary" @click="drawer.open()">
        <span class="-mt-0.5 text-[18px] leading-none">+</span>New request
      </AppButton>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-[18px]">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3.5">
      <KpiCard :label="`Leave balance · ${balance?.year ?? time.today().year}`" tone="accent" :loading="!balanceView">
        <template #aside>
          <span v-if="balanceView" class="font-mono text-[12px]">{{ balanceView.allowance }} days</span>
        </template>
        <template #value>
          <div v-if="balanceView" class="flex items-baseline gap-2">
            <span class="text-[48px] font-semibold leading-none tracking-[-0.04em]">{{ formatDays(balanceView.remainingDays) }}</span>
            <span>days left</span>
          </div>
        </template>
        <template v-if="balanceView">
          <div class="mt-1.5 flex h-2 overflow-hidden rounded-full bg-ink/[.12]" aria-hidden="true">
            <div class="bg-ink" :style="{ width: balanceView.usedPct }" />
            <div class="bg-hatch-ink" :style="{ width: balanceView.pendingPct }" />
          </div>
          <div class="flex gap-4 text-[12px]">
            <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-[2px] bg-ink" />{{ formatDays(balanceView.usedDays) }} used</span>
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-[2px] border-[1.5px] border-ink" />{{ formatDays(balanceView.pendingDays) }} pending
            </span>
          </div>
        </template>
      </KpiCard>

      <KpiCard label="Next time off">
        <template #value>
          <template v-if="nextTimeOff">
            <span class="text-[28px] font-semibold tracking-[-0.03em]">{{ time.range(nextTimeOff.request) }}</span>
          </template>
        </template>
        <template v-if="nextTimeOff">
          <span class="text-[13px] text-ink-3">
            {{ formatDayCount(nextTimeOff.request.days, 'working day') }} · {{ nextTimeOff.when }}
          </span>
          <div class="mt-auto"><StatusPill :status="nextTimeOff.request.status" /></div>
        </template>
        <span v-else class="text-ink-3">Nothing planned yet.</span>
      </KpiCard>

      <KpiCard :label="`Awaiting decision · ${balance?.year ?? time.today().year}`" :loading="pendingCount === null">
        <template #value>
          <div class="flex items-baseline gap-2">
            <span class="text-[28px] font-semibold tracking-[-0.03em]">{{ pendingCount }}</span>
            <span class="text-[13px] text-ink-3">{{ pendingCount === 1 ? 'request' : 'requests' }}</span>
          </div>
        </template>
        <span class="text-[13px] text-ink-3">
          {{ formatDayCount(balance?.pendingDays ?? 0, 'working day') }} requested · reviewed by
          {{ auth.me?.office.name }} validators
        </span>
      </KpiCard>
    </div>

    <section class="card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line-divider px-5 py-4">
        <h2 class="text-[16px] font-semibold tracking-[-0.01em]">My requests</h2>
        <SegmentedTabs v-model="activeTab" :options="tabOptions" label="Filter by status" />
      </div>

      <DataTable
        :columns="columns"
        :rows="list?.items ?? []"
        :loading="listLoading"
        empty-text="No requests in this view."
      >
        <template #cell-dates="{ row }">
          <div class="flex flex-col gap-0.5">
            <span class="font-medium">{{ time.range(row) }}</span>
            <span class="font-mono text-[12px] text-muted">{{ time.times(row) }}</span>
            <span v-if="row.group" class="mt-1 flex flex-wrap gap-1">
              <span
                v-if="tripMates(row, auth.me?.id).length"
                class="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-[2px] text-[11px] font-medium text-ink"
                tabindex="0"
                v-tooltip="tripTooltip(row)"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-accent-mark" aria-hidden="true" />{{ withText(tripMates(row, auth.me?.id)) }}
              </span>
              <span
                v-if="row.addedBy"
                class="inline-flex items-center rounded-full border border-line px-2 py-[1px] text-[11px] text-ink-2"
              >
                Added by {{ firstName(row.addedBy.name) }}
              </span>
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
        <template #cell-action="{ row }">
          <div v-if="row.status === 'Pending' && isTripMember(row, auth.me?.id)" class="flex gap-2">
            <AppButton size="xs" @click="drawer.open({ edit: row })">View</AppButton>
            <AppButton size="xs" @click="confirmLeave(row)">Leave trip</AppButton>
          </div>
          <div v-else-if="row.status === 'Pending'" class="flex gap-2">
            <span
              v-if="tripDecided(row)"
              tabindex="0"
              v-tooltip="'Someone on this trip already has a decision, so its dates can’t change'"
            >
              <AppButton size="xs" disabled>Edit</AppButton>
            </span>
            <AppButton v-else size="xs" @click="drawer.open({ edit: row })">Edit</AppButton>
            <AppButton size="xs" @click="confirmWithdraw(row)">Withdraw</AppButton>
          </div>
          <span
            v-else-if="row.status === 'Approved'"
            class="flex items-center gap-1.5 text-[12px] text-muted"
            tabindex="0"
            v-tooltip="'Approved requests can’t be modified'"
          >
            <span class="h-2 w-2 rounded-[2px] border-[1.5px] border-muted" />Locked
          </span>
          <AppButton v-else size="xs" @click="resubmit(row)">New dates</AppButton>
        </template>
        <template #below="{ row }">
          <div
            v-if="row.status === 'Rejected' && row.comments"
            class="flex gap-2.5 rounded-control bg-danger-tint px-3 py-2.5 text-[13px] leading-[1.45]"
          >
            <span class="shrink-0 font-semibold">{{ row.decidedBy ? shortName(row.decidedBy.name) : 'Validator' }}</span>
            <span class="text-ink-2">{{ row.comments }}</span>
          </div>
        </template>
      </DataTable>

      <PaginationBar
        v-if="list && list.total > list.pageSize"
        :page="list.page"
        :page-size="list.pageSize"
        :total="list.total"
        @update:page="mine.setPage"
      />
    </section>
  </div>
</template>
