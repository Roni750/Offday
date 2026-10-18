<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useForm } from 'vee-validate';
import { type ApiError, toApiError } from '@/api/errors';
import type { RequestPayload } from '@/api/types';
import ColleaguePicker, { type ColleagueHint } from '@/components/requests/ColleaguePicker.vue';
import AppButton from '@/components/ui/AppButton.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import StatusPill from '@/components/ui/StatusPill.vue';
import TimePicker from '@/components/ui/TimePicker.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useDialog } from '@/composables/useDialog';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
import { useConfirmStore } from '@/stores/confirm';
import { useMyRequestsStore } from '@/stores/myRequests';
import { useRequestDrawerStore } from '@/stores/requestDrawer';
import {
  DATE_FORMAT,
  TIME_FORMAT,
  estimateWorkingDays,
  formatDay,
  formatDayCount,
  formatDays,
  lastDay,
  officeInputToDateTime,
  periodsOverlap,
  todayIn,
} from '@/utils/dates';
import {
  MAX_COLLEAGUES,
  REASON_MAX,
  describeBlockedColleagues,
  describeConflict,
  describePendingColleagues,
  firstName,
  formatPeriod,
  formatPeriodTimes,
  isTripMember,
  isTripOrganizer,
  listNames,
  reasonText,
  tripMates,
  zonedPeriod,
} from '@/utils/requests';
import {
  type RequestFormField,
  type RequestFormValues,
  buildRequestFormSchema,
  findColleagueOverlaps,
} from '@/validation/requestForm';
import { toTypedSchema } from '@/validation/zodTypedSchema';

const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '18:00';
/** Order used to move focus to the first invalid input on submit. */
const FIELD_ORDER: RequestFormField[] = ['startDate', 'startTime', 'endDate', 'endTime', 'colleagueIds', 'reason'];
/** API field → form field, for `details.fields` on a 400. */
const API_FIELDS: Record<string, RequestFormField> = {
  startDate: 'startDate',
  endDate: 'endDate',
  reason: 'reason',
  colleagueIds: 'colleagueIds',
};

const auth = useAuthStore();
const mine = useMyRequestsStore();
const drawer = useRequestDrawerStore();
const toast = useToast();
const { choose } = useConfirmStore();
const { isOpen, editing } = storeToRefs(drawer);

const zone = computed(() => auth.timezone);
const today = computed(() => todayIn(zone.value));
const earliestStart = computed(() => today.value.plus({ days: 1 }));
const minStart = computed(() => earliestStart.value.toFormat(DATE_FORMAT));

// ---- Trips: who's going (decisions.md #15) ---------------------------------------

/** The trip of the request being edited, if any. */
const trip = computed(() => editing.value?.group ?? null);
/** Someone else's trip: the dates are theirs, so this person sees it read-only and can only leave. */
const memberView = computed(() => !!editing.value && isTripMember(editing.value, auth.me?.id));
const tripPeople = computed(() => (editing.value ? tripMates(editing.value, auth.me?.id) : []));
/** The organizer moving their trip (once everyone else has left, it's just their own request again). */
const organizerEdit = computed(() => !!editing.value && isTripOrganizer(editing.value, auth.me?.id) && tripPeople.value.length > 0);

// ---- Form (VeeValidate + the Zod schema that mirrors the API rules) ------------

const schema = computed(() =>
  buildRequestFormSchema({
    zone: zone.value,
    workDays: auth.workDays,
    today: today.value,
    ownRequests: mine.myUpcoming,
    editingId: editing.value?.id,
    teamRequests: mine.othersUpcoming,
    editingGroupId: trip.value?.id,
  }),
);

const { defineField, errors, values, handleSubmit, resetForm, setErrors, isSubmitting, isFieldTouched, validateField } =
  useForm<RequestFormValues>({
    validationSchema: computed(() => toTypedSchema(schema.value)),
  });

const [startDate, startDateAttrs] = defineField('startDate');
const [startTime, startTimeAttrs] = defineField('startTime');
const [endDate, endDateAttrs] = defineField('endDate');
const [endTime, endTimeAttrs] = defineField('endTime');
const [reason, reasonAttrs] = defineField('reason');
const [colleagueIds] = defineField('colleagueIds');

