<script setup lang="ts">
import { safeRedirect } from '@/utils/redirect';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toApiError } from '@/api/errors';
import type { Role, Status } from '@/api/types';
import AppButton from '@/components/ui/AppButton.vue';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import StatusPill from '@/components/ui/StatusPill.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { homePathFor, roleLabel } from '@/utils/roles';

interface DemoAccount {
  name: string;
  email: string;
  role: Role;
  hue: number;
}

const DEMO_PASSWORD = 'demo1234';

/** Seeded accounts from the API contract, one per role. */
const DEMO_ACCOUNTS: DemoAccount[] = [
  { name: 'Lina Haddad', email: 'lina@acme.io', role: 'Requester', hue: 300 },
  { name: 'Omar Benali', email: 'omar@acme.io', role: 'Validator', hue: 120 },
  { name: 'Noa Levi', email: 'noa@acme.io', role: 'WorkspaceAdmin', hue: 20 },
];

/** Decorative sample rows on the brand panel. */
const PREVIEW_ROWS: { name: string; range: string; status: Status }[] = [
  { name: 'Sara Kim', range: '16–20 Nov · 5d', status: 'Pending' },
  { name: 'Aya Tanaka', range: '14–20 Oct · 5d', status: 'Approved' },
  { name: 'Julia Novak', range: '6–10 Jul · 5d', status: 'Rejected' },
];

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const email = ref('');
const password = ref('');
const error = ref('');
const pending = ref<string | null>(null);

async function signIn(withEmail: string, withPassword: string): Promise<void> {
  if (!withEmail.trim() || !withPassword) {
    error.value = 'Enter your email and password.';
    return;
  }
  error.value = '';
  pending.value = withEmail;
  try {
    const me = await auth.login(withEmail.trim().toLowerCase(), withPassword);
    await router.replace(safeRedirect(route.query.redirect, homePathFor(me.role)));
  } catch (err) {
    const apiError = toApiError(err);
    error.value =
      apiError.status === 401 ? "That email and password don't match an account." : apiError.message;
  } finally {
    pending.value = null;
  }
}

function pickDemo(account: DemoAccount): void {
  email.value = account.email;
  password.value = DEMO_PASSWORD;
  void signIn(account.email, DEMO_PASSWORD);
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center p-8 max-sm:p-4">
    <div
      class="grid w-full max-w-[1040px] grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] overflow-hidden rounded-shell border border-line bg-surface shadow-shell"
    >
      <form class="flex flex-col gap-7 px-12 pb-10 pt-12 max-sm:px-6 max-sm:pt-8" novalidate @submit.prevent="signIn(email, password)">
        <BrandLogo />
        <div class="flex flex-col gap-2">
          <h1 class="text-[30px] font-semibold tracking-[-0.03em]">Sign in</h1>
          <p class="text-ink-3">Use your work account, or pick a demo profile below.</p>
        </div>

        <div class="flex flex-col gap-3.5">
          <label class="flex flex-col gap-1.5 text-[13px] font-medium">
            Email
            <input v-model="email" type="email" autocomplete="username" placeholder="name@acme.io" class="field-input font-normal" />
          </label>
          <label class="flex flex-col gap-1.5 text-[13px] font-medium">
            Password
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              class="field-input font-normal"
            />
          </label>
          <p v-if="error" role="alert" class="text-[13px] text-danger">{{ error }}</p>
          <AppButton type="submit" variant="primary" size="lg" class="mt-1" :loading="pending === email && !!email">
            Sign in
          </AppButton>
        </div>

        <div class="flex flex-col gap-2.5 border-t border-line-divider pt-5">
          <p class="eyebrow">Demo accounts · click to sign in</p>
          <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2.5">
            <button
              v-for="account in DEMO_ACCOUNTS"
              :key="account.email"
              type="button"
              class="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5 text-left transition-colors hover:border-ink disabled:cursor-wait disabled:opacity-60"
              :disabled="pending !== null"
              @click="pickDemo(account)"
            >
              <UserAvatar :name="account.name" :hue="account.hue" />
              <span class="flex min-w-0 flex-col">
                <span class="truncate text-[13px] font-medium text-ink">{{ account.name }}</span>
                <span class="text-[12px] text-muted">
                  {{ pending === account.email ? 'Signing in…' : roleLabel(account.role) }}
                </span>
              </span>
            </button>
          </div>
        </div>
      </form>

      <div class="flex flex-col justify-between gap-10 bg-night p-12 text-white max-sm:p-6">
        <p class="font-mono text-eyebrow uppercase text-night-text">Acme · Tel Aviv</p>
        <div class="flex flex-col gap-3">
          <p class="text-pretty text-[34px] font-semibold leading-[1.1] tracking-[-0.03em]">
            Time off, without the email thread.
          </p>
          <p class="max-w-[340px] leading-normal text-faint">
            Request leave, see who's out, and get a decision — all in one place.
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <div
            v-for="row in PREVIEW_ROWS"
            :key="row.name"
            class="flex items-center justify-between gap-3 rounded-xl border border-night-line bg-night-card px-3.5 py-3"
          >
            <div class="flex flex-col gap-0.5">
              <span class="text-[13px] font-medium">{{ row.name }}</span>
              <span class="font-mono text-[12px] text-night-text">{{ row.range }}</span>
            </div>
            <StatusPill :status="row.status" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
