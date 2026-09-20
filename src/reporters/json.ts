import type { LintSummary } from '../engine/linter.js';

export function reportJson(summary: LintSummary): string {
  return JSON.stringify(summary, null, 2);
}