/** Errors that the API returned and that don't belong to a field. */
const generalError = ref<string>();
/** Inputs and pickers alike: anything the submit handler can move focus to. */
type Focusable = { focus: () => void };
const inputs: Partial<Record<RequestFormField, Focusable | null>> = {};

// Rule 1 and the overlap checks compare start and end, so a changed period re-checks what depends on it.
watch([startDate, startTime, endDate, endTime], () => {
  if (isFieldTouched('endDate')) void validateField('endDate');
  if (isFieldTouched('endTime')) void validateField('endTime');
  if ((colleagueIds.value ?? []).length) void validateField('colleagueIds');
});
watch(colleagueIds, () => void validateField('colleagueIds'));

// ---- Opening ----------------------------------------------------------------

function initialValues(): RequestFormValues {
  const request = editing.value;
  if (!request) {
    return {
      startDate: '',
      startTime: DEFAULT_START_TIME,
      endDate: '',
      endTime: DEFAULT_END_TIME,
      reason: drawer.prefillReason,
      colleagueIds: [],
    };
  }
  const period = zonedPeriod(request, zone.value);
  return {
    startDate: period.start.toFormat(DATE_FORMAT),
    startTime: period.start.toFormat(TIME_FORMAT),
    endDate: period.end.toFormat(DATE_FORMAT),
    endTime: period.end.toFormat(TIME_FORMAT),
    reason: drawer.prefillReason,
    // When the organizer moves a trip, the client re-checks its members' approved time off, like the API.
    colleagueIds: tripMates(request, auth.me?.id).map((m) => m.userId),
  };
}

watch(isOpen, (open) => {
  if (!open) return;
  resetForm({ values: initialValues() });
  generalError.value = undefined;
  void mine.ensureFormContext();
});

const panel = ref<HTMLElement | null>(null);
useDialog(isOpen, panel, { onClose: () => close(), initialFocus: () => (memberView.value ? null : inputs.startDate) });

// ---- The period as typed, even while other fields are invalid (for the teammates' hints) ----

const period = computed(() => {
  const start = officeInputToDateTime(values.startDate ?? '', values.startTime ?? '', zone.value);
  const end = officeInputToDateTime(values.endDate ?? '', values.endTime ?? '', zone.value);
  return start && end && end > start ? { start, end } : null;
});

/** Each teammate's overlapping time off in the period: "Approved 12–14 Oct" blocks, "Pending 12–14 Oct" warns. */
const hints = computed(() => {
  const map = new Map<number, ColleagueHint>();
  const p = period.value;
  if (!p) return map;
  const { blocked, warned } = findColleagueOverlaps(
    mine.othersUpcoming,
    mine.teammates.map((u) => u.id),
    p.start,
    p.end,
    zone.value,
    trip.value?.id,
  );
  for (const o of blocked) map.set(o.userId, { status: 'Approved', range: formatPeriod(o.request, zone.value) });
  for (const o of warned) map.set(o.userId, { status: 'Pending', range: formatPeriod(o.request, zone.value) });
  return map;
});

/** Picked colleagues with pending plans then: they can still come, so this is a heads-up, not an error. */
const pendingWarning = computed(() => {
  const p = period.value;
  if (!p || !(colleagueIds.value ?? []).length || errors.value.colleagueIds) return '';
  const { warned } = findColleagueOverlaps(mine.othersUpcoming, colleagueIds.value ?? [], p.start, p.end, zone.value, trip.value?.id);
  return describePendingColleagues(
    warned.map((w) => ({ userId: w.userId, name: w.name, conflict: w.request })),
    zone.value,
  );
});

// ---- Summary (from the same schema, so it only shows for a valid period) ------

const parsed = computed(() => schema.value.safeParse(values));

