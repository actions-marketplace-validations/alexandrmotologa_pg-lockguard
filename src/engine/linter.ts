import * as fs from 'node:fs';
import { parseSql, type ParsedFile } from '../ast/parser.js';
import { ASTWalker, type ASTVisitorContext } from '../ast/visitor.js';
import { parseDirectives } from '../ast/directives.js';
import { getAllRules, BaseRule, type RuleViolation, type RuleSeverity } from '../rules/index.js';
import { isLockExceeded } from './lock_matrix.js';
import type { Config } from '../config.js';

export interface FileLintResult {
  file: string;
  violations: RuleViolation[];
  hasErrors: boolean;
  hasWarnings: boolean;
  durationMs: number;
}

export interface LintSummary {
  results: FileLintResult[];
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  totalErrors: number;
  totalWarnings: number;
  durationMs: number;
}

export class MigrationLinter {
  private config: Config;
  private rules: BaseRule[];

  constructor(config: Config) {
    this.config = config;
    this.rules = getAllRules();
  }

  /**
   * Lints raw SQL string.
   */
  public lintString(sql: string, filename = 'migration.sql'): FileLintResult {
    const start = performance.now();
    const directives = parseDirectives(sql);

    if (directives.ignoreFile) {
      return {
        file: filename,
        violations: [],
        hasErrors: false,
        hasWarnings: false,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const violations: RuleViolation[] = [];

    let parsed: ParsedFile;
    try {
      parsed = parseSql(sql);
    } catch (err: any) {
      const loc = err.location || { line: 1, column: 1, offset: 0 };
      violations.push({
        ruleId: 'SYNTAX_ERROR',
        ruleName: 'sql-syntax-error',
        file: filename,
        line: loc.line,
        column: loc.column,
        offset: loc.offset,
        lockLevel: 'ACCESS_EXCLUSIVE',
        severity: 'error',
        message: err.message,
        snippet: sql.slice(0, 100).trim(),
      });

      return {
        file: filename,
        violations,
        hasErrors: true,
        hasWarnings: false,
        durationMs: Math.round(performance.now() - start),
      };
    }

    const walker = new ASTWalker();

    // Wire up rules
    for (const rule of this.rules) {
      // Check if rule is globally ignored (case-insensitive)
      const isIgnored = this.config.ignoreRules.some(
        (r) => r.toUpperCase() === rule.id.toUpperCase() || r.toLowerCase() === rule.name.toLowerCase()
      );
      if (isIgnored) {
        continue;
      }

      // Check if PG006 (lock_timeout) is disabled
      if (rule.id === 'PG006' && !this.config.enforceLockTimeout) {
        continue;
      }

      const ruleCfg = this.config.rules[rule.id] || this.config.rules[rule.name] || {};
      const severity: RuleSeverity = ruleCfg.severity || rule.defaultSeverity;

      if (severity === 'off') {
        continue;
      }

      const nodeTypes = rule.targetNodeTypes;
      for (const nodeType of nodeTypes) {
        walker.on(nodeType, (astCtx: ASTVisitorContext) => {
          rule.check({
            ast: astCtx,
            pgVersion: this.config.pgVersion,
            options: ruleCfg.options || {},
            isTableNewInMigration: astCtx.isTableNewInMigration,
            report: (v) => {
              // Check inline comment directives
              if (directives.isRuleDisabled(rule.id, v.line) || directives.isRuleDisabled(rule.name, v.line)) {
                return;
              }

              // Apply max-lock-level filtering: if lock level is below maxLockLevel threshold, downgrade or suppress
              const lockExceeded = isLockExceeded(v.lockLevel, this.config.maxLockLevel);
              const finalSeverity = !lockExceeded && severity === 'error' ? 'warning' : severity;

              violations.push({
                ...v,
                ruleId: rule.id,
                ruleName: rule.name,
                file: filename,
                severity: finalSeverity,
              });
            },
          });
        });
      }
    }

    walker.walk(filename, parsed);

    const hasErrors = violations.some((v) => v.severity === 'error');
    const hasWarnings = violations.some((v) => v.severity === 'warning');

    return {
      file: filename,
      violations,
      hasErrors,
      hasWarnings,
      durationMs: Math.round(performance.now() - start),
    };
  }

  /**
   * Lints a single file from disk.
   */
  public lintFile(filePath: string): FileLintResult {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.lintString(content, filePath);
    } catch (err: any) {
      return {
        file: filePath,
        violations: [
          {
            ruleId: 'FILE_READ_ERROR',
            ruleName: 'file-read-error',
            file: filePath,
            line: 1,
            column: 1,
            offset: 0,
            lockLevel: 'ACCESS_EXCLUSIVE',
            severity: 'error',
            message: `Failed to read file: ${err.message}`,
            snippet: '',
          },
        ],
        hasErrors: true,
        hasWarnings: false,
        durationMs: 0,
      };
    }
  }

  /**
   * Lints multiple files and returns an aggregated summary.
   */
  public lintFiles(filePaths: string[]): LintSummary {
    const start = performance.now();
    const results: FileLintResult[] = [];

    let totalErrors = 0;
    let totalWarnings = 0;
    let passedFiles = 0;
    let failedFiles = 0;

    for (const filePath of filePaths) {
      const res = this.lintFile(filePath);
      results.push(res);

      const errCount = res.violations.filter((v) => v.severity === 'error').length;
      const warnCount = res.violations.filter((v) => v.severity === 'warning').length;

      totalErrors += errCount;
      totalWarnings += warnCount;

      if (res.hasErrors) {
        failedFiles++;
      } else {
        passedFiles++;
      }
    }

    return {
      results,
      totalFiles: filePaths.length,
      passedFiles,
      failedFiles,
      totalErrors,
      totalWarnings,
      durationMs: Math.round(performance.now() - start),
    };
  }
}
