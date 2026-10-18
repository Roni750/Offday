<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useForm } from 'vee-validate';
import { type ApiError, toApiError } from '@/api/errors';
import type { RequestPayload } from '@/api/types';
import AppButton from '@/components/ui/AppButton.vue';
import { useDialog } from '@/composables/useDialog';
import { useToast } from '@/composables/useToast';
import { useAuthStore } from '@/stores/auth';
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
  periodsOverlap,
  todayIn,
} from '@/utils/dates';
import { REASON_MAX, describeConflict, firstName, zonedPeriod } from '@/utils/requests';
import { type RequestFormField, type RequestFormValues, buildRequestFormSchema } from '@/validation/requestForm';
import { toTypedSchema } from '@/validation/zodTypedSchema';

const DEFAULT_START_TIME = '09:00';
const DEFAULT_END_TIME = '18:00';
/** Order used to move focus to the first invalid input on submit. */
const FIELD_ORDER: RequestFormField[] = ['startDate', 'startTime', 'endDate', 'endTime', 'reason'];
/** API field → form field, for `details.fields` on a 400. */
const API_FIELDS: Record<string, RequestFormField> = { startDate: 'startDate', endDate: 'endDate', reason: 'reason' };

const auth = useAuthStore();
const mine = useMyRequestsStore();
const drawer = useRequestDrawerStore();
const toast = useToast();
const { isOpen, editing } = storeToRefs(drawer);

const zone = computed(() => auth.timezone);
const today = computed(() => todayIn(zone.value));
const earliestStart = computed(() => today.value.plus({ days: 1 }));

// ---- Form (VeeValidate + the Zod schema that mirrors the API rules) ------------

const schema = computed(() =>
  buildRequestFormSchema({
    zone: zone.value,
    workDays: auth.workDays,
    today: today.value,
    ownRequests: mine.myUpcoming,
    editingId: editing.value?.id,
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

/** Errors that the API returned and that don't belong to a field. */
const generalError = ref<string>();
const inputs: Partial<Record<RequestFormField, HTMLElement | null>> = {};

// Rule 1 and the overlap check compare start and end, so a changed start re-checks a touched end.
watch([startDate, startTime], () => {
  if (isFieldTouched('endDate')) void validateField('endDate');
  if (isFieldTouched('endTime')) void validateField('endTime');
});

// ---- Opening ----------------------------------------------------------------

function initialValues(): RequestFormValues {
  const request = editing.value;
  if (!request) {
    return { startDate: '', startTime: DEFAULT_START_TIME, endDate: '', endTime: DEFAULT_END_TIME, reason: drawer.prefillReason };
  }
  const period = zonedPeriod(request, zone.value);
  return {
    startDate: period.start.toFormat(DATE_FORMAT),
    startTime: period.start.toFormat(TIME_FORMAT),
    endDate: period.end.toFormat(DATE_FORMAT),
    endTime: period.end.toFormat(TIME_FORMAT),
    reason: drawer.prefillReason,
  };
}

watch(isOpen, (open) => {
  if (!open) return;
  resetForm({ values: initialValues() });
  generalError.value = undefined;
  void mine.ensureFormContext();
});

const panel = ref<HTMLElement | null>(null);
useDialog(isOpen, panel, { onClose: () => close(), initialFocus: () => inputs.startDate });

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
  const mates = [
    ...new Set(
      mine.othersUpcoming
        .filter((r) => {
          const p = zonedPeriod(r, zone.value);
          return periodsOverlap(s, e, p.start, p.end);
        })
        .map((r) => firstName(r.user.name)),
    ),
  ];

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
  };
});

// ---- Submit -----------------------------------------------------------------

