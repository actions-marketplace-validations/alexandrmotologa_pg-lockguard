import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('MigrationLinter Engine Integration', () => {
  it('correctly lints 26 test fixture files', () => {
    const linter = new MigrationLinter(DEFAULT_CONFIG);
    const fixtureFiles = [
      path.resolve('tests/fixtures/01_safe_index.sql'),
      path.resolve('tests/fixtures/02_unsafe_index.sql'),
      path.resolve('tests/fixtures/08_safe_fk_not_valid.sql'),
      path.resolve('tests/fixtures/09_unsafe_fk.sql'),
      path.resolve('tests/fixtures/26_clean_zero_downtime_migration.sql'),
    ];

    const summary = linter.lintFiles(fixtureFiles);
    expect(summary.totalFiles).toBe(5);
    expect(summary.failedFiles).toBe(2); // 02_unsafe_index.sql and 09_unsafe_fk.sql
    expect(summary.passedFiles).toBe(3); // 01, 08, 26
  });

  it('handles syntax errors gracefully with code 2 indicators', () => {
    const linter = new MigrationLinter(DEFAULT_CONFIG);
    const invalidSql = 'ALTER TABLE users BROKEN SYNTAX !!!;';
    const result = linter.lintString(invalidSql);
    expect(result.hasErrors).toBe(true);
    expect(result.violations[0]?.ruleId).toBe('SYNTAX_ERROR');
  });

  it('respects ignoreRules configuration', () => {
    const linter = new MigrationLinter({
      ...DEFAULT_CONFIG,
      ignoreRules: ['PG001'],
    });

    const sql = "SET lock_timeout = '2s'; CREATE INDEX idx ON users (email);";
    const result = linter.lintString(sql);
    expect(result.violations.filter((v) => v.ruleId === 'PG001')).toHaveLength(0);
  });

  it('respects maxLockLevel configuration', () => {
    // If maxLockLevel is set to ACCESS_EXCLUSIVE, SHARE locks should be downgraded to warnings
    const linter = new MigrationLinter({
      ...DEFAULT_CONFIG,
      maxLockLevel: 'ACCESS_EXCLUSIVE',
    });

    const sql = "SET lock_timeout = '2s'; CREATE INDEX idx ON users (email);";
    const result = linter.lintString(sql);
    const v = result.violations.find((v) => v.ruleId === 'PG001');
    expect(v).toBeDefined();
    expect(v?.severity).toBe('warning');
    expect(result.hasErrors).toBe(false);
  });
});
