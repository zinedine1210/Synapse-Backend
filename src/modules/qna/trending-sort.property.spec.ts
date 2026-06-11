import * as fc from 'fast-check';

/**
 * Property-Based Tests for Trending Q&A Sort
 * Feature: synapse-mega-upgrade, Property 22: Trending Q&A Sort
 *
 * For any set of questions with answers that have received upvotes within a
 * 7-day window, the trending sort SHALL order questions by total recent
 * upvotes descending.
 *
 * **Validates: Requirements 22.6**
 */

// ============================================================
// Replicated trending sort logic from qna.service.ts
// ============================================================

interface QnaVoteEntry {
  answerId: string;
  questionId: string;
  value: number;
  createdAt: Date;
}

interface TrendingQuestion {
  id: string;
  title: string;
  trendingScore: number;
}

/**
 * Pure trending sort logic extracted from QnaService.getTrendingQuestions.
 * Given a list of votes and a mapping from answerId to questionId,
 * computes per-question trending scores (sum of vote values within 7-day window)
 * and returns questions sorted by score descending.
 */
function computeTrendingSort(
  votes: QnaVoteEntry[],
  now: Date = new Date(),
): TrendingQuestion[] {
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Filter votes to only those within the 7-day window
  const recentVotes = votes.filter((v) => v.createdAt >= sevenDaysAgo);

  // Build a map of questionId -> total recent upvotes
  const questionScores = new Map<string, number>();
  for (const vote of recentVotes) {
    const current = questionScores.get(vote.questionId) || 0;
    questionScores.set(vote.questionId, current + vote.value);
  }

  // Sort by score descending
  const sorted = [...questionScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({
      id,
      title: `Question ${id}`,
      trendingScore: score,
    }));

  return sorted;
}

// ============================================================
// Arbitraries (generators)
// ============================================================

const questionIdArb = fc.stringOf(
  fc.constantFrom('q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'),
  { minLength: 2, maxLength: 3 },
);

const answerIdArb = fc.uuid();

// Generate a date that is within the last 7 days (recent)
const recentDateArb = fc.integer({ min: 0, max: 7 * 24 * 60 * 60 * 1000 - 1 }).map(
  (msAgo) => new Date(Date.now() - msAgo),
);

// Generate a date that is older than 7 days
const oldDateArb = fc
  .integer({ min: 7 * 24 * 60 * 60 * 1000 + 1, max: 30 * 24 * 60 * 60 * 1000 })
  .map((msAgo) => new Date(Date.now() - msAgo));

// Generate a vote that is within the 7-day window
const recentVoteArb: fc.Arbitrary<QnaVoteEntry> = fc.record({
  answerId: answerIdArb,
  questionId: questionIdArb,
  value: fc.integer({ min: 1, max: 5 }),
  createdAt: recentDateArb,
});

// Generate a vote that is older than 7 days
const oldVoteArb: fc.Arbitrary<QnaVoteEntry> = fc.record({
  answerId: answerIdArb,
  questionId: questionIdArb,
  value: fc.integer({ min: 1, max: 5 }),
  createdAt: oldDateArb,
});

// Mixed votes (some recent, some old)
const mixedVotesArb: fc.Arbitrary<QnaVoteEntry[]> = fc
  .array(fc.oneof(recentVoteArb, oldVoteArb), { minLength: 1, maxLength: 50 })
  .filter((votes) => votes.some((v) => v.createdAt >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));

// Only recent votes
const recentVotesArb: fc.Arbitrary<QnaVoteEntry[]> = fc.array(recentVoteArb, {
  minLength: 1,
  maxLength: 50,
});

