import * as fs from 'node:fs';
import * as path from 'node:path';

export type FrameworkType = 'prisma' | 'drizzle' | 'flyway' | 'alembic' | 'typeorm' | 'supabase' | 'raw';

export interface FrameworkInfo {
  type: FrameworkType;
  displayName: string;
  detected: boolean;
  matchedIndicator?: string;
  defaultGlob: string[];
  tips: string[];
}

interface FrameworkDefinition {
  type: FrameworkType;
  displayName: string;
  indicators: {
    files?: string[];
    directories?: string[];
    packageDependencies?: string[];
  };
  defaultGlob: string[];
  tips: string[];
}

const FRAMEWORK_DEFINITIONS: FrameworkDefinition[] = [
  {
    type: 'prisma',
    displayName: 'Prisma ORM',
    indicators: {
      files: ['prisma/schema.prisma'],
      directories: ['prisma/migrations'],
      packageDependencies: ['@prisma/client', 'prisma'],
    },
    defaultGlob: ['prisma/migrations/**/*.sql'],
    tips: [
      'Prisma wraps migrations in a transaction by default. For CONCURRENTLY operations, set `migration.sql` with manual transaction boundaries or execute outside standard Prisma transaction blocks.',
    ],
  },
  {
    type: 'drizzle',
    displayName: 'Drizzle ORM',
    indicators: {
      files: ['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.json'],
      directories: ['drizzle'],
      packageDependencies: ['drizzle-orm'],
    },
    defaultGlob: ['drizzle/**/*.sql', 'migrations/**/*.sql'],
    tips: [
      'Drizzle migrations allow separate migration steps for non-transactional statements like CREATE INDEX CONCURRENTLY.',
    ],
  },
  {
    type: 'supabase',
    displayName: 'Supabase CLI',
    indicators: {
      directories: ['supabase/migrations'],
      files: ['supabase/config.toml'],
    },
    defaultGlob: ['supabase/migrations/**/*.sql'],
    tips: [
      'Supabase CLI applies migrations chronologically. Ensure lock_timeout is defined in production migrations.',
    ],
  },
  {
    type: 'flyway',
    displayName: 'Flyway',
    indicators: {
      files: ['flyway.conf'],
      directories: ['db/migration', 'sql'],
    },
    defaultGlob: ['db/migration/V*__*.sql', 'sql/V*__*.sql'],
    tips: [
      'Flyway supports non-transactional migrations via script configuration (e.g. `executeInTransaction=false`). Use this for CONCURRENTLY statements.',
    ],
  },
  {
    type: 'alembic',
    displayName: 'Alembic (SQLAlchemy)',
    indicators: {
      files: ['alembic.ini'],
      directories: ['alembic/versions'],
    },
    defaultGlob: ['alembic/versions/*.sql', 'migrations/versions/*.sql'],
    tips: [
      'Alembic raw SQL migrations should configure `autocommit_block()` when issuing CONCURRENTLY index operations.',
    ],
  },
  {
    type: 'typeorm',
    displayName: 'TypeORM',
    indicators: {
      files: ['ormconfig.json', 'ormconfig.ts', 'ormconfig.js'],
      directories: ['src/migration', 'src/migrations'],
      packageDependencies: ['typeorm'],
    },
    defaultGlob: ['src/migration/**/*.sql', 'src/migrations/**/*.sql', 'migrations/**/*.sql'],
    tips: [
      'TypeORM migrations can disable transactions via `transaction = false` on migration query runner classes.',
    ],
  },
];

/**
 * Detects the ORM / Migration tool in use in the current working directory.
 */
export function detectFramework(cwd: string = process.cwd()): FrameworkInfo {
  // Read package.json if available
  let packageDeps = new Set<string>();
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      packageDeps = new Set(Object.keys(deps));
    }
  } catch {
    // Ignore JSON parse errors
  }

  for (const def of FRAMEWORK_DEFINITIONS) {
    // Check files
    if (def.indicators.files) {
      for (const relFile of def.indicators.files) {
        if (fs.existsSync(path.join(cwd, relFile))) {
          return {
            type: def.type,
            displayName: def.displayName,
            detected: true,
            matchedIndicator: relFile,
            defaultGlob: def.defaultGlob,
            tips: def.tips,
          };
        }
      }
    }

    // Check directories
    if (def.indicators.directories) {
      for (const relDir of def.indicators.directories) {
        const fullDir = path.join(cwd, relDir);
        if (fs.existsSync(fullDir) && fs.statSync(fullDir).isDirectory()) {
          return {
            type: def.type,
            displayName: def.displayName,
            detected: true,
            matchedIndicator: relDir,
            defaultGlob: def.defaultGlob,
            tips: def.tips,
          };
        }
      }
    }

    // Check package dependencies
    if (def.indicators.packageDependencies) {
      for (const dep of def.indicators.packageDependencies) {
        if (packageDeps.has(dep)) {
          return {
            type: def.type,
            displayName: def.displayName,
            detected: true,
            matchedIndicator: `package.json: ${dep}`,
            defaultGlob: def.defaultGlob,
            tips: def.tips,
          };
        }
      }
    }
  }

  return {
    type: 'raw',
    displayName: 'Raw SQL / Generic',
    detected: false,
    defaultGlob: ['**/*.sql'],
    tips: [
      'Standard PostgreSQL migrations: ensure lock_timeout is configured before DDL modifications.',
    ],
  };
}

/**
 * Gets specific framework info by name.
 */
export function getFrameworkInfo(type: FrameworkType): FrameworkInfo {
  const found = FRAMEWORK_DEFINITIONS.find((d) => d.type === type);
  if (found) {
    return {
      type: found.type,
      displayName: found.displayName,
      detected: true,
      defaultGlob: found.defaultGlob,
      tips: found.tips,
    };
  }

  return {
    type: 'raw',
    displayName: 'Raw SQL / Generic',
    detected: false,
    defaultGlob: ['**/*.sql'],
    tips: [],
  };
}
