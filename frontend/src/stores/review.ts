import { defineStore } from 'pinia';
import { ref } from 'vue';
import { toApiError } from '@/api/errors';
import * as requestsApi from '@/api/requests';
import type { VacationRequest } from '@/api/types';
import { useToast } from '@/composables/useToast';
import { formatPeriod } from '@/utils/requests';
import { useAuthStore } from './auth';

/**
 * Validator / OfficeAdmin decisions: the pending badge count, approve / reject,
 * and the reject dialog's target (the dialog lives in the app shell).
 */
export const useReviewStore = defineStore('review', () => {
  const auth = useAuthStore();
  const toast = useToast();

  const pendingCount = ref<number | null>(null);
  const rejectTarget = ref<VacationRequest | null>(null);
  /** Request ids with an approve / reject in flight (disables their buttons). */
  const busyIds = ref<Set<number>>(new Set());
  /** Bumped after every decision so open lists reload. */
  const revision = ref(0);

  async function refreshPendingCount(): Promise<void> {
    if (!auth.canReview) return;
    try {
      const page = await requestsApi.listOfficeRequests({ status: 'Pending', page: 1, pageSize: 1 });
      // Only what this reviewer can decide: their own pending requests aren't theirs to review.
      pendingCount.value = page.awaitingMyReview;
    } catch {
      // Toast already shown.
    }
  }

  function setBusy(id: number, busy: boolean): void {
    const next = new Set(busyIds.value);
    if (busy) next.add(id);
    else next.delete(id);
    busyIds.value = next;
  }

  async function decided(): Promise<void> {
    revision.value++;
    await refreshPendingCount();
  }

  async function approve(request: VacationRequest): Promise<boolean> {
    setBusy(request.id, true);
    try {
      await requestsApi.approveRequest(request.id);
    } catch (error) {
      // 409: someone decided it meanwhile (another tab or validator). Reload so the row shows its real status.
      if (toApiError(error).status === 409) await decided();
      return false;
    } finally {
      setBusy(request.id, false);
    }
    toast.live('Request approved', `${request.user.name} · ${formatPeriod(request, auth.timezone)} has been notified.`);
    await decided();
    return true;
  }

  /** Throws {@link ApiError} so the dialog can keep itself open on failure. */
  async function reject(request: VacationRequest, comment: string): Promise<void> {
    setBusy(request.id, true);
    try {
      await requestsApi.rejectRequest(request.id, comment);
    } catch (error) {
      if (toApiError(error).status === 409) await decided();
      throw error;
    } finally {
      setBusy(request.id, false);
    }
    toast.success('Request rejected', `${request.user.name} will see your comment.`);
    await decided();
  }

  function openReject(request: VacationRequest): void {
    rejectTarget.value = request;
  }

  function closeReject(): void {
    rejectTarget.value = null;
  }

  function $reset(): void {
    pendingCount.value = null;
    rejectTarget.value = null;
    busyIds.value = new Set();
  }

  return {
    pendingCount,
    rejectTarget,
    busyIds,
    revision,
    refreshPendingCount,
    approve,
    reject,
    openReject,
    closeReject,
    $reset,
  };
});
