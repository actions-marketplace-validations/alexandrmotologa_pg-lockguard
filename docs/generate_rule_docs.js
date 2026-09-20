import * as fs from 'node:fs';
import * as path from 'node:path';

const outDir = path.resolve('docs/rules');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const rules = [
  {
    id: 'pg002',
    title: 'PG002: DROP INDEX without CONCURRENTLY',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Dropping an index without CONCURRENTLY takes an ACCESS EXCLUSIVE lock on the indexed table until any pending transactions referencing that table finish, blocking all concurrent queries.',
    bad: 'DROP INDEX idx_users_email;',
    good: '-- Step 1: Drop index concurrently outside a transaction block\nDROP INDEX CONCURRENTLY IF EXISTS idx_users_email;'
  },
  {
    id: 'pg003',
    title: 'PG003: ADD COLUMN NOT NULL without Constant Default',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Adding a NOT NULL column without a constant default on existing tables forces PostgreSQL to rewrite every row on disk while holding an ACCESS EXCLUSIVE lock.',
    bad: 'ALTER TABLE users ADD COLUMN score INT NOT NULL;',
    good: '-- Step 1: Add column as nullable\nALTER TABLE users ADD COLUMN score INT;\n\n-- Step 2: Backfill historical rows in small batches\nUPDATE users SET score = 0 WHERE score IS NULL;\n\n-- Step 3: Add NOT VALID check constraint (instant metadata update)\nALTER TABLE users ADD CONSTRAINT chk_users_score_not_null CHECK (score IS NOT NULL) NOT VALID;\n\n-- Step 4: Validate constraint in a separate transaction\nALTER TABLE users VALIDATE CONSTRAINT chk_users_score_not_null;'
  },
  {
    id: 'pg004',
    title: 'PG004: ADD FOREIGN KEY without NOT VALID',
    lock: 'SHARE ROW EXCLUSIVE',
    problem: 'Adding a foreign key constraint without NOT VALID forces PostgreSQL to sequentially scan the target table to verify all existing rows, blocking concurrent updates and deletes.',
    bad: 'ALTER TABLE orders ADD CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id);',
    good: '-- Step 1: Add foreign key with NOT VALID (instant metadata lock, no table scan)\nALTER TABLE orders ADD CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;\n\n-- Step 2: Validate constraint in a separate transaction (reads and writes remain active)\nALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user_id;'
  },
  {
    id: 'pg005',
    title: 'PG005: Incompatible Column Type Alteration',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Changing a column type to a non-binary-compatible type (such as integer to bigint or numeric precision changes) requires PostgreSQL to rewrite every row on disk under an ACCESS EXCLUSIVE lock.',
    bad: 'ALTER TABLE users ALTER COLUMN id TYPE bigint;',
    good: '-- Step 1: Add new column\nALTER TABLE users ADD COLUMN id_new bigint;\n\n-- Step 2: Dual-write trigger for new rows\nCREATE OR REPLACE FUNCTION tf_sync_id() RETURNS trigger AS $$\nBEGIN\n  NEW.id_new := NEW.id::bigint;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\n-- Step 3: Backfill historical data in batches\nUPDATE users SET id_new = id::bigint WHERE id_new IS NULL;\n\n-- Step 4: Swap columns'
  },
  {
    id: 'pg006',
    title: 'PG006: Missing SET lock_timeout',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'DDL migrations without an explicit lock_timeout will wait indefinitely behind active long-running queries, queuing up behind them and blocking all subsequent incoming queries on the table.',
    bad: '-- Missing lock_timeout at the top of migration file\nALTER TABLE users ADD COLUMN bio text;',
    good: '-- Add fast-fail lock timeout at the top of every migration file\nSET lock_timeout = \'2s\';\n\nALTER TABLE users ADD COLUMN bio text;'
  },
  {
    id: 'pg007',
    title: 'PG007: ADD CONSTRAINT UNIQUE without Pre-Built Index',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Adding a UNIQUE constraint directly requires building a backing unique index while holding an ACCESS EXCLUSIVE lock on the table, blocking all concurrent operations.',
    bad: 'ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);',
    good: '-- Step 1: Create unique index concurrently\nCREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_uq ON users (email);\n\n-- Step 2: Attach the pre-built index as a unique constraint (instant metadata update)\nALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE USING INDEX idx_users_email_uq;'
  },
  {
    id: 'pg008',
    title: 'PG008: VACUUM FULL or CLUSTER Statement',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'VACUUM FULL and CLUSTER rewrite entire tables to disk while holding an ACCESS EXCLUSIVE lock, blocking all concurrent reads and writes for the entire duration.',
    bad: 'VACUUM FULL users;',
    good: '-- Routine maintenance (non-blocking vacuum):\nVACUUM (ANALYZE) users;\n\n-- Online table repacking without exclusive locks:\n-- Use external utility pg_repack instead.'
  },
  {
    id: 'pg009',
    title: 'PG009: Concurrent DDL in Explicit Transaction',
    lock: 'SHARE_UPDATE_EXCLUSIVE',
    problem: 'PostgreSQL does not permit concurrent operations like CREATE INDEX CONCURRENTLY or DROP INDEX CONCURRENTLY inside multi-statement transaction blocks (BEGIN ... COMMIT).',
    bad: 'BEGIN;\nCREATE INDEX CONCURRENTLY idx_users ON users (id);\nCOMMIT;',
    good: '-- Remove BEGIN / COMMIT wrappers for concurrent migrations:\nCREATE INDEX CONCURRENTLY idx_users ON users (id);'
  },
  {
    id: 'pg010',
    title: 'PG010: ADD CHECK Constraint without NOT VALID',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Adding a CHECK constraint without NOT VALID locks the table for full sequential validation across all existing rows under an ACCESS EXCLUSIVE lock.',
    bad: 'ALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18);',
    good: '-- Step 1: Add constraint with NOT VALID (instant metadata lock)\nALTER TABLE users ADD CONSTRAINT chk_age CHECK (age >= 18) NOT VALID;\n\n-- Step 2: Validate constraint in a separate transaction\nALTER TABLE users VALIDATE CONSTRAINT chk_age;'
  },
  {
    id: 'pg011',
    title: 'PG011: Direct Column or Table Rename',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Renaming a column or table acquires an ACCESS EXCLUSIVE lock and immediately breaks active in-flight application queries referencing the previous identifier.',
    bad: 'ALTER TABLE users RENAME COLUMN first_name TO given_name;',
    good: '-- Use the expand/contract pattern:\n-- 1. Add \'given_name\' column\n-- 2. Dual-write to both columns\n-- 3. Deploy updated application code reading from \'given_name\'\n-- 4. Drop \'first_name\''
  },
  {
    id: 'pg012',
    title: 'PG012: Direct DROP TABLE or DROP COLUMN',
    lock: 'ACCESS EXCLUSIVE',
    problem: 'Dropping a table or column takes an instant ACCESS EXCLUSIVE lock and permanently deletes the schema element, breaking any active queries that have not yet refreshed.',
    bad: 'ALTER TABLE users DROP COLUMN phone;',
    good: '-- 1. Mark column as ignored in application ORM models\n-- 2. Deploy updated application servers\n-- 3. Run DROP COLUMN migration after observing zero traffic to that column:\nALTER TABLE users DROP COLUMN IF EXISTS phone;'
  }
];

for (const rule of rules) {
  const content = `# ${rule.title}

## Lock Level Acquired
\`${rule.lock}\`

## Problem
${rule.problem}

## Dangerous Pattern
\`\`\`sql
${rule.bad}
\`\`\`

## Safe Zero-Downtime Recipe
\`\`\`sql
${rule.good}
\`\`\`
`;
  fs.writeFileSync(path.join(outDir, `${rule.id}.md`), content, 'utf-8');
}

console.log(`Generated ${rules.length} rule documents in docs/rules/`);
