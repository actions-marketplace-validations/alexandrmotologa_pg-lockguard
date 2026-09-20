import * as fs from 'node:fs';
import * as path from 'node:path';

export interface InstallHookResult {
  success: boolean;
  hookPath: string;
  type: 'husky' | 'git';
  message: string;
}

const PRE_COMMIT_SCRIPT = `#!/bin/sh
# PG Lockguard pre-commit hook: prevents dangerous migration locks from being committed

STAGED_SQL=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.sql$')

if [ -z "$STAGED_SQL" ]; then
  exit 0
fi

echo "🛡️  PG Lockguard: Validating staged PostgreSQL migrations..."
npx pg-lockguard lint $STAGED_SQL

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ PG Lockguard detected dangerous DDL locks in your staged migrations."
  echo "Run 'npx pg-lockguard fix' to automatically remediate safe patterns,"
  echo "or check the suggestions above before committing."
  exit 1
fi
`;

/**
 * Finds the Git root directory starting from cwd and walking upwards.
 */
export function findGitRoot(startDir = process.cwd()): string | null {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
}

/**
 * Installs pre-commit hook into .husky/pre-commit or .git/hooks/pre-commit.
 */
export function installPreCommitHook(rootDir = process.cwd()): InstallHookResult {
  const gitRoot = findGitRoot(rootDir);

  if (!gitRoot) {
    throw new Error('Not a git repository: no .git folder found in current directory or any parent.');
  }

  // Check if Husky is in use
  const huskyDir = path.join(gitRoot, '.husky');
  if (fs.existsSync(huskyDir) && fs.statSync(huskyDir).isDirectory()) {
    const huskyHook = path.join(huskyDir, 'pre-commit');
    let content = PRE_COMMIT_SCRIPT;

    // If pre-commit file already exists in husky, append or update
    if (fs.existsSync(huskyHook)) {
      const existing = fs.readFileSync(huskyHook, 'utf-8');
      if (existing.includes('pg-lockguard')) {
        return {
          success: true,
          hookPath: huskyHook,
          type: 'husky',
          message: 'PG Lockguard pre-commit hook is already installed in .husky/pre-commit',
        };
      }
      content = `${existing.trimEnd()}\n\n# PG Lockguard\n${PRE_COMMIT_SCRIPT}`;
    }

    fs.writeFileSync(huskyHook, content, { encoding: 'utf-8', mode: 0o755 });
    try {
      fs.chmodSync(huskyHook, 0o755);
    } catch {
      // Ignore chmod on platforms that don't support it
    }

    return {
      success: true,
      hookPath: huskyHook,
      type: 'husky',
      message: 'Successfully installed PG Lockguard pre-commit hook into .husky/pre-commit',
    };
  }

  // Standard Git hook
  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf-8');
    if (existing.includes('pg-lockguard')) {
      return {
        success: true,
        hookPath,
        type: 'git',
        message: 'PG Lockguard pre-commit hook is already installed in .git/hooks/pre-commit',
      };
    }
    const combined = `${existing.trimEnd()}\n\n# PG Lockguard hook\n${PRE_COMMIT_SCRIPT}`;
    fs.writeFileSync(hookPath, combined, { encoding: 'utf-8', mode: 0o755 });
  } else {
    fs.writeFileSync(hookPath, PRE_COMMIT_SCRIPT, { encoding: 'utf-8', mode: 0o755 });
  }

  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {
    // Ignore chmod on platforms that don't support it
  }

  return {
    success: true,
    hookPath,
    type: 'git',
    message: 'Successfully installed PG Lockguard pre-commit hook into .git/hooks/pre-commit',
  };
}
