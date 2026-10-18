<script setup lang="ts">
import { computed } from 'vue';
import type { VacationRequest } from '@/api/types';
import AppButton from '@/components/ui/AppButton.vue';
import { useAuthStore } from '@/stores/auth';
import { useReviewStore } from '@/stores/review';

/** Reject / Approve for a Pending request; hidden on the reviewer's own requests (rule 6). */
const props = defineProps<{ request: VacationRequest }>();

const auth = useAuthStore();
const review = useReviewStore();

const isOwn = computed(() => props.request.user.id === auth.me?.id);
const busy = computed(() => review.busyIds.has(props.request.id));
</script>

<template>
  <span v-if="isOwn" class="text-[12px] text-muted" title="You can't decide on your own requests">Your request</span>
  <div v-else class="flex justify-end gap-2">
    <AppButton size="sm" variant="reject" :disabled="busy" @click="review.openReject(request)">Reject</AppButton>
    <AppButton size="sm" variant="primary" :loading="busy" @click="review.approve(request)">Approve</AppButton>
  </div>
</template>
