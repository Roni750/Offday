<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import type { DateTime } from 'luxon';
import * as holidaysApi from '@/api/holidays';
import * as officeApi from '@/api/office';
import { HOLIDAY_CALENDAR_IDS, type Holiday, type HolidayCalendarId, type TeamCalendar as TeamCalendarData } from '@/api/types';
import TeamCalendar from '@/components/calendar/TeamCalendar.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';
import { useMyRequestsStore } from '@/stores/myRequests';
import { useRequestDrawerStore } from '@/stores/requestDrawer';
import { useReviewStore } from '@/stores/review';
import { todayIn, toUtcIso } from '@/utils/dates';
import { HOLIDAY_CALENDARS, readHolidayPreference, writeHolidayPreference } from '@/utils/holidays';

const auth = useAuthStore();
const mine = useMyRequestsStore();
const review = useReviewStore();
const drawer = useRequestDrawerStore();

const currentMonth = (): DateTime => todayIn(auth.timezone).startOf('month');
const month = shallowRef<DateTime>(currentMonth());
const data = ref<TeamCalendarData>({ users: [], requests: [] });
const loading = ref(false);
let seq = 0;

async function load(): Promise<void> {
  const id = ++seq;
  loading.value = true;
  try {
    const from = month.value.startOf('month');
    const result = await officeApi.getTeamCalendar(toUtcIso(from), toUtcIso(from.plus({ months: 1 })));
    if (id === seq) data.value = result;
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    if (id === seq) loading.value = false;
  }
}

// Reload on navigation and after any change to requests made elsewhere in the app.
watch([month, () => mine.revision, () => review.revision, () => auth.timezone], load, { immediate: true });

// ---- Religious holidays (validators and workspace admins) ---------------------------

const selectedCalendars = ref<HolidayCalendarId[]>(auth.canReview ? readHolidayPreference() : []);
const holidays = ref<Holiday[]>([]);
const unavailable = ref<HolidayCalendarId[]>([]);
const loadingHolidays = ref(false);
let holidaySeq = 0;

function toggleCalendar(id: HolidayCalendarId): void {
  const next = selectedCalendars.value.includes(id) ? selectedCalendars.value.filter((c) => c !== id) : [...selectedCalendars.value, id];
  // Keep a stable order, so the request (and the server's cache) doesn't depend on click order.
  selectedCalendars.value = HOLIDAY_CALENDAR_IDS.filter((c) => next.includes(c));
  writeHolidayPreference(selectedCalendars.value);
}

async function loadHolidays(): Promise<void> {
  const id = ++holidaySeq;
  if (!auth.canReview || !selectedCalendars.value.length) {
    holidays.value = [];
    unavailable.value = [];
    return;
  }
  loadingHolidays.value = true;
  try {
    const from = month.value.startOf('month').toISODate()!;
    const to = month.value.endOf('month').toISODate()!;
    const result = await holidaysApi.getHolidays(from, to, selectedCalendars.value);
    if (id !== holidaySeq) return;
    holidays.value = result.holidays;
    unavailable.value = result.unavailable;
  } catch {
    // Toast already shown by the HTTP interceptor.
  } finally {
    if (id === holidaySeq) loadingHolidays.value = false;
  }
}

watch([month, selectedCalendars], loadHolidays, { immediate: true });

const unavailableLabels = computed(() => unavailable.value.map((id) => HOLIDAY_CALENDARS[id].label).join(' and '));

</script>

<template>
  <PageHeader title="Team calendar">
    <template #actions>
      <AppButton variant="primary" @click="drawer.open()">
        <span class="-mt-0.5 text-[18px] leading-none">+</span>New request
      </AppButton>
    </template>
  </PageHeader>

  <fieldset v-if="auth.canReview" class="card flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3">
    <legend class="sr-only">Show religious holidays</legend>
    <span class="text-[13px] font-medium" aria-hidden="true">Show holidays</span>
    <label
      v-for="id in HOLIDAY_CALENDAR_IDS"
      :key="id"
      class="flex cursor-pointer select-none items-center gap-2 text-[13px] text-ink-2 hover:text-ink"
    >
      <input
        type="checkbox"
        class="h-4 w-4 cursor-pointer accent-ink"
        :checked="selectedCalendars.includes(id)"
        @change="toggleCalendar(id)"
      />
      <span class="h-2 w-2 rounded-full" :class="HOLIDAY_CALENDARS[id].dot" aria-hidden="true" />
      {{ HOLIDAY_CALENDARS[id].label }}
    </label>
    <span v-if="loadingHolidays" class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-r-transparent" aria-label="Loading holidays" />
    <span class="ml-auto text-[12px] text-muted max-sm:ml-0">Source: Google Calendar's public holiday calendars</span>
  </fieldset>

  <p v-if="unavailable.length" class="rounded-control border border-pending-dot bg-pending-bg px-4 py-2.5 text-[13px] text-pending-fg" role="status">
    {{ unavailableLabels }} holidays can't be loaded right now. Try again in a few minutes.
  </p>

  <TeamCalendar
    :month="month"
    :users="data.users"
    :requests="data.requests"
    :me-id="auth.me?.id ?? null"
    :zone="auth.timezone"
    :work-days="auth.workDays"
    :loading="loading"
    :holidays="selectedCalendars.length ? holidays : undefined"
    @prev="month = month.minus({ months: 1 })"
    @next="month = month.plus({ months: 1 })"
    @today="month = currentMonth()"
  />
</template>
