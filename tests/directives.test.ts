import { describe, it, expect } from 'vitest';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('Inline SQL Comment Directives', () => {
  const linter = new MigrationLinter(DEFAULT_CONFIG);

  it('suppresses rule with -- pg-lockguard-disable-next-line', () => {
    const sql = `
      SET lock_timeout = '2s';
      -- pg-lockguard-disable-next-line PG001
      CREATE INDEX idx_users ON users (email);
    `;

    const result = linter.lintString(sql);
    expect(result.violations.filter((v) => v.ruleId === 'PG001')).toHaveLength(0);
  });

  it('suppresses multiple rules with comma separation and reasons', () => {
    const sql = `
      SET lock_timeout = '2s';
      -- pg-lockguard-disable-next-line PG001,PG004 reason: off-peak maintenance window
      CREATE INDEX idx_orders ON orders (user_id);
      ALTER TABLE orders ADD CONSTRAINT fk_u FOREIGN KEY (user_id) REFERENCES users(id);
    `;

    const result = linter.lintString(sql);
    // idx_orders line is suppressed
    expect(result.violations.filter((v) => v.ruleId === 'PG001')).toHaveLength(0);
    // fk_u is on the next line and is not suppressed
    expect(result.violations.filter((v) => v.ruleId === 'PG004')).toHaveLength(1);
  });

  it('suppresses blocks with disable and enable directives', () => {
    const sql = `
      SET lock_timeout = '2s';
      -- pg-lockguard-disable PG001
      CREATE INDEX idx1 ON users (a);
      CREATE INDEX idx2 ON users (b);
      -- pg-lockguard-enable PG001
      CREATE INDEX idx3 ON users (c);
    `;

    const result = linter.lintString(sql);
    const pg001s = result.violations.filter((v) => v.ruleId === 'PG001');
    expect(pg001s).toHaveLength(1);
    expect(pg001s[0]?.snippet).toContain('idx3');
  });

  it('ignores entire file when -- pg-lockguard-ignore-file is present', () => {
    const sql = `
      -- pg-lockguard-ignore-file
      CREATE INDEX idx1 ON users (a);
      DROP INDEX idx2;
      ALTER TABLE users ADD COLUMN col INT NOT NULL;
    `;

    const result = linter.lintString(sql);
    expect(result.violations).toHaveLength(0);
  });
});
