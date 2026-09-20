import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg007AddUniqueRule extends BaseRule {
  public readonly id = 'PG007';
  public readonly name = 'add-unique-using-index';
  public readonly description = 'Adding a UNIQUE constraint directly acquires an ACCESS EXCLUSIVE lock while building the underlying index.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['alterTableStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node || !Array.isArray(node.cmds)) return;

    const table = node.relation?.relname || 'target_table';

    for (const cmdItem of node.cmds) {
      const cmd = cmdItem.alterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddConstraint') continue;

      const constraint = cmd.def?.constraint;
      if (!constraint || constraint.contype !== 'CONSTR_UNIQUE') continue;

      // If USING INDEX was specified, the index already exists and was built concurrently (instant metadata operation)
      if (constraint.indexname) {
        continue;
      }

      const conName = constraint.conname || `uq_${table}`;
      const keys = (constraint.keys || [])
        .map((k: any) => k.string?.sval || '')
        .filter(Boolean)
        .join(', ') || 'columns';

      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `Adding UNIQUE constraint '${conName}' on '${table}' acquires ACCESS EXCLUSIVE lock while building index.`,
        snippet: context.ast.snippet,
        recipe: Recipes.addUniqueConstraint(table, conName, keys),
        explanation: `Defining a UNIQUE constraint directly in ALTER TABLE requires building a backing unique index while holding an ACCESS EXCLUSIVE lock on the table. Build the unique index first using CREATE UNIQUE INDEX CONCURRENTLY, then attach it with ADD CONSTRAINT ... UNIQUE USING INDEX.`,
      });
    }
  }
}
