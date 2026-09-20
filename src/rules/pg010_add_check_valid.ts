import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg010AddCheckValidRule extends BaseRule {
  public readonly id = 'PG010';
  public readonly name = 'add-check-constraint-not-valid';
  public readonly description = 'Adding a CHECK constraint without NOT VALID locks the table for full validation against existing rows.';
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
      if (!constraint || constraint.contype !== 'CONSTR_CHECK') continue;

      // Check if validation was skipped (NOT VALID)
      if (!constraint.skipValidation) {
        const conName = constraint.conname || `chk_${table}`;
        context.report({
          lockLevel: this.defaultLockLevel,
          line: context.ast.location.line,
          column: context.ast.location.column,
          offset: context.ast.location.offset,
          message: `Adding CHECK constraint '${conName}' on '${table}' without NOT VALID holds ACCESS EXCLUSIVE lock during table verification.`,
          snippet: context.ast.snippet,
          recipe: Recipes.addCheckConstraint(table, conName, '/* condition */'),
          explanation: `Adding a CHECK constraint without NOT VALID causes PostgreSQL to hold an ACCESS EXCLUSIVE lock while checking every existing row. Add the constraint with NOT VALID first, then validate it in a separate transaction.`,
        });
      }
    }
  }
}
