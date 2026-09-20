/**
 * Parser for inline SQL comment directives (e.g. -- pg-lockguard-disable-next-line PG001).
 */

export interface ParsedDirectives {
  ignoreFile: boolean;
  isRuleDisabled: (ruleId: string, line: number) => boolean;
}

export function parseDirectives(sql: string): ParsedDirectives {
  const lines = sql.split(/\r?\n/);
  let ignoreFile = false;

  // line -> Set of disabled rule IDs
  const nextLineDisabled = new Map<number, Set<string>>();
  // ruleId -> list of line ranges [start, end]
  const rangeDisabled = new Map<string, Array<{ start: number; end: number }>>();
  // Active open range starts: ruleId -> startLine
  const activeStarts = new Map<string, number>();

  const normalizeRuleId = (r: string) => r.trim().toUpperCase();

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1; // 1-based
    const line = lines[i]!.trim();

    if (!line.startsWith('--')) continue;

    const commentBody = line.replace(/^--+\s*/, '').trim();

    // 1. Check ignore-file
    if (/^pg-lockguard-ignore-file\b/i.test(commentBody)) {
      ignoreFile = true;
      continue;
    }

    // 2. Check disable-next-line
    const disableNextMatch = commentBody.match(/^pg-lockguard-disable-next-line\s+([^\s#]+)/i);
    if (disableNextMatch && disableNextMatch[1]) {
      const targetLine = lineNum + 1;
      const ruleList = disableNextMatch[1].split(',').map(normalizeRuleId);
      const set = nextLineDisabled.get(targetLine) || new Set<string>();
      for (const r of ruleList) {
        set.add(r);
      }
      nextLineDisabled.set(targetLine, set);
      continue;
    }

    // 3. Check disable (range)
    const disableMatch = commentBody.match(/^pg-lockguard-disable\s+([^\s#]+)/i);
    if (disableMatch && disableMatch[1]) {
      const ruleList = disableMatch[1].split(',').map(normalizeRuleId);
      for (const r of ruleList) {
        if (!activeStarts.has(r)) {
          activeStarts.set(r, lineNum);
        }
      }
      continue;
    }

    // 4. Check enable (end range)
    const enableMatch = commentBody.match(/^pg-lockguard-enable\s+([^\s#]+)/i);
    if (enableMatch && enableMatch[1]) {
      const ruleList = enableMatch[1].split(',').map(normalizeRuleId);
      for (const r of ruleList) {
        const start = activeStarts.get(r);
        if (start !== undefined) {
          const list = rangeDisabled.get(r) || [];
          list.push({ start, end: lineNum });
          rangeDisabled.set(r, list);
          activeStarts.delete(r);
        }
      }
      continue;
    }
  }

  // Close any unclosed active ranges to the end of the file
  for (const [r, start] of activeStarts.entries()) {
    const list = rangeDisabled.get(r) || [];
    list.push({ start, end: lines.length + 1 });
    rangeDisabled.set(r, list);
  }

  const isRuleDisabled = (ruleId: string, line: number): boolean => {
    if (ignoreFile) return true;

    const normalized = normalizeRuleId(ruleId);

    // Check single-line suppression
    const lineRules = nextLineDisabled.get(line);
    if (lineRules && (lineRules.has(normalized) || lineRules.has('ALL'))) {
      return true;
    }

    // Check block range suppression
    const ranges = rangeDisabled.get(normalized) || [];
    const allRanges = rangeDisabled.get('ALL') || [];
    const combined = [...ranges, ...allRanges];

    for (const range of combined) {
      if (line >= range.start && line <= range.end) {
        return true;
      }
    }

    return false;
  };

  return {
    ignoreFile,
    isRuleDisabled,
  };
}
