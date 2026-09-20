import { parse as wasmParse, ParseResult } from 'libpg-query-wasm';
import type { StatementNode, SourceLocation } from './types.js';

export interface ParsedFile {
  content: string;
  stmts: StatementNode[];
  lineOffsets: number[];
}

/**
 * Pre-computes line start offsets for efficient O(log N) line/col translation.
 */
export function computeLineOffsets(content: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/**
 * Translates a zero-based character offset to a 1-based line and column.
 */
export function offsetToLocation(offset: number, lineOffsets: number[]): SourceLocation {
  if (offset < 0) {
    return { line: 1, column: 1, offset: 0 };
  }

  let low = 0;
  let high = lineOffsets.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const lineStart = lineOffsets[mid]!;

    if (lineStart <= offset) {
      if (mid === lineOffsets.length - 1 || lineOffsets[mid + 1]! > offset) {
        return {
          line: mid + 1,
          column: offset - lineStart + 1,
          offset,
        };
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return { line: 1, column: 1, offset };
}

/**
 * Skips leading whitespace and SQL comments to find the actual start of the statement keyword.
 */
export function findStatementStart(content: string, rawOffset = 0): number {
  let offset = Math.max(0, rawOffset);
  while (offset < content.length) {
    if (/\s/.test(content[offset]!)) {
      offset++;
      continue;
    }
    if (content.slice(offset, offset + 2) === '--') {
      const nextNl = content.indexOf('\n', offset);
      offset = nextNl === -1 ? content.length : nextNl + 1;
      continue;
    }
    if (content.slice(offset, offset + 2) === '/*') {
      const endComment = content.indexOf('*/', offset);
      offset = endComment === -1 ? content.length : endComment + 2;
      continue;
    }
    break;
  }
  return offset;
}

/**
 * Extracts a code snippet for a given statement from the original SQL content.
 */
export function extractSnippet(
  content: string,
  startOffset?: number,
  length?: number
): string {
  if (startOffset === undefined) return '';
  const realStart = findStatementStart(content, startOffset);
  const consumed = realStart - startOffset;
  const remainingLen = length && length > consumed ? length - consumed : 100;
  return content.slice(realStart, realStart + remainingLen).trim();
}

/**
 * Parses raw SQL string into structured AST statements using libpg-query WebAssembly.
 */
export function parseSql(content: string): ParsedFile {
  const lineOffsets = computeLineOffsets(content);

  // Return empty list on empty or whitespace-only content
  if (!content.trim()) {
    return { content, stmts: [], lineOffsets };
  }

  try {
    const rawResult = wasmParse(content);
    const parsed = ParseResult.toObject(rawResult, { enums: String }) as {
      stmts?: StatementNode[];
    };

    return {
      content,
      stmts: parsed.stmts || [],
      lineOffsets,
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const locationMatch = errorMsg.match(/at position (\d+)/i);
    const offset = locationMatch ? parseInt(locationMatch[1], 10) : 0;
    const loc = offsetToLocation(offset, lineOffsets);

    const syntaxError = new Error(`SQL syntax error: ${errorMsg} at line ${loc.line}, column ${loc.column}`);
    (syntaxError as any).location = loc;
    throw syntaxError;
  }
}
