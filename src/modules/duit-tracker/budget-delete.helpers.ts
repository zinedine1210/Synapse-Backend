/**
 * Pure helper functions for budget deletion ownership validation.
 *
 * Extracts the ownership check logic from DuitTrackerService.deleteBudget
 * into a testable pure function.
 */

export type BudgetDeleteResult =
  | { success: true }
  | { success: false; reason: 'not_found' }
  | { success: false; reason: 'forbidden' };

export interface BudgetRecord {
  id: string;
  userId: string;
}

/**
 * Validates whether a requesting user can delete a given budget.
 *
 * Deletion succeeds if and only if:
 * 1. The budget exists (is not null/undefined)
 * 2. The budget's owning userId matches the requesting user's ID
 *
 * @param budget - The budget record found by ID (or null if not found)
 * @param requestingUserId - The ID of the user attempting the deletion
 * @returns BudgetDeleteResult indicating success or failure reason
 */
export function validateBudgetDeletion(
  budget: BudgetRecord | null,
  requestingUserId: string,
): BudgetDeleteResult {
  if (!budget) {
    return { success: false, reason: 'not_found' };
  }
  if (budget.userId !== requestingUserId) {
    return { success: false, reason: 'forbidden' };
  }
  return { success: true };
}
