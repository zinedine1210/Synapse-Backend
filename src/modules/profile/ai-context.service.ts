/**
 * AI Context Builder Service
 *
 * Builds a personalized AI context string from UserProfile fields.
 * Used for injecting user context into AI prompts (Daily Briefing, Q&A, etc.)
 *
 * Requirements:
 * - 5.4: Include relevant User_Profile context in AI prompts
 * - 5.5: Truncate context to 1000 characters when injecting into AI prompts
 */

/** Maximum total characters for the AI context string */
export const AI_CONTEXT_MAX_LENGTH = 1000;

/**
 * Minimal interface for the profile fields needed by the AI context builder.
 * Compatible with the Prisma UserProfile model.
 */
export interface AIContextProfile {
  dailyHabits?: string | null;
  lifeGoals?: string | null;
  studySchedule?: string | null;
  personalNotes?: string | null;
}

interface ContextField {
  label: string;
  value: string;
}

/**
 * Builds an AI context string from user profile fields.
 *
 * - Includes only non-empty fields (dailyHabits, lifeGoals, studySchedule, personalNotes)
 * - Each field is labeled with a section header for AI readability
 * - Enforces a total length of ≤ 1000 characters via proportional truncation
 *
 * This is a pure function with no side effects, suitable for unit and property testing.
 */
export function buildAIContext(profile: AIContextProfile): string {
  const fields: ContextField[] = [];

  if (profile.dailyHabits && profile.dailyHabits.trim().length > 0) {
    fields.push({ label: 'Daily Habits', value: profile.dailyHabits.trim() });
  }
  if (profile.lifeGoals && profile.lifeGoals.trim().length > 0) {
    fields.push({ label: 'Life Goals', value: profile.lifeGoals.trim() });
  }
  if (profile.studySchedule && profile.studySchedule.trim().length > 0) {
    fields.push({ label: 'Study Schedule', value: profile.studySchedule.trim() });
  }
  if (profile.personalNotes && profile.personalNotes.trim().length > 0) {
    fields.push({ label: 'Personal Notes', value: profile.personalNotes.trim() });
  }

  if (fields.length === 0) {
    return '';
  }

  // Format each field as "[Label]: [Value]"
  // Join fields with newline separator
  const separator = '\n';

  // Calculate the overhead (labels + separators) to determine available space for values
  const overheadPerField = fields.map((f) => `${f.label}: `.length);
  const separatorOverhead = (fields.length - 1) * separator.length;
  const totalOverhead =
    overheadPerField.reduce((sum, len) => sum + len, 0) + separatorOverhead;

  const availableForValues = AI_CONTEXT_MAX_LENGTH - totalOverhead;

  if (availableForValues <= 0) {
    // Edge case: overhead alone exceeds limit — just truncate the raw joined string
    return fields
      .map((f) => `${f.label}: ${f.value}`)
      .join(separator)
      .slice(0, AI_CONTEXT_MAX_LENGTH);
  }

  // Proportionally allocate space to each field value based on its original length
  const totalValueLength = fields.reduce((sum, f) => sum + f.value.length, 0);

  let truncatedFields: string[];

  if (totalValueLength <= availableForValues) {
    // All values fit without truncation
    truncatedFields = fields.map((f) => `${f.label}: ${f.value}`);
  } else {
    // Proportionally truncate each value
    truncatedFields = fields.map((f) => {
      const proportion = f.value.length / totalValueLength;
      const allowedLength = Math.max(1, Math.floor(proportion * availableForValues));
      const truncatedValue =
        f.value.length > allowedLength
          ? f.value.slice(0, allowedLength - 3) + '...'
          : f.value;
      return `${f.label}: ${truncatedValue}`;
    });
  }

  const result = truncatedFields.join(separator);

  // Final safety truncation to guarantee the 1000 char limit
  if (result.length > AI_CONTEXT_MAX_LENGTH) {
    return result.slice(0, AI_CONTEXT_MAX_LENGTH);
  }

  return result;
}
