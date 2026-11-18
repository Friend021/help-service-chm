import { parseDeadline, toIsoUtcDeadline } from './deadline';

/**
 * D-2 unit tests for the pure deadline helpers. All expectations are
 * timezone-independent (UTC dates and roundtrips only).
 */
describe('deadline utils', () => {
  describe('toIsoUtcDeadline', () => {
    it('formats a UTC Date with milliseconds and a trailing Z', () => {
      expect(toIsoUtcDeadline(new Date(Date.UTC(2026, 4, 1, 12, 30, 5, 123))))
        .toBe('2026-05-01T12:30:05.123Z');
    });

    it('formats a UTC date-month rollover exactly', () => {
      expect(toIsoUtcDeadline(new Date(Date.UTC(2027, 0, 2, 3, 4, 5, 6))))
        .toBe('2027-01-02T03:04:05.006Z');
    });

    it('treats a date-only string as UTC midnight', () => {
      expect(toIsoUtcDeadline('2026-05-01')).toBe('2026-05-01T00:00:00.000Z');
    });

    it('normalizes a full datetime string to UTC', () => {
      // The trailing Z makes parsing TZ-independent.
      expect(toIsoUtcDeadline('2026-05-01T12:30:00Z')).toBe('2026-05-01T12:30:00.000Z');
      expect(toIsoUtcDeadline('2026-05-01T12:30:00.500Z')).toBe('2026-05-01T12:30:00.500Z');
    });

    it('throws on garbage input', () => {
      expect(() => toIsoUtcDeadline('not-a-date')).toThrow(TypeError);
      expect(() => toIsoUtcDeadline('')).toThrow(TypeError);
    });
  });

  describe('parseDeadline', () => {
    it('roundtrips through toIsoUtcDeadline for Date objects in any timezone', () => {
      const localDates = [
        new Date(Date.UTC(2026, 4, 1, 12, 30, 45, 678)),
        new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999)),
        new Date(2026, 4, 1), // local midnight
      ];
      for (const date of localDates) {
        const roundtripped = parseDeadline(toIsoUtcDeadline(date));
        expect(roundtripped.getTime()).toBe(date.getTime());
      }
    });

    it('roundtrips date-only strings', () => {
      const roundtripped = parseDeadline(toIsoUtcDeadline('2026-05-01'));
      expect(roundtripped.getUTCFullYear()).toBe(2026);
      expect(roundtripped.getUTCMonth()).toBe(4);
      expect(roundtripped.getUTCDate()).toBe(1);
      expect(roundtripped.getUTCHours()).toBe(0);
    });

    it('parses a suggested-format ISO string verbatim', () => {
      expect(parseDeadline('2026-10-16T07:32:12.162Z').getTime())
        .toBe(Date.UTC(2026, 9, 16, 7, 32, 12, 162));
    });

    it('throws on garbage input', () => {
      expect(() => parseDeadline('garbage')).toThrow(TypeError);
      expect(() => parseDeadline('')).toThrow(TypeError);
    });
  });
});
