import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import type { VacationRequest } from '@/api/types';
import { type RequestFormValues, buildRequestFormSchema, toFieldErrors } from './requestForm';

const ZONE = 'Asia/Jerusalem';
// Sunday 18 Oct 2026 in the office; the earliest valid start is Monday 19 Oct.
const TODAY = DateTime.fromISO('2026-10-18', { zone: ZONE });

const existing = (id: number, start: string, end: string, status: VacationRequest['status'] = 'Approved'): VacationRequest => ({
  id,
  user: { id: 1, name: 'Lina Haddad', email: 'lina@acme.io' },
  startDate: DateTime.fromISO(start, { zone: ZONE }).toUTC().toISO()!,
  endDate: DateTime.fromISO(end, { zone: ZONE }).toUTC().toISO()!,
  reason: null,
  status,
  comments: status === 'Rejected' ? 'No' : null,
  days: 1,
  decidedBy: null,
  decidedAt: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
});

const values = (overrides: Partial<RequestFormValues> = {}): RequestFormValues => ({
  startDate: '2026-11-02',
  startTime: '09:00',
  endDate: '2026-11-06',
  endTime: '18:00',
  reason: '',
  ...overrides,
});

const MON_FRI = [1, 2, 3, 4, 5];
const SUN_THU = [7, 1, 2, 3, 4];

const validate = (form: RequestFormValues, ownRequests: VacationRequest[] = [], editingId?: number, workDays = MON_FRI) => {
  const result = buildRequestFormSchema({ zone: ZONE, workDays, today: TODAY, ownRequests, editingId }).safeParse(form);
  return { result, errors: result.success ? {} : toFieldErrors(result.error) };
};

describe('request form schema', () => {
  it('accepts a valid multi-day request and builds the API payload in office time', () => {
    const { result } = validate(values({ reason: '  Family trip  ' }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.payload).toEqual({
      startDate: '2026-11-02T09:00:00+02:00',
      endDate: '2026-11-06T18:00:00+02:00',
      reason: 'Family trip',
    });
  });

  it('turns an empty reason into null', () => {
    const { result } = validate(values({ reason: '   ' }));
    expect(result.success && result.data.payload.reason).toBeNull();
  });

  it('requires every date and time field', () => {
    const { errors } = validate(values({ startDate: '', startTime: '', endDate: '', endTime: '' }));
    expect(errors).toMatchObject({
      startDate: 'Pick a start date',
      startTime: 'Pick a start time',
      endDate: 'Pick an end date',
      endTime: 'Pick an end time',
    });
  });

  it('rejects impossible dates', () => {
    expect(validate(values({ startDate: '2026-11-31' })).errors.startDate).toBe('Enter a valid start date');
  });

  describe('rule 4: start after today (office time)', () => {
    it('rejects today', () => {
      expect(validate(values({ startDate: '2026-10-18' })).errors.startDate).toMatch(/after today.*19 Oct/);
    });
    it('rejects the past', () => {
      expect(validate(values({ startDate: '2026-10-01' })).errors.startDate).toBeDefined();
    });
    it('accepts tomorrow', () => {
      expect(validate(values({ startDate: '2026-10-19', endDate: '2026-10-19' })).result.success).toBe(true);
    });
    it('shows even when the end is still empty', () => {
      expect(validate(values({ startDate: '2026-10-18', endDate: '' })).errors.startDate).toBeDefined();
    });
  });

  describe('rule 1: end after start', () => {
    it('allows a same-day half day', () => {
      expect(validate(values({ endDate: '2026-11-02', endTime: '13:00' })).result.success).toBe(true);
    });
    it('blames the end time when the same day ends before it starts', () => {
      const { errors } = validate(values({ endDate: '2026-11-02', startTime: '13:00', endTime: '09:00' }));
      expect(errors.endTime).toBe('End time must be after the start time');
    });
    it('rejects an end equal to the start', () => {
      expect(validate(values({ endDate: '2026-11-02', endTime: '09:00' })).errors.endTime).toBeDefined();
    });
    it('blames the end date when it is before the start date', () => {
      expect(validate(values({ endDate: '2026-11-01' })).errors.endDate).toBe('End date must be on or after the start date');
    });
  });

  it('requires quarter-hour times', () => {
    expect(validate(values({ startTime: '09:07' })).errors.startTime).toMatch(/quarter hour/);
    expect(validate(values({ endTime: '17:45' })).result.success).toBe(true);
  });

  describe('at least one working day (office week)', () => {
    it('rejects a weekend-only request in a Mon–Fri office', () => {
      expect(validate(values({ startDate: '2026-11-07', endDate: '2026-11-08' })).errors.endDate).toMatch(/working day/);
    });
    it('follows the office week: Friday is off in a Sun–Thu office, Sunday is on', () => {
      expect(validate(values({ startDate: '2026-11-06', endDate: '2026-11-06' }), [], undefined, SUN_THU).errors.endDate).toMatch(/working day/);
      expect(validate(values({ startDate: '2026-11-08', endDate: '2026-11-08' }), [], undefined, SUN_THU).result.success).toBe(true);
    });
  });

  it('rejects requests longer than a year', () => {
    expect(validate(values({ endDate: '2027-12-01' })).errors.endDate).toMatch(/longer than a year/);
  });

  it('limits the reason to 240 characters', () => {
    expect(validate(values({ reason: 'x'.repeat(241) })).errors.reason).toMatch(/240/);
    expect(validate(values({ reason: 'x'.repeat(240) })).result.success).toBe(true);
  });

  describe('rule 2: no overlap with own Pending/Approved requests', () => {
    const approved = existing(7, '2026-11-04T09:00', '2026-11-05T18:00');

    it('reports an overlap and names the conflicting request', () => {
      expect(validate(values(), [approved]).errors.endDate).toMatch(/overlap your approved request/);
    });
    it('ignores rejected requests', () => {
      expect(validate(values(), [existing(8, '2026-11-04T09:00', '2026-11-05T18:00', 'Rejected')]).result.success).toBe(true);
    });
    it('allows touching periods (13:00 end, 13:00 start)', () => {
      const morning = existing(9, '2026-11-02T09:00', '2026-11-02T13:00');
      expect(validate(values({ startTime: '13:00', endDate: '2026-11-02' }), [morning]).result.success).toBe(true);
    });
    it('ignores the request being edited', () => {
      expect(validate(values(), [approved], 7).result.success).toBe(true);
    });
  });
});
