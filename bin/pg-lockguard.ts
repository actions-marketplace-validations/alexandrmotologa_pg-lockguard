#!/usr/bin/env node

import { Command } from 'commander';
import { glob } from 'glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js';
import { MigrationLinter } from '../src/engine/linter.js';
import { reportTerminal } from '../src/reporters/terminal.js';
import { reportGitHub } from '../src/reporters/github.js';
import { reportSarif } from '../src/reporters/sarif.js';
import { reportJson } from '../src/reporters/json.js';
import { getAllRules } from '../src/rules/index.js';
import type { LockLevel } from '../src/engine/lock_matrix.js';
import type { PostgresVersion } from '../src/engine/version_matrix.js';

const program = new Command();

program
  .name('pg-lockguard')
  .description('Zero-downtime PostgreSQL DDL lock analyzer and migration linter')
  .version('1.0.0');

// LINT COMMAND
program
  .command('lint')
  .description('Lint SQL migration files for lock safety hazards')
  .argument('[patterns...]', 'File paths or glob patterns to lint (e.g. migrations/*.sql)')
  .option('--pg-version <version>', 'Target Postgres version (11-17)', (val) => parseInt(val, 10))
  .option(
    '--max-lock-level <level>',
    'Fail threshold lock level (ROW_EXCLUSIVE, SHARE, ACCESS_EXCLUSIVE, etc.)'
  )
  .option('--format <format>', 'Output format (pretty, json, github, sarif)', 'pretty')
  .option('--enforce-lock-timeout', 'Enforce SET lock_timeout at top of file', true)
  .option('--no-enforce-lock-timeout', 'Disable SET lock_timeout enforcement')
  .option('--ignore-rule <rules...>', 'Comma-separated rule IDs to ignore (e.g. PG001,PG004)')
  .option('--config <path>', 'Path to custom configuration file')
  .option('--explain', 'Print safe zero-downtime multi-step recipes for detected violations', false)
  .option('--fail-on-warning', 'Exit with code 1 if warnings are found', false)
  .action(async (patterns, options) => {
    try {
      const baseConfig = loadConfig(options.config);

      // Merge CLI options over baseConfig
      const pgVersion = (options.pgVersion || baseConfig.pgVersion) as PostgresVersion;
      const maxLockLevel = (options.maxLockLevel || baseConfig.maxLockLevel) as LockLevel;
      const enforceLockTimeout = options.enforceLockTimeout !== undefined ? options.enforceLockTimeout : baseConfig.enforceLockTimeout;

      let ignoreRules = [...baseConfig.ignoreRules];
      if (options.ignoreRule) {
        const cliRules = Array.isArray(options.ignoreRule)
          ? options.ignoreRule.flatMap((r: string) => r.split(',')).map((r: string) => r.trim())
          : String(options.ignoreRule).split(',').map((r) => r.trim());
        ignoreRules = [...ignoreRules, ...cliRules];
      }

      const activeConfig = {
        ...baseConfig,
        pgVersion,
        maxLockLevel,
        enforceLockTimeout,
        ignoreRules,
      };

      // Resolve file targets
      const targetPatterns = patterns && patterns.length > 0 ? patterns : activeConfig.include;
      const matchedFiles = new Set<string>();

      for (const pattern of targetPatterns) {
        // If exact file path exists, add directly
        if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
          matchedFiles.add(path.resolve(pattern));
          continue;
        }

        const files = await glob(pattern, {
          ignore: activeConfig.exclude,
          nodir: true,
        });

        for (const file of files) {
          matchedFiles.add(path.resolve(file));
        }
      }

      const fileList = Array.from(matchedFiles);

      if (fileList.length === 0) {
        if (options.format === 'pretty') {
          console.log(`No SQL files found matching pattern(s): ${targetPatterns.join(', ')}`);
        }
        process.exitCode = 0;
        return;
      }

      const linter = new MigrationLinter(activeConfig);
      const summary = linter.lintFiles(fileList);

      // Render output format
      switch (options.format.toLowerCase()) {
        case 'json':
          console.log(reportJson(summary));
          break;
        case 'github':
          console.log(reportGitHub(summary));
          break;
        case 'sarif':
          console.log(reportSarif(summary));
          break;
        case 'pretty':
        default:
          console.log(reportTerminal(summary, options.explain));
          break;
      }

      // Exit codes:
      // Check syntax errors first
      const hasSyntaxErrors = summary.results.some((r) =>
        r.violations.some((v) => v.ruleId === 'SYNTAX_ERROR' || v.ruleId === 'FILE_READ_ERROR')
      );

      if (hasSyntaxErrors) {
        process.exitCode = 2;
        return;
      }

      if (summary.totalErrors > 0) {
        process.exitCode = 1;
        return;
      }

      if (options.failOnWarning && summary.totalWarnings > 0) {
        process.exitCode = 1;
        return;
      }

      process.exitCode = 0;
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 2;
    }
  });

// EXPLAIN COMMAND
program
  .command('explain')
  .description('Display detailed lock impact and zero-downtime recipe for a specific rule')
  .argument('<ruleId>', 'Rule ID to explain (e.g. PG001, PG003)')
  .action((ruleId) => {
    const rules = getAllRules();
    const rule = rules.find(
      (r) => r.id.toUpperCase() === ruleId.toUpperCase() || r.name.toLowerCase() === ruleId.toLowerCase()
    );

    if (!rule) {
      console.error(`Unknown rule '${ruleId}'. Available rules: ${rules.map((r) => r.id).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    console.log(`\nRule: ${rule.id} (${rule.name})`);
    console.log(`Default Lock Level: ${rule.defaultLockLevel}`);
    console.log(`Default Severity: ${rule.defaultSeverity}`);
    console.log(`Description: ${rule.description}\n`);
    console.log(`Documentation: https://github.com/alexandrmotologa/pg-lockguard/blob/main/docs/rules/${rule.id.toLowerCase()}.md\n`);
  });

// INIT COMMAND
program
  .command('init')
  .description('Generate a starter .pg-lockguard.json configuration file')
  .action(() => {
    const target = path.join(process.cwd(), '.pg-lockguard.json');
    if (fs.existsSync(target)) {
      console.log(`Configuration file already exists at ${target}`);
      process.exitCode = 0;
      return;
    }

    fs.writeFileSync(target, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n', 'utf-8');
    console.log(`Created configuration file at ${target}`);
  });

program.parse(process.argv);
