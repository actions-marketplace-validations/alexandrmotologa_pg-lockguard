import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg005AlterColumnTypeRule extends BaseRule {
  public readonly id = 'PG005';
  public readonly name = 'alter-column-type';
  public readonly description = 'Changing column types that are not binary-compatible forces a full table rewrite holding ACCESS EXCLUSIVE lock.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['alterTableStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node || !Array.isArray(node.cmds)) return;

    const table = node.relation?.relname || 'target_table';

    for (const cmdItem of node.cmds) {
      const cmd = cmdItem.alterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AlterColumnType') continue;

      const colName = cmd.name || 'column';
      const colDef = cmd.def?.columnDef;
      const typeNames = colDef?.typeName?.names || [];
      const newTypeName = typeNames
        .map((n: any) => n.string?.sval || '')
        .filter((s: string) => s && s !== 'pg_catalog')
        .join('.')
        .toLowerCase();

      // Check if this type modification is inherently safe
      // Note: Changing to text or widening varchar is binary-compatible in PG 9.2+
      // Without schema catalog state, changes between types (like int -> bigint) or to numeric/timestamp require rewrite.
      if (newTypeName === 'text') {
        // Changing varchar/bpchar to text is binary compatible
        continue;
      }

      // Check if typmods specify varchar widening
      if (newTypeName === 'varchar') {
        // If it's varchar with a known positive typmod or unlimited, check if flagged
        // In static analysis without existing table catalog, changing type should warn unless explicit safe annotation
      }

      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `Altering column '${colName}' type to '${newTypeName || 'new_type'}' on table '${table}' may force a full table rewrite under ACCESS EXCLUSIVE lock.`,
        snippet: context.ast.snippet,
        recipe: Recipes.alterColumnType(table, colName, newTypeName || 'new_type'),
        explanation: `Type conversions such as integer to bigint, timestamp to timestamptz, or narrowing varchar lengths cannot be applied in place. PostgreSQL locks the table exclusively and rewrites every row on disk. Use the expand-and-contract dual-write pattern for zero downtime.`,
      });
    }
  }
}
