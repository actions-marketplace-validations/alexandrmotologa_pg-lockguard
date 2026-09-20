import type { LintSummary } from '../engine/linter.js';

/**
 * Formats lint results as GitHub PR-ready Markdown with collapsible details and lock tables.
 */
export class MarkdownReporter {
  public format(summary: LintSummary): string {
    const lines: string[] = [];

    const isSuccess = summary.totalErrors === 0;
    const statusIcon = isSuccess ? '✅' : '🚨';
    const statusText = isSuccess ? 'PASSED' : 'FAILED';

    lines.push(`## ${statusIcon} PG Lockguard Migration Security Report — ${statusText}`);
    lines.push('');

    // Summary table
    lines.push('| Metric | Count |');
    lines.push('|:---|:---|');
    lines.push(`| **Files Checked** | \`${summary.totalFiles}\` |`);
    lines.push(`| **Passed Migrations** | \`${summary.passedFiles}\` |`);
    lines.push(`| **Failed Migrations** | \`${summary.failedFiles}\` |`);
    lines.push(`| **Errors** | \`${summary.totalErrors}\` |`);
    lines.push(`| **Warnings** | \`${summary.totalWarnings}\` |`);
    lines.push(`| **Duration** | \`${summary.durationMs.toFixed(0)}ms\` |`);
    lines.push('');

    if (summary.totalErrors === 0 && summary.totalWarnings === 0) {
      lines.push('> ✨ **All migrations meet zero-downtime PostgreSQL lock safety requirements.**');
      lines.push('> No unsafe exclusive table locks or blocking DDL operations were detected.');
      lines.push('');
      lines.push('---');
      lines.push('*Automated with [PG Lockguard](https://github.com/alexandrmotologa/pg-lockguard)*');
      return lines.join('\n');
    }

    lines.push('### 🔍 Detected Lock Issues');
    lines.push('');

    const filesWithIssues = summary.results.filter((r) => r.violations.length > 0);

    for (const fileResult of filesWithIssues) {
      const errorCount = fileResult.violations.filter((v) => v.severity === 'error').length;
      const warnCount = fileResult.violations.filter((v) => v.severity === 'warning').length;
      const labelParts: string[] = [];
      if (errorCount > 0) labelParts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`);
      if (warnCount > 0) labelParts.push(`${warnCount} warning${warnCount > 1 ? 's' : ''}`);

      lines.push(`<details open>`);
      lines.push(`<summary><b><code>${fileResult.file}</code></b> (${labelParts.join(', ')})</summary>`);
      lines.push('');

      for (const v of fileResult.violations) {
        const severityBadge =
          v.severity === 'error' ? '🔴 **ERROR**' : v.severity === 'warning' ? '🟡 **WARN**' : '🔵 **INFO**';

        lines.push(`#### ${severityBadge}: \`[${v.ruleId}]\` ${v.ruleName}`);
        lines.push(`- **Location**: Line ${v.line}, Column ${v.column}`);
        lines.push(`- **Lock Required**: \`${v.lockLevel}\``);
        lines.push(`- **Risk**: ${v.explanation || v.message}`);
        lines.push('');

        if (v.snippet) {
          lines.push('```sql');
          lines.push(v.snippet);
          lines.push('```');
        }

        if (v.recipe) {
          lines.push('**Recommended Zero-Downtime Migration Pattern:**');
          lines.push('```sql');
          lines.push(v.recipe);
          lines.push('```');
        }

        lines.push('');
      }

      lines.push('</details>');
      lines.push('');
    }

    lines.push('---');
    lines.push('*Automated with [PG Lockguard](https://github.com/alexandrmotologa/pg-lockguard)*');

    return lines.join('\n');
  }
}
