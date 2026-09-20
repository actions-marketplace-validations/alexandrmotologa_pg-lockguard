import { BaseRule, type RuleContext, type RuleSeverity } from './base.js';
import type { LockLevel } from '../engine/lock_matrix.js';

export class Pg006LockTimeoutRule extends BaseRule {
  public readonly id = 'PG006';
  public readonly name = 'require-lock-timeout';
  public readonly description = 'Migration files should set lock_timeout to prevent queued DDL statements from starving connection pools.';
  public readonly defaultLockLevel: LockLevel = 'ACCESS_EXCLUSIVE';
  public readonly defaultSeverity: RuleSeverity = 'warning';
  public readonly targetNodeTypes = ['*'];

  public check(context: RuleContext): void {
    // Only inspect once per file on the first statement
    if (context.ast.statementIndex !== 0) return;

    const stmts = context.ast.parsed.stmts;
    let hasLockTimeout = false;

    // Inspect initial statements for SET lock_timeout
    for (const raw of stmts) {
      const varSet = raw.stmt?.variableSetStmt;
      if (varSet && varSet.name?.toLowerCase() === 'lock_timeout') {
        hasLockTimeout = true;
        break;
      }
    }

    if (!hasLockTimeout) {
      context.report({
        lockLevel: this.defaultLockLevel,
        line: 1,
        column: 1,
        offset: 0,
        message: `Migration file does not configure 'SET lock_timeout'. A queued DDL statement can block incoming application connections.`,
        snippet: context.ast.parsed.content.slice(0, 100).trim(),
        recipe: `SET lock_timeout = '2s';\n-- Add at the very beginning of the migration file`,
        explanation: `When a DDL statement requests a heavy lock, PostgreSQL queues it behind currently running queries and blocks ALL subsequent queries on that table. Setting 'lock_timeout' ensures the migration fails fast if it cannot acquire locks immediately, protecting your connection pool.`,
      });
    }
  }
}
