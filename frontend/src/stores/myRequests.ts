import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authApi from '@/api/auth';
import * as officeApi from '@/api/office';
import * as requestsApi from '@/api/requests';
import type {
  Balance,
  Paginated,
  RequestPayload,
  StatusCounts,
  VacationRequest,
} from '@/api/types';
import { useToast } from '@/composables/useToast';
import { todayIn, toUtcIso } from '@/utils/dates';
import { PAGE_SIZE, type StatusTab, formatPeriod, tabToStatus } from '@/utils/requests';
import { useAuthStore } from './auth';

/** How far ahead the office's Pending/Approved requests are loaded (overlap checks, "next time off"). */
const UPCOMING_MONTHS = 12;

/**
 * The signed-in user's own requests: the paginated list, tab counts, leave
 * balance, and the office's upcoming requests used by the request form.
 */
export const useMyRequestsStore = defineStore('myRequests', () => {
  const auth = useAuthStore();
  const toast = useToast();

  const tab = ref<StatusTab>('All');
  const page = ref(1);
  const list = ref<Paginated<VacationRequest> | null>(null);
  const counts = ref<StatusCounts | null>(null);
  const balance = ref<Balance | null>(null);
  /** Office-wide Pending + Approved requests from today on. */
  const upcoming = ref<VacationRequest[]>([]);
  const upcomingLoaded = ref(false);
  const listLoading = ref(false);
  /** Bumped after every change so other views (calendar, overview) can reload. */
  const revision = ref(0);
  let listSeq = 0;

  const myUpcoming = computed(() => upcoming.value.filter((r) => r.user.id === auth.me?.id));
  const othersUpcoming = computed(() => upcoming.value.filter((r) => r.user.id !== auth.me?.id));

  async function loadList(): Promise<void> {
    const seq = ++listSeq;
    listLoading.value = true;
    try {
      const result = await requestsApi.listMyRequests({
        status: tabToStatus(tab.value),
        page: page.value,
        pageSize: PAGE_SIZE,
      });
      if (seq !== listSeq) return;
      list.value = result;
      counts.value = result.counts;
    } catch {
      // The HTTP interceptor already raised a toast.
    } finally {
      if (seq === listSeq) listLoading.value = false;
    }
  }

  async function loadBalance(): Promise<void> {
    try {
      balance.value = await authApi.getBalance(todayIn(auth.timezone).year);
    } catch {
      // Toast already shown.
    }
  }

  async function loadUpcoming(): Promise<void> {
    const from = todayIn(auth.timezone);
    try {
      // Background context for the form and KPIs: if it fails, the page and form still work
      // (the API re-checks overlaps on submit), so don't show an error the user can't act on.
      const result = await officeApi.getTeamCalendar(toUtcIso(from), toUtcIso(from.plus({ months: UPCOMING_MONTHS })), { quiet: true });
      upcoming.value = result.requests;
      upcomingLoaded.value = true;
    } catch (error) {
      console.warn('Upcoming requests unavailable; live overlap preview disabled', error);
    }
  }

  /** Data the request form needs (balance, overlaps, teammates off). */
  async function ensureFormContext(): Promise<void> {
    await Promise.all([balance.value ? null : loadBalance(), upcomingLoaded.value ? null : loadUpcoming()]);
  }

  async function refresh(): Promise<void> {
    await Promise.all([loadList(), loadBalance(), loadUpcoming()]);
  }

  function setTab(value: StatusTab): void {
    tab.value = value;
    page.value = 1;
    void loadList();
  }

  function setPage(value: number): void {
    page.value = value;
    void loadList();
  }

  /** Creates, or edits when `editingId` is set. Throws {@link ApiError} for the form to map. */
  async function save(payload: RequestPayload, editingId?: number): Promise<VacationRequest> {
    const saved = editingId
      ? await requestsApi.updateRequest(editingId, payload)
      : await requestsApi.createRequest(payload);
    revision.value++;
    if (editingId) {
      toast.success('Request updated', `${formatPeriod(saved, auth.timezone)} · still pending review.`);
    } else {
      tab.value = 'All';
      page.value = 1;
      toast.live('Request submitted', `${formatPeriod(saved, auth.timezone)} · validators in ${auth.me?.office.name ?? 'your office'} have been notified.`);
    }
    await refresh();
    return saved;
  }

  async function withdraw(request: VacationRequest): Promise<void> {
    try {
      await requestsApi.withdrawRequest(request.id);
    } catch {
      return;
    }
    revision.value++;
    toast.info('Request withdrawn', `${formatPeriod(request, auth.timezone)} is no longer pending.`);
    if (list.value && list.value.items.length === 1 && page.value > 1) page.value--;
    await refresh();
  }

  function $reset(): void {
    tab.value = 'All';
    page.value = 1;
    list.value = null;
    counts.value = null;
    balance.value = null;
    upcoming.value = [];
    upcomingLoaded.value = false;
  }

  return {
    tab,
    page,
    list,
    counts,
    balance,
    upcoming,
    myUpcoming,
    othersUpcoming,
    listLoading,
    revision,
    loadList,
    loadBalance,
    loadUpcoming,
    ensureFormContext,
    refresh,
    setTab,
    setPage,
    save,
    withdraw,
    $reset,
  };
});
