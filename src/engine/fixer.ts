import { MigrationLinter, type FileLintResult } from './linter.js';
import { DEFAULT_CONFIG, type Config } from '../config.js';

export interface FixDetail {
  ruleId: string;
  line: number;
  description: string;
  original: string;
  replacement: string;
}

export interface FileFixResult {
  file: string;
  fixed: boolean;
  fixes: FixDetail[];
  originalContent: string;
  fixedContent: string;
}

export interface FixOptions {
  lockTimeout?: string;
  rules?: string[]; // specific rules to fix, defaults to all fixable
}

const DEFAULT_LOCK_TIMEOUT = '2s';

/**
 * Auto-fix engine for PostgreSQL migrations.
 * Performs safe, zero-downtime rewrites for supported PG Lockguard rules.
 */
export class Fixer {
  public readonly linter: MigrationLinter;

  constructor(linter?: MigrationLinter, config?: Config) {
    this.linter = linter || new MigrationLinter(config || DEFAULT_CONFIG);
  }

  /**
   * Verifies fixed content with the internal linter.
   */
  public verify(content: string, fileName = 'migration.sql'): FileLintResult {
    return this.linter.lintString(content, fileName);
  }

  /**
   * Fixes SQL content for a given file name or string.
   */
  public fixContent(content: string, fileName = 'migration.sql', options: FixOptions = {}): FileFixResult {
    const lockTimeout = options.lockTimeout || DEFAULT_LOCK_TIMEOUT;
    const allowedRules = options.rules ? new Set(options.rules) : null;
    const fixes: FixDetail[] = [];
    let currentContent = content;

    const canFixRule = (id: string): boolean => {
      return !allowedRules || allowedRules.has(id);
    };

    // 1. Fix PG006: Missing lock_timeout
    if (canFixRule('PG006')) {
      const hasLockTimeout = /SET\s+lock_timeout\s*=\s*['"]?[a-zA-Z0-9_.]+['"]?/i.test(currentContent);
      if (!hasLockTimeout && currentContent.trim().length > 0) {
        const timeoutStmt = `SET lock_timeout = '${lockTimeout}';\n\n`;
        currentContent = timeoutStmt + currentContent;
        fixes.push({
          ruleId: 'PG006',
          line: 1,
          description: `Added 'SET lock_timeout = '${lockTimeout}';' at the top of the migration`,
          original: '',
          replacement: timeoutStmt.trim(),
        });
      }
    }

    // 2. Fix PG001: CREATE INDEX -> CREATE INDEX CONCURRENTLY IF NOT EXISTS
    if (canFixRule('PG001')) {
      // Matches CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON
      // Avoid modifying when CONCURRENTLY is already present
      const createIndexRegex = /\bCREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_".]+)\s+ON\b/gi;
      
      currentContent = currentContent.replace(createIndexRegex, (match, uniqueKeyword, indexName, offset) => {
        const line = currentContent.slice(0, offset).split('\n').length;
        const unique = uniqueKeyword ? 'UNIQUE ' : '';
        const replacement = `CREATE ${unique}INDEX CONCURRENTLY IF NOT EXISTS ${indexName} ON`;
        fixes.push({
          ruleId: 'PG001',
          line,
          description: `Rewrote index creation with CONCURRENTLY IF NOT EXISTS`,
          original: match,
          replacement,
        });
        return replacement;
      });
    }

    // 3. Fix PG002: DROP INDEX -> DROP INDEX CONCURRENTLY IF EXISTS
    if (canFixRule('PG002')) {
      // Matches DROP INDEX [IF EXISTS] name
      // Avoid modifying when CONCURRENTLY is already present
      const dropIndexRegex = /\bDROP\s+INDEX\s+(?!CONCURRENTLY\b)(?:IF\s+EXISTS\s+)?([a-zA-Z0-9_".]+)/gi;

      currentContent = currentContent.replace(dropIndexRegex, (match, indexName, offset) => {
        const line = currentContent.slice(0, offset).split('\n').length;
        const replacement = `DROP INDEX CONCURRENTLY IF EXISTS ${indexName}`;
        fixes.push({
          ruleId: 'PG002',
          line,
          description: `Rewrote index drop with CONCURRENTLY IF EXISTS`,
          original: match,
          replacement,
        });
        return replacement;
      });
    }

    // 4. Fix PG004: ADD FOREIGN KEY without NOT VALID
    if (canFixRule('PG004')) {
      // Matches: ADD CONSTRAINT <name> FOREIGN KEY (...) REFERENCES <table>(...) [on delete/update actions]
      // without NOT VALID at the end
      const addFkRegex = /\bADD\s+CONSTRAINT\s+([a-zA-Z0-9_".]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([a-zA-Z0-9_".]+)\s*\(([^)]+)\)([\s\w\n]*?)(?<!NOT\s+VALID)(\s*;|\s*$)/gi;

      currentContent = currentContent.replace(addFkRegex, (match, name, cols, refTable, refCols, extraActions, terminator, offset) => {
        if (/NOT\s+VALID/i.test(extraActions)) {
          return match;
        }
        const line = currentContent.slice(0, offset).split('\n').length;
        const trimmedExtra = extraActions.trimEnd();
        const replacement = `ADD CONSTRAINT ${name} FOREIGN KEY (${cols}) REFERENCES ${refTable} (${refCols})${trimmedExtra ? ' ' + trimmedExtra.trim() : ''} NOT VALID${terminator}`;
        fixes.push({
          ruleId: 'PG004',
          line,
          description: `Appended NOT VALID to foreign key constraint to avoid full table scan lock`,
          original: match.trim(),
          replacement: replacement.trim(),
        });
        return replacement;
      });
    }

    // 5. Fix PG010: ADD CHECK constraint without NOT VALID
    if (canFixRule('PG010')) {
      const addCheckRegex = /\bADD\s+CONSTRAINT\s+([a-zA-Z0-9_".]+)\s+CHECK\s*\(([\s\S]*?)\)(?<!NOT\s+VALID)(\s*;|\s*$)/gi;

      currentContent = currentContent.replace(addCheckRegex, (match, name, checkExpr, terminator, offset) => {
        if (/NOT\s+VALID/i.test(match)) {
          return match;
        }
        const line = currentContent.slice(0, offset).split('\n').length;
        const replacement = `ADD CONSTRAINT ${name} CHECK (${checkExpr}) NOT VALID${terminator}`;
        fixes.push({
          ruleId: 'PG010',
          line,
          description: `Appended NOT VALID to check constraint to avoid table validation lock`,
          original: match.trim(),
          replacement: replacement.trim(),
        });
        return replacement;
      });
    }

    return {
      file: fileName,
      fixed: fixes.length > 0,
      fixes,
      originalContent: content,
      fixedContent: currentContent,
    };
  }
}
