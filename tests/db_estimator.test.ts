import { describe, it, expect } from 'vitest';
import {
  extractTargetTables,
  calculateTableRisk,
  estimateMigrationRisk,
  type QueryRunner,
} from '../src/engine/db_estimator.js';

describe('Live Database Risk Estimator', () => {
  it('extracts target tables from DDL statements', () => {
    const sql = `
      ALTER TABLE users ADD COLUMN age integer;
      CREATE INDEX idx_orders_customer ON orders (customer_id);
    `;
    const tables = extractTargetTables(sql);
    expect(tables).toContain('users');
    expect(tables).toContain('orders');
  });

  it('calculates risk levels based on row counts and bytes', () => {
    const low = calculateTableRisk(500, 1024 * 100);
    expect(low.riskLevel).toBe('LOW');

    const med = calculateTableRisk(50000, 50 * 1024 * 1024);
    expect(med.riskLevel).toBe('MEDIUM');

    const high = calculateTableRisk(1500000, 500 * 1024 * 1024);
    expect(high.riskLevel).toBe('HIGH');

    const crit = calculateTableRisk(15000000, 5 * 1024 * 1024 * 1024);
    expect(crit.riskLevel).toBe('CRITICAL');
  });

  it('queries statistics and calculates table risk through query runner', async () => {
    const mockRunner: QueryRunner = {
      async query(sql: string, params?: any[]) {
        return {
          rows: [
            {
              table_name: 'users',
              estimated_rows: '12500000',
              total_bytes: '3500000000',
              total_size_pretty: '3.5 GB',
              table_size_pretty: '2.1 GB',
            },
            {
              table_name: 'settings',
              estimated_rows: '42',
              total_bytes: '16384',
              total_size_pretty: '16 kB',
              table_size_pretty: '8192 bytes',
            },
          ],
        };
      },
    };

    const sql = 'ALTER TABLE users ADD COLUMN phone text; ALTER TABLE settings ADD COLUMN val text;';
    const result = await estimateMigrationRisk([sql], mockRunner);

    expect(result.tables).toHaveLength(2);
    expect(result.highestRisk).toBe('CRITICAL');

    const usersStat = result.tables.find((t) => t.tableName === 'users');
    expect(usersStat?.riskLevel).toBe('CRITICAL');
    expect(usersStat?.totalSizePretty).toBe('3.5 GB');

    const settingsStat = result.tables.find((t) => t.tableName === 'settings');
    expect(settingsStat?.riskLevel).toBe('LOW');
  });
});
