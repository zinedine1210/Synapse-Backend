/**
 * Property-Based Tests for Top N Expenses Selection
 *
 * Feature: synapse-ux-revamp, Property 7: Top N Expenses Selection
 *
 * Validates: Requirements 8.3
 */
import * as fc from 'fast-check';
import { BriefingService } from './briefing.service';

// ============================================================
// Property 7: Top N Expenses Selection
// Feature: synapse-ux-revamp, Property 7: Top N Expenses Selection
// Validates: Requirements 8.3
// ============================================================

describe('Feature: synapse-ux-revamp, Property 7: Top N Expenses Selection', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any list of transactions within the last 24 hours, the briefing data
   * extractor shall select exactly the top 3 expense transactions by amount
   * (or all if fewer than 3 exist), and every selected transaction shall have
   * an amount ≥ any non-selected expense transaction.
   */

  // Arbitrary for a single transaction
  const transactionArb = fc.record({
    label: fc.string({ minLength: 1, maxLength: 50 }),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true }),
    type: fc.oneof(fc.constant('expense'), fc.constant('income'), fc.constant('transfer')),
  });

  // Arbitrary for a list of transactions
  const transactionListArb = fc.array(transactionArb, { minLength: 0, maxLength: 50 });

  it('should select exactly min(n, expenseCount) transactions', () => {
    fc.assert(
      fc.property(transactionListArb, (transactions) => {
        const result = BriefingService.selectTopExpenses(transactions, 3);
        const expenseCount = transactions.filter((t) => t.type === 'expense').length;
        const expectedCount = Math.min(3, expenseCount);

        expect(result.length).toBe(expectedCount);
      }),
      { numRuns: 100 },
    );
  });

  it('should return results sorted descending by amount', () => {
    fc.assert(
      fc.property(transactionListArb, (transactions) => {
        const result = BriefingService.selectTopExpenses(transactions, 3);

        for (let i = 0; i < result.length - 1; i++) {
          expect(result[i].amount).toBeGreaterThanOrEqual(result[i + 1].amount);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('every selected transaction should have amount >= any non-selected expense', () => {
    fc.assert(
      fc.property(transactionListArb, (transactions) => {
        const result = BriefingService.selectTopExpenses(transactions, 3);
        const allExpenses = transactions.filter((t) => t.type === 'expense');
        const selectedAmounts = new Set(result.map((r) => `${r.label}:${r.amount}`));

        // Non-selected expenses are those not in the result
        const nonSelectedExpenses = allExpenses.filter(
          (e) => !selectedAmounts.has(`${e.label}:${e.amount}`),
        );

        // Every selected amount must be >= every non-selected expense amount
        if (result.length > 0 && nonSelectedExpenses.length > 0) {
          const minSelected = Math.min(...result.map((r) => r.amount));
          const maxNonSelected = Math.max(...nonSelectedExpenses.map((e) => e.amount));
          expect(minSelected).toBeGreaterThanOrEqual(maxNonSelected);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should only include expense type transactions (never income or transfer)', () => {
    fc.assert(
      fc.property(transactionListArb, (transactions) => {
        const result = BriefingService.selectTopExpenses(transactions, 3);

        // All results should come from expenses in the original list
        const expenseLabelsAndAmounts = transactions
          .filter((t) => t.type === 'expense')
          .map((t) => `${t.label}:${t.amount}`);

        for (const r of result) {
          expect(expenseLabelsAndAmounts).toContain(`${r.label}:${r.amount}`);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should return empty array when no expense transactions exist', () => {
    const nonExpenseListArb = fc.array(
      fc.record({
        label: fc.string({ minLength: 1, maxLength: 50 }),
        amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true }),
        type: fc.oneof(fc.constant('income'), fc.constant('transfer')),
      }),
      { minLength: 0, maxLength: 20 },
    );

    fc.assert(
      fc.property(nonExpenseListArb, (transactions) => {
        const result = BriefingService.selectTopExpenses(transactions, 3);
        expect(result.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('should work correctly with custom N value', () => {
    const nArb = fc.integer({ min: 1, max: 10 });

    fc.assert(
      fc.property(transactionListArb, nArb, (transactions, n) => {
        const result = BriefingService.selectTopExpenses(transactions, n);
        const expenseCount = transactions.filter((t) => t.type === 'expense').length;
        const expectedCount = Math.min(n, expenseCount);

        expect(result.length).toBe(expectedCount);

        // Still sorted descending
        for (let i = 0; i < result.length - 1; i++) {
          expect(result[i].amount).toBeGreaterThanOrEqual(result[i + 1].amount);
        }
      }),
      { numRuns: 100 },
    );
  });
});
