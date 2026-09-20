import { describe, it, expect } from 'vitest';
import { MigrationLinter } from '../src/engine/linter.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { reportSarif } from '../src/reporters/sarif.js';

describe('SARIF v2.1.0 Reporter', () => {
  it('generates compliant SARIF v2.1.0 document', () => {
    const linter = new MigrationLinter(DEFAULT_CONFIG);
    const sql = "SET lock_timeout = '2s'; CREATE INDEX idx ON users (email);";
    const summary = linter.lintFiles(['migration.sql']);
    // Mock the summary result with the parsed violation
    summary.results = [linter.lintString(sql, 'migrations/0001_add_idx.sql')];

    const sarifRaw = reportSarif(summary);
    const sarif = JSON.parse(sarifRaw);

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0.json');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('pg-lockguard');
    expect(sarif.runs[0].tool.driver.rules.length).toBeGreaterThanOrEqual(12);

    const resultItem = sarif.runs[0].results.find((r: any) => r.ruleId === 'PG001');
    expect(resultItem).toBeDefined();
    expect(resultItem.level).toBe('error');
    expect(resultItem.locations[0].physicalLocation.artifactLocation.uri).toBe('migrations/0001_add_idx.sql');
  });
});
