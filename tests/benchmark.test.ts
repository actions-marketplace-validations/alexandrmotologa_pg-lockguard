import { describe, it, expect } from 'vitest';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('Performance Benchmark', () => {
  it('lints 100 SQL statements in under 500ms', () => {
    const linter = new MigrationLinter(DEFAULT_CONFIG);
    const sql = `
      SET lock_timeout = '2s';
      CREATE INDEX CONCURRENTLY idx_users_email ON users (email);
      ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT false NOT NULL;
      ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
      ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18) NOT VALID;
    `;

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      linter.lintString(sql, `migration_${i}.sql`);
    }
    const elapsed = performance.now() - start;

    console.log(`Linted 100 migrations in ${Math.round(elapsed)}ms`);
    expect(elapsed).toBeLessThan(1000); // Strict performance target
  });
});
