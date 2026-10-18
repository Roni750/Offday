<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppButton from '@/components/ui/AppButton.vue';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import { useAuthStore } from '@/stores/auth';
import { endSession } from '@/stores/session';
import { safeRedirect } from '@/utils/redirect';

/** Shown when the session exists but `/me` can't be loaded (server down, network). The token is kept. */
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const retrying = ref(false);

async function retry(): Promise<void> {
  retrying.value = true;
  try {
    if (await auth.ensureMe()) await router.replace(safeRedirect(route.query.redirect, auth.homePath));
  } finally {
    retrying.value = false;
  }
}

function signOut(): void {
  endSession();
  void router.replace({ name: 'login' });
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-canvas p-4">
    <section class="flex w-full max-w-[420px] flex-col gap-4 rounded-[20px] border border-line bg-surface p-8" aria-labelledby="unavailable-title">
      <BrandLogo />
      <h1 id="unavailable-title" class="text-[24px] font-semibold tracking-[-0.03em]">Can’t reach Offday right now</h1>
      <p class="text-[14px] text-ink-3">
        The server didn’t respond. You’re still signed in. Check your connection and try again.
      </p>
      <div class="flex gap-2.5">
        <AppButton variant="primary" :loading="retrying" @click="retry">Try again</AppButton>
        <AppButton @click="signOut">Sign out</AppButton>
      </div>
    </section>
  </main>
</template>
