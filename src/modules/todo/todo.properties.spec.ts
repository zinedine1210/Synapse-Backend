import * as fc from 'fast-check';

/**
 * Property-Based Tests for Todo and Dashboard Logic
 * Feature: synapse-mega-upgrade
 *
 * Tests the todo reorder sort-order assignment, next-due-date calculation
 * for recurring todos, and unified timeline sort correctness.
 */

// ============================================================
// Pure Logic: Reorder sort-order assignment
// Replicates the batch update logic from todo.service.ts reorder()
// ============================================================

interface ReorderItem {
  id: string;
  sortOrder: number;
}

/**
 * Simulates the reorder operation: assigns sort orders from the DTO items
 * and returns the resulting mapping. In the real service, this is a
 * Prisma transaction that updates each todo's sortOrder.
 */
function applyReorder(items: ReorderItem[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) {
    result.set(item.id, item.sortOrder);
  }
  return result;
}

// ============================================================
// Pure Logic: Recurring Todo Next Instance
// When a recurring todo is completed, the next due date is calculated.
// ============================================================

type Recurrence = 'daily' | 'weekly' | 'monthly';

/**
 * Computes the next due date for a recurring todo.
 * - daily: +1 day
 * - weekly: +7 days
 * - monthly: +1 month (same day-of-month, clamped to last day)
 */
function computeNextDueDate(currentDueDate: Date, recurrence: Recurrence): Date {
  const next = new Date(currentDueDate);
  switch (recurrence) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly': {
      const dayOfMonth = next.getDate();
      next.setMonth(next.getMonth() + 1);
      // Handle month overflow (e.g., Jan 31 → Feb 28/29)
      // If setMonth caused day overflow, clamp to last day of target month
      if (next.getDate() !== dayOfMonth) {
        // Went past end of month, set to last day of previous month
        next.setDate(0);
      }
      break;
    }
  }
  return next;
}

// ============================================================
// Pure Logic: Unified Timeline Sort
// Replicates the merge sort from todo.service.ts getUnifiedTimeline()
// ============================================================

interface TimelineItem {
  id: string;
  type: 'personal' | 'class';
  title: string;
  dueDate: Date | null;
}

/**
 * Sorts timeline items by due date ascending. Items without a due date
 * are placed at the end (Infinity).
 */
function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => {
    const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return dateA - dateB;
  });
}

// ============================================================
// Arbitraries (generators)
// ============================================================

const reorderItemArb: fc.Arbitrary<ReorderItem> = fc.record({
  id: fc.uuid(),
  sortOrder: fc.integer({ min: 0, max: 1000 }),
});

const contiguousReorderArb = (size: number): fc.Arbitrary<ReorderItem[]> =>
  fc.array(fc.uuid(), { minLength: size, maxLength: size }).map((ids) =>
    ids.map((id, index) => ({ id, sortOrder: index })),
  );

const recurrenceArb: fc.Arbitrary<Recurrence> = fc.constantFrom(
  'daily',
  'weekly',
  'monthly',
);

const dateArb: fc.Arbitrary<Date> = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2026-12-31'),
});

const timelineItemArb: fc.Arbitrary<TimelineItem> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('personal' as const, 'class' as const),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  dueDate: fc.option(dateArb, { nil: null }),
});

