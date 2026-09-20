/**
 * PostgreSQL Lock Level Hierarchy and Conflict Matrix.
 */

export type LockLevel =
  | 'ACCESS_SHARE'
  | 'ROW_SHARE'
  | 'ROW_EXCLUSIVE'
  | 'SHARE_UPDATE_EXCLUSIVE'
  | 'SHARE'
  | 'SHARE_ROW_EXCLUSIVE'
  | 'EXCLUSIVE'
  | 'ACCESS_EXCLUSIVE';

export const LOCK_LEVEL_RANKS: Record<LockLevel, number> = {
  ACCESS_SHARE: 1,
  ROW_SHARE: 2,
  ROW_EXCLUSIVE: 3,
  SHARE_UPDATE_EXCLUSIVE: 4,
  SHARE: 5,
  SHARE_ROW_EXCLUSIVE: 6,
  EXCLUSIVE: 7,
  ACCESS_EXCLUSIVE: 8,
};

export interface LockProperties {
  level: LockLevel;
  rank: number;
  blocksReads: boolean;
  blocksWrites: boolean;
  description: string;
}

export const LOCK_DETAILS: Record<LockLevel, LockProperties> = {
  ACCESS_SHARE: {
    level: 'ACCESS_SHARE',
    rank: 1,
    blocksReads: false,
    blocksWrites: false,
    description: 'Acquired by SELECT. Only conflicts with ACCESS EXCLUSIVE.',
  },
  ROW_SHARE: {
    level: 'ROW_SHARE',
    rank: 2,
    blocksReads: false,
    blocksWrites: false,
    description: 'Acquired by SELECT FOR UPDATE / FOR SHARE.',
  },
  ROW_EXCLUSIVE: {
    level: 'ROW_EXCLUSIVE',
    rank: 3,
    blocksReads: false,
    blocksWrites: false,
    description: 'Acquired by INSERT, UPDATE, DELETE. Does not block concurrent reads or writes on other rows.',
  },
  SHARE_UPDATE_EXCLUSIVE: {
    level: 'SHARE_UPDATE_EXCLUSIVE',
    rank: 4,
    blocksReads: false,
    blocksWrites: false,
    description: 'Acquired by VACUUM (without FULL), ANALYZE, CREATE INDEX CONCURRENTLY, and VALIDATE CONSTRAINT. Does not block reads or writes.',
  },
  SHARE: {
    level: 'SHARE',
    rank: 5,
    blocksReads: false,
    blocksWrites: true,
    description: 'Acquired by standard CREATE INDEX. Blocks concurrent writes (INSERT, UPDATE, DELETE).',
  },
  SHARE_ROW_EXCLUSIVE: {
    level: 'SHARE_ROW_EXCLUSIVE',
    rank: 6,
    blocksReads: false,
    blocksWrites: true,
    description: 'Acquired by unvalidated foreign keys and triggers. Blocks concurrent writes.',
  },
  EXCLUSIVE: {
    level: 'EXCLUSIVE',
    rank: 7,
    blocksReads: false,
    blocksWrites: true,
    description: 'Acquired by REFRESH MATERIALIZED VIEW CONCURRENTLY. Blocks concurrent writes and queries holding SHARE UPDATE EXCLUSIVE.',
  },
  ACCESS_EXCLUSIVE: {
    level: 'ACCESS_EXCLUSIVE',
    rank: 8,
    blocksReads: true,
    blocksWrites: true,
    description: 'Acquired by ALTER TABLE rewrites, DROP TABLE, TRUNCATE, and VACUUM FULL. Blocks all concurrent reads and writes.',
  },
};

/**
 * Returns true if lockLevelA is greater than or equal to lockLevelB in severity.
 */
export function isLockExceeded(actual: LockLevel, threshold: LockLevel): boolean {
  return LOCK_LEVEL_RANKS[actual] >= LOCK_LEVEL_RANKS[threshold];
}
