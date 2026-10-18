import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { Role } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { ADMIN_ROLES, ALL_ROLES, REVIEWER_ROLES, homePathFor } from '@/utils/roles';

declare module 'vue-router' {
  interface RouteMeta {
    /** Reachable without signing in. */
    public?: boolean;
    /** Roles allowed on this route; others are sent to their home page. */
    roles?: readonly Role[];
    /** Page title (also the document title). */
    title?: string;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: 'Sign in' },
  },
  {
    path: '/unavailable',
    name: 'unavailable',
    component: () => import('@/views/UnavailableView.vue'),
    meta: { public: true, title: 'Can’t reach Offday' },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppShell.vue'),
    children: [
      {
        path: 'requests/mine',
        name: 'my-requests',
        component: () => import('@/views/MyRequestsView.vue'),
        meta: { roles: ALL_ROLES, title: 'My requests' },
      },
      {
        path: 'team',
        name: 'team',
        component: () => import('@/views/TeamCalendarView.vue'),
        meta: { roles: ALL_ROLES, title: 'Team calendar' },
      },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/OverviewView.vue'),
        meta: { roles: REVIEWER_ROLES, title: 'Overview' },
      },
      {
        path: 'requests',
        name: 'requests',
        component: () => import('@/views/RequestsView.vue'),
        meta: { roles: REVIEWER_ROLES, title: 'Requests' },
      },
      {
        path: 'admin/users',
        name: 'admin-users',
        component: () => import('@/views/admin/UsersRolesView.vue'),
        meta: { roles: ADMIN_ROLES, title: 'Users & roles' },
      },
      {
        path: 'admin/office',
        name: 'admin-office',
        component: () => import('@/views/admin/OfficeSettingsView.vue'),
        meta: { roles: ADMIN_ROLES, title: 'Office settings' },
      },
    ],
  },
  {
    // The invite token lives only in this page URL; the page sends it to the API in a request body.
    path: '/join/:token',
    name: 'join',
    component: () => import('@/views/JoinView.vue'),
    meta: { public: true, title: 'Join Offday' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (to.meta.public) {
    // A signed-in user has no business on the login page.
    if (to.name === 'login' && (await auth.ensureMe())) return auth.homePath;
    return true;
  }

  let me = await auth.ensureMe();
  if (!me) {
    const query = to.fullPath !== '/' ? { redirect: to.fullPath } : {};
    // Still holding a token means `/me` failed for another reason than a 401 (server down, network):
    // keep the session and offer a retry instead of signing the user out.
    return auth.token ? { name: 'unavailable', query } : { name: 'login', query };
  }

  // Role and office settings can change while signed in; re-check them when the cached copy is old.
  await auth.revalidate();
  me = auth.me ?? me;

  // `/` resolves to the role's home here, once `/me` is known.
  if (to.path === '/') return homePathFor(me.role);

  const allowed = to.meta.roles;
  if (allowed && !allowed.includes(me.role)) return homePathFor(me.role);
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Offday` : 'Offday';
});