function applyServerError(error: ApiError): void {
  if (error.code === 'OVERLAP') {
    const conflict = error.details.conflict;
    setErrors({ endDate: conflict ? describeConflict(conflict, zone.value) : error.message });
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
    // The schema's output carries the API payload; recompute it from the validated values.
    if (!parsed.value.success) return;
    const data = parsed.value.data.payload;
    const payload: RequestPayload = { startDate: data.startDate, endDate: data.endDate };
    // Editing always sends the reason so it can be cleared.
    if (data.reason || editing.value) payload.reason = data.reason ?? '';

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

function close(): void {
  if (!isSubmitting.value) drawer.close();
}

const startError = computed(() => errors.value.startDate ?? errors.value.startTime);
const endError = computed(() => errors.value.endDate ?? errors.value.endTime);
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
              <h2 id="request-drawer-title" class="text-[20px] font-semibold tracking-[-0.02em]">
                {{ editing ? 'Edit request' : 'New time-off request' }}
              </h2>
              <p id="request-drawer-hint" class="text-[13px] text-ink-3">
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

          <div class="flex flex-1 flex-col gap-5 overflow-auto p-6">
            <div class="flex flex-col gap-4">
              <fieldset class="flex flex-col gap-1.5">
                <legend class="mb-1.5 text-[13px] font-medium">Start</legend>
                <div class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2.5">
                  <input
                    :ref="(el) => (inputs.startDate = el as HTMLElement | null)"
                    v-model="startDate"
                    v-bind="startDateAttrs"
                    type="date"
                    aria-label="Start date"
                    required
                    :min="earliestStart.toFormat(DATE_FORMAT)"
                    class="field-input"
                    :class="{ 'field-input-error': errors.startDate }"
                    :aria-invalid="!!errors.startDate"
                    :aria-describedby="startError ? 'start-error' : undefined"
                  />
                  <input
                    :ref="(el) => (inputs.startTime = el as HTMLElement | null)"
                    v-model="startTime"
                    v-bind="startTimeAttrs"
                    type="time"
                    step="900"
                    aria-label="Start time"
                    required
                    class="field-input font-mono"
                    :class="{ 'field-input-error': errors.startTime }"
                    :aria-invalid="!!errors.startTime"
                    :aria-describedby="startError ? 'start-error' : undefined"
                  />
                </div>
                <p id="start-error" class="text-[12px] text-danger" aria-live="polite">{{ startError }}</p>
              </fieldset>

              <fieldset class="flex flex-col gap-1.5">
                <legend class="mb-1.5 text-[13px] font-medium">End</legend>
                <div class="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2.5">
                  <input
                    :ref="(el) => (inputs.endDate = el as HTMLElement | null)"
                    v-model="endDate"
                    v-bind="endDateAttrs"
                    type="date"
                    aria-label="End date"
                    required
                    :min="startDate || earliestStart.toFormat(DATE_FORMAT)"
                    class="field-input"
                    :class="{ 'field-input-error': errors.endDate }"
                    :aria-invalid="!!errors.endDate"
                    :aria-describedby="endError ? 'end-error' : undefined"
                  />
                  <input
                    :ref="(el) => (inputs.endTime = el as HTMLElement | null)"
                    v-model="endTime"
                    v-bind="endTimeAttrs"
                    type="time"
                    step="900"
                    aria-label="End time"
                    required
                    class="field-input font-mono"
                    :class="{ 'field-input-error': errors.endTime }"
                    :aria-invalid="!!errors.endTime"
                    :aria-describedby="endError ? 'end-error' : undefined"
                  />
                </div>
                <p id="end-error" class="text-[12px] text-danger" aria-live="polite">{{ endError }}</p>
              </fieldset>
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="request-reason" class="flex justify-between text-[13px] font-medium">
                Reason <span class="font-normal text-muted">Optional</span>
              </label>
              <textarea
                id="request-reason"
                :ref="(el) => (inputs.reason = el as HTMLElement | null)"
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
                <div class="flex justify-between gap-3">
                  <dt class="shrink-0 text-ink-3">Teammates off</dt>
                  <dd class="text-right font-medium">{{ summary.mates }}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div class="flex justify-end gap-2.5 border-t border-line-divider px-6 py-4">
            <AppButton :disabled="isSubmitting" @click="close">Cancel</AppButton>
            <AppButton type="submit" variant="primary" :loading="isSubmitting">
              {{ editing ? 'Save changes' : 'Submit request' }}
            </AppButton>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
