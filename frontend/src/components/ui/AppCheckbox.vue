<script setup lang="ts">
/**
 * A checkbox styled like the rest of the app. The real `<input type="checkbox">` stays in the page,
 * visually hidden, so keyboard, screen readers and form behavior are the native ones.
 */
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });

const model = defineModel<boolean>({ required: true });
</script>

<template>
  <label
    class="group inline-flex select-none items-center gap-2 text-[13px]"
    :class="disabled ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-ink-2 hover:text-ink'"
  >
    <input v-model="model" type="checkbox" class="peer sr-only" :disabled="disabled" />
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink peer-focus-visible:ring-offset-2"
      :class="model ? 'border-ink bg-ink text-white' : 'border-line-input bg-surface group-hover:border-ink-3'"
      aria-hidden="true"
    >
      <svg v-if="model" class="h-3 w-3" viewBox="0 0 16 16" fill="none">
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <slot />
  </label>
</template>
