import type { ASTVisitorContext } from '../ast/visitor.js';
import type { LockLevel } from '../engine/lock_matrix.js';
import type { PostgresVersion } from '../engine/version_matrix.js';

export type RuleSeverity = 'error' | 'warning' | 'info' | 'off';

export interface RuleViolation {
  ruleId: string;
  ruleName: string;
  file: string;
  line: number;
  column: number;
  offset: number;
  lockLevel: LockLevel;
  severity: RuleSeverity;
  message: string;
  snippet: string;
  recipe?: string;
  explanation?: string;
}

export interface RuleOptions {
  severity?: RuleSeverity;
  [key: string]: any;
}

export interface RuleContext {
  ast: ASTVisitorContext;
  pgVersion: PostgresVersion;
  options: RuleOptions;
  isTableNewInMigration: (tableName: string) => boolean;
  report: (violation: Omit<RuleViolation, 'ruleId' | 'ruleName' | 'severity' | 'file'>) => void;
}

export abstract class BaseRule {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly defaultLockLevel: LockLevel;
  public abstract readonly defaultSeverity: RuleSeverity;

  /**
   * Node types this rule listens to (e.g. 'indexStmt', 'alterTableStmt', '*').
   */
  public abstract readonly targetNodeTypes: string[];

  /**
   * Main check function executed on matching AST nodes.
   */
  public abstract check(context: RuleContext): void;
}
