import { BaseRule } from './base.js';
import { Pg001CreateIndexRule } from './pg001_create_index.js';
import { Pg002DropIndexRule } from './pg002_drop_index.js';
import { Pg003AddColumnNotNullRule } from './pg003_add_column_not_null.js';
import { Pg004AddForeignKeyRule } from './pg004_add_foreign_key.js';
import { Pg005AlterColumnTypeRule } from './pg005_alter_column_type.js';
import { Pg006LockTimeoutRule } from './pg006_lock_timeout.js';
import { Pg007AddUniqueRule } from './pg007_add_unique.js';
import { Pg008VacuumClusterRule } from './pg008_vacuum_cluster.js';
import { Pg009ConcurrentInTxRule } from './pg009_concurrent_in_tx.js';
import { Pg010AddCheckValidRule } from './pg010_add_check_valid.js';
import { Pg011RenameColumnTableRule } from './pg011_rename_column_table.js';
import { Pg012DropColumnTableRule } from './pg012_drop_column_table.js';

export * from './base.js';
export * from './pg001_create_index.js';
export * from './pg002_drop_index.js';
export * from './pg003_add_column_not_null.js';
export * from './pg004_add_foreign_key.js';
export * from './pg005_alter_column_type.js';
export * from './pg006_lock_timeout.js';
export * from './pg007_add_unique.js';
export * from './pg008_vacuum_cluster.js';
export * from './pg009_concurrent_in_tx.js';
export * from './pg010_add_check_valid.js';
export * from './pg011_rename_column_table.js';
export * from './pg012_drop_column_table.js';

/**
 * Returns instantiated array of all available built-in rules.
 */
export function getAllRules(): BaseRule[] {
  return [
    new Pg001CreateIndexRule(),
    new Pg002DropIndexRule(),
    new Pg003AddColumnNotNullRule(),
    new Pg004AddForeignKeyRule(),
    new Pg005AlterColumnTypeRule(),
    new Pg006LockTimeoutRule(),
    new Pg007AddUniqueRule(),
    new Pg008VacuumClusterRule(),
    new Pg009ConcurrentInTxRule(),
    new Pg010AddCheckValidRule(),
    new Pg011RenameColumnTableRule(),
    new Pg012DropColumnTableRule(),
  ];
}
