declare module 'sql.js' {
  interface SqlJsStatic {
    Database: typeof Database
  }

  interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  interface ParamsObject {
    [key: string]: string | number | null | Uint8Array
  }

  type BindParams = ParamsObject | (string | number | null | Uint8Array)[]

  class Database {
    constructor(data?: ArrayLike<number> | Buffer | null)
    run(sql: string, params?: BindParams): Database
    exec(sql: string, params?: BindParams): QueryExecResult[]
    export(): Uint8Array
    close(): void
  }

  interface SqlJsConfig {
    locateFile?: (filename: string) => string
  }

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>
  export { Database, QueryExecResult, BindParams, ParamsObject, SqlJsStatic }
}
