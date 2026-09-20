import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';

export class Pg008VacuumClusterRule extends BaseRule {
  public readonly id = 'PG008';
  public readonly name = 'avoid-vacuum-full-cluster';
  public readonly description = 'VACUUM FULL and CLUSTER rewrite entire tables while holding an ACCESS EXCLUSIVE lock.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['vacuumStmt', 'clusterStmt'];

  public check(context: RuleContext): void {
    const node = context.ast.stmtBody;
    if (!node) return;

    if (context.ast.stmtKey === 'clusterStmt') {
      const table = node.relation?.relname || 'table';
      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `Executing CLUSTER on '${table}' acquires an ACCESS EXCLUSIVE lock and rewrites the table.`,
        snippet: context.ast.snippet,
        recipe: `-- Consider using pg_repack or an off-peak maintenance window.\n-- Standard maintenance: VACUUM ANALYZE ${table};`,
        explanation: `CLUSTER rewrites the entire table according to the index order while holding an ACCESS EXCLUSIVE lock. All concurrent application reads and writes will be blocked for the duration.`,
      });
      return;
    }

    if (context.ast.stmtKey === 'vacuumStmt') {
      const isFull = (node.options || []).some(
        (opt: any) => opt.defElem?.defname?.toLowerCase() === 'full'
      );

      if (isFull) {
        const table = node.rels?.[0]?.vacuumRelation?.relation?.relname || 'table';
        context.report({
          lockLevel: this.defaultLockLevel,
          line: context.ast.location.line,
          column: context.ast.location.column,
          offset: context.ast.location.offset,
          message: `VACUUM FULL on '${table}' rewrites the table while holding an ACCESS EXCLUSIVE lock.`,
          snippet: context.ast.snippet,
          recipe: `-- For zero-downtime table repacking, use pg_repack.\n-- For routine maintenance, use non-blocking vacuum:\nVACUUM (ANALYZE) ${table};`,
          explanation: `VACUUM FULL rebuilds table contents into a new disk file under an ACCESS EXCLUSIVE lock, blocking all concurrent transactions. For online table compaction, consider pg_repack or autovacuum tuning.`,
        });
      }
    }
  }
}