// ============================================================
// Property 22: Trending Q&A Sort
// Feature: synapse-mega-upgrade, Property 22: Trending Q&A Sort
// Validates: Requirements 22.6
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 22: Trending Q&A Sort', () => {
  /**
   * **Validates: Requirements 22.6**
   *
   * For any set of questions with answers that have received upvotes within a
   * 7-day window, the trending sort SHALL order questions by total recent
   * upvotes descending.
   */

  it('results are sorted by trendingScore in descending order', () => {
    fc.assert(
      fc.property(recentVotesArb, (votes) => {
        const result = computeTrendingSort(votes);
        for (let i = 1; i < result.length; i++) {
          if (result[i].trendingScore > result[i - 1].trendingScore) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('trendingScore equals the sum of vote values for that question within 7-day window', () => {
    fc.assert(
      fc.property(mixedVotesArb, (votes) => {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = computeTrendingSort(votes, now);

        // Manually compute expected scores
        const expectedScores = new Map<string, number>();
        for (const vote of votes) {
          if (vote.createdAt >= sevenDaysAgo) {
            const current = expectedScores.get(vote.questionId) || 0;
            expectedScores.set(vote.questionId, current + vote.value);
          }
        }

        // Each result's trendingScore should match the expected
        for (const question of result) {
          const expected = expectedScores.get(question.id) || 0;
          if (question.trendingScore !== expected) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('votes older than 7 days do not contribute to trendingScore', () => {
    fc.assert(
      fc.property(
        fc.array(oldVoteArb, { minLength: 1, maxLength: 30 }),
        (oldVotes) => {
          const result = computeTrendingSort(oldVotes);
          // All old votes -> no questions should appear in trending
          return result.length === 0;
        },
      ),
      { numRuns: 150 },
    );
  });

  it('all questions with recent votes appear in the result', () => {
    fc.assert(
      fc.property(mixedVotesArb, (votes) => {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = computeTrendingSort(votes, now);
        const resultIds = new Set(result.map((r) => r.id));

        // Collect all question IDs that have at least one recent vote
        const questionsWithRecentVotes = new Set<string>();
        for (const vote of votes) {
          if (vote.createdAt >= sevenDaysAgo) {
            questionsWithRecentVotes.add(vote.questionId);
          }
        }

        // Every question with recent votes must be in result
        for (const qId of questionsWithRecentVotes) {
          if (!resultIds.has(qId)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('no question without recent votes appears in the result', () => {
    fc.assert(
      fc.property(mixedVotesArb, (votes) => {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const result = computeTrendingSort(votes, now);

        // Collect questions that only have old votes
        const questionsWithRecentVotes = new Set<string>();
        for (const vote of votes) {
          if (vote.createdAt >= sevenDaysAgo) {
            questionsWithRecentVotes.add(vote.questionId);
          }
        }

        // No result should contain a question without recent votes
        for (const question of result) {
          if (!questionsWithRecentVotes.has(question.id)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 150 },
    );
  });

  it('result length equals the number of distinct questions with recent votes', () => {
    fc.assert(
      fc.property(recentVotesArb, (votes) => {
        const result = computeTrendingSort(votes);
        const distinctQuestions = new Set(votes.map((v) => v.questionId));
        return result.length === distinctQuestions.size;
      }),
      { numRuns: 150 },
    );
  });

  it('adding more recent votes to a question increases or maintains its position', () => {
    fc.assert(
      fc.property(
        recentVotesArb,
        recentVoteArb,
        (votes, extraVote) => {
          const resultBefore = computeTrendingSort(votes);
          const resultAfter = computeTrendingSort([...votes, extraVote]);

          const targetQuestionId = extraVote.questionId;

          // Find position (index) in both results
          const posBefore = resultBefore.findIndex((r) => r.id === targetQuestionId);
          const posAfter = resultAfter.findIndex((r) => r.id === targetQuestionId);

          // The question must exist in the "after" result
          if (posAfter === -1) return false;

          // If it didn't exist before, it now exists - that's valid
          if (posBefore === -1) return true;

          // Position should be same or better (lower index = higher rank)
          return posAfter <= posBefore;
        },
      ),
      { numRuns: 150 },
    );
  });
});
