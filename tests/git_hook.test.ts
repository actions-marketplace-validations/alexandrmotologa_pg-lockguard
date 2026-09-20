import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { installPreCommitHook, findGitRoot } from '../src/engine/git_hook.js';

describe('Git Hook Installer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-lockguard-git-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('fails if directory is not a git repo', () => {
    expect(() => installPreCommitHook(tmpDir)).toThrow('Not a git repository');
  });

  it('installs into .git/hooks/pre-commit for standard git repositories', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const result = installPreCommitHook(tmpDir);

    expect(result.success).toBe(true);
    expect(result.type).toBe('git');
    expect(fs.existsSync(result.hookPath)).toBe(true);

    const content = fs.readFileSync(result.hookPath, 'utf-8');
    expect(content).toContain('pg-lockguard lint');
  });

  it('installs into .husky/pre-commit when husky directory is present', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    fs.mkdirSync(path.join(tmpDir, '.husky'));

    const result = installPreCommitHook(tmpDir);
    expect(result.success).toBe(true);
    expect(result.type).toBe('husky');
    expect(result.hookPath).toContain('.husky');

    const content = fs.readFileSync(result.hookPath, 'utf-8');
    expect(content).toContain('pg-lockguard lint');
  });

  it('does not duplicate script if already installed', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    installPreCommitHook(tmpDir);
    const result2 = installPreCommitHook(tmpDir);

    expect(result2.success).toBe(true);
    expect(result2.message).toContain('already installed');
  });
});
