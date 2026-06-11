/**
 * Property-Based Tests for Financial Logic
 *
 * Feature: synapse-mega-upgrade, Property 13: Budget Alert Threshold
 * Feature: synapse-mega-upgrade, Property 19: Period Comparison Calculation
 * Feature: synapse-mega-upgrade, Property 21: Percentage-Based Bill Splitting
 *
 * Validates: Requirements 12.4, 17.2, 19.2
 */
import * as fc from 'fast-check';
import {
  checkBudgetAlertThreshold,
  calculatePeriodComparison,
  calculatePercentageSplit,
} from './financial.helpers';

// ============================================================
// Property 13: Budget Alert Threshold
// Feature: synapse-mega-upgrade, Property 13: Budget Alert Threshold
// Validates: Requirements 12.4
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 13: Budget Alert Threshold', () => {
  /**
   * **Validates: Requirements 12.4**
   *
   * For any category budget and set of expenses, the system SHALL trigger
   * an alert if and only if total spending >= 80% of the budget.
   */

  // Use integers representing Rupiah amounts (realistic for currency)
  const positiveAmount = fc.integer({ min: 1, max: 10_000_000 });
  const nonNegativeAmount = fc.integer({ min: 0, max: 10_000_000 });

  it('should trigger alert if and only if spending >= 80% of budget', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        nonNegativeAmount,
        (budget, spending) => {
          const result = checkBudgetAlertThreshold(budget, spending);
          const expectedAlert = spending / budget >= 0.8;
          expect(result.shouldAlert).toBe(expectedAlert);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should correctly calculate utilization ratio', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        nonNegativeAmount,
        (budget, spending) => {
          const result = checkBudgetAlertThreshold(budget, spending);
          const expectedUtilization = spending / budget;
          expect(result.utilization).toBeCloseTo(expectedUtilization, 10);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should not trigger alert when spending is exactly below 80%', () => {
    fc.assert(
      fc.property(
        positiveAmount,
        (budget) => {
          // spending at 79% of budget — guaranteed below threshold
          const spending = budget * 0.79;
          const result = checkBudgetAlertThreshold(budget, spending);
          expect(result.shouldAlert).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should trigger alert when spending is at or above 80%', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 80, max: 150 }),
        (budget, percentInt) => {
          // Generate spending as a known percentage of budget (80–150%)
          // Use integer percentage to avoid floating-point precision issues
          const spending = Math.ceil((budget * percentInt) / 100);
          const result = checkBudgetAlertThreshold(budget, spending);
          // spending/budget >= percentInt/100 >= 80/100 = 0.8
          expect(result.shouldAlert).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should not alert when budget is zero or negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 0 }),
        nonNegativeAmount,
        (budget, spending) => {
          const result = checkBudgetAlertThreshold(budget, spending);
          expect(result.shouldAlert).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 19: Period Comparison Calculation
// Feature: synapse-mega-upgrade, Property 19: Period Comparison Calculation
// Validates: Requirements 17.2
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 19: Period Comparison Calculation', () => {
  /**
   * **Validates: Requirements 17.2**
   *
   * For any two time periods with transaction data, the period comparison
   * SHALL correctly calculate the difference and percentage change between them.
   */

  const expenseArray = fc.array(
    fc.integer({ min: 0, max: 1_000_000 }),
    { minLength: 0, maxLength: 50 },
  );

  it('should correctly compute difference as currentTotal - previousTotal', () => {
    fc.assert(
      fc.property(
        expenseArray,
        expenseArray,
        (currentExpenses, previousExpenses) => {
          const result = calculatePeriodComparison(currentExpenses, previousExpenses);
          const expectedCurrent = currentExpenses.reduce((s, a) => s + a, 0);
          const expectedPrevious = previousExpenses.reduce((s, a) => s + a, 0);

          expect(result.currentTotal).toBe(expectedCurrent);
          expect(result.previousTotal).toBe(expectedPrevious);
          expect(result.difference).toBe(expectedCurrent - expectedPrevious);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should correctly calculate percentage change when previous > 0', () => {
    fc.assert(
      fc.property(
        expenseArray,
        fc.array(
          fc.integer({ min: 1, max: 1_000_000 }),
          { minLength: 1, maxLength: 50 },
        ),
        (currentExpenses, previousExpenses) => {
          const result = calculatePeriodComparison(currentExpenses, previousExpenses);
          const previousTotal = previousExpenses.reduce((s, a) => s + a, 0);
          const currentTotal = currentExpenses.reduce((s, a) => s + a, 0);

          // previousTotal guaranteed > 0 since array has at least 1 element > 0
          const expectedChange = ((currentTotal - previousTotal) / previousTotal) * 100;
          expect(result.percentageChange).toBeCloseTo(expectedChange, 5);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should return 0% change when both periods are empty', () => {
    const result = calculatePeriodComparison([], []);
    expect(result.currentTotal).toBe(0);
    expect(result.previousTotal).toBe(0);
    expect(result.difference).toBe(0);
    expect(result.percentageChange).toBe(0);
  });

  it('should return 100% change when previous period is empty but current has data', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.integer({ min: 1, max: 1_000_000 }),
          { minLength: 1, maxLength: 50 },
        ),
        (currentExpenses) => {
          const result = calculatePeriodComparison(currentExpenses, []);
          expect(result.percentageChange).toBe(100);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should have positive difference when current > previous and negative when current < previous', () => {
    fc.assert(
      fc.property(
        expenseArray,
        expenseArray,
        (currentExpenses, previousExpenses) => {
          const result = calculatePeriodComparison(currentExpenses, previousExpenses);
          if (result.currentTotal > result.previousTotal) {
            expect(result.difference).toBeGreaterThan(0);
          } else if (result.currentTotal < result.previousTotal) {
            expect(result.difference).toBeLessThan(0);
          } else {
            expect(result.difference).toBe(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 21: Percentage-Based Bill Splitting
// Feature: synapse-mega-upgrade, Property 21: Percentage-Based Bill Splitting
// Validates: Requirements 19.2
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 21: Percentage-Based Bill Splitting', () => {
  /**
   * **Validates: Requirements 19.2**
   *
   * For any total amount and participant percentages that sum to 100%,
   * each participant's share SHALL equal total * (their percentage / 100),
   * and the sum of all shares SHALL equal the total (within rounding tolerance).
   */

  /**
   * Generator: produce 2–10 participants with percentages that sum exactly to 100.
   * Uses the "stick breaking" approach: generate N-1 random breakpoints on [0,100]
   * and derive integer percentages.
   */
  const participantsArb = fc
    .integer({ min: 2, max: 10 })
    .chain((n) =>
      fc.tuple(
        fc.array(fc.integer({ min: 1, max: 99 }), {
          minLength: n - 1,
          maxLength: n - 1,
        }),
        fc.constant(n),
      ),
    )
    .map(([breakpoints, n]) => {
      // Sort breakpoints and compute differences to get percentages
      const sorted = [0, ...breakpoints.sort((a, b) => a - b), 100];
      const percentages: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        percentages.push(sorted[i] - sorted[i - 1]);
      }
      // Ensure we have exactly n participants; adjust if needed
      // Breakpoints may produce 0% for duplicates; filter and reassign
      const nonZero = percentages.filter((p) => p > 0);
      if (nonZero.length < 2) {
        // Fallback: equal split
        const equal = Math.floor(100 / n);
        const remainder = 100 - equal * n;
        return Array.from({ length: n }, (_, i) => ({
          name: `Participant ${i + 1}`,
          percentage: i === 0 ? equal + remainder : equal,
        }));
      }
      return nonZero.map((p, i) => ({
        name: `Participant ${i + 1}`,
        percentage: p,
      }));
    })
    .filter(
      (participants) =>
        participants.reduce((s, p) => s + p.percentage, 0) === 100 &&
        participants.length >= 2,
    );

  const totalAmountArb = fc.integer({ min: 1000, max: 100_000_000 });

  it('should produce shares that sum to the total amount', () => {
    fc.assert(
      fc.property(totalAmountArb, participantsArb, (totalAmount, participants) => {
        const shares = calculatePercentageSplit(totalAmount, participants);
        const sharesSum = shares.reduce((sum, s) => sum + s.share, 0);
        // Sum of shares must exactly equal the total
        expect(sharesSum).toBe(totalAmount);
      }),
      { numRuns: 200 },
    );
  });

  it('should calculate each share as approximately total * percentage / 100', () => {
    fc.assert(
      fc.property(totalAmountArb, participantsArb, (totalAmount, participants) => {
        const shares = calculatePercentageSplit(totalAmount, participants);

        for (const share of shares) {
          const expectedShare = (totalAmount * share.percentage) / 100;
          // Each share should be within 1 unit of the expected value (rounding tolerance)
          expect(Math.abs(share.share - Math.round(expectedShare))).toBeLessThanOrEqual(
            participants.length, // rounding adjustment can shift by at most 1 per participant
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('should produce same number of shares as participants', () => {
    fc.assert(
      fc.property(totalAmountArb, participantsArb, (totalAmount, participants) => {
        const shares = calculatePercentageSplit(totalAmount, participants);
        expect(shares.length).toBe(participants.length);
      }),
      { numRuns: 100 },
    );
  });

  it('should assign correct percentage to each participant', () => {
    fc.assert(
      fc.property(totalAmountArb, participantsArb, (totalAmount, participants) => {
        const shares = calculatePercentageSplit(totalAmount, participants);
        for (let i = 0; i < participants.length; i++) {
          expect(shares[i].percentage).toBe(participants[i].percentage);
          expect(shares[i].name).toBe(participants[i].name);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should handle equal split (50/50) correctly', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 10_000_000 }),
        (totalAmount) => {
          const participants = [
            { name: 'A', percentage: 50 },
            { name: 'B', percentage: 50 },
          ];
          const shares = calculatePercentageSplit(totalAmount, participants);
          const sum = shares.reduce((s, sh) => s + sh.share, 0);
          expect(sum).toBe(totalAmount);
          // Each should be exactly half (integer amounts, 50% of even is exact)
          for (const share of shares) {
            expect(Math.abs(share.share - Math.round(totalAmount / 2))).toBeLessThanOrEqual(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
