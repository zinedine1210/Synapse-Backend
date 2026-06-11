/**
 * Anti-Spam System helpers for Q&A module.
 *
 * Implements:
 * - Minimum answer length validation (20 characters)
 * - Spam keyword detection (jual, beli, promo, WA, follow)
 */

export const SPAM_KEYWORDS = ['jual', 'beli', 'promo', 'wa', 'follow'] as const;

export const MIN_ANSWER_LENGTH = 20;

/**
 * Validates that an answer body meets the minimum length requirement.
 * @returns true if the answer is valid (>= MIN_ANSWER_LENGTH chars), false otherwise.
 */
export function validateAnswerMinLength(body: string): boolean {
  return body.length >= MIN_ANSWER_LENGTH;
}

/**
 * Detects whether an answer body contains any spam keywords.
 * Detection is case-insensitive and checks for whole-word or substring matches.
 * @returns true if spam is detected (body contains at least one keyword), false otherwise.
 */
export function detectSpamKeywords(body: string): boolean {
  const lowerBody = body.toLowerCase();
  return SPAM_KEYWORDS.some((keyword) => lowerBody.includes(keyword));
}

/**
 * Combined anti-spam check for an answer submission.
 * @returns An object with `valid` (can be submitted) and optional `reason` for rejection.
 */
export function validateAnswer(body: string): {
  valid: boolean;
  flagged: boolean;
  reason?: string;
} {
  if (!validateAnswerMinLength(body)) {
    return {
      valid: false,
      flagged: false,
      reason: 'Jawaban minimal 20 karakter',
    };
  }

  if (detectSpamKeywords(body)) {
    return {
      valid: true,
      flagged: true,
      reason: 'Jawaban mengandung kata spam dan perlu review',
    };
  }

  return { valid: true, flagged: false };
}
