import { http } from './http';
import type { HolidayCalendarId, HolidaysResponse } from './types';

/** Validator, OfficeAdmin. `from` / `to` are calendar dates (`"2026-10-01"`), both inclusive. */
export async function getHolidays(from: string, to: string, calendars: readonly HolidayCalendarId[]): Promise<HolidaysResponse> {
  const { data } = await http.get<HolidaysResponse>('/holidays', { params: { from, to, calendars: calendars.join(',') } });
  return data;
}
