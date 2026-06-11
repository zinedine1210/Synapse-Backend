/**
 * Feature: synapse-mega-upgrade, Property 4: Quiet Hours Notification Suppression
 *
 * **Validates: Requirements 2.3, 20.5**
 *
 * For any notification timestamp and quiet hours window (start, end),
 * the notification SHALL be suppressed (queued) if and only if the
 * timestamp falls within the quiet hours window.
 */
import * as fc from 'fast-check';
import { NotificationService } from './notification.service';

describe('Feature: synapse-mega-upgrade, Property 4: Quiet Hours Notification Suppression', () => {
  let service: NotificationService;

  beforeEach(() => {
    // Create a minimal instance to test the pure checkQuietHours logic
    service = Object.create(NotificationService.prototype);
  });

  /**
   * Helper: convert hours and minutes to a "HH:mm" string.
   */
  function toTimeStr(hour: number, min: number): string {
    return `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
  }

  /**
   * Helper: convert hours and minutes to total minutes since midnight.
   */
  function toMinutes(hour: number, min: number): number {
    return hour * 60 + min;
  }

  /**
   * Reference implementation: determines if currentMinutes is within the
   * [startMinutes, endMinutes) quiet hours window.
   * Handles same-day and overnight windows.
   */
  function isWithinWindow(
    startHour: number,
    startMin: number,
    endHour: number,
    endMin: number,
    currentHour: number,
    currentMin: number,
  ): boolean {
    const startMinutes = toMinutes(startHour, startMin);
    const endMinutes = toMinutes(endHour, endMin);
    const currentMinutes = toMinutes(currentHour, currentMin);

    if (startMinutes <= endMinutes) {
      // Same-day window (e.g., 08:00–17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight window (e.g., 22:00–07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }

  // Arbitraries for generating valid time components
  const hourArb = fc.integer({ min: 0, max: 23 });
  const minuteArb = fc.integer({ min: 0, max: 59 });

  it('should suppress notification if and only if timestamp is within quiet hours window (all random times)', () => {
    fc.assert(
      fc.property(
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        (startHour, startMin, endHour, endMin, currentHour, currentMin) => {
          const start = toTimeStr(startHour, startMin);
          const end = toTimeStr(endHour, endMin);
          const now = new Date(2024, 0, 15, currentHour, currentMin, 0);

          const actual = service.checkQuietHours(start, end, now);
          const expected = isWithinWindow(
            startHour,
            startMin,
            endHour,
            endMin,
            currentHour,
            currentMin,
          );

          expect(actual).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should suppress notification within same-day quiet hours window', () => {
    fc.assert(
      fc.property(
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        (startHour, startMin, endHour, endMin, currentHour, currentMin) => {
          const startMinutes = toMinutes(startHour, startMin);
          const endMinutes = toMinutes(endHour, endMin);

          // Only test same-day windows (start <= end)
          fc.pre(startMinutes <= endMinutes);

          const start = toTimeStr(startHour, startMin);
          const end = toTimeStr(endHour, endMin);
          const now = new Date(2024, 0, 15, currentHour, currentMin, 0);

          const currentMinutes = toMinutes(currentHour, currentMin);
          const expectedInWindow =
            currentMinutes >= startMinutes && currentMinutes < endMinutes;

          expect(service.checkQuietHours(start, end, now)).toBe(
            expectedInWindow,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should suppress notification within overnight quiet hours window', () => {
    fc.assert(
      fc.property(
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        (startHour, startMin, endHour, endMin, currentHour, currentMin) => {
          const startMinutes = toMinutes(startHour, startMin);
          const endMinutes = toMinutes(endHour, endMin);

          // Only test overnight windows (start > end)
          fc.pre(startMinutes > endMinutes);

          const start = toTimeStr(startHour, startMin);
          const end = toTimeStr(endHour, endMin);
          const now = new Date(2024, 0, 15, currentHour, currentMin, 0);

          const currentMinutes = toMinutes(currentHour, currentMin);
          const expectedInWindow =
            currentMinutes >= startMinutes || currentMinutes < endMinutes;

          expect(service.checkQuietHours(start, end, now)).toBe(
            expectedInWindow,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should never suppress at exact end time (end is exclusive)', () => {
    fc.assert(
      fc.property(
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        (startHour, startMin, endHour, endMin) => {
          // Skip degenerate case where start == end
          const startMinutes = toMinutes(startHour, startMin);
          const endMinutes = toMinutes(endHour, endMin);
          fc.pre(startMinutes !== endMinutes);

          const start = toTimeStr(startHour, startMin);
          const end = toTimeStr(endHour, endMin);
          // Set current time to exactly the end time
          const now = new Date(2024, 0, 15, endHour, endMin, 0);

          expect(service.checkQuietHours(start, end, now)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should always suppress at exact start time', () => {
    fc.assert(
      fc.property(
        hourArb,
        minuteArb,
        hourArb,
        minuteArb,
        (startHour, startMin, endHour, endMin) => {
          // Skip degenerate case where start == end
          const startMinutes = toMinutes(startHour, startMin);
          const endMinutes = toMinutes(endHour, endMin);
          fc.pre(startMinutes !== endMinutes);

          const start = toTimeStr(startHour, startMin);
          const end = toTimeStr(endHour, endMin);
          // Set current time to exactly the start time
          const now = new Date(2024, 0, 15, startHour, startMin, 0);

          expect(service.checkQuietHours(start, end, now)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
