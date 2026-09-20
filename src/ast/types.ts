/**
 * PostgreSQL AST TypeScript definitions for libpg-query-wasm.
 */

export interface SourceLocation {
  line: number;
  column: number;
  offset: number;
}

export interface StatementNode {
  stmt: Record<string, any>;
  stmtLocation?: number;
  stmtLen?: number;
}

export interface ParseOutput {
  version: number;
  stmts: StatementNode[];
}

export interface RelationRef {
  relname: string;
  schemaname?: string;
  inh?: boolean;
  relpersistence?: string;
  location?: number;
}

export interface ColumnDefNode {
  colname?: string;
  typeName?: {
    names?: Array<{ string?: { sval?: string } }>;
    typmods?: Array<{ aConst?: { ival?: { ival?: number } } }>;
    typemod?: number;
    location?: number;
  };
  constraints?: Array<{
    constraint?: ConstraintNode;
  }>;
  location?: number;
}

export interface ConstraintNode {
  contype?:
    | 'CONSTR_NULL'
    | 'CONSTR_NOTNULL'
    | 'CONSTR_DEFAULT'
    | 'CONSTR_CHECK'
    | 'CONSTR_PRIMARY'
    | 'CONSTR_UNIQUE'
    | 'CONSTR_EXCLUSION'
    | 'CONSTR_FOREIGN'
    | 'CONSTR_ATTR_DEFERRABLE'
    | 'CONSTR_ATTR_NOT_DEFERRABLE'
    | 'CONSTR_ATTR_DEFERRED'
    | 'CONSTR_ATTR_IMMEDIATE';
  conname?: string;
  location?: number;
  rawExpr?: any;
  initiallyValid?: boolean;
  skipValidation?: boolean;
  pktable?: RelationRef;
  fkAttrs?: Array<{ string?: { sval?: string } }>;
  pkAttrs?: Array<{ string?: { sval?: string } }>;
  keys?: Array<{ string?: { sval?: string } }>;
}

export interface AlterTableCmdNode {
  subtype?: string;
  name?: string;
  def?: {
    columnDef?: ColumnDefNode;
    constraint?: ConstraintNode;
  };
  behavior?: string;
}

export interface AlterTableStmtNode {
  relation: RelationRef;
  cmds: Array<{ alterTableCmd: AlterTableCmdNode }>;
  objtype?: string;
}

export interface IndexStmtNode {
  idxname?: string;
  relation: RelationRef;
  accessMethod?: string;
  indexParams?: any[];
  concurrent?: boolean;
  unique?: boolean;
}

export interface DropStmtNode {
  objects?: Array<{
    list?: {
      items?: Array<{ string?: { sval?: string } }>;
    };
  }>;
  removeType?: string;
  behavior?: string;
  concurrent?: boolean;
}

export interface VariableSetStmtNode {
  kind?: string;
  name?: string;
  args?: any[];
  isLocal?: boolean;
}

export interface RenameStmtNode {
  renameType?: string;
  relationType?: string;
  relation?: RelationRef;
  subname?: string;
  newname?: string;
  behavior?: string;
}

export interface VacuumStmtNode {
  options?: Array<{
    defElem?: {
      defname?: string;
      location?: number;
    };
  }>;
  rels?: Array<{
    vacuumRelation?: {
      relation?: RelationRef;
    };
  }>;
  isVacuumcmd?: boolean;
}

export interface ClusterStmtNode {
  relation?: RelationRef;
  indexname?: string;
}

export interface TransactionStmtNode {
  kind?:
    | 'TRANS_STMT_BEGIN'
    | 'TRANS_STMT_START'
    | 'TRANS_STMT_COMMIT'
    | 'TRANS_STMT_ROLLBACK'
    | 'TRANS_STMT_SAVEPOINT'
    | 'TRANS_STMT_RELEASE'
    | 'TRANS_STMT_ROLLBACK_TO';
}
