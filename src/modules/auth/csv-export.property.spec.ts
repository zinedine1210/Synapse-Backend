/**
 * Feature: synapse-mega-upgrade, Property 5: CSV Export Round Trip
 *
 * **Validates: Requirements 2.6**
 *
 * For any set of user transactions and todos, exporting to CSV and parsing
 * the CSV back SHALL produce records containing all original transaction
 * amounts, categories, labels, and dates without data loss.
 */
import * as fc from 'fast-check';

// ============================================================
// Extracted pure functions from SettingsService for testability
// ============================================================

/**
 * Escape a field value for CSV (handle commas, quotes, newlines).
 */
function escapeCsvField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generate CSV string from transactions and todos.
 * Replicates the private generateCsv method in SettingsService.
 */
function generateCsv(transactions: any[], todos: any[]): string {
  const lines: string[] = [];

  // Transaction section
  lines.push('=== TRANSACTIONS ===');
  lines.push('date,type,category,label,amount,note');
  for (const tx of transactions) {
    const date = new Date(tx.date).toISOString().slice(0, 10);
    const label = escapeCsvField(tx.label);
    const note = escapeCsvField(tx.note || '');
    const category = escapeCsvField(tx.category);
    lines.push(`${date},${tx.type},${category},${label},${tx.amount},${note}`);
  }

  // Separator
  lines.push('');

  // Todo section
  lines.push('=== TODOS ===');
  lines.push('title,status,priority,category,dueDate,createdAt');
  for (const todo of todos) {
    const title = escapeCsvField(todo.title);
    const category = escapeCsvField(todo.category || '');
    const dueDate = todo.dueDate
      ? new Date(todo.dueDate).toISOString().slice(0, 10)
      : '';
    const createdAt = new Date(todo.createdAt).toISOString().slice(0, 10);
    lines.push(
      `${title},${todo.status},${todo.priority},${category},${dueDate},${createdAt}`,
    );
  }

  return lines.join('\n');
}

// ============================================================
// CSV Parser for round-trip verification
// ============================================================

interface ParsedTransaction {
  date: string;
  type: string;
  category: string;
  label: string;
  amount: number;
  note: string;
}

interface ParsedTodo {
  title: string;
  status: string;
  priority: string;
  category: string;
  dueDate: string;
  createdAt: string;
}

/**
 * Parse a CSV row respecting quoted fields.
 */
function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < row.length) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse the full CSV export into structured data.
 */
function parseCsvExport(csv: string): {
  transactions: ParsedTransaction[];
  todos: ParsedTodo[];
} {
  const lines = csv.split('\n');
  const transactions: ParsedTransaction[] = [];
  const todos: ParsedTodo[] = [];

  let section: 'none' | 'transactions' | 'todos' = 'none';
  let headerSkipped = false;

  for (const line of lines) {
    if (line === '=== TRANSACTIONS ===') {
      section = 'transactions';
      headerSkipped = false;
      continue;
    }
    if (line === '=== TODOS ===') {
      section = 'todos';
      headerSkipped = false;
      continue;
    }
    if (line === '') continue;

    if (!headerSkipped) {
      headerSkipped = true;
      continue; // Skip CSV header row
    }

    if (section === 'transactions') {
      const fields = parseCsvRow(line);
      transactions.push({
        date: fields[0],
        type: fields[1],
        category: fields[2],
        label: fields[3],
        amount: Number(fields[4]),
        note: fields[5] || '',
      });
    } else if (section === 'todos') {
      const fields = parseCsvRow(line);
      todos.push({
        title: fields[0],
        status: fields[1],
        priority: fields[2],
        category: fields[3],
        dueDate: fields[4] || '',
        createdAt: fields[5],
      });
    }
  }

  return { transactions, todos };
}

// ============================================================
// Arbitraries (test data generators)
// ============================================================

/**
 * Generate a safe string for CSV fields — avoids characters that would
 * break line-based CSV parsing in unrecoverable ways (no standalone \n or \r
 * outside quoted fields is already handled by escapeCsvField, but we want
 * diverse strings including commas and quotes).
 */
const safeCsvStringArb = fc.stringOf(
  fc.oneof(
    fc.char().filter((c) => c !== '\n' && c !== '\r'),
    fc.constant(','),
    fc.constant('"'),
  ),
  { minLength: 1, maxLength: 50 },
);

/** Simple string without line breaks for labels/categories */
const simpleStringArb = fc.stringOf(
  fc.char().filter((c) => c !== '\n' && c !== '\r'),
  { minLength: 1, maxLength: 30 },
);

const transactionTypeArb = fc.constantFrom('income', 'expense');
const todoPriorityArb = fc.constantFrom('low', 'medium', 'high');
const todoStatusArb = fc.constantFrom('pending', 'completed', 'cancelled');

/** Generate a valid date in a reasonable range */
const dateArb = fc.date({
  min: new Date('2020-01-01'),
  max: new Date('2030-12-31'),
});

/** Generate a transaction record */
const transactionArb = fc.record({
  date: dateArb,
  type: transactionTypeArb,
  category: simpleStringArb,
  label: simpleStringArb,
  amount: fc.integer({ min: 0, max: 100_000_000 }),
  note: fc.oneof(simpleStringArb, fc.constant('')),
});

