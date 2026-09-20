# Zero-Downtime PostgreSQL Migration Recipes

This guide documents verified, multi-step migration patterns for modifying production PostgreSQL schemas without acquiring blocking table locks.

---

## 1. Creating an Index Without Downtime

Standard `CREATE INDEX` takes a `SHARE` lock on the table. This blocks all concurrent writes (`INSERT`, `UPDATE`, `DELETE`) until the index build completes.

### The Recipe
Run index creation outside an explicit transaction block with `CONCURRENTLY`:

```sql
-- Safe: reads and writes continue concurrently
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
```

If the index build fails (for example, due to a unique constraint violation or cancelled transaction), PostgreSQL leaves an `INVALID` index behind. To clean it up:

```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_users_email;
```

---

## 2. Adding a NOT NULL Column to an Existing Table

### In PostgreSQL 11 and Newer
If you provide a constant default value (such as a string literal, number, or boolean), PostgreSQL updates table metadata instantly without rewriting existing rows:

```sql
-- Instant metadata operation on PostgreSQL 11+
ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT false NOT NULL;
```

> Warning: If the default value calls a volatile function such as `clock_timestamp()`, `random()`, or `gen_random_uuid()`, PostgreSQL must rewrite every row on disk under an `ACCESS EXCLUSIVE` lock.

### In PostgreSQL 10 and Older, or for Computed/Volatile Defaults
Use a four-step migration sequence:

```sql
-- Step 1 (Transaction 1): Add column as nullable
ALTER TABLE users ADD COLUMN created_day DATE;

-- Step 2 (Outside transaction, in batches): Backfill historical data
UPDATE users SET created_day = CURRENT_DATE WHERE created_day IS NULL;

-- Step 3 (Transaction 2): Add check constraint with NOT VALID
ALTER TABLE users ADD CONSTRAINT chk_users_created_day_not_null CHECK (created_day IS NOT NULL) NOT VALID;

-- Step 4 (Transaction 3): Validate the constraint
ALTER TABLE users VALIDATE CONSTRAINT chk_users_created_day_not_null;
```

---

## 3. Adding a Foreign Key Constraint

Adding a foreign key without `NOT VALID` forces PostgreSQL to sequentially scan the target table to verify all existing rows under a `SHARE ROW EXCLUSIVE` lock.

### The Recipe
Split the operation across two transactions:

```sql
-- Step 1 (Transaction 1): Add foreign key with NOT VALID (instant metadata lock)
ALTER TABLE orders ADD CONSTRAINT fk_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;

-- Step 2 (Transaction 2): Validate constraint without blocking concurrent writes
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_user_id;
```

---

## 4. Adding a Unique Constraint

`ALTER TABLE ... ADD CONSTRAINT ... UNIQUE` takes an `ACCESS EXCLUSIVE` lock while building the underlying unique index.

### The Recipe
Build the index concurrently first, then attach it to the constraint:

```sql
-- Step 1 (Outside transaction): Build unique index concurrently
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_uq ON users (email);

-- Step 2 (Transaction): Attach the existing index as a constraint
ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE USING INDEX idx_users_email_uq;
```

---

## 5. Modifying Column Types (Expand and Contract Pattern)

Changing a column type from `integer` to `bigint` or changing numeric precision rewrites the table on disk under an `ACCESS EXCLUSIVE` lock.

### The Recipe
```sql
-- Step 1: Add new column
ALTER TABLE payments ADD COLUMN amount_cents_v2 BIGINT;

-- Step 2: Create a sync trigger to dual-write inserts and updates
CREATE OR REPLACE FUNCTION tf_payments_sync_amount() RETURNS trigger AS $$
BEGIN
  NEW.amount_cents_v2 := NEW.amount_cents::bigint;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_sync_amount
BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION tf_payments_sync_amount();

-- Step 3: Backfill historical rows in small batches
UPDATE payments SET amount_cents_v2 = amount_cents::bigint WHERE amount_cents_v2 IS NULL;

-- Step 4: Deploy application code to read from amount_cents_v2
-- Step 5: Drop the old trigger and column in a later release
```

---

## 6. Dropping an Index Safely

Standard `DROP INDEX` takes an `ACCESS EXCLUSIVE` lock on the indexed table.

### The Recipe
```sql
-- Drop index concurrently without blocking active queries
DROP INDEX CONCURRENTLY IF EXISTS idx_orders_created_at;
```
