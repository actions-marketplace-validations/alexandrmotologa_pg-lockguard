import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';
import {
  isConstantDefaultExpression,
  isVolatileDefaultExpression,
} from '../engine/version_matrix.js';

export class Pg003AddColumnNotNullRule extends BaseRule {
  public readonly id = 'PG003';
  public readonly name = 'add-column-not-null';
  public readonly description = 'Adding a NOT NULL column without a constant default triggers a full table rewrite holding ACCESS EXCLUSIVE lock.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['alterTableStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node || !Array.isArray(node.cmds)) return;

    const table = node.relation?.relname || 'target_table';

    // If table was created in this migration, it is empty and safe to modify
    if (context.isTableNewInMigration(table)) {
      return;
    }

    for (const cmdItem of node.cmds) {
      const cmd = cmdItem.alterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddColumn') continue;

      const colDef = cmd.def?.columnDef;
      if (!colDef) continue;

      const colName = colDef.colname || 'column';
      const constraints = colDef.constraints || [];

      let hasNotNull = false;
      let defaultExpr: any = null;

      for (const cItem of constraints) {
        const c = cItem.constraint;
        if (!c) continue;
        if (c.contype === 'CONSTR_NOTNULL') {
          hasNotNull = true;
        } else if (c.contype === 'CONSTR_DEFAULT') {
          defaultExpr = c.rawExpr;
        }
      }

      if (!hasNotNull) continue;

      // Evaluate PostgreSQL version and default expression
      const isPg11Plus = context.pgVersion >= 11;
      const isConstantDefault = defaultExpr ? isConstantDefaultExpression(defaultExpr) : false;
      const isVolatileDefault = defaultExpr ? isVolatileDefaultExpression(defaultExpr) : false;

      // In PG 11+, a constant default is safe (fast metadata update)
      if (isPg11Plus && isConstantDefault && !isVolatileDefault) {
        continue;
      }

      let reason = '';
      if (!defaultExpr) {
        reason = `Adding NOT NULL column '${colName}' without a DEFAULT value requires a full table rewrite and table scan under ACCESS EXCLUSIVE lock.`;
      } else if (isVolatileDefault) {
        reason = `Default value for '${colName}' uses a volatile function, which prevents PostgreSQL fast-default optimization and forces a full table rewrite under ACCESS EXCLUSIVE lock.`;
      } else if (!isPg11Plus) {
        reason = `PostgreSQL versions prior to 11 do not support fast metadata defaults. Adding column '${colName}' with DEFAULT ... NOT NULL will rewrite the entire table.`;
      } else {
        reason = `Adding NOT NULL column '${colName}' with non-constant default forces a table rewrite.`;
      }

      const typeNames = colDef.typeName?.names || [];
      const colType = typeNames.map((n: any) => n.string?.sval || '').filter(Boolean).join('.') || 'text';

      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: reason,
        snippet: context.ast.snippet,
        recipe: Recipes.addColumnNotNull(table, colName, colType),
        explanation: `In production PostgreSQL environments, full table rewrites block all concurrent reads and writes, leading to connection exhaustion. Add the column as nullable first, backfill rows in batches, then enforce nullability using an unvalidated CHECK constraint validated in a subsequent transaction.`,
      });
    }
  }
}
