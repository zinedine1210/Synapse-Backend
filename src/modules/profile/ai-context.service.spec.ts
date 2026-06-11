import { buildAIContext, AI_CONTEXT_MAX_LENGTH } from './ai-context.service';

describe('buildAIContext', () => {
  it('should return empty string when all fields are empty or null', () => {
    expect(buildAIContext({})).toBe('');
    expect(buildAIContext({ dailyHabits: null, lifeGoals: null })).toBe('');
    expect(buildAIContext({ dailyHabits: '', lifeGoals: '   ' })).toBe('');
  });

  it('should include non-empty fields with labels', () => {
    const result = buildAIContext({
      dailyHabits: 'Wake up at 6am',
      lifeGoals: 'Graduate with honors',
    });

    expect(result).toContain('Daily Habits: Wake up at 6am');
    expect(result).toContain('Life Goals: Graduate with honors');
  });

  it('should skip empty/null/whitespace-only fields', () => {
    const result = buildAIContext({
      dailyHabits: 'Exercise daily',
      lifeGoals: null,
      studySchedule: '',
      personalNotes: '  ',
    });

    expect(result).toContain('Daily Habits: Exercise daily');
    expect(result).not.toContain('Life Goals');
    expect(result).not.toContain('Study Schedule');
    expect(result).not.toContain('Personal Notes');
  });

  it('should include all four fields when all are non-empty', () => {
    const result = buildAIContext({
      dailyHabits: 'Morning run',
      lifeGoals: 'Get a PhD',
      studySchedule: 'Mon-Fri 8am-12pm',
      personalNotes: 'Loves coffee',
    });

    expect(result).toContain('Daily Habits: Morning run');
    expect(result).toContain('Life Goals: Get a PhD');
    expect(result).toContain('Study Schedule: Mon-Fri 8am-12pm');
    expect(result).toContain('Personal Notes: Loves coffee');
  });

  it('should never exceed 1000 characters', () => {
    const longText = 'a'.repeat(300);
    const result = buildAIContext({
      dailyHabits: longText,
      lifeGoals: longText,
      studySchedule: longText,
      personalNotes: longText,
    });

    expect(result.length).toBeLessThanOrEqual(AI_CONTEXT_MAX_LENGTH);
  });

  it('should truncate proportionally when total exceeds limit', () => {
    const result = buildAIContext({
      dailyHabits: 'a'.repeat(300),
      lifeGoals: 'b'.repeat(300),
      studySchedule: 'c'.repeat(200),
      personalNotes: 'd'.repeat(200),
    });

    expect(result.length).toBeLessThanOrEqual(AI_CONTEXT_MAX_LENGTH);
    // Each field should still have some representation
    expect(result).toContain('Daily Habits:');
    expect(result).toContain('Life Goals:');
    expect(result).toContain('Study Schedule:');
    expect(result).toContain('Personal Notes:');
  });

  it('should not truncate when total is under 1000 characters', () => {
    const result = buildAIContext({
      dailyHabits: 'Short habit',
      lifeGoals: 'Short goal',
    });

    expect(result).toBe('Daily Habits: Short habit\nLife Goals: Short goal');
    expect(result.length).toBeLessThanOrEqual(AI_CONTEXT_MAX_LENGTH);
  });
});
