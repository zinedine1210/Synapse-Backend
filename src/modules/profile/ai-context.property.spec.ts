/**
 * Property 3: AI Context Builder Respects Character Limit
 *
 * For any combination of user profile AI context fields (dailyHabits, lifeGoals,
 * studySchedule, personalNotes), the constructed AI context string shall include
 * content from each non-empty field AND the total length shall never exceed 1000 characters.
 *
 * Feature: synapse-ux-revamp, Property 3: AI Context Builder Respects Character Limit
 * Validates: Requirements 5.4, 5.5
 */
import * as fc from 'fast-check';
import {
  buildAIContext,
  AI_CONTEXT_MAX_LENGTH,
  AIContextProfile,
} from './ai-context.service';

describe('Property 3: AI Context Builder Respects Character Limit', () => {
  /**
   * Generator for an optional string field that can be:
   * - undefined, null, empty, whitespace-only (treated as "empty")
   * - a non-empty string of arbitrary length (up to 500 chars for stress testing)
   */
  const optionalField = fc.oneof(
    fc.constant(undefined),
    fc.constant(null),
    fc.constant(''),
    fc.constant('   '), // whitespace-only counts as empty
    fc.string({ minLength: 1, maxLength: 500 }),
  );

  /**
   * Generator for a profile with arbitrary combinations of fields.
   */
  const profileArbitrary: fc.Arbitrary<AIContextProfile> = fc.record({
    dailyHabits: optionalField,
    lifeGoals: optionalField,
    studySchedule: optionalField,
    personalNotes: optionalField,
  });

  /**
   * Generator for a profile where at least one field is non-empty.
   * Uses longer strings to stress the truncation logic.
   */
  const profileWithContentArbitrary: fc.Arbitrary<AIContextProfile> = fc
    .record({
      dailyHabits: fc.oneof(
        fc.constant(undefined),
        fc.string({ minLength: 1, maxLength: 500 }),
      ),
      lifeGoals: fc.oneof(
        fc.constant(undefined),
        fc.string({ minLength: 1, maxLength: 500 }),
      ),
      studySchedule: fc.oneof(
        fc.constant(undefined),
        fc.string({ minLength: 1, maxLength: 500 }),
      ),
      personalNotes: fc.oneof(
        fc.constant(undefined),
        fc.string({ minLength: 1, maxLength: 500 }),
      ),
    })
    .filter((profile) => {
      // Ensure at least one field has non-empty trimmed content
      return [
        profile.dailyHabits,
        profile.lifeGoals,
        profile.studySchedule,
        profile.personalNotes,
      ].some((v) => v != null && v.trim().length > 0);
    });

  /**
   * Validates: Requirements 5.4, 5.5
   *
   * Property: For any combination of AI context fields, the output length
   * shall never exceed 1000 characters.
   */
  it('output length never exceeds 1000 characters for any field combination', () => {
    fc.assert(
      fc.property(profileArbitrary, (profile) => {
        const result = buildAIContext(profile);
        expect(result.length).toBeLessThanOrEqual(AI_CONTEXT_MAX_LENGTH);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   *
   * Property: For any profile with at least one non-empty field, the output
   * includes a label for each non-empty field (field representation is present).
   */
  it('each non-empty field has its label represented in the output', () => {
    const fieldLabels: Record<keyof AIContextProfile, string> = {
      dailyHabits: 'Daily Habits',
      lifeGoals: 'Life Goals',
      studySchedule: 'Study Schedule',
      personalNotes: 'Personal Notes',
    };

    fc.assert(
      fc.property(profileWithContentArbitrary, (profile) => {
        const result = buildAIContext(profile);

        for (const [key, label] of Object.entries(fieldLabels)) {
          const value = profile[key as keyof AIContextProfile];
          if (value != null && value.trim().length > 0) {
            expect(result).toContain(label);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   *
   * Stress test: Even with maximum-length fields (all 4 fields at 500 chars),
   * the output respects the 1000 character limit.
   */
  it('respects limit even with all fields at maximum length', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 200, maxLength: 500 }),
        fc.string({ minLength: 200, maxLength: 500 }),
        fc.string({ minLength: 200, maxLength: 500 }),
        fc.string({ minLength: 200, maxLength: 500 }),
        (dailyHabits, lifeGoals, studySchedule, personalNotes) => {
          const profile: AIContextProfile = {
            dailyHabits,
            lifeGoals,
            studySchedule,
            personalNotes,
          };
          const result = buildAIContext(profile);
          expect(result.length).toBeLessThanOrEqual(AI_CONTEXT_MAX_LENGTH);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 5.4, 5.5
   *
   * Property: When all fields are empty/null/undefined, the output is an empty string.
   */
  it('returns empty string when all fields are empty', () => {
    const emptyField = fc.constantFrom(undefined, null, '', '   ');
    const emptyProfile = fc.record({
      dailyHabits: emptyField,
      lifeGoals: emptyField,
      studySchedule: emptyField,
      personalNotes: emptyField,
    });

    fc.assert(
      fc.property(emptyProfile, (profile) => {
        const result = buildAIContext(profile);
        expect(result).toBe('');
      }),
      { numRuns: 100 },
    );
  });
});
