import { describe, expect, it } from 'vitest';
import {
  formatPickerDate,
  matchTimeSlot,
  monthGrid,
  moveFocusDate,
  parseDateValue,
  parseTimeInput,
  placePopover,
  rangePosition,
  timeSlots,
  toDateValue,
  weekStartFor,
  weekdayOrder,
} from './pickers';

const day = (value: string) => parseDateValue(value)!;

describe('date values', () => {
  it('parses and formats yyyy-MM-dd', () => {
    expect(toDateValue(day('2026-11-03'))).toBe('2026-11-03');
    expect(parseDateValue('')).toBeNull();
    expect(parseDateValue('2026-02-30')).toBeNull();
    expect(formatPickerDate('2026-11-03')).toBe('Tue 3 Nov 2026');
    expect(formatPickerDate('')).toBe('');
  });
});

describe('weekStartFor', () => {
  it('starts the week on the first day of the working run', () => {
    expect(weekStartFor([1, 2, 3, 4, 5])).toBe(1);
    expect(weekStartFor([7, 1, 2, 3, 4])).toBe(7);
    expect(weekStartFor([2, 3, 4, 5, 6])).toBe(2);
  });
  it('falls back to Monday for an empty or full week', () => {
    expect(weekStartFor([])).toBe(1);
    expect(weekStartFor([1, 2, 3, 4, 5, 6, 7])).toBe(1);
  });
  it('orders the columns from the start day', () => {
    expect(weekdayOrder(7)).toEqual([7, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('monthGrid', () => {
  it('covers the month in six full weeks starting on the given weekday', () => {
    const grid = monthGrid(day('2026-11-01'), 1);
    expect(grid).toHaveLength(6);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    // 1 Nov 2026 is a Sunday: a Monday-first grid opens on Mon 26 Oct.
    expect(toDateValue(grid[0][0])).toBe('2026-10-26');
    expect(toDateValue(grid[0][6])).toBe('2026-11-01');
    expect(grid.every((w) => w[0].weekday === 1)).toBe(true);
  });
  it('starts on Sunday for a Sun–Thu office', () => {
    const grid = monthGrid(day('2026-11-15'), 7);
    expect(toDateValue(grid[0][0])).toBe('2026-11-01');
    expect(toDateValue(grid[5][6])).toBe('2026-12-12');
  });
});

describe('moveFocusDate', () => {
  const tue = day('2026-11-03');
  const move = (key: string, shift = false, start = 1) => {
    const next = moveFocusDate(tue, key, start, shift);
    return next ? toDateValue(next) : null;
  };
  it('moves by day, week, month and year', () => {
    expect(move('ArrowLeft')).toBe('2026-11-02');
    expect(move('ArrowRight')).toBe('2026-11-04');
    expect(move('ArrowUp')).toBe('2026-10-27');
    expect(move('ArrowDown')).toBe('2026-11-10');
    expect(move('PageUp')).toBe('2026-10-03');
    expect(move('PageDown')).toBe('2026-12-03');
    expect(move('PageDown', true)).toBe('2027-11-03');
  });
  it('jumps to the ends of the displayed week', () => {
    expect(move('Home')).toBe('2026-11-02');
    expect(move('End')).toBe('2026-11-08');
    expect(move('Home', false, 7)).toBe('2026-11-01');
    expect(move('End', false, 7)).toBe('2026-11-07');
  });
  it('clamps month moves to the last day of shorter months', () => {
    expect(toDateValue(moveFocusDate(day('2026-01-31'), 'PageDown', 1)!)).toBe('2026-02-28');
  });
  it('ignores other keys', () => {
    expect(move('a')).toBeNull();
  });
});

describe('rangePosition', () => {
  it('locates a day in a period given in either order', () => {
    expect(rangePosition('2026-11-02', '2026-11-02', '2026-11-05')).toBe('start');
    expect(rangePosition('2026-11-03', '2026-11-05', '2026-11-02')).toBe('inside');
    expect(rangePosition('2026-11-05', '2026-11-02', '2026-11-05')).toBe('end');
    expect(rangePosition('2026-11-06', '2026-11-02', '2026-11-05')).toBeNull();
    expect(rangePosition('2026-11-02', '2026-11-02', '2026-11-02')).toBe('single');
  });
  it('needs both ends', () => {
    expect(rangePosition('2026-11-02', '2026-11-02', '')).toBeNull();
  });
});

describe('timeSlots', () => {
  it('lists every quarter hour of the day', () => {
    const slots = timeSlots();
    expect(slots).toHaveLength(96);
    expect(slots[0]).toBe('00:00');
    expect(slots[1]).toBe('00:15');
    expect(slots.at(-1)).toBe('23:45');
  });
});

describe('parseTimeInput', () => {
  it.each([
    ['13:30', '13:30'],
    ['1330', '13:30'],
    ['930', '09:30'],
    ['9:30', '09:30'],
    ['09:45', '09:45'],
    ['13.15', '13:15'],
    ['13h00', '13:00'],
    ['9', '09:00'],
    ['0', '00:00'],
    [' 18:00 ', '18:00'],
  ])('reads %j as %s', (text, expected) => {
    expect(parseTimeInput(text)).toBe(expected);
  });

  it.each(['', '24:00', '13:37', '1360', '12345', 'noon', '1:3', '13:'])('rejects %j', (text) => {
    expect(parseTimeInput(text)).toBeNull();
  });
});

describe('matchTimeSlot', () => {
  it('matches exact times and the hour typed so far', () => {
    expect(matchTimeSlot('13:30')).toBe('13:30');
    expect(matchTimeSlot('13')).toBe('13:00');
    expect(matchTimeSlot('13:')).toBe('13:00');
    expect(matchTimeSlot('13:3')).toBe('13:00');
    expect(matchTimeSlot('7')).toBe('07:00');
  });
  it('matches nothing for impossible input', () => {
    expect(matchTimeSlot('25')).toBeNull();
    expect(matchTimeSlot('ab')).toBeNull();
  });
});

describe('placePopover', () => {
  const viewport = { width: 1280, height: 800 };
  const trigger = { top: 100, bottom: 142, left: 900, width: 200 };

  it('opens below the trigger, aligned to its left edge', () => {
    expect(placePopover(trigger, { width: 304, height: 340 }, viewport)).toMatchObject({
      top: 148,
      left: 900,
      width: 304,
      side: 'below',
    });
  });

  it('flips above when it only fits there', () => {
    const low = { top: 600, bottom: 642, left: 100, width: 200 };
    const place = placePopover(low, { width: 304, height: 340 }, viewport);
    expect(place.side).toBe('above');
    expect(place.top).toBe(600 - 6 - 340);
  });

  it('stays inside a narrow viewport', () => {
    const phone = { width: 320, height: 640 };
    const place = placePopover({ top: 100, bottom: 142, left: 180, width: 120 }, { width: 304, height: 340 }, phone);
    expect(place.width).toBe(304);
    expect(place.left).toBe(8);
    expect(place.left + place.width).toBeLessThanOrEqual(phone.width - 8);

    const tiny = placePopover({ top: 100, bottom: 142, left: 16, width: 120 }, { width: 304, height: 340 }, { width: 280, height: 640 });
    expect(tiny.width).toBe(264);
    expect(tiny.left).toBe(8);
  });

  it('limits the height to the space on the chosen side', () => {
    const place = placePopover(trigger, { width: 200, height: 2000 }, viewport);
    expect(place.side).toBe('below');
    expect(place.maxHeight).toBe(800 - 142 - 6 - 8);
  });
});
