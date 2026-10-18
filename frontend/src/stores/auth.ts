import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as authApi from '@/api/auth';
import * as invitationsApi from '@/api/invitations';
import type { AcceptInvitationForm, LoginResponse, Me } from '@/api/types';
import { canReview as roleCanReview, homePathFor, isAdmin as roleIsAdmin, roleLabel } from '@/utils/roles';
import { DEFAULT_WORK_DAYS } from '@/utils/dates';

const TOKEN_KEY = 'offday.token';
/** How long a loaded `/me` is trusted before navigation re-checks it. */
const ME_MAX_AGE_MS = 30_000;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then lasts for this tab only.
  }
}

/** What changed between two `/me` snapshots that affects what the user sees or may do. */
function describeChanges(before: Me, after: Me): string[] {
  const changes: string[] = [];
  if (before.role !== after.role) changes.push(`Your role is now ${roleLabel(after.role)}.`);
  if (before.office.timezone !== after.office.timezone) changes.push(`Times are now shown in ${after.office.timezone}.`);
  if (before.office.workDays.join() !== after.office.workDays.join()) changes.push('Your office changed its work week.');
  return changes;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(readToken());
  const me = ref<Me | null>(null);
  const meLoadedAt = ref(0);
  /**
   * Bumped when the role or office settings change while signed in (changed by an admin elsewhere).
   * The app reacts by re-checking the route and reloading the current view.
   */
  const sessionVersion = ref(0);
  const lastChanges = ref<string[]>([]);
  let mePromise: Promise<Me> | null = null;

  const isAuthenticated = computed(() => !!token.value);
  const role = computed(() => me.value?.role ?? null);
  const canReview = computed(() => roleCanReview(role.value));
  const isAdmin = computed(() => roleIsAdmin(role.value));
  /** The office zone every date is shown and entered in. */
  const timezone = computed(() => me.value?.office.timezone ?? 'UTC');
  /** The office's working days, ISO weekdays (1 = Monday ... 7 = Sunday). */
  const workDays = computed<readonly number[]>(() => me.value?.office.workDays ?? DEFAULT_WORK_DAYS);
  const homePath = computed(() => homePathFor(role.value));

  function setToken(value: string | null): void {
    token.value = value;
    writeToken(value);
  }

  /** `silent`: the user made the change themselves (e.g. an admin saving office settings), so don't announce it. */
  function applyMe(user: Me, silent = false): void {
    const before = me.value;
    me.value = user;
    meLoadedAt.value = Date.now();
    const changes = before && before.id === user.id && !silent ? describeChanges(before, user) : [];
    if (changes.length) {
      lastChanges.value = changes;
      sessionVersion.value++;
    }
  }

  /** Stores a session returned by the API (sign-in or accepting an invite). */
  function startSession(session: LoginResponse): Me {
    setToken(session.token);
    applyMe(session.user);
    return session.user;
  }

  async function login(email: string, password: string): Promise<Me> {
    return startSession(await authApi.login(email, password));
  }

  /** Creates the account through an invite link and signs it in. */
  async function acceptInvitation(inviteToken: string, form: AcceptInvitationForm): Promise<Me> {
    return startSession(await invitationsApi.acceptInvitation(inviteToken, form));
  }

  /**
   * Reloads `/me` (deduplicated). A 401 ends the session through the HTTP interceptor;
   * any other failure rejects but keeps the token, so a network blip never signs the user out.
   */
  function refreshMe(options: { silent?: boolean } = {}): Promise<Me> {
    mePromise ??= authApi
      .getMe()
      .then((user) => {
        applyMe(user, options.silent);
        return user;
      })
      .finally(() => (mePromise = null));
    return mePromise;
  }

  /** The current user, loading it if needed. `null` when signed out or `/me` can't be loaded. */
  async function ensureMe(): Promise<Me | null> {
    if (!token.value) return null;
    if (me.value) return me.value;
    try {
      return await refreshMe();
    } catch {
      return null;
    }
  }

  /** Re-checks `/me` when the cached copy is older than `maxAgeMs`. Failures are ignored; the next check retries. */
  async function revalidate(maxAgeMs = ME_MAX_AGE_MS): Promise<void> {
    if (!token.value || !me.value || Date.now() - meLoadedAt.value < maxAgeMs) return;
    try {
      await refreshMe();
    } catch {
      // Keep the cached user.
    }
  }

  function logout(): void {
    setToken(null);
    me.value = null;
    meLoadedAt.value = 0;
  }

  return {
    token,
    me,
    sessionVersion,
    lastChanges,
    isAuthenticated,
    role,
    canReview,
    isAdmin,
    timezone,
    workDays,
    homePath,
    startSession,
    login,
    acceptInvitation,
    ensureMe,
    refreshMe,
    revalidate,
    logout,
  };
});
