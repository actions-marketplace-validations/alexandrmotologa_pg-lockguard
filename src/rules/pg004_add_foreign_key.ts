import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg004AddForeignKeyRule extends BaseRule {
  public readonly id = 'PG004';
  public readonly name = 'add-foreign-key-not-valid';
  public readonly description = 'Adding a FOREIGN KEY constraint without NOT VALID locks the table for validation against all existing rows.';
  public readonly defaultLockLevel: LockLevel = 'SHARE_ROW_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['alterTableStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node || !Array.isArray(node.cmds)) return;

    const table = node.relation?.relname || 'target_table';

    // If source table is newly created in this migration, scan is instantaneous on 0 rows
    if (context.isTableNewInMigration(table)) {
      return;
    }

    for (const cmdItem of node.cmds) {
      const cmd = cmdItem.alterTableCmd;
      if (!cmd || cmd.subtype !== 'AT_AddConstraint') continue;

      const constraint = cmd.def?.constraint;
      if (!constraint || constraint.contype !== 'CONSTR_FOREIGN') continue;

      // Check if validation is skipped (i.e. NOT VALID was specified)
      if (!constraint.skipValidation) {
        const conName = constraint.conname || `fk_${table}`;
        const fkAttr = constraint.fkAttrs?.[0]?.string?.sval || 'col_id';
        const pkTable = constraint.pktable?.relname || 'parent_table';
        const pkAttr = constraint.pkAttrs?.[0]?.string?.sval || 'id';

        context.report({
          lockLevel: this.defaultLockLevel,
          line: context.ast.location.line,
          column: context.ast.location.column,
          offset: context.ast.location.offset,
          message: `Adding FOREIGN KEY '${conName}' on '${table}' without NOT VALID acquires SHARE ROW EXCLUSIVE lock and blocks concurrent writes during table validation.`,
          snippet: context.ast.snippet,
          recipe: Recipes.addForeignKey(table, conName, fkAttr, pkTable, pkAttr),
          explanation: `Adding a foreign key without NOT VALID causes PostgreSQL to immediately scan the entire table to verify referential integrity, holding a SHARE ROW EXCLUSIVE lock. Split this into two steps: add the constraint with NOT VALID (instant metadata update), then validate it in a separate transaction using VALIDATE CONSTRAINT.`,
        });
      }
    }
  }
}
