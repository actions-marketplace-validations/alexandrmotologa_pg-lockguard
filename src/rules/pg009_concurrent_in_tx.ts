import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';

export class Pg009ConcurrentInTxRule extends BaseRule {
  public readonly id = 'PG009';
  public readonly name = 'concurrent-in-transaction';
  public readonly description = 'Concurrent operations (such as CREATE/DROP INDEX CONCURRENTLY) cannot be executed inside a transaction block.';
  public readonly defaultLockLevel: LockLevel = 'SHARE_UPDATE_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'error';
  public readonly targetNodeTypes = ['indexStmt', 'dropStmt', 'vacuumStmt'];

  public check(context: RuleContext): void {
    if (!context.ast.isInTransaction) return;

    const key = context.ast.stmtKey;
    const body = context.ast.stmtBody;

    let isConcurrent = false;
    let operation = '';

    if (key === 'indexStmt' && body.concurrent) {
      isConcurrent = true;
      operation = 'CREATE INDEX CONCURRENTLY';
    } else if (key === 'dropStmt' && body.removeType === 'OBJECT_INDEX' && body.concurrent) {
      isConcurrent = true;
      operation = 'DROP INDEX CONCURRENTLY';
    } else if (key === 'vacuumStmt') {
      isConcurrent = true;
      operation = 'VACUUM';
    }

    if (isConcurrent) {
      context.report({
        lockLevel: this.defaultLockLevel,
        line: context.ast.location.line,
        column: context.ast.location.column,
        offset: context.ast.location.offset,
        message: `${operation} cannot run inside a multi-statement transaction block. PostgreSQL will abort with a runtime error.`,
        snippet: context.ast.snippet,
        recipe: `-- Remove BEGIN / COMMIT wrappers around concurrent DDL migrations:\n${context.ast.snippet}`,
        explanation: `PostgreSQL prohibits running concurrent index or vacuum statements inside transaction blocks because they manage their own two-phase transactions internally. Remove BEGIN / COMMIT from the migration file.`,
      });
    }
  }
}
