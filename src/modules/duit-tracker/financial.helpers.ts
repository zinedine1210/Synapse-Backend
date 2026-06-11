/**
 * Pure helper functions for financial logic:
 * - Budget alert threshold checking
 * - Period comparison calculation
 * - Percentage-based bill splitting
 */

export interface BudgetAlertResult {
  shouldAlert: boolean;
  utilization: number; // ratio of spending/budget (e.g., 0.8 = 80%)
}

/**
 * Determines whether a budget alert should be triggered.
 * An alert triggers if and only if total spending >= 80% of the budget.
 *
 * @param budget - The budget amount for a category (must be > 0)
 * @param totalSpending - The total amount spent in that category
 * @returns BudgetAlertResult with shouldAlert and utilization ratio
 */
export function checkBudgetAlertThreshold(
  budget: number,
  totalSpending: number,
): BudgetAlertResult {
  if (budget <= 0) {
    return { shouldAlert: false, utilization: 0 };
  }
  const utilization = totalSpending / budget;
  return {
    shouldAlert: utilization >= 0.8,
    utilization,
  };
}

export interface PeriodData {
  totalExpense: number;
}

export interface PeriodComparisonResult {
  currentTotal: number;
  previousTotal: number;
  difference: number;
  percentageChange: number; // percentage change from previous to current
}

/**
 * Calculates the comparison between two time periods.
 * Computes the difference and percentage change from previous period to current.
 *
 * @param currentPeriodExpenses - Array of expense amounts in the current period
 * @param previousPeriodExpenses - Array of expense amounts in the previous period
 * @returns PeriodComparisonResult with totals, difference, and percentage change
 */
export function calculatePeriodComparison(
  currentPeriodExpenses: number[],
  previousPeriodExpenses: number[],
): PeriodComparisonResult {
  const currentTotal = currentPeriodExpenses.reduce((sum, amount) => sum + amount, 0);
  const previousTotal = previousPeriodExpenses.reduce((sum, amount) => sum + amount, 0);
  const difference = currentTotal - previousTotal;

  let percentageChange: number;
  if (previousTotal === 0) {
    percentageChange = currentTotal > 0 ? 100 : 0;
  } else {
    percentageChange = (difference / previousTotal) * 100;
  }

  return {
    currentTotal,
    previousTotal,
    difference,
    percentageChange,
  };
}

export interface ParticipantShare {
  name: string;
  percentage: number;
  share: number;
}

/**
 * Calculates each participant's share based on percentages.
 * Percentages must sum to 100%. Each share = total * (percentage / 100).
 * Uses banker's rounding to minimize rounding errors; adjusts the last
 * participant to ensure the sum of shares equals the total exactly.
 *
 * @param totalAmount - The total bill amount
 * @param participants - Array of { name, percentage } (percentages must sum to 100)
 * @returns Array of ParticipantShare with calculated share amounts
 */
export function calculatePercentageSplit(
  totalAmount: number,
  participants: { name: string; percentage: number }[],
): ParticipantShare[] {
  if (participants.length === 0) {
    return [];
  }

  const shares: ParticipantShare[] = participants.map((p) => ({
    name: p.name,
    percentage: p.percentage,
    share: Math.round((totalAmount * p.percentage) / 100),
  }));

  // Adjust last participant so total shares sum equals totalAmount exactly
  const sharesSum = shares.reduce((sum, s) => sum + s.share, 0);
  const roundingDiff = totalAmount - sharesSum;
  if (shares.length > 0 && roundingDiff !== 0) {
    shares[shares.length - 1].share += roundingDiff;
  }

  return shares;
}
