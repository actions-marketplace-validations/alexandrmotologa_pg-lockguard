import type { LintSummary } from '../engine/linter.js';
import { getAllRules } from '../rules/index.js';

export function reportSarif(summary: LintSummary): string {
  const allRules = getAllRules();

  const rulesMeta = allRules.map((r) => ({
    id: r.id,
    name: r.name,
    shortDescription: {
      text: r.description,
    },
    fullDescription: {
      text: `${r.description} Default lock acquired: ${r.defaultLockLevel}.`,
    },
    defaultConfiguration: {
      level: r.defaultSeverity === 'error' ? 'error' : 'warning',
    },
    helpUri: `https://github.com/alexandrmotologa/pg-lockguard/blob/main/docs/rules/${r.id.toLowerCase()}.md`,
    properties: {
      lockLevel: r.defaultLockLevel,
      tags: ['postgresql', 'database', 'ddl', 'locks', 'migrations'],
    },
  }));

  const results = [];

  for (const fileRes of summary.results) {
    for (const v of fileRes.violations) {
      results.push({
        ruleId: v.ruleId,
        level: v.severity === 'error' ? 'error' : 'warning',
        message: {
          text: v.message,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: v.file.replace(/\\/g, '/'),
              },
              region: {
                startLine: v.line,
                startColumn: v.column,
              },
            },
          },
        ],
        properties: {
          lockLevel: v.lockLevel,
          recipe: v.recipe,
        },
      });
    }
  }

  const sarifPayload = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'pg-lockguard',
            version: '1.0.0',
            informationUri: 'https://github.com/alexandrmotologa/pg-lockguard',
            rules: rulesMeta,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarifPayload, null, 2);
}
