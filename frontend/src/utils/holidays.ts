import { HOLIDAY_CALENDAR_IDS, type HolidayCalendarId } from '@/api/types';

/** Full class names (Tailwind only keeps classes it can find in the source). */
export const HOLIDAY_CALENDARS: Record<HolidayCalendarId, { label: string; dot: string; chip: string; column: string }> = {
  jewish: { label: 'Jewish', dot: 'bg-holiday-jewish', chip: 'bg-holiday-jewish-tint text-holiday-jewish-fg', column: 'bg-holiday-jewish-col' },
  christian: { label: 'Christian', dot: 'bg-holiday-christian', chip: 'bg-holiday-christian-tint text-holiday-christian-fg', column: 'bg-holiday-christian-col' },
  muslim: { label: 'Muslim', dot: 'bg-holiday-muslim', chip: 'bg-holiday-muslim-tint text-holiday-muslim-fg', column: 'bg-holiday-muslim-col' },
  hindu: { label: 'Hindu', dot: 'bg-holiday-hindu', chip: 'bg-holiday-hindu-tint text-holiday-hindu-fg', column: 'bg-holiday-hindu-col' },
};

const STORAGE_KEY = 'offday.holidayCalendars';

/** The calendars this viewer chose to show; a per-browser preference. */
export function readHolidayPreference(): HolidayCalendarId[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? HOLIDAY_CALENDAR_IDS.filter((id) => stored.includes(id)) : [];
  } catch {
    return [];
  }
}

export function writeHolidayPreference(ids: readonly HolidayCalendarId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit.
  }
}
