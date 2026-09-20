<div align="center">
  <img src="assets/logo.png" alt="PG Lockguard Logo" width="180" height="180" />
  <h1>PG Lockguard</h1>
  <p><strong>Zero-downtime PostgreSQL DDL lock analyzer and migration linter</strong></p>
  <p>
    <a href="https://github.com/alexandrmotologa/pg-lockguard/actions"><img src="https://img.shields.io/badge/CI-Passing-success?style=flat-square" alt="CI Status" /></a>
    <a href="https://www.npmjs.com/package/pg-lockguard"><img src="https://img.shields.io/npm/v/pg-lockguard?style=flat-square&color=blue" alt="npm version" /></a>
    <a href="https://github.com/alexandrmotologa/pg-lockguard/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>
  </p>
</div>

---

## Overview

In production PostgreSQL systems, executing standard DDL migrations often acquires heavy table locks such as `ACCESS EXCLUSIVE` or `SHARE`. These lock levels conflict with regular application traffic (`SELECT`, `INSERT`, `UPDATE`, `DELETE`). A single unindexed foreign key or non-concurrent index build can queue behind active queries, causing connection pool exhaustion and application timeouts.

`pg-lockguard` is a static analysis command-line tool and CI linter for SQL migration scripts. It parses SQL queries using the official PostgreSQL parser compiled to WebAssembly, inspects lock acquisition levels, and flags dangerous operations before they reach production databases. When a violation occurs, the tool generates safe, multi-step migration recipes.

---

## Installation

```bash
# Global CLI installation
npm install -g pg-lockguard

# Project-level installation
npm install --save-dev pg-lockguard
```

---

## Quick start

Run `pg-lockguard` against your migration directory:

```bash
# Lint all SQL files in the migrations directory
pg-lockguard lint "migrations/**/*.sql"

# Inspect migration with zero-downtime refactoring recipes
pg-lockguard lint "migrations/**/*.sql" --explain

# Output GitHub Actions workflow annotations in CI
pg-lockguard lint "migrations/**/*.sql" --format github

# Emit SARIF v2.1.0 report for the GitHub Security tab
pg-lockguard lint "migrations/**/*.sql" --format sarif > results.sarif
```

---

## Supported rules matrix

| Rule ID | Name | Lock level | Problem summary | Safe alternative recipe |
| :--- | :--- | :--- | :--- | :--- |
| [`PG001`](docs/rules/pg001.md) | `create-index-concurrently` | `SHARE` | Building index blocks concurrent table writes. | Use `CREATE INDEX CONCURRENTLY`. |
| [`PG002`](docs/rules/pg002.md) | `drop-index-concurrently` | `ACCESS EXCLUSIVE` | Dropping index blocks concurrent reads and writes. | Use `DROP INDEX CONCURRENTLY`. |
| [`PG003`](docs/rules/pg003.md) | `add-column-not-null` | `ACCESS EXCLUSIVE` | Adding `NOT NULL` without a constant default rewrites the table. | Add nullable column, backfill in batches, validate constraint. |
| [`PG004`](docs/rules/pg004.md) | `add-foreign-key-not-valid` | `SHARE ROW EXCLUSIVE` | Adding foreign key without `NOT VALID` scans all existing rows under write lock. | Add constraint with `NOT VALID`, then validate in a separate step. |
| [`PG005`](docs/rules/pg005.md) | `alter-column-type` | `ACCESS EXCLUSIVE` | Incompatible type alteration rewrites all rows on disk. | Use dual-write trigger and batch backfill. |
| [`PG006`](docs/rules/pg006.md) | `require-lock-timeout` | `ACCESS EXCLUSIVE` | Missing `lock_timeout` allows DDL to wait indefinitely, blocking new connections. | Prepend `SET lock_timeout = '2s';` to the migration file. |
| [`PG007`](docs/rules/pg007.md) | `add-unique-using-index` | `ACCESS EXCLUSIVE` | Direct unique constraint builds index under full table lock. | Create unique index concurrently, attach with `USING INDEX`. |
| [`PG008`](docs/rules/pg008.md) | `avoid-vacuum-full-cluster` | `ACCESS EXCLUSIVE` | `VACUUM FULL` and `CLUSTER` rewrite entire tables under exclusive lock. | Use routine `VACUUM (ANALYZE)` or `pg_repack`. |
| [`PG009`](docs/rules/pg009.md) | `concurrent-in-transaction` | `SHARE_UPDATE_EXCLUSIVE` | Concurrent operations cannot execute inside a `BEGIN ... COMMIT` block. | Remove transaction wrappers for concurrent migrations. |
| [`PG010`](docs/rules/pg010.md) | `add-check-constraint-not-valid`| `ACCESS EXCLUSIVE` | Direct check constraint scans the table under exclusive lock. | Add constraint with `NOT VALID`, then validate separately. |
| [`PG011`](docs/rules/pg011.md) | `avoid-column-table-rename` | `ACCESS EXCLUSIVE` | Renaming columns or tables breaks in-flight application queries. | Use expand and contract pattern with dual-writing. |
| [`PG012`](docs/rules/pg012.md) | `avoid-destructive-drop` | `ACCESS EXCLUSIVE` | Direct drops break active queries and permanently remove data. | Deprecate in application code first, then drop. |

