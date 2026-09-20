import { describe, it, expect } from 'vitest';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';

describe('PG Lockguard Rules Suite', () => {
  const linter = new MigrationLinter(DEFAULT_CONFIG);

  describe('PG001: CREATE INDEX CONCURRENTLY', () => {
    it('fails when index is created without CONCURRENTLY', () => {
      const sql = "SET lock_timeout = '2s'; CREATE INDEX idx ON users (email);";
      const result = linter.lintString(sql);
      expect(result.hasErrors).toBe(true);
      const violation = result.violations.find((v) => v.ruleId === 'PG001');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('SHARE');
      expect(violation?.recipe).toContain('CREATE INDEX CONCURRENTLY');
    });

    it('passes when index is created with CONCURRENTLY', () => {
      const sql = "SET lock_timeout = '2s'; CREATE INDEX CONCURRENTLY idx ON users (email);";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG001')).toHaveLength(0);
    });
  });

  describe('PG002: DROP INDEX CONCURRENTLY', () => {
    it('fails when index is dropped without CONCURRENTLY', () => {
      const sql = "SET lock_timeout = '2s'; DROP INDEX idx;";
      const result = linter.lintString(sql);
      expect(result.hasErrors).toBe(true);
      const violation = result.violations.find((v) => v.ruleId === 'PG002');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('ACCESS_EXCLUSIVE');
    });

    it('passes when index is dropped with CONCURRENTLY', () => {
      const sql = "SET lock_timeout = '2s'; DROP INDEX CONCURRENTLY idx;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG002')).toHaveLength(0);
    });
  });

  describe('PG003: ADD COLUMN NOT NULL', () => {
    it('passes on PostgreSQL 16 when adding column with constant default', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT false NOT NULL;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG003')).toHaveLength(0);
    });

    it('fails when adding column NOT NULL without default value', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD COLUMN age INT NOT NULL;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG003');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('ACCESS_EXCLUSIVE');
    });

    it('fails when default value uses a volatile function', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD COLUMN token UUID DEFAULT gen_random_uuid() NOT NULL;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG003');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('volatile function');
    });
  });

  describe('PG004: ADD FOREIGN KEY', () => {
    it('fails when foreign key is added without NOT VALID', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id);";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG004');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('SHARE_ROW_EXCLUSIVE');
    });

    it('passes when foreign key is added with NOT VALID', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG004')).toHaveLength(0);
    });
  });

  describe('PG005: ALTER COLUMN TYPE', () => {
    it('fails when changing type to non-compatible type', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ALTER COLUMN id TYPE bigint;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG005');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('ACCESS_EXCLUSIVE');
    });

    it('passes when altering type to text (binary compatible)', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ALTER COLUMN desc TYPE text;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG005')).toHaveLength(0);
    });
  });

  describe('PG006: SET lock_timeout', () => {
    it('warns when lock_timeout is missing', () => {
      const sql = 'CREATE INDEX CONCURRENTLY idx ON users(id);';
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG006');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('warning');
    });

    it('passes when SET lock_timeout is present', () => {
      const sql = "SET lock_timeout = '3s'; CREATE INDEX CONCURRENTLY idx ON users(id);";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG006')).toHaveLength(0);
    });
  });

  describe('PG007: UNIQUE Constraint', () => {
    it('fails when unique constraint is added directly', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE (email);";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG007');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('ACCESS_EXCLUSIVE');
    });

    it('passes when unique constraint is added USING INDEX', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE USING INDEX idx_uq;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG007')).toHaveLength(0);
    });
  });

  describe('PG008: VACUUM FULL & CLUSTER', () => {
    it('fails on VACUUM FULL', () => {
      const sql = "SET lock_timeout = '2s'; VACUUM FULL users;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG008');
      expect(violation).toBeDefined();
      expect(violation?.lockLevel).toBe('ACCESS_EXCLUSIVE');
    });

    it('fails on CLUSTER', () => {
      const sql = "SET lock_timeout = '2s'; CLUSTER users USING idx_id;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG008');
      expect(violation).toBeDefined();
    });

    it('passes on standard VACUUM (ANALYZE)', () => {
      const sql = "SET lock_timeout = '2s'; VACUUM (ANALYZE) users;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG008')).toHaveLength(0);
    });
  });

  describe('PG009: Concurrent DDL in Transaction', () => {
    it('fails when CREATE INDEX CONCURRENTLY is wrapped in BEGIN/COMMIT', () => {
      const sql = 'BEGIN; CREATE INDEX CONCURRENTLY idx ON users (id); COMMIT;';
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG009');
      expect(violation).toBeDefined();
      expect(violation?.message).toContain('cannot run inside a multi-statement transaction block');
    });
  });

  describe('PG010: CHECK Constraint without NOT VALID', () => {
    it('fails when CHECK constraint is added without NOT VALID', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18);";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG010');
      expect(violation).toBeDefined();
    });

    it('passes when CHECK constraint is added with NOT VALID', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18) NOT VALID;";
      const result = linter.lintString(sql);
      expect(result.violations.filter((v) => v.ruleId === 'PG010')).toHaveLength(0);
    });
  });

  describe('PG011: RENAME Column or Table', () => {
    it('warns when renaming column', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users RENAME COLUMN first_name TO given_name;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG011');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('warning');
    });

    it('warns when renaming table', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users RENAME TO accounts;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG011');
      expect(violation).toBeDefined();
    });
  });

  describe('PG012: Destructive Drop', () => {
    it('warns when dropping a table', () => {
      const sql = "SET lock_timeout = '2s'; DROP TABLE old_users;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG012');
      expect(violation).toBeDefined();
    });

    it('warns when dropping a column', () => {
      const sql = "SET lock_timeout = '2s'; ALTER TABLE users DROP COLUMN phone;";
      const result = linter.lintString(sql);
      const violation = result.violations.find((v) => v.ruleId === 'PG012');
      expect(violation).toBeDefined();
    });
  });
});
