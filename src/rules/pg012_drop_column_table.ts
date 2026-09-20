import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg012DropColumnTableRule extends BaseRule {
  public readonly id = 'PG012';
  public readonly name = 'avoid-destructive-drop';
  public readonly description = 'Dropping tables or columns acquires an ACCESS EXCLUSIVE lock and permanently removes active schema elements.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'warning';
  public readonly targetNodeTypes = ['alterTableStmt', 'dropStmt'];

  public check(context: RuleContext): void {
    const key = context.ast.stmtKey;
    const body = context.ast.stmtBody;
    if (!body) return;

    if (key === 'dropStmt' && body.removeType === 'OBJECT_TABLE') {
      let tableName = 'target_table';
      const obj = body.objects?.[0];
      if (obj?.list?.items && obj.list.items.length > 0) {
        const sval = obj.list.items[obj.list.items.length - 1]?.string?.sval;
        if (sval) tableName = sval;
      }

      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `Dropping table '${tableName}' acquires an ACCESS EXCLUSIVE lock and immediately breaks any queries referencing it.`,
        snippet: context.ast.snippet,
        recipe: `-- Ensure table '${tableName}' has zero remaining traffic and deprecation window has elapsed:\nDROP TABLE IF EXISTS ${tableName};`,
        explanation: `Dropping a table takes an ACCESS EXCLUSIVE lock and is irreversible. Verify that no active application services or read replicas are running queries against this table.`,
      });
      return;
    }

    if (key === 'alterTableStmt' && Array.isArray(body.cmds)) {
      const table = body.relation?.relname || 'target_table';
      for (const cmdItem of body.cmds) {
        const cmd = cmdItem.alterTableCmd;
        if (cmd?.subtype === 'AT_DropColumn') {
          const colName = cmd.name || 'column';
          context.report({
            lockLevel: this.defaultLockLevel,
            line: context.ast.location.line,
            column: context.ast.location.column,
            offset: context.ast.location.offset,
            message: `Dropping column '${colName}' on '${table}' acquires an ACCESS EXCLUSIVE lock and breaks active application queries.`,
            snippet: context.ast.snippet,
            recipe: Recipes.dropColumn(table, colName),
            explanation: `Ensure that all application servers have deployed code that no longer references column '${colName}' before running this drop migration.`,
          });
        }
      }
    }
  }
}
