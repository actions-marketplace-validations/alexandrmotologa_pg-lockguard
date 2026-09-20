import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg002DropIndexRule extends BaseRule {
  public readonly id = 'PG002';
  public readonly name = 'drop-index-concurrently';
  public readonly description = 'DROP INDEX without CONCURRENTLY acquires an ACCESS EXCLUSIVE lock, blocking reads and writes.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['dropStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node) return;

    // Check if this is a DROP INDEX statement
    if (node.removeType === 'OBJECT_INDEX') {
      if (!node.concurrent) {
        let indexName = 'target_index';
        const obj = node.objects?.[0];
        if (obj?.list?.items && obj.list.items.length > 0) {
          const sval = obj.list.items[obj.list.items.length - 1]?.string?.sval;
          if (sval) indexName = sval;
        }

        context.report({
          lockLevel: this.defaultLockLevel,
          line: context.ast.location.line,
          column: context.ast.location.column,
          offset: context.ast.location.offset,
          message: `Dropping index '${indexName}' without CONCURRENTLY acquires an ACCESS EXCLUSIVE lock, blocking all concurrent reads and writes.`,
          snippet: context.ast.snippet,
          recipe: Recipes.dropIndexConcurrently(indexName),
          explanation: `Standard DROP INDEX takes an ACCESS EXCLUSIVE lock on the indexed table until any pending transactions on that table finish. Use DROP INDEX CONCURRENTLY to safely remove the index in two phases without blocking application queries.`,
        });
      }
    }
  }
}
