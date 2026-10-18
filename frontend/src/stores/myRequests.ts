import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authApi from '@/api/auth';
import * as officeApi from '@/api/office';
import * as requestsApi from '@/api/requests';
import type {
  Balance,
  Paginated,
  RequestPayload,
  SavedRequest,
  StatusCounts,
  UserSummary,
  VacationRequest,
  WithdrawScope,
} from '@/api/types';
import { useToast } from '@/composables/useToast';
import { todayIn, toUtcIso } from '@/utils/dates';
import {
  PAGE_SIZE,
  type StatusTab,
  describePendingColleagues,
  formatPeriod,
  isTripMember,
  tabToStatus,
  tripMates,
  withText,
} from '@/utils/requests';
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
  /** The office's people except me, by name: who the request form can add to a trip. */
  const teammates = ref<UserSummary[]>([]);
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
      teammates.value = result.users.filter((u) => u.id !== auth.me?.id);
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
  async function save(payload: RequestPayload, editingId?: number): Promise<SavedRequest> {
    const saved = editingId
      ? await requestsApi.updateRequest(editingId, payload)
      : await requestsApi.createRequest(payload);
    revision.value++;
    const period = formatPeriod(saved, auth.timezone);
    const mates = tripMates(saved, auth.me?.id);
    const company = mates.length ? ` · ${withText(mates, 3).replace(/^With/, 'with')}` : '';
    if (editingId) {
      toast.success(saved.group ? 'Trip updated' : 'Request updated', `${period}${company} · still pending review.`);
    } else {
      tab.value = 'All';
      page.value = 1;
      toast.live(
        saved.group ? 'Trip submitted' : 'Request submitted',
        `${period}${company} · validators in ${auth.me?.office.name ?? 'your office'} have been notified.`,
      );
    }
    // Colleagues with pending plans then are on the trip anyway; one heads-up per submit names all of them.
    if (saved.warnings?.length) {
      toast.info(
        saved.warnings.length === 1 ? `${saved.warnings[0]?.name} might already have plans` : 'Some colleagues might already have plans',
        describePendingColleagues(saved.warnings, auth.timezone),
      );
    }
    await refresh();
    return saved;
  }

  /** `group`: the organizer cancels the trip for everyone still pending. For a trip member, `self` leaves the trip. */
  async function withdraw(request: VacationRequest, scope: WithdrawScope = 'self'): Promise<void> {
    try {
      await requestsApi.withdrawRequest(request.id, scope);
    } catch {
      return;
    }
    revision.value++;
    const period = formatPeriod(request, auth.timezone);
    if (scope === 'group') {
      toast.info('Trip cancelled', `${period} is no longer pending for anyone on the trip.`);
    } else if (isTripMember(request, auth.me?.id)) {
      toast.info('You left the trip', `${period} · the rest of the trip goes on without you.`);
    } else {
      toast.info('Request withdrawn', `${period} is no longer pending.`);
    }
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
    teammates.value = [];
    upcomingLoaded.value = false;
  }

  return {
    tab,
    page,
    list,
    counts,
    balance,
    upcoming,
    teammates,
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
