import { onBeforeUnmount, ref, type Ref } from 'vue';

/** Reactive `window.matchMedia(query).matches`, for layout changes that CSS alone can't express. */
export function useMediaQuery(query: string): Ref<boolean> {
  const media = window.matchMedia(query);
  const matches = ref(media.matches);
  const update = (event: MediaQueryListEvent) => (matches.value = event.matches);
  media.addEventListener('change', update);
  onBeforeUnmount(() => media.removeEventListener('change', update));
  return matches;
}
