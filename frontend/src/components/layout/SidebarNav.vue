<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import BrandLogo from '@/components/ui/BrandLogo.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useAuthStore } from '@/stores/auth';
import { useReviewStore } from '@/stores/review';
import { endSession } from '@/stores/session';
import { roleLabel } from '@/utils/roles';

interface NavItem {
  to: string;
  label: string;
  badge?: number | null;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const auth = useAuthStore();
const review = useReviewStore();
const router = useRouter();

const workspaceLabel = computed(() => (auth.me ? `${auth.me.workspace.name} · ${auth.me.office.name}` : ''));

const groups = computed<NavGroup[]>(() => {
  const mine: NavItem[] = [
    { to: '/requests/mine', label: 'My requests' },
    { to: '/team', label: 'Team calendar' },
  ];
  const result: NavGroup[] = [];
  if (auth.canReview) {
    result.push({
      label: workspaceLabel.value,
      items: [
        { to: '/dashboard', label: 'Overview' },
        { to: '/requests', label: 'Requests', badge: review.pendingCount },
        ...mine,
      ],
    });
  } else {
    result.push({ label: workspaceLabel.value, items: mine });
  }
  if (auth.isAdmin) {
    result.push({
      label: 'Administration',
      items: [
        { to: '/admin/users', label: 'Users & roles' },
        { to: '/admin/office', label: 'Office settings' },
      ],
    });
  }
  return result;
});

function signOut(): void {
  endSession();
  void router.push({ name: 'login' });
}
</script>

<template>
  <aside
    class="sticky top-0 flex h-screen w-[236px] shrink-0 flex-col gap-7 border-r border-line px-3.5 py-5 max-md:static max-md:h-auto max-md:w-full max-md:gap-3 max-md:border-b max-md:border-r-0 max-md:px-4 max-md:py-3"
  >
    <div class="flex items-center justify-between px-2 py-1 max-md:px-0">
      <BrandLogo />
      <button
        type="button"
        class="h-8 cursor-pointer rounded-lg border border-line-input px-3 text-[12px] font-medium text-ink-2 hover:bg-surface hover:text-ink md:hidden"
        @click="signOut"
      >
        Sign out
      </button>
    </div>

    <nav class="flex flex-col gap-5 max-md:flex-row max-md:gap-1 max-md:overflow-x-auto" aria-label="Main">
      <div v-for="group in groups" :key="group.label" class="flex flex-col gap-0.5 max-md:flex-row">
        <p class="eyebrow truncate px-2.5 pb-2 max-md:hidden" v-tooltip.truncated="group.label">{{ group.label }}</p>
        <RouterLink
          v-for="item in group.items"
          :key="item.to"
          v-slot="{ href, navigate, isActive }"
          :to="item.to"
          custom
        >
          <a
            :href="href"
            class="flex h-[38px] shrink-0 items-center gap-2.5 whitespace-nowrap rounded-control border px-2.5 text-[14px] font-medium transition-colors"
            :class="isActive ? 'border-line bg-surface text-ink shadow-nav' : 'border-transparent text-ink-2 hover:text-ink'"
            :aria-current="isActive ? 'page' : undefined"
            @click="navigate"
          >
            <span class="h-1.5 w-1.5 rounded-[2px]" :class="isActive ? 'bg-accent-mark' : 'bg-nav-idle'" />
            <span class="flex-1">{{ item.label }}</span>
            <span v-if="item.badge" class="rounded-full bg-ink px-[7px] py-0.5 font-mono text-[11px] text-white">
              {{ item.badge }}
            </span>
          </a>
        </RouterLink>
      </div>
    </nav>

    <div v-if="auth.me" class="mt-auto flex flex-col gap-2.5 max-md:hidden">
      <div class="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5">
        <UserAvatar :id="auth.me.id" :name="auth.me.name" :size="34" />
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="truncate text-[13px] font-medium">{{ auth.me.name }}</span>
          <span class="truncate text-[12px] text-muted" v-tooltip.truncated="auth.me.email">
            {{ roleLabel(auth.me.role) }} · {{ auth.me.email }}
          </span>
        </div>
      </div>
      <button
        type="button"
        class="h-9 cursor-pointer rounded-control border border-line-input text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface hover:text-ink"
        @click="signOut"
      >
        Sign out
      </button>
    </div>
  </aside>
</template>
