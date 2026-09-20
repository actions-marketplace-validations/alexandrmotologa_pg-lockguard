import chalk from 'chalk';
import type { LintSummary } from '../engine/linter.js';
import type { RuleViolation } from '../rules/base.js';
import type { LockLevel } from '../engine/lock_matrix.js';

function formatLockBadge(lockLevel: LockLevel): string {
  switch (lockLevel) {
    case 'ACCESS_EXCLUSIVE':
      return chalk.bgRed.black.bold(` ${lockLevel} `);
    case 'EXCLUSIVE':
    case 'SHARE_ROW_EXCLUSIVE':
      return chalk.bgHex('#e65100').black.bold(` ${lockLevel} `);
    case 'SHARE':
      return chalk.bgYellow.black.bold(` ${lockLevel} `);
    case 'SHARE_UPDATE_EXCLUSIVE':
      return chalk.bgCyan.black.bold(` ${lockLevel} `);
    default:
      return chalk.bgGray.white(` ${lockLevel} `);
  }
}

export function formatTerminalViolation(v: RuleViolation, showRecipes = false): string {
  const isError = v.severity === 'error';
  const prefix = isError ? chalk.red.bold('✖ ERROR') : chalk.yellow.bold('⚠ WARN');
  const badge = formatLockBadge(v.lockLevel);
  const locationStr = chalk.dim(`${v.file}:${v.line}:${v.column}`);

  const lines: string[] = [
    `  ${prefix} ${chalk.white.bold(v.ruleId)} (${chalk.cyan(v.ruleName)}) ${badge}`,
    `    ${chalk.dim('at')} ${locationStr}`,
    `    ${chalk.white(v.message)}`,
  ];

  if (v.snippet) {
    lines.push(
      ``,
      `    ${chalk.dim(`${v.line} |`)} ${chalk.red(v.snippet)}`,
      `    ${chalk.dim('  |')} ${chalk.red('^'.repeat(Math.min(v.snippet.length, 40)))}`,
      ``
    );
  }

  if (showRecipes && v.recipe) {
    lines.push(
      `    ${chalk.green.bold('Safe Multi-Step Migration Recipe:')}`,
      ...v.recipe.split('\n').map((l) => `      ${chalk.green(l)}`),
      ``
    );
  }

  return lines.join('\n');
}

export function reportTerminal(summary: LintSummary, showRecipes = false): string {
  const output: string[] = [];

  output.push(
    chalk.bold.hex('#3b82f6')(`\n  PG Lockguard`) +
      chalk.dim(` — PostgreSQL Zero-Downtime Migration Linter\n`)
  );

  let totalViolations = 0;

  for (const fileRes of summary.results) {
    if (fileRes.violations.length === 0) continue;

    totalViolations += fileRes.violations.length;
    output.push(chalk.bold.underline(`  ${fileRes.file}`));

    for (const v of fileRes.violations) {
      output.push(formatTerminalViolation(v, showRecipes));
    }
  }

  output.push(chalk.dim('─'.repeat(70)));

  if (summary.totalErrors > 0) {
    output.push(
      chalk.red.bold(
        `  Failed: ${summary.totalErrors} error(s), ${summary.totalWarnings} warning(s) across ${summary.failedFiles}/${summary.totalFiles} files.`
      )
    );
  } else if (summary.totalWarnings > 0) {
    output.push(
      chalk.yellow.bold(
        `  Passed with warnings: ${summary.totalWarnings} warning(s) in ${summary.totalFiles} files.`
      )
    );
  } else {
    output.push(
      chalk.green.bold(
        `  ✔ All ${summary.totalFiles} migration files passed lock safety checks (${summary.durationMs}ms).`
      )
    );
  }

  output.push('');
  return output.join('\n');
}
