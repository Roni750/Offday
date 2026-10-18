<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import * as statsApi from '@/api/stats';
import type { Overview } from '@/api/types';
import PageHeader from '@/components/layout/PageHeader.vue';
import MonthlyBarChart from '@/components/overview/MonthlyBarChart.vue';
import UpcomingAbsences from '@/components/overview/UpcomingAbsences.vue';
import DecisionButtons from '@/components/requests/DecisionButtons.vue';
import AppButton from '@/components/ui/AppButton.vue';
import CardHeader from '@/components/ui/CardHeader.vue';
import DataTable from '@/components/ui/DataTable.vue';
import KpiCard from '@/components/ui/KpiCard.vue';
import type { TableColumn } from '@/components/ui/types';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useOfficeTime } from '@/composables/useOfficeTime';
import { useAuthStore } from '@/stores/auth';
import { useMyRequestsStore } from '@/stores/myRequests';
import { useReviewStore } from '@/stores/review';
import { formatDays } from '@/utils/dates';
import { reasonText } from '@/utils/requests';

const NEEDS_DECISION_LIMIT = 4;

const auth = useAuthStore();
const review = useReviewStore();
const mine = useMyRequestsStore();
const router = useRouter();
const time = useOfficeTime();

const year = computed(() => time.today().year);
const stats = ref<Overview | null>(null);
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    // Upcoming office requests power "Upcoming absences" and "Needs your decision".
    const [overview] = await Promise.all([statsApi.getOverview(year.value), mine.loadUpcoming()]);
    stats.value = overview;
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    loading.value = false;
  }
}

watch([() => review.revision, () => mine.revision, () => auth.timezone], load, { immediate: true });

const pendingCount = computed(() => review.pendingCount ?? stats.value?.pendingCount ?? 0);

const kpis = computed(() => {
  const s = stats.value;
  return {
    pending: s?.pendingCount ?? null,
    oldest: s?.oldestPendingCreatedAt ? `Oldest submitted ${time.day(s.oldestPendingCreatedAt)}` : 'Nothing waiting',
    rate: s ? (s.approvalRate === null ? '—' : `${Math.round(s.approvalRate * 100)}%`) : null,
    approvedDays: s ? formatDays(s.approvedDays) : null,
    people: s?.approvedPeople ?? 0,
    outSoon: s?.outNext14Days ?? null,
    teamSize: s?.teamSize ?? 0,
  };
});

const currentMonth = computed(() => time.today().toFormat('yyyy-MM'));

/** Pending requests others submitted, soonest start first. */
const needsDecision = computed(() =>
  mine.upcoming
    .filter((r) => r.status === 'Pending' && r.user.id !== auth.me?.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, NEEDS_DECISION_LIMIT),
);

const columns: TableColumn[] = [
  { key: 'employee', label: 'Employee', width: 'minmax(180px,1.4fr)' },
  { key: 'dates', label: 'Dates', width: 'minmax(130px,1fr)' },
  { key: 'reason', label: 'Reason', width: 'minmax(120px,1.6fr)' },
  { key: 'decision', label: 'Decision', width: 'auto', align: 'right' },
];

function goReview(): void {
  void router.push({ name: 'requests' });
}
</script>

<template>
  <PageHeader title="Overview">
    <template #actions>
      <AppButton v-if="pendingCount > 0" variant="primary" @click="goReview">Review {{ pendingCount }} pending</AppButton>
    </template>
  </PageHeader>

  <div class="flex flex-col gap-[18px]">
    <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
      <KpiCard label="Awaiting review" tone="accent" :value="kpis.pending" :hint="kpis.oldest" :loading="!stats" />
      <KpiCard label="Approval rate" :value="kpis.rate" :hint="`Approved ÷ decided · ${year}`" :loading="!stats" />
      <KpiCard
        :label="`Approved days · ${year}`"
        :value="kpis.approvedDays"
        :hint="`Across ${kpis.people} team ${kpis.people === 1 ? 'member' : 'members'}`"
        :loading="!stats"
      />
      <KpiCard label="Out in next 14 days" :value="kpis.outSoon" :hint="`of ${kpis.teamSize} people`" :loading="!stats" />
    </div>

    <div class="flex flex-wrap gap-3.5">
      <MonthlyBarChart :data="stats?.monthly ?? []" :current-month="currentMonth" :loading="loading" />
      <UpcomingAbsences :requests="mine.upcoming" :loading="loading" />
    </div>

    <section class="card overflow-hidden">
      <CardHeader title="Needs your decision" subtitle="Pending requests, soonest start first">
        <AppButton size="sm" @click="goReview">View all</AppButton>
      </CardHeader>
      <DataTable
        :columns="columns"
        :rows="needsDecision"
        :loading="loading"
        :min-width="720"
        hide-header
        dense
        empty-text="You're all caught up."
      >
        <template #cell-employee="{ row }">
          <div class="flex min-w-0 items-center gap-2.5">
            <UserAvatar :id="row.user.id" :name="row.user.name" />
            <span class="truncate font-medium">{{ row.user.name }}</span>
          </div>
        </template>
        <template #cell-dates="{ row }">
          <div class="flex flex-col gap-0.5">
            <span class="font-medium">{{ time.range(row) }}</span>
            <span class="font-mono text-[12px] text-muted">{{ formatDays(row.days) }} working days</span>
          </div>
        </template>
        <template #cell-reason="{ row }">
          <span class="block truncate" :class="row.reason ? 'text-ink-2' : 'text-faint'">{{ reasonText(row) }}</span>
        </template>
        <template #cell-decision="{ row }">
          <DecisionButtons :request="row" />
        </template>
      </DataTable>
    </section>
  </div>
</template>
