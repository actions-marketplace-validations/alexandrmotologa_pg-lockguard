import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectFramework, getFrameworkInfo } from '../src/engine/frameworks.js';

describe('Framework Auto-Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-lockguard-fw-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects Prisma when prisma/schema.prisma exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'prisma'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'prisma', 'schema.prisma'), '// prisma schema');

    const result = detectFramework(tmpDir);
    expect(result.type).toBe('prisma');
    expect(result.detected).toBe(true);
    expect(result.defaultGlob).toContain('prisma/migrations/**/*.sql');
  });

  it('detects Drizzle when drizzle.config.ts exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'drizzle.config.ts'), 'export default {}');

    const result = detectFramework(tmpDir);
    expect(result.type).toBe('drizzle');
    expect(result.detected).toBe(true);
  });

  it('detects Supabase when supabase/migrations directory exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'supabase', 'migrations'), { recursive: true });

    const result = detectFramework(tmpDir);
    expect(result.type).toBe('supabase');
    expect(result.detected).toBe(true);
  });

  it('detects Flyway when flyway.conf exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'flyway.conf'), 'flyway.url=');

    const result = detectFramework(tmpDir);
    expect(result.type).toBe('flyway');
    expect(result.detected).toBe(true);
  });

  it('detects Alembic when alembic.ini exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'alembic.ini'), '[alembic]');

    const result = detectFramework(tmpDir);
    expect(result.type).toBe('alembic');
    expect(result.detected).toBe(true);
  });

  it('falls back to raw when no indicators are present', () => {
    const result = detectFramework(tmpDir);
    expect(result.type).toBe('raw');
    expect(result.detected).toBe(false);
  });

  it('returns metadata by framework name with getFrameworkInfo', () => {
    const info = getFrameworkInfo('prisma');
    expect(info.displayName).toBe('Prisma ORM');
    expect(info.tips.length).toBeGreaterThan(0);
  });
});