const summary = computed(() => {
  if (!parsed.value.success) return null;
  const { start: s, end: e } = parsed.value.data;

  const sameDay = s.startOf('day').equals(lastDay(s, e));
  const hours = Math.round(e.diff(s, 'hours').hours * 4) / 4;
  const days = estimateWorkingDays(s, e, auth.workDays);
  // Against the balance of the year the request starts in; other years aren't loaded.
  const balance = mine.balance && mine.balance.year === s.year ? mine.balance : null;
  // When editing, this request's current days are already counted as pending.
  const otherPending = balance ? balance.pendingDays - (editing.value?.days ?? 0) : 0;
  const after = balance ? balance.remainingDays - days : null;
  const afterAllPending = balance && otherPending > 0 ? after! - otherPending : null;
  const going = new Set(parsed.value.data.payload.colleagueIds);
  const mates = [
    ...new Set(
      mine.othersUpcoming
        .filter((r) => {
          // People on this trip are going with you, not "off" on their own.
          if (going.has(r.user.id) || (trip.value && r.group?.id === trip.value.id)) return false;
          const p = zonedPeriod(r, zone.value);
          return periodsOverlap(s, e, p.start, p.end);
        })
        .map((r) => firstName(r.user.name)),
    ),
  ];
  const companions = mine.teammates.filter((u) => going.has(u.id)).map((u) => firstName(u.name));

  return {
    value: sameDay ? formatDays(hours) : formatDays(days),
    unit: sameDay ? (hours === 1 ? 'hour' : 'hours') : days === 1 ? 'working day' : 'working days',
    countsAs: sameDay ? formatDayCount(days) : null,
    period: sameDay
      ? `${formatDay(s)} · ${s.toFormat(TIME_FORMAT)}–${e.toFormat(TIME_FORMAT)}`
      : `${formatDay(s)} ${s.toFormat(TIME_FORMAT)} → ${formatDay(e)} ${e.toFormat(TIME_FORMAT)}`,
    after,
    afterAllPending,
    year: s.year,
    mates: mates.length ? mates.join(', ') : 'Nobody',
    companions: companions.length ? listNames(companions) : null,
  };
});

// ---- Submit -----------------------------------------------------------------

function applyServerError(error: ApiError): void {
  if (error.code === 'OVERLAP') {
    const { conflict, conflicts } = error.details;
    if (conflicts?.length) setErrors({ colleagueIds: describeBlockedColleagues(conflicts, zone.value) });
    else setErrors({ endDate: conflict ? describeConflict(conflict, zone.value) : error.message });
    return;
  }
  if (error.code === 'VALIDATION_ERROR' && Object.keys(error.fieldErrors).length) {
    const fieldErrors: Partial<Record<RequestFormField, string>> = {};
    const other: string[] = [];
    for (const [field, message] of Object.entries(error.fieldErrors)) {
      const key = API_FIELDS[field];
      if (key) fieldErrors[key] = message;
      else other.push(message);
    }
    setErrors(fieldErrors);
    generalError.value = other.length ? other.join(' ') : undefined;
    return;
  }
  generalError.value = error.message;
}

const submit = handleSubmit(
  async () => {
    if (memberView.value) return;
    // The schema's output carries the API payload; recompute it from the validated values.
    if (!parsed.value.success) return;
    const data = parsed.value.data.payload;
    const payload: RequestPayload = { startDate: data.startDate, endDate: data.endDate };
    // Editing always sends the reason so it can be cleared.
    if (data.reason || editing.value) payload.reason = data.reason ?? '';
    // A trip's people are fixed once it exists; only a new request sends them.
    if (!editing.value && data.colleagueIds.length) payload.colleagueIds = data.colleagueIds;

    generalError.value = undefined;
    try {
      await mine.save(payload, editing.value?.id);
      drawer.close();
    } catch (error) {
      // The interceptor already raised a toast; also show it next to the fields.
      applyServerError(toApiError(error));
    }
  },
  // Invalid input never reaches the API: move focus to the first problem instead.
  async ({ errors: invalid }) => {
    await nextTick();
    const field = FIELD_ORDER.find((f) => invalid[f]);
    if (field) inputs[field]?.focus();
    toast.error(editing.value ? "Couldn't save changes" : "Couldn't submit request", 'Check the highlighted fields.');
  },
);

const leaving = ref(false);

