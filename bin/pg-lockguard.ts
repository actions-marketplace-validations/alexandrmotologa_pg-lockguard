#!/usr/bin/env node

import { Command } from 'commander';
import { glob } from 'glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js';
import { MigrationLinter } from '../src/engine/linter.js';
import { Fixer } from '../src/engine/fixer.js';
import { detectFramework, getFrameworkInfo, type FrameworkType } from '../src/engine/frameworks.js';
import { installPreCommitHook } from '../src/engine/git_hook.js';
import { estimateMigrationRisk } from '../src/engine/db_estimator.js';
import { reportTerminal } from '../src/reporters/terminal.js';
import { reportGitHub } from '../src/reporters/github.js';
import { reportSarif } from '../src/reporters/sarif.js';
import { reportJson } from '../src/reporters/json.js';
import { MarkdownReporter } from '../src/reporters/markdown.js';
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
  .option('--format <format>', 'Output format (pretty, json, github, sarif, markdown)', 'pretty')
  .option('--framework <name>', 'Migration framework (auto, prisma, drizzle, flyway, alembic, typeorm, raw)', 'auto')
  .option('--enforce-lock-timeout', 'Enforce SET lock_timeout at top of file', true)
  .option('--no-enforce-lock-timeout', 'Disable SET lock_timeout enforcement')
  .option('--ignore-rule <rules...>', 'Comma-separated rule IDs to ignore (e.g. PG001,PG004)')
  .option('--config <path>', 'Path to custom configuration file')
  .option('--explain', 'Print safe zero-downtime multi-step recipes for detected violations', false)
  .option('--fail-on-warning', 'Exit with code 1 if warnings are found', false)
  .action(async (patterns, options) => {
    try {
      const baseConfig = loadConfig(options.config);

      // Detect or resolve framework
      let frameworkInfo = getFrameworkInfo('raw');
      if (options.framework === 'auto') {
        frameworkInfo = detectFramework(process.cwd());
      } else if (options.framework) {
        frameworkInfo = getFrameworkInfo(options.framework as FrameworkType);
      }

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
      let targetPatterns = patterns && patterns.length > 0 ? patterns : null;
      if (!targetPatterns) {
        if (frameworkInfo.detected) {
          targetPatterns = frameworkInfo.defaultGlob;
        } else {
          targetPatterns = activeConfig.include;
        }
      }

      const matchedFiles = new Set<string>();

      for (const pattern of targetPatterns) {
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
          if (frameworkInfo.detected) {
            console.log(chalk.dim(`(Detected framework: ${frameworkInfo.displayName})`));
          }
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
        case 'markdown':
          console.log(new MarkdownReporter().format(summary));
          break;
        case 'pretty':
        default:
          if (frameworkInfo.detected && frameworkInfo.type !== 'raw') {
            console.log(chalk.cyan(`⚙️  Detected Framework: ${chalk.bold(frameworkInfo.displayName)}`));
            for (const tip of frameworkInfo.tips) {
              console.log(chalk.dim(`   💡 ${tip}`));
            }
          }
          console.log(reportTerminal(summary, options.explain));
          break;
      }

      // Exit codes:
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

// FIX COMMAND
program
  .command('fix')
  .description('Automatically remediate safe lock issues (CONCURRENTLY, NOT VALID, lock_timeout)')
  .argument('[patterns...]', 'File paths or glob patterns to fix')
  .option('--dry-run', 'Preview fixes without writing to files', false)
  .option('--timeout <duration>', 'Default lock timeout to inject (e.g. 2s, 1500ms)', '2s')
  .action(async (patterns, options) => {
    try {
      const targetPatterns = patterns && patterns.length > 0 ? patterns : ['**/*.sql'];
      const matchedFiles = new Set<string>();

      for (const pattern of targetPatterns) {
        if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
          matchedFiles.add(path.resolve(pattern));
          continue;
        }

        const files = await glob(pattern, {
          ignore: ['**/node_modules/**', '**/dist/**'],
          nodir: true,
        });

        for (const file of files) {
          matchedFiles.add(path.resolve(file));
        }
      }

      const fileList = Array.from(matchedFiles);
      if (fileList.length === 0) {
        console.log(`No SQL files found matching pattern(s): ${targetPatterns.join(', ')}`);
        process.exitCode = 0;
        return;
      }

      const fixer = new Fixer();
      let totalFixes = 0;
      let totalFilesFixed = 0;

      console.log(chalk.bold(`\n🔧 PG Lockguard Auto-Fix Engine${options.dryRun ? ' (DRY RUN)' : ''}\n`));

      for (const file of fileList) {
        const content = fs.readFileSync(file, 'utf-8');
        const relPath = path.relative(process.cwd(), file);
        const result = fixer.fixContent(content, relPath, { lockTimeout: options.timeout });

        if (result.fixed) {
          totalFilesFixed++;
          totalFixes += result.fixes.length;

          console.log(`${chalk.green('✔')} ${chalk.bold(relPath)} (${result.fixes.length} fix${result.fixes.length > 1 ? 'es' : ''})`);
          for (const fix of result.fixes) {
            console.log(`  ${chalk.cyan(`[${fix.ruleId}]`)} Line ${fix.line}: ${fix.description}`);
          }

          if (!options.dryRun) {
            fs.writeFileSync(file, result.fixedContent, 'utf-8');
          }
        }
      }

      console.log('');
      if (totalFilesFixed === 0) {
        console.log(chalk.green('✨ No auto-fixable lock patterns found. All migrations are up to date!'));
      } else {
        const actionWord = options.dryRun ? 'Found' : 'Applied';
        console.log(chalk.bold.green(`🎉 ${actionWord} ${totalFixes} safe zero-downtime fix(es) across ${totalFilesFixed} migration file(s).`));
      }

      process.exitCode = 0;
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exitCode = 2;
    }
  });

// INSTALL-HOOK COMMAND
program
  .command('install-hook')
  .description('Install PG Lockguard Git pre-commit hook in .husky or .git/hooks')
  .action(() => {
    try {
      const res = installPreCommitHook(process.cwd());
      console.log(chalk.green(`\n🛡️  ${res.message}`));
      console.log(chalk.dim(`   Path: ${res.hookPath}\n`));
      process.exitCode = 0;
    } catch (err: any) {
      console.error(chalk.red(`\n❌ Failed to install pre-commit hook: ${err.message}\n`));
      process.exitCode = 1;
    }
  });

// ESTIMATE COMMAND
program
  .command('estimate')
  .description('Estimate live table sizes and lock risk holding times against a PostgreSQL database')
  .argument('[patterns...]', 'Migration files to analyze')
  .requiredOption('--db <url>', 'PostgreSQL connection URL (e.g. postgres://user:pass@host:5432/dbname)')
  .action(async (patterns, options) => {
    try {
      const targetPatterns = patterns && patterns.length > 0 ? patterns : ['**/*.sql'];
      const matchedFiles = new Set<string>();

      for (const pattern of targetPatterns) {
        if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
          matchedFiles.add(path.resolve(pattern));
          continue;
        }

        const files = await glob(pattern, {
          ignore: ['**/node_modules/**', '**/dist/**'],
          nodir: true,
        });

        for (const file of files) {
          matchedFiles.add(path.resolve(file));
        }
      }

      const fileList = Array.from(matchedFiles);
      if (fileList.length === 0) {
        console.log(`No SQL files found matching pattern(s): ${targetPatterns.join(', ')}`);
        process.exitCode = 0;
        return;
      }

      const contents = fileList.map((f) => fs.readFileSync(f, 'utf-8'));

      console.log(chalk.bold(`\n📊 Connecting to live PostgreSQL database to estimate table lock impacts...\n`));
      const estimate = await estimateMigrationRisk(contents, options.db);

      if (estimate.tables.length === 0) {
        console.log(chalk.yellow('No target tables found in database or matching migration statements.'));
        process.exitCode = 0;
        return;
      }

      console.log(chalk.bold(`Target Database Table Statistics & Lock Holding Estimates:`));
      console.log('─'.repeat(80));

      for (const t of estimate.tables) {
        const riskColor =
          t.riskLevel === 'CRITICAL'
            ? chalk.red.bold
            : t.riskLevel === 'HIGH'
            ? chalk.magenta.bold
            : t.riskLevel === 'MEDIUM'
            ? chalk.yellow.bold
            : chalk.green.bold;

        console.log(`\nTable: ${chalk.bold(t.tableName)}`);
        console.log(`  Live Rows:       ${chalk.cyan(t.estimatedRows.toLocaleString())}`);
        console.log(`  Total Disk Size: ${chalk.cyan(t.totalSizePretty)}`);
        console.log(`  Lock Risk Level: ${riskColor(t.riskLevel)}`);
        console.log(`  Hold Time Est:   ${chalk.white.bold(t.estimatedHoldTime)}`);
        console.log(`  Traffic Impact:  ${chalk.dim(t.trafficWarning)}`);
      }

      console.log('\n' + '─'.repeat(80));
      console.log(chalk.bold(`Overall Migration Risk: ${estimate.highestRisk}\n`));
      process.exitCode = 0;
    } catch (err: any) {
      console.error(chalk.red(`\n❌ Estimation failed: ${err.message}\n`));
      process.exitCode = 1;
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
