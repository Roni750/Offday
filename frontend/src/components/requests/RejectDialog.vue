<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { toApiError } from '@/api/errors';
import AppButton from '@/components/ui/AppButton.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useDialog } from '@/composables/useDialog';
import { useOfficeTime } from '@/composables/useOfficeTime';
import { useToast } from '@/composables/useToast';
import { useReviewStore } from '@/stores/review';
import { formatDayCount } from '@/utils/dates';
import { COMMENT_MAX, reasonText } from '@/utils/requests';

const review = useReviewStore();
const { rejectTarget: target, rejectScope: scope } = storeToRefs(review);

/** "Reject all": everyone on the trip who is still pending gets the same comment. */
const isGroup = computed(() => scope.value === 'group' && !!target.value?.group);
const pendingPeople = computed(() => target.value?.group?.members.filter((m) => m.status === 'Pending') ?? []);
const organizerName = computed(() => target.value?.group?.organizer?.name ?? 'the organizer');
const time = useOfficeTime();
const toast = useToast();

const comment = ref('');
const showError = ref(false);
const serverError = ref('');
const submitting = ref(false);
const textarea = ref<HTMLTextAreaElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const isOpen = computed(() => target.value !== null);

watch(target, (request) => {
  if (!request) return;
  comment.value = '';
  showError.value = false;
  serverError.value = '';
});

useDialog(isOpen, panel, { onClose: () => close(), initialFocus: () => textarea.value });

watch(comment, () => {
  showError.value = false;
  serverError.value = '';
});

async function confirm(): Promise<void> {
  const request = target.value;
  if (!request) return;
  const text = comment.value.trim();
  if (!text) {
    showError.value = true;
    toast.error('Comment required', isGroup.value ? 'Add a comment before rejecting this trip.' : 'Add a comment before rejecting this request.');
    textarea.value?.focus();
    return;
  }
  submitting.value = true;
  try {
    if (isGroup.value) await review.rejectGroup(request, text);
    else await review.reject(request, text);
    review.closeReject();
  } catch (error) {
    serverError.value = toApiError(error).fieldErrors.comment ?? toApiError(error).message;
  } finally {
    submitting.value = false;
  }
}

function close(): void {
  if (!submitting.value) review.closeReject();
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
      <div v-if="isOpen && target" class="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div class="absolute inset-0 bg-modal-overlay" aria-hidden="true" @click="close" />
        <div
          ref="panel"
          class="relative flex w-[480px] max-w-full flex-col overflow-hidden rounded-modal bg-surface shadow-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
          aria-describedby="reject-hint"
        >
          <div class="flex flex-col gap-1.5 px-6 pt-[22px]">
            <h2 id="reject-title" class="text-[20px] font-semibold tracking-[-0.02em]">
              {{ isGroup ? `Reject trip (${pendingPeople.length} pending)` : 'Reject request' }}
            </h2>
            <p v-if="isGroup" id="reject-hint" class="text-[13px] text-ink-3">
              Everyone still pending on {{ organizerName }}'s trip will see your comment. Decided requests stay as they are.
            </p>
            <p v-else id="reject-hint" class="text-[13px] text-ink-3">{{ target.user.name }} will see your comment.</p>
          </div>

          <div
            v-if="isGroup"
            class="mx-6 mt-[18px] flex flex-col gap-2 rounded-xl border border-line-divider bg-surface-subtle px-3.5 py-3"
          >
            <span class="font-medium">{{ time.range(target) }}</span>
            <ul class="flex flex-wrap gap-1.5" aria-label="People who will be rejected">
              <li
                v-for="person in pendingPeople"
                :key="person.userId"
                class="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-[2px] pl-1 pr-2 text-[12px]"
              >
                <UserAvatar :id="person.userId" :name="person.name" :size="18" />{{ person.name }}
              </li>
            </ul>
          </div>

          <div v-else class="mx-6 mt-[18px] flex items-center gap-3 rounded-xl border border-line-divider bg-surface-subtle px-3.5 py-3">
            <UserAvatar :id="target.user.id" :name="target.user.name" />
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="font-medium">{{ time.range(target) }}</span>
              <span class="truncate text-[12px] text-muted">
                {{ formatDayCount(target.days, 'working day') }} · {{ reasonText(target) }}
              </span>
            </div>
          </div>

          <div class="flex flex-col gap-1.5 px-6 pt-[18px] text-[13px]">
            <label for="reject-comment" class="flex justify-between font-medium">
              Comment <span class="font-normal text-muted" aria-hidden="true">Required</span>
            </label>
            <textarea
              id="reject-comment"
              ref="textarea"
              v-model="comment"
              rows="4"
              required
              :maxlength="COMMENT_MAX"
              placeholder="Explain why, and suggest alternative dates if possible"
              class="field-textarea"
              :class="{ 'field-input-error': showError || serverError }"
              :aria-invalid="showError || !!serverError"
              :aria-describedby="showError || serverError ? 'reject-comment-error' : undefined"
            />
            <p id="reject-comment-error" class="text-[12px] text-danger" aria-live="polite">
              {{ showError ? 'A comment is required to reject a request.' : serverError }}
            </p>
          </div>

          <div class="flex justify-end gap-2.5 px-6 py-5">
            <AppButton :disabled="submitting" @click="close">Cancel</AppButton>
            <AppButton variant="danger" :loading="submitting" @click="confirm">
              {{ isGroup ? `Reject ${pendingPeople.length} requests` : 'Reject request' }}
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
