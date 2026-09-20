# CI/CD Integration Guide

Run `pg-lockguard` in your continuous integration pipelines to catch blocking DDL locks on pull requests before migrations reach staging or production databases.

---

## 1. GitHub Actions Workflow

Create `.github/workflows/pg-lockguard.yml`:

```yaml
name: PostgreSQL Migration Lock Guard

on:
  pull_request:
    paths:
      - 'migrations/**'
      - 'db/migrations/**'
      - 'prisma/migrations/**'

jobs:
  lint-locks:
    name: Lint DDL Locks
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install pg-lockguard
        run: npm install -g pg-lockguard

      - name: Lint Migration Files (Workflow Annotations)
        run: |
          pg-lockguard lint "migrations/**/*.sql" \
            --format github \
            --pg-version 16 \
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

## 2. Pre-Commit Hook (Husky and lint-staged)

Run `pg-lockguard` locally before committing SQL files:

### In `package.json`:
```json
{
  "lint-staged": {
    "*.sql": [
      "pg-lockguard lint --fail-on-warning"
    ]
  }
}
```

---

## 3. Configuration File (`.pg-lockguard.json`)

Customize rules and thresholds directly in your repository root:

```json
{
  "pgVersion": 16,
  "maxLockLevel": "SHARE",
  "enforceLockTimeout": true,
  "ignoreRules": [],
  "rules": {
    "PG006": {
      "severity": "warning"
    },
    "PG011": {
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
