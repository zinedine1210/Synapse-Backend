import * as fc from 'fast-check';

/**
 * Property-Based Tests for Q&A Backend Logic
 * Feature: synapse-mega-upgrade
 *
 * Tests the answer sorting algorithm and related questions constraint
 * from the QnA service.
 */

// ============================================================
// Replicated sorting logic from qna.service.ts
// Prisma orderBy: [{ isApprovedByAsker: 'desc' }, { upvotes: 'desc' }, { createdAt: 'asc' }]
// ============================================================

interface Answer {
  id: string;
  isApprovedByAsker: boolean;
  upvotes: number;
  createdAt: Date;
}

function sortAnswers(answers: Answer[]): Answer[] {
  return [...answers].sort((a, b) => {
    // isApprovedByAsker desc (true before false)
    if (a.isApprovedByAsker !== b.isApprovedByAsker) {
      return a.isApprovedByAsker ? -1 : 1;
    }
    // upvotes desc
    if (a.upvotes !== b.upvotes) {
      return b.upvotes - a.upvotes;
    }
    // createdAt asc
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// ============================================================
// Replicated related questions logic from qna.service.ts
// ============================================================

interface Question {
  id: string;
  category: string[];
  tags: string[];
  isPublic: boolean;
  createdAt: Date;
}

function getRelatedQuestions(
  sourceQuestion: Question,
  allQuestions: Question[],
): Question[] {
  if (
    sourceQuestion.category.length === 0 &&
    sourceQuestion.tags.length === 0
  ) {
    return [];
  }

  const related = allQuestions.filter((q) => {
    // Exclude the source question itself
    if (q.id === sourceQuestion.id) return false;
    // Must be public
    if (!q.isPublic) return false;
    // Must share at least one category or tag
    const sharesCategory = q.category.some((cat) =>
      sourceQuestion.category.includes(cat),
    );
    const sharesTag = q.tags.some((tag) => sourceQuestion.tags.includes(tag));
    return sharesCategory || sharesTag;
  });

  // Sort by createdAt desc and take max 5
  related.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return related.slice(0, 5);
}

// ============================================================
// Arbitraries (generators)
// ============================================================

const answerArb: fc.Arbitrary<Answer> = fc.record({
  id: fc.uuid(),
  isApprovedByAsker: fc.boolean(),
  upvotes: fc.integer({ min: 0, max: 1000 }),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
});

const answersArrayArb: fc.Arbitrary<Answer[]> = fc.array(answerArb, {
  minLength: 0,
  maxLength: 50,
});

const categoryArb = fc.stringOf(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), {
  minLength: 1,
  maxLength: 3,
});
const categoriesArb = fc.array(categoryArb, { minLength: 0, maxLength: 4 });
const tagArb = fc.stringOf(fc.constantFrom('x', 'y', 'z', 'w', 'v'), {
  minLength: 1,
  maxLength: 3,
});
const tagsArb = fc.array(tagArb, { minLength: 0, maxLength: 5 });

const questionArb: fc.Arbitrary<Question> = fc.record({
  id: fc.uuid(),
  category: categoriesArb,
  tags: tagsArb,
  isPublic: fc.boolean(),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
});

// ============================================================
// Property 2: Answer Sort Order Invariant
// Feature: synapse-mega-upgrade, Property 2: Answer Sort Order Invariant
// Validates: Requirements 1.5
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 2: Answer Sort Order Invariant', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * For any array of answers with varying isApprovedByAsker, upvotes, and createdAt values,
   * sorting SHALL always produce an ordering where:
   * 1. All approved answers precede non-approved
   * 2. Within each group, answers are ordered by upvotes descending
   * 3. Ties in upvotes are broken by createdAt ascending
   */

  it('all approved answers precede non-approved answers', () => {
    fc.assert(
      fc.property(answersArrayArb, (answers) => {
        const sorted = sortAnswers(answers);
        const firstNonApprovedIdx = sorted.findIndex((a) => !a.isApprovedByAsker);
        if (firstNonApprovedIdx === -1) {
          // All are approved — valid
          return true;
        }
        // Every item after the first non-approved must also be non-approved
        for (let i = firstNonApprovedIdx; i < sorted.length; i++) {
          if (sorted[i].isApprovedByAsker) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('within approved group, answers are ordered by upvotes descending', () => {
    fc.assert(
      fc.property(answersArrayArb, (answers) => {
        const sorted = sortAnswers(answers);
        const approved = sorted.filter((a) => a.isApprovedByAsker);
        for (let i = 1; i < approved.length; i++) {
          if (approved[i].upvotes > approved[i - 1].upvotes) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('within non-approved group, answers are ordered by upvotes descending', () => {
    fc.assert(
      fc.property(answersArrayArb, (answers) => {
        const sorted = sortAnswers(answers);
        const nonApproved = sorted.filter((a) => !a.isApprovedByAsker);
        for (let i = 1; i < nonApproved.length; i++) {
          if (nonApproved[i].upvotes > nonApproved[i - 1].upvotes) return false;
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('ties in upvotes are broken by createdAt ascending', () => {
    fc.assert(
      fc.property(answersArrayArb, (answers) => {
        const sorted = sortAnswers(answers);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          // Only check tiebreaker within the same approval group and same upvotes
          if (
            prev.isApprovedByAsker === curr.isApprovedByAsker &&
            prev.upvotes === curr.upvotes
          ) {
            if (curr.createdAt.getTime() < prev.createdAt.getTime()) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });

  it('sorting is stable — same input always produces same output', () => {
    fc.assert(
      fc.property(answersArrayArb, (answers) => {
        const sorted1 = sortAnswers(answers);
        const sorted2 = sortAnswers(answers);
        return JSON.stringify(sorted1) === JSON.stringify(sorted2);
      }),
      { numRuns: 100 },
    );
  });

  it('sorted array has the same length as input', () => {
    fc.assert(
      fc.property(answersArrayArb, (answers) => {
        const sorted = sortAnswers(answers);
        return sorted.length === answers.length;
      }),
      { numRuns: 100 },
    );
  });
});

// ============================================================
// Property 3: Related Questions Constraint
// Feature: synapse-mega-upgrade, Property 3: Related Questions Constraint
// Validates: Requirements 1.10
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 3: Related Questions Constraint', () => {
  /**
   * **Validates: Requirements 1.10**
   *
   * For any question with categories/tags and a database of other questions,
   * the related questions result SHALL:
   * - Contain at most 5 items
   * - Each sharing at least one category or tag with the source question
   * - Exclude the source question itself
   */

  it('related questions result contains at most 5 items', () => {
    fc.assert(
      fc.property(
        questionArb,
        fc.array(questionArb, { minLength: 0, maxLength: 30 }),
        (source, allQuestions) => {
          const related = getRelatedQuestions(source, allQuestions);
          return related.length <= 5;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('related questions excludes the source question itself', () => {
    fc.assert(
      fc.property(
        questionArb,
        fc.array(questionArb, { minLength: 0, maxLength: 30 }),
        (source, allQuestions) => {
          // Ensure the source is in the pool
          const pool = [...allQuestions, source];
          const related = getRelatedQuestions(source, pool);
          return related.every((q) => q.id !== source.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each related question shares at least one category or tag with the source', () => {
    fc.assert(
      fc.property(
        questionArb,
        fc.array(questionArb, { minLength: 0, maxLength: 30 }),
        (source, allQuestions) => {
          const related = getRelatedQuestions(source, allQuestions);
          return related.every((q) => {
            const sharesCategory = q.category.some((cat) =>
              source.category.includes(cat),
            );
            const sharesTag = q.tags.some((tag) => source.tags.includes(tag));
            return sharesCategory || sharesTag;
          });
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns empty when source has no categories and no tags', () => {
    fc.assert(
      fc.property(
        fc.array(questionArb, { minLength: 0, maxLength: 20 }),
        (allQuestions) => {
          const emptySource: Question = {
            id: 'empty-source-id',
            category: [],
            tags: [],
            isPublic: true,
            createdAt: new Date(),
          };
          const related = getRelatedQuestions(emptySource, allQuestions);
          return related.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('only includes public questions in the result', () => {
    fc.assert(
      fc.property(
        questionArb,
        fc.array(questionArb, { minLength: 0, maxLength: 30 }),
        (source, allQuestions) => {
          const related = getRelatedQuestions(source, allQuestions);
          return related.every((q) => q.isPublic);
        },
      ),
      { numRuns: 100 },
    );
  });
});
