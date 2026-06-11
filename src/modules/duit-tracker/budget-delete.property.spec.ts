/**
 * Property-Based Tests for Budget Deletion Ownership Validation
 *
 * Feature: synapse-ux-revamp, Property 9: Budget Deletion Ownership Validation
 *
 * Validates: Requirements 9.4
 */
import * as fc from 'fast-check';
import { validateBudgetDeletion, BudgetRecord } from './budget-delete.helpers';

// ============================================================
// Property 9: Budget Deletion Ownership Validation
// Feature: synapse-ux-revamp, Property 9: Budget Deletion Ownership Validation
// Validates: Requirements 9.4
// ============================================================

describe('Feature: synapse-ux-revamp, Property 9: Budget Deletion Ownership Validation', () => {
  /**
   * **Validates: Requirements 9.4**
   *
   * For any budget ID and requesting user ID, deletion succeeds
   * if and only if budget.userId === requestingUser.id
   */

  // Arbitrary for non-empty user IDs (UUID-like strings)
  const userIdArb = fc.uuid();
  const budgetIdArb = fc.uuid();

  it('should succeed if and only if budget.userId === requestingUserId', () => {
    fc.assert(
      fc.property(
        budgetIdArb,
        userIdArb,
        userIdArb,
        (budgetId, budgetOwnerId, requestingUserId) => {
          const budget: BudgetRecord = { id: budgetId, userId: budgetOwnerId };
          const result = validateBudgetDeletion(budget, requestingUserId);

          if (budgetOwnerId === requestingUserId) {
            expect(result.success).toBe(true);
          } else {
            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.reason).toBe('forbidden');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should always succeed when requesting user is the budget owner', () => {
    fc.assert(
      fc.property(
        budgetIdArb,
        userIdArb,
        (budgetId, userId) => {
          // Same userId for both budget owner and requester
          const budget: BudgetRecord = { id: budgetId, userId };
          const result = validateBudgetDeletion(budget, userId);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should always fail with forbidden when requesting user is NOT the budget owner', () => {
    fc.assert(
      fc.property(
        budgetIdArb,
        userIdArb,
        userIdArb.filter((id) => true), // second user ID
        (budgetId, budgetOwnerId, requestingUserId) => {
          // Only test when IDs are actually different
          fc.pre(budgetOwnerId !== requestingUserId);

          const budget: BudgetRecord = { id: budgetId, userId: budgetOwnerId };
          const result = validateBudgetDeletion(budget, requestingUserId);

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toBe('forbidden');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should fail with not_found when budget does not exist', () => {
    fc.assert(
      fc.property(
        userIdArb,
        (requestingUserId) => {
          const result = validateBudgetDeletion(null, requestingUserId);
          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.reason).toBe('not_found');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should be a biconditional: success ↔ ownership match (exhaustive check)', () => {
    fc.assert(
      fc.property(
        budgetIdArb,
        userIdArb,
        fc.boolean(),
        (budgetId, userId, isSameUser) => {
          // Generate a different user ID if isSameUser is false
          const requestingUserId = isSameUser ? userId : userId + '-other';
          const budget: BudgetRecord = { id: budgetId, userId };
          const result = validateBudgetDeletion(budget, requestingUserId);

          // Biconditional: success ↔ (budget.userId === requestingUserId)
          const ownershipMatch = budget.userId === requestingUserId;
          expect(result.success).toBe(ownershipMatch);
        },
      ),
      { numRuns: 100 },
    );
  });
});