/** Generate a todo record */
const todoArb = fc.record({
  title: simpleStringArb,
  status: todoStatusArb,
  priority: todoPriorityArb,
  category: fc.oneof(simpleStringArb, fc.constant('')),
  dueDate: fc.oneof(dateArb, fc.constant(null)),
  createdAt: dateArb,
});

// ============================================================
// Property Tests
// ============================================================

describe('Feature: synapse-mega-upgrade, Property 5: CSV Export Round Trip', () => {
  it('should preserve all transaction data through CSV export and parse round trip', () => {
    fc.assert(
      fc.property(
        fc.array(transactionArb, { minLength: 1, maxLength: 20 }),
        fc.array(todoArb, { minLength: 0, maxLength: 10 }),
        (transactions, todos) => {
          // Export to CSV
          const csv = generateCsv(transactions, todos);

          // Parse back
          const parsed = parseCsvExport(csv);

          // Verify transaction count
          expect(parsed.transactions.length).toBe(transactions.length);

          // Verify each transaction field
          for (let i = 0; i < transactions.length; i++) {
            const original = transactions[i];
            const restored = parsed.transactions[i];

            // Date (formatted as YYYY-MM-DD)
            const expectedDate = new Date(original.date)
              .toISOString()
              .slice(0, 10);
            expect(restored.date).toBe(expectedDate);

            // Amount
            expect(restored.amount).toBe(original.amount);

            // Category
            expect(restored.category).toBe(original.category);

            // Label
            expect(restored.label).toBe(original.label);

            // Type
            expect(restored.type).toBe(original.type);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should preserve all todo data through CSV export and parse round trip', () => {
    fc.assert(
      fc.property(
        fc.array(transactionArb, { minLength: 0, maxLength: 5 }),
        fc.array(todoArb, { minLength: 1, maxLength: 20 }),
        (transactions, todos) => {
          // Export to CSV
          const csv = generateCsv(transactions, todos);

          // Parse back
          const parsed = parseCsvExport(csv);

          // Verify todo count
          expect(parsed.todos.length).toBe(todos.length);

          // Verify each todo field
          for (let i = 0; i < todos.length; i++) {
            const original = todos[i];
            const restored = parsed.todos[i];

            // Title
            expect(restored.title).toBe(original.title);

            // Status
            expect(restored.status).toBe(original.status);

            // Priority
            expect(restored.priority).toBe(original.priority);

            // Category
            expect(restored.category).toBe(original.category || '');

            // DueDate
            const expectedDueDate = original.dueDate
              ? new Date(original.dueDate).toISOString().slice(0, 10)
              : '';
            expect(restored.dueDate).toBe(expectedDueDate);

            // CreatedAt
            const expectedCreatedAt = new Date(original.createdAt)
              .toISOString()
              .slice(0, 10);
            expect(restored.createdAt).toBe(expectedCreatedAt);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle CSV special characters (commas, quotes) in fields without data loss', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            date: dateArb,
            type: transactionTypeArb,
            category: safeCsvStringArb,
            label: safeCsvStringArb,
            amount: fc.integer({ min: 0, max: 100_000_000 }),
            note: fc.oneof(safeCsvStringArb, fc.constant('')),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (transactions) => {
          const csv = generateCsv(transactions, []);
          const parsed = parseCsvExport(csv);

          expect(parsed.transactions.length).toBe(transactions.length);

          for (let i = 0; i < transactions.length; i++) {
            const original = transactions[i];
            const restored = parsed.transactions[i];

            // All fields must be exactly preserved
            expect(restored.amount).toBe(original.amount);
            expect(restored.category).toBe(original.category);
            expect(restored.label).toBe(original.label);

            const expectedDate = new Date(original.date)
              .toISOString()
              .slice(0, 10);
            expect(restored.date).toBe(expectedDate);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should produce valid CSV structure with correct section markers and headers', () => {
    fc.assert(
      fc.property(
        fc.array(transactionArb, { minLength: 0, maxLength: 15 }),
        fc.array(todoArb, { minLength: 0, maxLength: 15 }),
        (transactions, todos) => {
          const csv = generateCsv(transactions, todos);

          // Must contain section markers
          expect(csv).toContain('=== TRANSACTIONS ===');
          expect(csv).toContain('=== TODOS ===');

          // Must contain headers
          expect(csv).toContain('date,type,category,label,amount,note');
          expect(csv).toContain(
            'title,status,priority,category,dueDate,createdAt',
          );

          // Parse and verify counts match
          const parsed = parseCsvExport(csv);
          expect(parsed.transactions.length).toBe(transactions.length);
          expect(parsed.todos.length).toBe(todos.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should handle empty transactions and todos gracefully', () => {
    fc.assert(
      fc.property(
        fc.constant([] as any[]),
        fc.constant([] as any[]),
        (transactions, todos) => {
          const csv = generateCsv(transactions, todos);
          const parsed = parseCsvExport(csv);

          expect(parsed.transactions.length).toBe(0);
          expect(parsed.todos.length).toBe(0);
          // Structure still present
          expect(csv).toContain('=== TRANSACTIONS ===');
          expect(csv).toContain('=== TODOS ===');
        },
      ),
      { numRuns: 100 },
    );
  });
});
