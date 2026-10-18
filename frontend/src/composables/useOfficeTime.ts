import { computed } from 'vue';
import type { DateTime } from 'luxon';
import { useAuthStore } from '@/stores/auth';
import { formatPeriod, formatPeriodTimes, zonedPeriod } from '@/utils/requests';
import { formatDay, formatLongDate, nowIn, todayIn, toZone } from '@/utils/dates';

interface Period {
  startDate: string;
  endDate: string;
}

/** Date helpers bound to the signed-in user's office time zone. */
export function useOfficeTime() {
  const auth = useAuthStore();
  const zone = computed(() => auth.timezone);

  return {
    zone,
    now: (): DateTime => nowIn(zone.value),
    today: (): DateTime => todayIn(zone.value),
    toLocal: (iso: string): DateTime => toZone(iso, zone.value),
    /** "18 Oct" for an API timestamp. */
    day: (iso: string): string => formatDay(toZone(iso, zone.value)),
    longToday: (): string => formatLongDate(todayIn(zone.value)),
    period: (p: Period) => zonedPeriod(p, zone.value),
    range: (p: Period): string => formatPeriod(p, zone.value),
    times: (p: Period): string => formatPeriodTimes(p, zone.value),
  };
}
