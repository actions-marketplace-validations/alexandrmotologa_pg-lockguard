/**
 * PostgreSQL Version Nuances & Type Compatibility Matrix.
 */

export type PostgresVersion = 11 | 12 | 13 | 14 | 15 | 16 | 17;

export const DEFAULT_POSTGRES_VERSION: PostgresVersion = 16;

/**
 * List of known volatile functions in PostgreSQL that require table rewrites
 * when evaluated across existing rows during ADD COLUMN ... DEFAULT ... NOT NULL.
 */
export const VOLATILE_DEFAULT_FUNCTIONS = new Set([
  'clock_timestamp',
  'random',
  'gen_random_uuid',
  'uuid_generate_v4',
  'timeofday',
  'statement_timestamp',
]);

/**
 * Checks if a default expression AST node is a volatile function call.
 */
export function isVolatileDefaultExpression(rawExpr: any): boolean {
  if (!rawExpr) return false;

  // funcCall AST
  if (rawExpr.funcCall) {
    const names = rawExpr.funcCall.funcname;
    if (Array.isArray(names) && names.length > 0) {
      const fnName = names[names.length - 1]?.string?.sval?.toLowerCase();
      if (fnName && VOLATILE_DEFAULT_FUNCTIONS.has(fnName)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if an expression is a static constant (string, integer, float, boolean, null).
 */
export function isConstantDefaultExpression(rawExpr: any): boolean {
  if (!rawExpr) return false;
  if (rawExpr.aConst) return true;

  // Type cast of a constant, e.g. 'active'::text or 0::bigint
  if (rawExpr.typeCast && rawExpr.typeCast.arg?.aConst) {
    return true;
  }

  return false;
}

/**
 * Checks if a type alteration is binary-compatible (metadata-only update, no table rewrite).
 */
export function isBinaryCompatibleTypeChange(
  currentType: string,
  currentLength: number | undefined,
  targetType: string,
  targetLength: number | undefined
): boolean {
  const cur = currentType.toLowerCase();
  const tgt = targetType.toLowerCase();

  // varchar(x) to varchar(y) where y >= x
  if (cur === 'varchar' && tgt === 'varchar') {
    if (currentLength !== undefined && targetLength !== undefined) {
      return targetLength >= currentLength;
    }
    // varchar(n) to unconstrained varchar
    if (targetLength === undefined) {
      return true;
    }
  }

  // varchar(n) to text
  if (cur === 'varchar' && tgt === 'text') {
    return true;
  }

  // Same exact type with no length restriction change
  if (cur === tgt && currentLength === targetLength) {
    return true;
  }

  return false;
}
