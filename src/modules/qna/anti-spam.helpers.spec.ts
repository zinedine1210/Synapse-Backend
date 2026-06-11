/**
 * Property-Based Tests for the Anti-Spam System
 *
 * Feature: synapse-mega-upgrade, Property 11: Answer Minimum Length Validation
 * Feature: synapse-mega-upgrade, Property 12: Spam Keyword Detection
 *
 * Validates: Requirements 11.1, 11.3
 */
import * as fc from 'fast-check';
import {
  validateAnswerMinLength,
  detectSpamKeywords,
  validateAnswer,
  SPAM_KEYWORDS,
  MIN_ANSWER_LENGTH,
} from './anti-spam.helpers';

describe('Feature: synapse-mega-upgrade, Property 11: Answer Minimum Length Validation', () => {
  /**
   * Property 11: Answer Minimum Length Validation
   *
   * For any string with fewer than 20 characters, the anti-spam system SHALL reject
   * the submission. For any string with 20 or more characters (that doesn't contain
   * spam keywords), it SHALL accept it.
   *
   * **Validates: Requirements 11.1**
   */

  it('SHALL reject any string with fewer than 20 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: MIN_ANSWER_LENGTH - 1 }),
        (shortBody) => {
          expect(validateAnswerMinLength(shortBody)).toBe(false);

          const result = validateAnswer(shortBody);
          expect(result.valid).toBe(false);
          expect(result.reason).toBe('Jawaban minimal 20 karakter');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('SHALL accept any string with 20 or more characters (no spam keywords)', () => {
    // Generate strings of at least 20 chars that do NOT contain spam keywords
    const safeCharArb = fc.stringOf(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvxyz0123456789 .,!?-_'.split(''),
      ),
      { minLength: MIN_ANSWER_LENGTH, maxLength: 200 },
    );

    fc.assert(
      fc.property(safeCharArb, (body) => {
        // Ensure no spam keywords are accidentally included
        const lowerBody = body.toLowerCase();
        const hasSpam = SPAM_KEYWORDS.some((kw) => lowerBody.includes(kw));
        fc.pre(!hasSpam);

        expect(validateAnswerMinLength(body)).toBe(true);

        const result = validateAnswer(body);
        expect(result.valid).toBe(true);
        expect(result.flagged).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('SHALL reject exactly at the boundary (19 chars rejected, 20 chars accepted)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...'abcdefghijklmnopqrstuvxyz'.split('')),
        (ch) => {
          // 19 chars → rejected
          const short = ch.repeat(19);
          expect(validateAnswerMinLength(short)).toBe(false);

          // 20 chars → accepted
          const exact = ch.repeat(20);
          expect(validateAnswerMinLength(exact)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('Feature: synapse-mega-upgrade, Property 12: Spam Keyword Detection', () => {
  /**
   * Property 12: Spam Keyword Detection
   *
   * For any answer body containing at least one spam keyword (jual, beli, promo, WA,
   * follow), the system SHALL flag it. For any answer body that does NOT contain any
   * spam keyword AND is >= 20 chars, it SHALL not be flagged.
   *
   * **Validates: Requirements 11.3**
   */

  it('SHALL flag any answer body containing at least one spam keyword', () => {
    // Strategy: generate a body >= 20 chars that includes at least one spam keyword
    const spamKeywordArb = fc.constantFrom(...SPAM_KEYWORDS);
    const paddingArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvxyz '.split('')),
      { minLength: 10, maxLength: 50 },
    );

    fc.assert(
      fc.property(
        spamKeywordArb,
        paddingArb,
        paddingArb,
        (keyword, prefix, suffix) => {
          const body = prefix + ' ' + keyword + ' ' + suffix;
          // Ensure body is long enough to pass length check
          fc.pre(body.length >= MIN_ANSWER_LENGTH);

          expect(detectSpamKeywords(body)).toBe(true);

          const result = validateAnswer(body);
          expect(result.valid).toBe(true);
          expect(result.flagged).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('SHALL detect spam keywords case-insensitively', () => {
    // Strategy: generate a keyword with randomized casing
    const randomCaseKeyword = fc.constantFrom(...SPAM_KEYWORDS).chain((kw) =>
      fc.tuple(
        fc.constant(kw),
        fc.array(fc.boolean(), { minLength: kw.length, maxLength: kw.length }),
      ).map(([keyword, cases]) =>
        keyword
          .split('')
          .map((c, i) => (cases[i] ? c.toUpperCase() : c.toLowerCase()))
          .join(''),
      ),
    );

    const paddingArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvxyz '.split('')),
      { minLength: 15, maxLength: 50 },
    );

    fc.assert(
      fc.property(randomCaseKeyword, paddingArb, (casedKeyword, padding) => {
        const body = padding + ' ' + casedKeyword + ' ' + padding;
        fc.pre(body.length >= MIN_ANSWER_LENGTH);

        expect(detectSpamKeywords(body)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('SHALL NOT flag any answer body without spam keywords that is >= 20 chars', () => {
    // Generate strings that definitely don't contain any spam keywords
    // Use a character set that cannot form: jual, beli, promo, wa, follow
    // Safe chars: excludes 'j','w','p' to guarantee no keywords can form
    const safeChars = 'cdghknqrstuvxyz0123456789 .,!?-_';
    const safeBodyArb = fc.stringOf(
      fc.constantFrom(...safeChars.split('')),
      { minLength: MIN_ANSWER_LENGTH, maxLength: 200 },
    );

    fc.assert(
      fc.property(safeBodyArb, (body) => {
        // Double-check no spam keywords
        const lowerBody = body.toLowerCase();
        const hasSpam = SPAM_KEYWORDS.some((kw) => lowerBody.includes(kw));
        fc.pre(!hasSpam);

        expect(detectSpamKeywords(body)).toBe(false);

        const result = validateAnswer(body);
        expect(result.valid).toBe(true);
        expect(result.flagged).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('SHALL flag when body contains multiple spam keywords', () => {
    const paddingArb = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvxyz '.split('')),
      { minLength: 5, maxLength: 20 },
    );

    fc.assert(
      fc.property(
        fc.subarray(SPAM_KEYWORDS as unknown as string[], { minLength: 2 }),
        paddingArb,
        (keywords, padding) => {
          const body = padding + ' ' + keywords.join(' ') + ' ' + padding;
          fc.pre(body.length >= MIN_ANSWER_LENGTH);

          expect(detectSpamKeywords(body)).toBe(true);

          const result = validateAnswer(body);
          expect(result.flagged).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
