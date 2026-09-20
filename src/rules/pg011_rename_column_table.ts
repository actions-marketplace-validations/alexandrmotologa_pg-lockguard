import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg011RenameColumnTableRule extends BaseRule {
  public readonly id = 'PG011';
  public readonly name = 'avoid-column-table-rename';
  public readonly description = 'Renaming columns or tables acquires an ACCESS EXCLUSIVE lock and immediately breaks active application queries.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'warning';
  public readonly targetNodeTypes = ['renameStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node) return;

    const renameType = node.renameType;
    const isColumn = renameType === 'OBJECT_COLUMN';
    const isTable = renameType === 'OBJECT_TABLE';

    if (isColumn || isTable) {
      const entity = isColumn ? 'Column' : 'Table';
      const oldName = isColumn ? (node.subname || 'old_col') : (node.relation?.relname || 'old_table');
      const newName = node.newname || 'new_name';
      const table = node.relation?.relname || 'target_table';

      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `Renaming ${entity.toLowerCase()} '${oldName}' to '${newName}' acquires an ACCESS EXCLUSIVE lock and immediately breaks running queries.`,
        snippet: context.ast.snippet,
        recipe: Recipes.renameColumn(table, oldName, newName),
        explanation: `In production systems with rolling deployments, running application instances will continue querying '${oldName}' and fail with runtime database errors until new code is fully deployed. Use the expand-and-contract pattern instead.`,
      });
    }
  }
}
