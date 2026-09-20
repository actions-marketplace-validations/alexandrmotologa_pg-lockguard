import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import { Recipes } from '../engine/recipes.js';

export class Pg001CreateIndexRule extends BaseRule {
  public readonly id = 'PG001';
  public readonly name = 'create-index-concurrently';
  public readonly description = 'CREATE INDEX without CONCURRENTLY blocks all concurrent table writes.';
  public readonly defaultLockLevel: LockLevel = 'SHARE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['indexStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node) return;

    const table = node.relation?.relname || 'target_table';

    // If table was created earlier in the same migration, concurrent traffic does not exist yet
    if (context.isTableNewInMigration(table)) {
      return;
    }

    // Check if index creation is marked CONCURRENTLY
    if (!node.concurrent) {
      const indexName = node.idxname || `idx_${table}`;
      const isUnique = Boolean(node.unique);

      const params = (node.indexParams || [])
        .map((p: any) => p.indexElem?.name || '')
        .filter(Boolean)
        .join(', ') || 'columns';

      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `Building index '${indexName}' on table '${table}' without CONCURRENTLY acquires a SHARE lock, blocking all concurrent writes (INSERT, UPDATE, DELETE).`,
        snippet: context.ast.snippet,
        recipe: Recipes.createIndexConcurrently(table, indexName, params, isUnique),
        explanation: `Standard CREATE INDEX scans the table and builds the index while holding a SHARE lock. Use CREATE ${isUnique ? 'UNIQUE ' : ''}INDEX CONCURRENTLY outside a transaction block to avoid blocking concurrent writes.`,
      });
    }
  }
}
