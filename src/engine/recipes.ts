/**
 * Safe Zero-Downtime PostgreSQL Multi-Step Migration Recipes.
 */

export const Recipes = {
  /**
   * Safe index creation recipe.
   */
  createIndexConcurrently(table: string, indexName: string, columns: string, isUnique = false): string {
    const uniqueKw = isUnique ? 'UNIQUE ' : '';
    return [
      `-- Step 1: Create the index concurrently outside an explicit transaction block`,
      `CREATE ${uniqueKw}INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${table} (${columns});`,
    ].join('\n');
  },

  /**
   * Safe index drop recipe.
   */
  dropIndexConcurrently(indexName: string): string {
    return [
      `-- Step 1: Drop the index concurrently without holding ACCESS EXCLUSIVE lock`,
      `DROP INDEX CONCURRENTLY IF EXISTS ${indexName};`,
    ].join('\n');
  },

  /**
   * Safe ADD COLUMN NOT NULL recipe for legacy Postgres or volatile defaults.
   */
  addColumnNotNull(table: string, column: string, type: string, defaultValue?: string): string {
    const steps = [
      `-- Step 1: Add column as nullable (instant metadata operation)`,
      `ALTER TABLE ${table} ADD COLUMN ${column} ${type};`,
      ``,
    ];

    if (defaultValue) {
      steps.push(
        `-- Step 2: Backfill existing rows in batches to avoid long lock durations`,
        `UPDATE ${table} SET ${column} = ${defaultValue} WHERE ${column} IS NULL;`,
        ``
      );
    }

    steps.push(
      `-- Step 3: Add NOT VALID check constraint (instant metadata lock)`,
      `ALTER TABLE ${table} ADD CONSTRAINT chk_${table}_${column}_not_null CHECK (${column} IS NOT NULL) NOT VALID;`,
      ``,
      `-- Step 4: Validate constraint in a separate transaction (does NOT block concurrent reads/writes)`,
      `ALTER TABLE ${table} VALIDATE CONSTRAINT chk_${table}_${column}_not_null;`
    );

    return steps.join('\n');
  },

  /**
   * Safe Foreign Key constraint recipe.
   */
  addForeignKey(
    table: string,
    constraintName: string,
    column: string,
    targetTable: string,
    targetColumn: string
  ): string {
    return [
      `-- Step 1: Add foreign key constraint with NOT VALID (instant metadata lock, no table scan)`,
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${column}) REFERENCES ${targetTable}(${targetColumn}) NOT VALID;`,
      ``,
      `-- Step 2: Validate constraint in a separate transaction (reads & writes remain active)`,
      `ALTER TABLE ${table} VALIDATE CONSTRAINT ${constraintName};`,
    ].join('\n');
  },

  /**
   * Safe column type change recipe (Dual-write expand/contract pattern).
   */
  alterColumnType(table: string, column: string, newType: string): string {
    const newCol = `${column}_new`;
    return [
      `-- Step 1: Add new column with the target type`,
      `ALTER TABLE ${table} ADD COLUMN ${newCol} ${newType};`,
      ``,
      `-- Step 2: Create a sync trigger to dual-write new and updated values`,
      `CREATE OR REPLACE FUNCTION tf_${table}_sync_${column}() RETURNS trigger AS $$`,
      `BEGIN`,
      `  NEW.${newCol} := NEW.${column}::${newType};`,
      `  RETURN NEW;`,
      `END;`,
      `$$ LANGUAGE plpgsql;`,
      ``,
      `CREATE TRIGGER trg_${table}_sync_${column}`,
      `BEFORE INSERT OR UPDATE ON ${table}`,
      `FOR EACH ROW EXECUTE FUNCTION tf_${table}_sync_${column}();`,
      ``,
      `-- Step 3: Backfill historical rows in small batches`,
      `UPDATE ${table} SET ${newCol} = ${column}::${newType} WHERE ${newCol} IS NULL;`,
      ``,
      `-- Step 4: Swap columns or redirect application queries`,
    ].join('\n');
  },

  /**
   * Safe Unique constraint recipe.
   */
  addUniqueConstraint(table: string, constraintName: string, columns: string): string {
    const indexName = `idx_${table}_${constraintName}`;
    return [
      `-- Step 1: Build a unique index concurrently (does NOT block concurrent writes)`,
      `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON ${table} (${columns});`,
      ``,
      `-- Step 2: Attach the pre-built index as a unique constraint (instant metadata update)`,
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} UNIQUE USING INDEX ${indexName};`,
    ].join('\n');
  },

  /**
   * Safe CHECK constraint recipe.
   */
  addCheckConstraint(table: string, constraintName: string, checkExpression: string): string {
    return [
      `-- Step 1: Add constraint with NOT VALID (instant metadata lock)`,
      `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} CHECK (${checkExpression}) NOT VALID;`,
      ``,
      `-- Step 2: Validate constraint in a separate transaction (does NOT block concurrent reads/writes)`,
      `ALTER TABLE ${table} VALIDATE CONSTRAINT ${constraintName};`,
    ].join('\n');
  },

  /**
   * Safe column rename recipe.
   */
  renameColumn(table: string, oldCol: string, newCol: string): string {
    return [
      `-- Renaming column '${oldCol}' on table '${table}' breaks in-flight application queries immediately.`,
      `-- Recommended approach:`,
      `-- 1. Add '${newCol}' alongside '${oldCol}' on '${table}'.`,
      `-- 2. Dual-write via trigger or application model.`,
      `-- 3. Deploy updated application code to read from '${newCol}'.`,
      `-- 4. Deprecate and drop '${oldCol}'.`,
    ].join('\n');
  },

  /**
   * Safe column drop recipe.
   */
  dropColumn(table: string, column: string): string {
    return [
      `-- Ensure the application has stopped referencing '${column}' before dropping.`,
      `-- Alternatively, mark the column as hidden or ignore it in the ORM first.`,
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column};`,
    ].join('\n');
  },
};
