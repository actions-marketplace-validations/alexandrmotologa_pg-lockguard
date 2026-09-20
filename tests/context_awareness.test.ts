import { describe, it, expect } from 'vitest';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('Context Awareness: Table Lifecycle Tracking', () => {
  const linter = new MigrationLinter(DEFAULT_CONFIG);

  it('allows non-concurrent CREATE INDEX on newly created table in same migration', () => {
    const sql = `
      SET lock_timeout = '2s';
      CREATE TABLE accounts (id serial primary key, email text);
      CREATE INDEX idx_accounts_email ON accounts (email);
    `;

    const result = linter.lintString(sql);
    expect(result.violations.filter((v) => v.ruleId === 'PG001')).toHaveLength(0);
  });

  it('allows NOT NULL columns, foreign keys, and checks on newly created table', () => {
    const sql = `
      SET lock_timeout = '2s';
      CREATE TABLE orders (id serial primary key);
      ALTER TABLE orders ADD COLUMN user_id INT NOT NULL;
      ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);
      ALTER TABLE orders ADD CONSTRAINT chk_id CHECK (id > 0);
      ALTER TABLE orders ADD CONSTRAINT uq_order UNIQUE (id);
    `;

    const result = linter.lintString(sql);
    // None of these should fail because orders is brand new with zero concurrent queries
    expect(result.hasErrors).toBe(false);
  });

  it('still flags non-concurrent index and unvalidated FK on existing tables', () => {
    const sql = `
      SET lock_timeout = '2s';
      CREATE TABLE new_table (id serial);
      -- old_table is NOT created in this file
      CREATE INDEX idx_old ON old_table (name);
      ALTER TABLE old_table ADD CONSTRAINT fk_old FOREIGN KEY (ref_id) REFERENCES new_table(id);
    `;

    const result = linter.lintString(sql);
    const pg001 = result.violations.find((v) => v.ruleId === 'PG001');
    const pg004 = result.violations.find((v) => v.ruleId === 'PG004');
    expect(pg001).toBeDefined();
    expect(pg004).toBeDefined();
  });
});
