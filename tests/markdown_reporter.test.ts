import { describe, it, expect } from 'vitest';
import { MarkdownReporter } from '../src/reporters/markdown.js';
import type { LintSummary } from '../src/engine/linter.js';

describe('Markdown Reporter', () => {
  const reporter = new MarkdownReporter();

  it('renders clean success report when no violations are present', () => {
    const summary: LintSummary = {
      results: [
        {
          file: 'migrations/001_clean.sql',
          violations: [],
          hasErrors: false,
          hasWarnings: false,
          durationMs: 5,
        },
      ],
      totalFiles: 1,
      passedFiles: 1,
      failedFiles: 0,
      totalErrors: 0,
      totalWarnings: 0,
      durationMs: 5,
    };

    const output = reporter.format(summary);
    expect(output).toContain('## ✅ PG Lockguard Migration Security Report — PASSED');
    expect(output).toContain('All migrations meet zero-downtime PostgreSQL lock safety requirements');
    expect(output).toContain('| **Passed Migrations** | `1` |');
  });

  it('renders detailed markdown report with collapsible details and remediation recipes', () => {
    const summary: LintSummary = {
      results: [
        {
          file: 'migrations/002_unsafe.sql',
          violations: [
            {
              ruleId: 'PG001',
              ruleName: 'create-index-concurrently',
              file: 'migrations/002_unsafe.sql',
              line: 4,
              column: 1,
              offset: 20,
              severity: 'error',
              lockLevel: 'SHARE',
              message: 'Creating index without CONCURRENTLY acquires SHARE lock.',
              snippet: 'CREATE INDEX idx_users_email ON users(email);',
              explanation: 'Acquires SHARE lock on users table.',
              recipe: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users(email);',
            },
          ],
          hasErrors: true,
          hasWarnings: false,
          durationMs: 12,
        },
      ],
      totalFiles: 1,
      passedFiles: 0,
      failedFiles: 1,
      totalErrors: 1,
      totalWarnings: 0,
      durationMs: 12,
    };

    const output = reporter.format(summary);
    expect(output).toContain('## 🚨 PG Lockguard Migration Security Report — FAILED');
    expect(output).toContain('<details open>');
    expect(output).toContain('<code>migrations/002_unsafe.sql</code>');
    expect(output).toContain('[PG001]');
    expect(output).toContain('SHARE');
    expect(output).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS');
  });
});
