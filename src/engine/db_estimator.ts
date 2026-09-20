import pg from 'pg';
import { parseSql } from '../ast/parser.js';

const { Client } = pg;

export type TableRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface TableStats {
  tableName: string;
  estimatedRows: number;
  totalBytes: number;
  totalSizePretty: string;
  tableSizePretty: string;
  riskLevel: TableRiskLevel;
  estimatedHoldTime: string;
  trafficWarning: string;
}

export interface EstimationResult {
  tables: TableStats[];
  highestRisk: TableRiskLevel;
  summary: string;
}

export interface QueryRunner {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

/**
 * Extracts table names targeted by DDL statements in a SQL string.
 */
export function extractTargetTables(sql: string): string[] {
  const tables = new Set<string>();
  try {
    const parsed = parseSql(sql);
    for (const stmt of parsed.stmts) {
      const obj = stmt.stmt;
      if (!obj) continue;

      if (obj.alterTableStmt?.relation?.relname) {
        tables.add(obj.alterTableStmt.relation.relname.toLowerCase());
      }
      if (obj.indexStmt?.relation?.relname) {
        tables.add(obj.indexStmt.relation.relname.toLowerCase());
      }
      if (obj.createTableAsStmt?.into?.rel?.relname) {
        tables.add(obj.createTableAsStmt.into.rel.relname.toLowerCase());
      }
      if (obj.refreshMatViewStmt?.relation?.relname) {
        tables.add(obj.refreshMatViewStmt.relation.relname.toLowerCase());
      }
    }
  } catch {
    // Fallback regex if syntax error
    const alterMatch = sql.matchAll(/ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_".]+)/gi);
    for (const m of alterMatch) {
      if (m[1]) tables.add(m[1].replace(/["']/g, '').toLowerCase());
    }
    const indexMatch = sql.matchAll(/ON\s+([a-zA-Z0-9_".]+)\s*\(/gi);
    for (const m of indexMatch) {
      if (m[1]) tables.add(m[1].replace(/["']/g, '').toLowerCase());
    }
  }

  return Array.from(tables);
}

/**
 * Calculates risk level and impact based on row count and total bytes.
 */
export function calculateTableRisk(rows: number, bytes: number): {
  riskLevel: TableRiskLevel;
  estimatedHoldTime: string;
  trafficWarning: string;
} {
  if (rows < 10000 && bytes < 10 * 1024 * 1024) {
    return {
      riskLevel: 'LOW',
      estimatedHoldTime: '< 50ms',
      trafficWarning: 'Minor table size. Lock impact is minimal on low-concurrency workloads.',
    };
  }

  if (rows < 500000 && bytes < 200 * 1024 * 1024) {
    return {
      riskLevel: 'MEDIUM',
      estimatedHoldTime: '100ms – 1.5s',
      trafficWarning: 'Moderate table size. Exclusive locks will queue active write transactions.',
    };
  }

  if (rows < 5000000 && bytes < 2 * 1024 * 1024 * 1024) {
    return {
      riskLevel: 'HIGH',
      estimatedHoldTime: '2s – 25s',
      trafficWarning: 'Large table. Heavy exclusive locks are likely to exceed connection pool timeouts under active traffic.',
    };
  }

  return {
    riskLevel: 'CRITICAL',
    estimatedHoldTime: '> 30s to minutes',
    trafficWarning: 'Extreme risk. High-volume table will exhaust connection pool and trigger 504 gateway timeouts without CONCURRENTLY or NOT VALID.',
  };
}

/**
 * Queries live PostgreSQL database statistics for tables referenced in SQL migrations.
 */
export async function estimateMigrationRisk(
  sqlOrFiles: string[],
  connectionOrRunner: string | QueryRunner
): Promise<EstimationResult> {
  const allTargetTables = new Set<string>();

  for (const item of sqlOrFiles) {
    const tables = extractTargetTables(item);
    for (const t of tables) allTargetTables.add(t);
  }

  const tableList = Array.from(allTargetTables);
  if (tableList.length === 0) {
    return {
      tables: [],
      highestRisk: 'LOW',
      summary: 'No existing target tables detected in migration statements.',
    };
  }

  let client: any = null;
  let runner: QueryRunner;

  if (typeof connectionOrRunner === 'string') {
    client = new Client({ connectionString: connectionOrRunner });
    await client.connect();
    runner = client;
  } else {
    runner = connectionOrRunner;
  }

  try {
    const query = `
      SELECT
        c.relname AS table_name,
        c.reltuples::bigint AS estimated_rows,
        pg_total_relation_size(c.oid)::bigint AS total_bytes,
        pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size_pretty,
        pg_size_pretty(pg_relation_size(c.oid)) AS table_size_pretty
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND c.relname = ANY($1::text[])
    `;

    const res = await runner.query(query, [tableList]);
    const stats: TableStats[] = [];

    const riskRank: Record<TableRiskLevel, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    let highest: TableRiskLevel = 'LOW';

    for (const row of res.rows) {
      const rows = Math.max(0, parseInt(row.estimated_rows ?? '0', 10));
      const bytes = Math.max(0, parseInt(row.total_bytes ?? '0', 10));
      const calc = calculateTableRisk(rows, bytes);

      if (riskRank[calc.riskLevel] > riskRank[highest]) {
        highest = calc.riskLevel;
      }

      stats.push({
        tableName: row.table_name,
        estimatedRows: rows,
        totalBytes: bytes,
        totalSizePretty: row.total_size_pretty || '0 bytes',
        tableSizePretty: row.table_size_pretty || '0 bytes',
        riskLevel: calc.riskLevel,
        estimatedHoldTime: calc.estimatedHoldTime,
        trafficWarning: calc.trafficWarning,
      });
    }

    return {
      tables: stats,
      highestRisk: highest,
      summary: `Estimated risk across ${stats.length} live database table(s): ${highest}`,
    };
  } finally {
    if (client) {
      await client.end();
    }
  }
}
