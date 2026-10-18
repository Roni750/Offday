<script setup lang="ts">
import { computed } from 'vue';
import { hueFor, initialsOf } from '@/utils/avatar';

const props = withDefaults(
  defineProps<{
    name: string;
    /** User id; picks the hue. */
    id?: number;
    /** Explicit hue, overrides `id`. */
    hue?: number;
    size?: number;
  }>(),
  { id: 1, hue: undefined, size: 32 },
);

const style = computed(() => {
  const h = props.hue ?? hueFor(props.id);
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    fontSize: props.size <= 28 ? '11px' : '12px',
    background: `oklch(0.92 0.045 ${h})`,
    color: `oklch(0.38 0.09 ${h})`,
  };
});
</script>

<template>
  <div
    class="flex shrink-0 select-none items-center justify-center rounded-full font-semibold"
    :style="style"
    aria-hidden="true"
  >
    {{ initialsOf(name) }}
  </div>
</template>
