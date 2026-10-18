import { createApp, watch } from 'vue';
import { createPinia } from 'pinia';
import { Settings } from 'luxon';
import App from './App.vue';
import { errorTitle } from './api/errors';
import { installInterceptors } from './api/http';
import { vTooltip } from './directives/tooltip';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { useMyRequestsStore } from './stores/myRequests';
import { useReviewStore } from './stores/review';
import { endSession } from './stores/session';
import { useToastStore } from './stores/toasts';
import { describeConflict } from './utils/requests';
import './style.css';

// Stable English month / weekday names regardless of the browser locale.
Settings.defaultLocale = 'en-US';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.directive('tooltip', vTooltip);

const auth = useAuthStore(pinia);
const toasts = useToastStore(pinia);

installInterceptors({
  getToken: () => auth.token,
  onUnauthorized: () => {
    const wasSignedIn = auth.isAuthenticated;
    endSession();
    if (wasSignedIn) {
      toasts.push({ kind: 'info', title: 'Session expired', body: 'Please sign in again.' });
    }
    // The join page works signed out, and its URL holds an invite token that mustn't travel into `?redirect=`.
    const current = router.currentRoute.value.name;
    if (current !== 'login' && current !== 'join') {
      void router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } });
    }
  },
  onError: (error) => {
    const showToast = () => {
      const conflict = error.details.conflict;
      const body = error.code === 'OVERLAP' && conflict ? describeConflict(conflict, auth.timezone) : error.message;
      toasts.push({ kind: 'error', title: errorTitle(error), body });
    };
    if (error.status !== 403 || !auth.me) return showToast();

    // A 403 often means an admin changed this user's role. Re-check first: if the session changed,
    // the "access updated" message below explains it better than a generic "no access" toast.
    const version = auth.sessionVersion;
    auth.refreshMe().then(
      () => {
        if (auth.sessionVersion === version) showToast();
      },
      showToast,
    );
  },
});

app.use(router);

// The role or office settings changed while signed in: say what changed, drop per-user caches,
// re-run the route guard (the current page may no longer be allowed) and reload the view.
watch(
  () => auth.sessionVersion,
  () => {
    toasts.push({ kind: 'info', title: 'Your access was updated', body: auth.lastChanges.join(' ') });
    useMyRequestsStore().$reset();
    useReviewStore().$reset();
    void useReviewStore().refreshPendingCount();
    const current = router.currentRoute.value;
    if (!current.meta.public) void router.replace({ path: current.path, query: current.query, hash: current.hash, force: true });
  },
);

// Coming back to the tab is a natural moment to pick up changes made elsewhere.
window.addEventListener('focus', () => void auth.revalidate(10_000));

app.mount('#app');