async function leaveTrip(): Promise<void> {
  const request = editing.value;
  if (!request) return;
  const organizer = request.group?.organizer?.name ?? 'The organizer';
  const choice = await choose({
    title: 'Leave this trip?',
    body: `${formatPeriod(request, zone.value)} will be removed for you only. ${firstName(organizer)} and the others stay on the trip.`,
    confirmLabel: 'Leave trip',
    tone: 'danger',
  });
  if (choice !== 'confirm') return;
  leaving.value = true;
  try {
    await mine.withdraw(request);
    drawer.close();
  } finally {
    leaving.value = false;
  }
}

function close(): void {
  if (!isSubmitting.value && !leaving.value) drawer.close();
}

const startError = computed(() => errors.value.startDate ?? errors.value.startTime);
const endError = computed(() => errors.value.endDate ?? errors.value.endTime);
const colleagueCount = computed(() => (colleagueIds.value ?? []).length);

const title = computed(() => {
  if (memberView.value) return 'Trip with colleagues';
  if (organizerEdit.value) return 'Edit trip';
  return editing.value ? 'Edit request' : 'New time-off request';
});
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
        <form
          ref="panel"
          class="relative flex h-full w-[460px] max-w-[100vw] flex-col bg-surface shadow-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="request-drawer-title"
          aria-describedby="request-drawer-hint"
          novalidate
          @submit="submit"
        >
          <div class="flex items-start justify-between border-b border-line-divider px-6 py-[22px]">
            <div class="flex flex-col gap-1">
              <h2 id="request-drawer-title" class="text-[20px] font-semibold tracking-[-0.02em]">{{ title }}</h2>
              <p v-if="memberView" id="request-drawer-hint" class="text-[13px] text-ink-3">
                {{ editing?.addedBy ? `${editing.addedBy.name} added you.` : '' }}
                The trip's dates are set by {{ trip?.organizer?.name ?? 'its organizer' }}. Leave the trip to request your own dates.
              </p>
              <p v-else id="request-drawer-hint" class="text-[13px] text-ink-3">
                Validators in {{ auth.me?.office.name }} will review it. Times are in {{ zone }}.
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

          <!-- A colleague's view of someone else's trip: read-only, with "Leave trip". -->
          <div v-if="memberView && editing" class="flex flex-1 flex-col gap-5 overflow-auto p-6">
            <dl class="flex flex-col gap-2.5 rounded-[14px] border border-line px-4 py-3.5 text-[13px]">
              <div class="flex justify-between gap-3">
                <dt class="text-ink-3">Period</dt>
                <dd class="text-right font-medium">{{ formatPeriod(editing, zone) }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-3">Times</dt>
                <dd class="text-right font-mono text-[12px]">{{ formatPeriodTimes(editing, zone) }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-ink-3">Counts as</dt>
                <dd class="font-medium">{{ formatDayCount(editing.days, 'working day') }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="shrink-0 text-ink-3">Reason</dt>
                <dd class="text-right" :class="editing.reason ? 'text-ink' : 'text-faint'">{{ reasonText(editing) }}</dd>
              </div>
              <div class="flex items-center justify-between gap-3">
                <dt class="text-ink-3">Your status</dt>
                <dd><StatusPill :status="editing.status" /></dd>
              </div>
            </dl>
            <section class="flex flex-col gap-2" aria-labelledby="trip-people-title">
              <h3 id="trip-people-title" class="text-[13px] font-medium">Going with</h3>
              <ul class="flex flex-col divide-y divide-line-divider rounded-control border border-line">
                <li v-for="person in tripPeople" :key="person.userId" class="flex items-center gap-2.5 px-3 py-2">
                  <UserAvatar :id="person.userId" :name="person.name" :size="24" />
                  <span class="flex-1 truncate text-[13px]">
                    {{ person.name }}
                    <span v-if="person.userId === trip?.organizer?.id" class="text-muted">· organizer</span>
                  </span>
                  <StatusPill :status="person.status" />
                </li>
              </ul>
            </section>
          </div>

          <div v-else class="flex flex-1 flex-col gap-5 overflow-auto p-6">
            <div class="flex flex-col gap-4">
              <fieldset class="flex flex-col gap-1.5">
                <legend class="mb-1.5 text-[13px] font-medium">Start</legend>
                <div class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2.5">
                  <DatePicker
                    :ref="(el) => (inputs.startDate = el as Focusable | null)"
                    v-model="startDate"
                    v-bind="startDateAttrs"
                    label="Start date"
                    :min="minStart"
                    :work-days="auth.workDays"
                    :zone="zone"
                    :range-start="startDate"
                    :range-end="endDate"
                    :invalid="!!errors.startDate"
                    :aria-describedby="startError ? 'start-error' : undefined"
                  />
                  <TimePicker
                    :ref="(el) => (inputs.startTime = el as Focusable | null)"
                    v-model="startTime"
                    v-bind="startTimeAttrs"
                    label="Start time"
                    :invalid="!!errors.startTime"
                    :aria-describedby="startError ? 'start-error' : undefined"
                  />
                </div>
                <p id="start-error" class="text-[12px] text-danger" aria-live="polite">{{ startError }}</p>
              </fieldset>

              <fieldset class="flex flex-col gap-1.5">
                <legend class="mb-1.5 text-[13px] font-medium">End</legend>
                <div class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2.5">
                  <DatePicker
                    :ref="(el) => (inputs.endDate = el as Focusable | null)"
                    v-model="endDate"
                    v-bind="endDateAttrs"
                    label="End date"
                    :min="startDate || minStart"
                    :work-days="auth.workDays"
                    :zone="zone"
                    :range-start="startDate"
                    :range-end="endDate"
                    :invalid="!!errors.endDate"
                    :aria-describedby="endError ? 'end-error' : undefined"
                  />
                  <TimePicker
                    :ref="(el) => (inputs.endTime = el as Focusable | null)"
                    v-model="endTime"
                    v-bind="endTimeAttrs"
                    label="End time"
                    :min="startDate && startDate === endDate ? startTime : undefined"
                    :invalid="!!errors.endTime"
                    :aria-describedby="endError ? 'end-error' : undefined"
                  />
                </div>
                <p id="end-error" class="text-[12px] text-danger" aria-live="polite">{{ endError }}</p>
              </fieldset>
            </div>

            <!-- Going with: pick colleagues for a new request; a trip's people are fixed once it exists. -->
            <fieldset class="flex flex-col gap-1.5">
              <legend class="mb-1.5 flex w-full justify-between text-[13px] font-medium">
                Going with
                <span v-if="organizerEdit" class="font-normal text-muted">{{ tripPeople.length + 1 }} people</span>
                <span v-else-if="!editing" class="font-mono text-[11px] font-normal text-muted" aria-live="polite">
                  {{ colleagueCount }}/{{ MAX_COLLEAGUES }}
                </span>
                <span v-else class="font-normal text-muted">Just you</span>
              </legend>

              <template v-if="organizerEdit">
                <ul class="flex flex-col divide-y divide-line-divider rounded-control border border-line">
                  <li v-for="person in tripPeople" :key="person.userId" class="flex items-center gap-2.5 px-3 py-2">
                    <UserAvatar :id="person.userId" :name="person.name" :size="24" />
                    <span class="flex-1 truncate text-[13px]">{{ person.name }}</span>
                    <span
                      v-if="hints.get(person.userId)"
                      class="font-mono text-[11px]"
                      :class="hints.get(person.userId)!.status === 'Approved' ? 'text-danger' : 'text-pending-warn'"
                    >
                      {{ hints.get(person.userId)!.status }} {{ hints.get(person.userId)!.range }}
                    </span>
                    <StatusPill :status="person.status" />
                  </li>
                </ul>
                <p class="text-[12px] text-ink-3">New dates apply to everyone. To change who's going, cancel the trip and submit a new one.</p>
              </template>
              <template v-else-if="!editing">
                <ColleaguePicker
                  :ref="(el) => (inputs.colleagueIds = el as Focusable | null)"
                  v-model="colleagueIds"
                  :teammates="mine.teammates"
                  :max="MAX_COLLEAGUES"
                  :hints="hints"
                  :invalid="!!errors.colleagueIds"
                  :describedby="errors.colleagueIds || pendingWarning ? 'colleagues-note' : undefined"
                />
              </template>
              <p v-else class="text-[12px] text-ink-3">Colleagues can only be added when a request is submitted.</p>

              <p id="colleagues-note" aria-live="polite" class="text-[12px] leading-[1.45]">
                <span v-if="errors.colleagueIds" class="text-danger">{{ errors.colleagueIds }}</span>
                <span v-else-if="pendingWarning" class="text-pending-warn">{{ pendingWarning }}</span>
              </p>
            </fieldset>

            <div class="flex flex-col gap-1.5">
              <label for="request-reason" class="flex justify-between text-[13px] font-medium">
                Reason <span class="font-normal text-muted">Optional</span>
              </label>
              <textarea
                id="request-reason"
                :ref="(el) => (inputs.reason = el as Focusable | null)"
                v-model="reason"
                v-bind="reasonAttrs"
                rows="4"
                :maxlength="REASON_MAX"
                placeholder="e.g. Family trip"
                class="field-textarea font-normal"
                :class="{ 'field-input-error': errors.reason }"
                :aria-invalid="!!errors.reason"
                :aria-describedby="errors.reason ? 'reason-count reason-error' : 'reason-count'"
              />
              <span class="flex justify-between gap-3 font-normal">
                <span id="reason-error" class="text-[12px] text-danger" aria-live="polite">{{ errors.reason }}</span>
                <span id="reason-count" class="font-mono text-[11px] text-muted">{{ (reason ?? '').length }}/{{ REASON_MAX }}</span>
              </span>
            </div>

            <div
              v-if="generalError"
              role="alert"
              class="rounded-xl bg-danger-tint px-3.5 py-3 text-[13px] leading-[1.45] text-danger-strong"
            >
              {{ generalError }}
            </div>

            <div v-if="summary" class="overflow-hidden rounded-[14px] border border-line">
              <div class="flex items-baseline justify-between border-b border-line-divider bg-surface-subtle px-4 py-3.5">
                <span class="text-[13px] text-ink-2">Summary</span>
                <span class="text-[22px] font-semibold tracking-[-0.02em]">
                  {{ summary.value }}
                  <span class="text-[13px] font-normal text-ink-3">{{ summary.unit }}</span>
                </span>
              </div>
              <dl class="flex flex-col gap-2.5 px-4 py-3 text-[13px]">
                <div class="flex justify-between gap-3">
                  <dt class="text-ink-3">Period</dt>
                  <dd class="text-right font-medium">{{ summary.period }}</dd>
                </div>
                <div v-if="summary.countsAs" class="flex justify-between gap-3">
                  <dt class="text-ink-3">Counts as</dt>
                  <dd class="font-medium">{{ summary.countsAs }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="text-ink-3">Balance after approval</dt>
                  <dd class="text-right font-medium" :class="summary.after !== null && summary.after < 0 ? 'text-danger' : ''">
                    <template v-if="summary.after === null">Counts toward {{ summary.year }}</template>
                    <template v-else>
                      {{ formatDayCount(summary.after) }} left
                      <span v-if="summary.afterAllPending !== null" class="block text-[12px] font-normal text-ink-3">
                        {{ formatDayCount(summary.afterAllPending) }} if your other pending requests are approved too
                      </span>
                    </template>
                  </dd>
                </div>
                <div v-if="summary.companions" class="flex justify-between gap-3">
                  <dt class="shrink-0 text-ink-3">Going with</dt>
                  <dd class="text-right font-medium">{{ summary.companions }}</dd>
                </div>
                <div class="flex justify-between gap-3">
                  <dt class="shrink-0 text-ink-3">Teammates off</dt>
                  <dd class="text-right font-medium">{{ summary.mates }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div class="flex justify-end gap-2.5 border-t border-line-divider px-6 py-4">
            <template v-if="memberView">
              <AppButton :disabled="leaving" @click="close">Close</AppButton>
              <AppButton
                v-if="editing?.status === 'Pending'"
                variant="danger"
                :loading="leaving"
                @click="leaveTrip"
              >
                Leave trip
              </AppButton>
            </template>
            <template v-else>
              <AppButton :disabled="isSubmitting" @click="close">Cancel</AppButton>
              <AppButton type="submit" variant="primary" :loading="isSubmitting">
                {{ editing ? 'Save changes' : colleagueCount ? `Submit for ${colleagueCount + 1} people` : 'Submit request' }}
              </AppButton>
            </template>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
