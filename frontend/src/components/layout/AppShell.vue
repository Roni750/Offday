<script setup lang="ts">
import { onMounted } from 'vue';
import RejectDialog from '@/components/requests/RejectDialog.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import RequestFormDrawer from '@/components/requests/RequestFormDrawer.vue';
import { useAuthStore } from '@/stores/auth';
import { useReviewStore } from '@/stores/review';
import SidebarNav from './SidebarNav.vue';

const auth = useAuthStore();
const review = useReviewStore();

onMounted(() => {
  void review.refreshPendingCount();
});
</script>

<template>
  <div class="flex min-h-screen max-md:flex-col">
    <SidebarNav />
    <main class="flex min-w-0 flex-1 flex-col gap-[22px] px-8 pb-12 pt-6 max-md:px-4 max-md:pt-5">
      <!-- Remounts the page when the role or office settings change while signed in. -->
      <RouterView :key="auth.sessionVersion" />
    </main>
  </div>
  <RequestFormDrawer />
  <RejectDialog />
  <ConfirmDialog />
</template>