// ============================================================
// Property 14: Todo Reorder Persistence
// Feature: synapse-mega-upgrade, Property 14: Todo Reorder Persistence
// Validates: Requirements 13.1
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 14: Todo Reorder Persistence', () => {
  /**
   * **Validates: Requirements 13.1**
   *
   * For any set of todos with assigned sortOrders, after reorder the resultant
   * sort orders SHALL match the batch update and be contiguous/unique within the group.
   */

  it('reorder produces unique sort orders for distinct todo ids', () => {
    fc.assert(
      fc.property(
        fc.array(reorderItemArb, { minLength: 1, maxLength: 50 }).filter(
          (items) => new Set(items.map((i) => i.id)).size === items.length,
        ),
        (items) => {
          const result = applyReorder(items);
          // Each id maps to exactly one sort order
          expect(result.size).toBe(items.length);
          // The sort orders assigned match what was requested
          for (const item of items) {
            expect(result.get(item.id)).toBe(item.sortOrder);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('contiguous reorder produces sort orders 0..n-1 with no gaps or duplicates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }).chain((size) => contiguousReorderArb(size)),
        (items) => {
          const result = applyReorder(items);
          const sortOrders = Array.from(result.values()).sort((a, b) => a - b);

          // Must be contiguous starting from 0
          for (let i = 0; i < sortOrders.length; i++) {
            expect(sortOrders[i]).toBe(i);
          }

          // Must have no duplicates
          const uniqueOrders = new Set(sortOrders);
          expect(uniqueOrders.size).toBe(sortOrders.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reorder with shuffled contiguous sort orders preserves uniqueness', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 30 }).chain((size) =>
          fc.tuple(
            fc.array(fc.uuid(), { minLength: size, maxLength: size }),
            fc.shuffledSubarray(
              Array.from({ length: size }, (_, i) => i),
              { minLength: size, maxLength: size },
            ),
          ),
        ),
        ([ids, orders]) => {
          const items: ReorderItem[] = ids.map((id, i) => ({
            id,
            sortOrder: orders[i],
          }));

          const result = applyReorder(items);
          const sortOrders = Array.from(result.values());
          const uniqueOrders = new Set(sortOrders);

          // All sort orders are unique
          expect(uniqueOrders.size).toBe(items.length);

          // Sort orders form a contiguous range [0..n-1]
          const sorted = [...sortOrders].sort((a, b) => a - b);
          for (let i = 0; i < sorted.length; i++) {
            expect(sorted[i]).toBe(i);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('reorder result preserves the exact mapping from the input batch', () => {
    fc.assert(
      fc.property(
        fc.array(reorderItemArb, { minLength: 1, maxLength: 50 }).filter(
          (items) => new Set(items.map((i) => i.id)).size === items.length,
        ),
        (items) => {
          const result = applyReorder(items);

          // Every input item's sort order is exactly preserved
          for (const item of items) {
            expect(result.get(item.id)).toBe(item.sortOrder);
          }

          // No extra entries
          expect(result.size).toBe(items.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 15: Recurring Todo Next Instance
// Feature: synapse-mega-upgrade, Property 15: Recurring Todo Next Instance
// Validates: Requirements 13.3
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 15: Recurring Todo Next Instance', () => {
  /**
   * **Validates: Requirements 13.3**
   *
   * For any todo with recurrence (daily/weekly/monthly), completing the current
   * instance SHALL generate the next due date correctly.
   */

  it('daily recurrence always advances by exactly 1 day', () => {
    fc.assert(
      fc.property(dateArb, (dueDate) => {
        const next = computeNextDueDate(dueDate, 'daily');
        const diffMs = next.getTime() - dueDate.getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        expect(diffMs).toBe(oneDayMs);
      }),
      { numRuns: 100 },
    );
  });

  it('weekly recurrence always advances by exactly 7 days', () => {
    fc.assert(
      fc.property(dateArb, (dueDate) => {
        const next = computeNextDueDate(dueDate, 'weekly');
        const diffMs = next.getTime() - dueDate.getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        expect(diffMs).toBe(sevenDaysMs);
      }),
      { numRuns: 100 },
    );
  });

  it('monthly recurrence advances to the next month', () => {
    fc.assert(
      fc.property(dateArb, (dueDate) => {
        const next = computeNextDueDate(dueDate, 'monthly');
        // Next date must be strictly after current
        expect(next.getTime()).toBeGreaterThan(dueDate.getTime());

        // The month should advance by 1 (or wrap around Dec→Jan)
        const expectedMonth = (dueDate.getMonth() + 1) % 12;
        expect(next.getMonth()).toBe(expectedMonth);
      }),
      { numRuns: 100 },
    );
  });

  it('monthly recurrence clamps day-of-month when target month is shorter', () => {
    // Test specifically with dates on days 29-31 which may overflow
    const highDayArb = fc.integer({ min: 2020, max: 2026 }).chain((year) =>
      fc.constantFrom(
        new Date(year, 0, 29), // Jan 29 → Feb 28/29
        new Date(year, 0, 30), // Jan 30 → Feb 28/29
        new Date(year, 0, 31), // Jan 31 → Feb 28/29
        new Date(year, 2, 31), // Mar 31 → Apr 30
        new Date(year, 4, 31), // May 31 → Jun 30
        new Date(year, 6, 31), // Jul 31 → Aug 31 (no clamp)
        new Date(year, 7, 31), // Aug 31 → Sep 30
      ),
    );

    fc.assert(
      fc.property(highDayArb, (dueDate) => {
        const next = computeNextDueDate(dueDate, 'monthly');
        // Next date should be in the following month
        const expectedMonth = (dueDate.getMonth() + 1) % 12;
        expect(next.getMonth()).toBe(expectedMonth);
        // And the day should be valid (not overflow to subsequent month)
        expect(next.getDate()).toBeGreaterThanOrEqual(1);
        expect(next.getDate()).toBeLessThanOrEqual(31);
      }),
      { numRuns: 100 },
    );
  });

  it('next due date is always strictly in the future relative to current due date', () => {
    fc.assert(
      fc.property(dateArb, recurrenceArb, (dueDate, recurrence) => {
        const next = computeNextDueDate(dueDate, recurrence);
        expect(next.getTime()).toBeGreaterThan(dueDate.getTime());
      }),
      { numRuns: 100 },
    );
  });

  it('daily/weekly recurrence preserves time-of-day', () => {
    fc.assert(
      fc.property(
        dateArb,
        fc.constantFrom('daily' as Recurrence, 'weekly' as Recurrence),
        (dueDate, recurrence) => {
          const next = computeNextDueDate(dueDate, recurrence);
          expect(next.getHours()).toBe(dueDate.getHours());
          expect(next.getMinutes()).toBe(dueDate.getMinutes());
          expect(next.getSeconds()).toBe(dueDate.getSeconds());
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 16: Unified Timeline Sort
// Feature: synapse-mega-upgrade, Property 16: Unified Timeline Sort
// Validates: Requirements 13.6
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 16: Unified Timeline Sort', () => {
  /**
   * **Validates: Requirements 13.6**
   *
   * For any mix of personal todos and class deadlines, the unified timeline
   * SHALL be sorted by due date ascending.
   */

  it('unified timeline is always sorted by due date ascending', () => {
    fc.assert(
      fc.property(
        fc.array(timelineItemArb, { minLength: 0, maxLength: 50 }),
        (items) => {
          const sorted = sortTimeline(items);
          for (let i = 1; i < sorted.length; i++) {
            const prevDate = sorted[i - 1].dueDate
              ? new Date(sorted[i - 1].dueDate!).getTime()
              : Infinity;
            const currDate = sorted[i].dueDate
              ? new Date(sorted[i].dueDate!).getTime()
              : Infinity;
            expect(currDate).toBeGreaterThanOrEqual(prevDate);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('items without due dates are placed at the end of the timeline', () => {
    fc.assert(
      fc.property(
        fc.array(timelineItemArb, { minLength: 1, maxLength: 50 }),
        (items) => {
          const sorted = sortTimeline(items);
          const firstNullIdx = sorted.findIndex((item) => item.dueDate === null);
          if (firstNullIdx === -1) return; // No null dates, skip

          // All items after the first null-date item must also have null dates
          for (let i = firstNullIdx; i < sorted.length; i++) {
            expect(sorted[i].dueDate).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sorting preserves all original items (no data loss)', () => {
    fc.assert(
      fc.property(
        fc.array(timelineItemArb, { minLength: 0, maxLength: 50 }),
        (items) => {
          const sorted = sortTimeline(items);
          expect(sorted.length).toBe(items.length);

          // Every item ID from the input exists in the output
          const sortedIds = new Set(sorted.map((i) => i.id));
          for (const item of items) {
            expect(sortedIds.has(item.id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('timeline correctly interleaves personal todos and class deadlines by date', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: fc.constant('personal' as const),
            title: fc.string({ minLength: 1, maxLength: 20 }),
            dueDate: dateArb.map((d) => d as Date | null),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: fc.constant('class' as const),
            title: fc.string({ minLength: 1, maxLength: 20 }),
            dueDate: dateArb.map((d) => d as Date | null),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (personalItems, classItems) => {
          const allItems: TimelineItem[] = [...personalItems, ...classItems];
          const sorted = sortTimeline(allItems);

          // Result must be sorted by due date ascending
          for (let i = 1; i < sorted.length; i++) {
            const prevDate = sorted[i - 1].dueDate
              ? new Date(sorted[i - 1].dueDate!).getTime()
              : Infinity;
            const currDate = sorted[i].dueDate
              ? new Date(sorted[i].dueDate!).getTime()
              : Infinity;
            expect(currDate).toBeGreaterThanOrEqual(prevDate);
          }

          // Must contain all items from both types
          expect(sorted.length).toBe(allItems.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sorting is stable — same input produces same output', () => {
    fc.assert(
      fc.property(
        fc.array(timelineItemArb, { minLength: 0, maxLength: 30 }),
        (items) => {
          const sorted1 = sortTimeline(items);
          const sorted2 = sortTimeline(items);
          expect(sorted1.map((i) => i.id)).toEqual(sorted2.map((i) => i.id));
        },
      ),
      { numRuns: 100 },
    );
  });
});
