import type { StatementNode, SourceLocation } from './types.js';
import { offsetToLocation, extractSnippet, type ParsedFile } from './parser.js';

export interface ASTVisitorContext {
  file: string;
  parsed: ParsedFile;
  statementIndex: number;
  totalStatements: number;
  rawStmt: StatementNode;
  stmtKey: string;
  stmtBody: any;
  location: SourceLocation;
  snippet: string;
  isInTransaction: boolean;
}

export type NodeHandler = (context: ASTVisitorContext) => void;

export class ASTWalker {
  private handlers = new Map<string, NodeHandler[]>();

  public on(stmtKey: string, handler: NodeHandler): this {
    const list = this.handlers.get(stmtKey) || [];
    list.push(handler);
    this.handlers.set(stmtKey, list);
    return this;
  }

  public walk(file: string, parsed: ParsedFile): void {
    let inTransaction = false;

    for (let i = 0; i < parsed.stmts.length; i++) {
      const rawStmt = parsed.stmts[i]!;
      const stmtObj = rawStmt.stmt;
      if (!stmtObj) continue;

      const offset = rawStmt.stmtLocation ?? 0;
      const length = rawStmt.stmtLen ?? 0;
      const location = offsetToLocation(offset, parsed.lineOffsets);
      const snippet = extractSnippet(parsed.content, offset, length);

      const keys = Object.keys(stmtObj);
      for (const key of keys) {
        const body = stmtObj[key];

        // Track transaction state
        if (key === 'transactionStmt') {
          const kind = body?.kind;
          if (kind === 'TRANS_STMT_BEGIN' || kind === 'TRANS_STMT_START') {
            inTransaction = true;
          } else if (kind === 'TRANS_STMT_COMMIT' || kind === 'TRANS_STMT_ROLLBACK') {
            inTransaction = false;
          }
        }

        const ctx: ASTVisitorContext = {
          file,
          parsed,
          statementIndex: i,
          totalStatements: parsed.stmts.length,
          rawStmt,
          stmtKey: key,
          stmtBody: body,
          location,
          snippet,
          isInTransaction: inTransaction,
        };

        const list = this.handlers.get(key);
        if (list) {
          for (const handler of list) {
            handler(ctx);
          }
        }

        // Global wildcard handlers
        const wildcard = this.handlers.get('*');
        if (wildcard) {
          for (const handler of wildcard) {
            handler(ctx);
          }
        }
      }
    }
  }
}