---

## Safe migration example

### Bad: Standard blocking migration
```sql
-- migration.sql
-- Missing lock_timeout
ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL;
CREATE INDEX idx_users_email ON users (email);
ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id);
```

### Good: Zero-downtime migration
```sql
-- 0001_safe_migration.sql
SET lock_timeout = '2s';

-- 1. Fast metadata default on PostgreSQL 11+
ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT false NOT NULL;

-- 2. Concurrently built index (reads and writes continue uninterrupted)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);

-- 3. Foreign key with instant metadata lock
ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID;
```

```sql
-- 0002_validate_constraints.sql
SET lock_timeout = '2s';

-- 4. Validate foreign key in a separate transaction without blocking writes
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user;
```

---

## Command line options

```text
Usage: pg-lockguard [options] [command]

Commands:
  lint [options] [patterns...]  Lint SQL migration files for lock safety hazards
  explain <ruleId>              Display lock impact and zero-downtime recipe for a rule
  init                          Generate a starter .pg-lockguard.json configuration file

Options:
  --pg-version <version>        Target Postgres version (11, 12, 13, 14, 15, 16, 17) [default: 16]
  --max-lock-level <level>      Fail threshold (ROW_EXCLUSIVE, SHARE, ACCESS_EXCLUSIVE) [default: SHARE]
  --format <format>             pretty, json, github, sarif [default: pretty]
  --enforce-lock-timeout        Require 'SET lock_timeout' in migration files [default: true]
  --no-enforce-lock-timeout     Disable lock_timeout verification
  --ignore-rule <rules...>      Rule IDs to ignore (e.g. PG001,PG004)
  --config <path>               Path to custom configuration file
  --explain                     Print safe refactoring recipes for all violations
  --fail-on-warning             Exit with status code 1 if warnings are found
```

### Exit codes
- `0`: All migration files passed lock safety checks.
- `1`: One or more violations exceeded the configured threshold.
- `2`: Syntax error or file read failure.

---

## Configuration file (`.pg-lockguard.json`)

You can generate a starter configuration file with:

```bash
pg-lockguard init
```

```json
{
  "pgVersion": 16,
  "maxLockLevel": "SHARE",
  "enforceLockTimeout": true,
  "ignoreRules": [],
  "rules": {
    "PG006": {
      "severity": "warning"
    }
  },
  "include": [
    "migrations/**/*.sql"
  ],
  "exclude": [
    "**/node_modules/**",
    "**/dist/**"
  ]
}
```

---

## GitHub Actions setup

Add this workflow to `.github/workflows/pg-lockguard.yml`:

```yaml
name: PostgreSQL Lock Guard

on:
  pull_request:
    paths:
      - 'migrations/**/*.sql'

jobs:
  lint-locks:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pg-lockguard
        run: npm install -g pg-lockguard

      - name: Lint Migration Locks
        run: |
          pg-lockguard lint "migrations/**/*.sql" \
            --format github \
            --max-lock-level SHARE

      - name: Generate SARIF Security Report
        if: always()
        run: |
          pg-lockguard lint "migrations/**/*.sql" \
            --format sarif > pg-lockguard.sarif || true

      - name: Upload SARIF to GitHub Security Tab
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: pg-lockguard.sarif
```

---

## License

MIT © [Alexandr Motologa](https://github.com/alexandrmotologa)
