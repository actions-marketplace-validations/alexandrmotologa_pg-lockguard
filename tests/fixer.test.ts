import { describe, it, expect } from 'vitest';
import { Fixer } from '../src/engine/fixer.js';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('Auto-Fix Engine', () => {
  const fixer = new Fixer();
  const linter = new MigrationLinter(DEFAULT_CONFIG);

  it('prepends SET lock_timeout when missing (PG006)', () => {
    const sql = `CREATE TABLE orders (id serial primary key);`;
    const result = fixer.fixContent(sql, 'test.sql', { lockTimeout: '1500ms' });

    expect(result.fixed).toBe(true);
    expect(result.fixes).toHaveLength(1);
    expect(result.fixes[0]!.ruleId).toBe('PG006');
    expect(result.fixedContent).toContain("SET lock_timeout = '1500ms';");
  });

  it('does not prepend SET lock_timeout if already set', () => {
    const sql = `SET lock_timeout = '3s';\nCREATE TABLE orders (id serial primary key);`;
    const result = fixer.fixContent(sql, 'test.sql');

    expect(result.fixed).toBe(false);
    expect(result.fixes).toHaveLength(0);
    expect(result.fixedContent).toBe(sql);
  });

  it('transforms CREATE INDEX to CONCURRENTLY IF NOT EXISTS (PG001)', () => {
    const sql = `SET lock_timeout = '2s';\nCREATE INDEX idx_users_email ON users (email);`;
    const result = fixer.fixContent(sql, 'test.sql');

    expect(result.fixed).toBe(true);
    expect(result.fixedContent).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);');

    // Verify fixed content has no PG001 violations
    const lintResult = linter.lintString(result.fixedContent, 'test.sql');
    expect(lintResult.violations.find((v) => v.ruleId === 'PG001')).toBeUndefined();
  });

  it('transforms CREATE UNIQUE INDEX to CONCURRENTLY IF NOT EXISTS (PG001)', () => {
    const sql = `SET lock_timeout = '2s';\nCREATE UNIQUE INDEX idx_users_username ON users (username);`;
    const result = fixer.fixContent(sql, 'test.sql');

    expect(result.fixed).toBe(true);
    expect(result.fixedContent).toContain('CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_username ON users (username);');
  });

  it('transforms DROP INDEX to CONCURRENTLY IF EXISTS (PG002)', () => {
    const sql = `SET lock_timeout = '2s';\nDROP INDEX idx_old_data;`;
    const result = fixer.fixContent(sql, 'test.sql');

    expect(result.fixed).toBe(true);
    expect(result.fixedContent).toContain('DROP INDEX CONCURRENTLY IF EXISTS idx_old_data;');

    // Verify fixed content has no PG002 violations
    const lintResult = linter.lintString(result.fixedContent, 'test.sql');
    expect(lintResult.violations.find((v) => v.ruleId === 'PG002')).toBeUndefined();
  });

  it('appends NOT VALID to ADD FOREIGN KEY constraint (PG004)', () => {
    const sql = `SET lock_timeout = '2s';\nALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);`;
    const result = fixer.fixContent(sql, 'test.sql');

    expect(result.fixed).toBe(true);
    expect(result.fixedContent).toContain('ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;');

    // Verify fixed content has no PG004 violations
    const lintResult = linter.lintString(result.fixedContent, 'test.sql');
    expect(lintResult.violations.find((v) => v.ruleId === 'PG004')).toBeUndefined();
  });

  it('appends NOT VALID to ADD CHECK constraint (PG010)', () => {
    const sql = `SET lock_timeout = '2s';\nALTER TABLE products ADD CONSTRAINT chk_price CHECK (price > 0);`;
    const result = fixer.fixContent(sql, 'test.sql');

    expect(result.fixed).toBe(true);
    expect(result.fixedContent).toContain('ADD CONSTRAINT chk_price CHECK (price > 0) NOT VALID;');

    // Verify fixed content has no PG010 violations
    const lintResult = linter.lintString(result.fixedContent, 'test.sql');
    expect(lintResult.violations.find((v) => v.ruleId === 'PG010')).toBeUndefined();
  });
});
