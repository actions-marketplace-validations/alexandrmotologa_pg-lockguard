import type { LintSummary } from '../engine/linter.js';

export function reportGitHub(summary: LintSummary): string {
  const lines: string[] = [];

  for (const fileRes of summary.results) {
    for (const v of fileRes.violations) {
      const cmd = v.severity === 'error' ? 'error' : 'warning';
      const title = `${v.ruleId}: ${v.ruleName} [${v.lockLevel}]`;
      const msg = v.message.replace(/\r?\n/g, '%0A');

      lines.push(
        `::${cmd} file=${v.file},line=${v.line},col=${v.column},title=${title}::${msg}`
      );
    }
  }

  return lines.join('\n');
}
