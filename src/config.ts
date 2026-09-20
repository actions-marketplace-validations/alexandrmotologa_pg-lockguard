import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';


export const LockLevelEnum = z.enum([
  'ACCESS_SHARE',
  'ROW_SHARE',
  'ROW_EXCLUSIVE',
  'SHARE_UPDATE_EXCLUSIVE',
  'SHARE',
  'SHARE_ROW_EXCLUSIVE',
  'EXCLUSIVE',
  'ACCESS_EXCLUSIVE',
]);

export const PostgresVersionEnum = z.union([
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(14),
  z.literal(15),
  z.literal(16),
  z.literal(17),
]);

export const RuleConfigSchema = z.object({
  severity: z.enum(['error', 'warning', 'info', 'off']).optional(),
  options: z.record(z.any()).optional(),
});

export const ConfigSchema = z.object({
  pgVersion: PostgresVersionEnum.default(16),
  maxLockLevel: LockLevelEnum.default('SHARE'),
  enforceLockTimeout: z.boolean().default(true),
  ignoreRules: z.array(z.string()).default([]),
  rules: z.record(RuleConfigSchema).default({}),
  include: z.array(z.string()).default(['**/*.sql']),
  exclude: z.array(z.string()).default(['**/node_modules/**', '**/dist/**']),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  pgVersion: 16,
  maxLockLevel: 'SHARE',
  enforceLockTimeout: true,
  ignoreRules: [],
  rules: {},
  include: ['**/*.sql'],
  exclude: ['**/node_modules/**', '**/dist/**'],
};

/**
 * Loads configuration file if present, merged with defaults and CLI overrides.
 */
export function loadConfig(configPath?: string): Config {
  let userConfig: any = {};

  const candidatePaths = configPath
    ? [configPath]
    : [
        path.join(process.cwd(), '.pg-lockguard.json'),
        path.join(process.cwd(), '.pg-lockguardrc'),
        path.join(process.cwd(), '.pg-lockguardrc.json'),
      ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        userConfig = JSON.parse(raw);
        break;
      } catch (err: any) {
        throw new Error(`Failed to parse configuration file at ${candidate}: ${err.message}`);
      }
    }
  }

  const result = ConfigSchema.safeParse(userConfig);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration in .pg-lockguard.json:\n${issues}`);
  }

  return result.data;
}
