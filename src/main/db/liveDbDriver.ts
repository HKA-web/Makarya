import { Client as PgClient } from 'pg'
import * as mysql from 'mysql2/promise'
import { Connection as TediousConnection, Request as TediousRequest } from 'tedious'
import * as fs from 'fs'

export interface DbConnectionConfig {
  type: 'sqlserver' | 'mysql' | 'postgres' | 'sqlite' | string
  host: string
  port?: number
  database: string
  username?: string
  password?: string
  authType?: 'sql_auth' | 'windows_auth' | 'none' | string
}

export interface TableColumnSchema {
  name: string
  type: string
  isPrimary?: boolean
  isNullable?: boolean
  defaultValue?: string
}

export interface TableSchemaInfo {
  name: string
  schema?: string
  columns: TableColumnSchema[]
  rowCount?: number
}

export interface SchemaInspectionResult {
  success: boolean
  database: string
  dbType: string
  tableCount: number
  tables: TableSchemaInfo[]
  message?: string
  error?: string
}

export interface QueryExecutionResult {
  success: boolean
  rowCount: number
  columns: string[]
  rows: any[]
  durationMs: number
  error?: string
}

export class LiveDatabaseDriverService {
  /**
   * Test live authentication & connectivity against target DBMS
   */
  public async testConnection(config: DbConnectionConfig): Promise<{
    success: boolean
    latencyMs?: number
    message?: string
    error?: string
  }> {
    const startTime = Date.now()
    const dbType = (config.type || 'postgres').toLowerCase()

    try {
      if (dbType === 'postgres') {
        const client = new PgClient({
          host: config.host || 'localhost',
          port: Number(config.port) || 5432,
          database: config.database || 'postgres',
          user: config.username || 'postgres',
          password: config.password || '',
          connectionTimeoutMillis: 5000
        })

        await client.connect()
        const res = await client.query('SELECT version() as ver, current_database() as db')
        await client.end()

        const latency = Date.now() - startTime
        return {
          success: true,
          latencyMs: latency,
          message: `Berhasil terhubung ke PostgreSQL (${res.rows[0]?.db || config.database}) pada ${config.host}:${config.port || 5432}. Latency: ${latency}ms.`
        }
      }

      if (dbType === 'mysql') {
        const connection = await mysql.createConnection({
          host: config.host || 'localhost',
          port: Number(config.port) || 3306,
          database: config.database,
          user: config.username || 'root',
          password: config.password || '',
          connectTimeout: 5000
        })

        const [rows] = await connection.query('SELECT VERSION() as ver, DATABASE() as db')
        await connection.end()

        const latency = Date.now() - startTime
        return {
          success: true,
          latencyMs: latency,
          message: `Berhasil terhubung ke MySQL (${config.database}) pada ${config.host}:${config.port || 3306}. Latency: ${latency}ms.`
        }
      }

      if (dbType === 'sqlite') {
        const filePath = config.host || config.database
        if (fs.existsSync(filePath)) {
          return {
            success: true,
            latencyMs: Date.now() - startTime,
            message: `Berkas SQLite terverifikasi dan dapat diakses: ${filePath}`
          }
        } else {
          return {
            success: true,
            latencyMs: Date.now() - startTime,
            message: `Lokasi berkas SQLite siap dibuat: ${filePath}`
          }
        }
      }

      if (dbType === 'sqlserver') {
        return new Promise((resolve) => {
          const tediousConfig: any = {
            server: config.host || 'localhost',
            authentication: {
              type: config.authType === 'windows_auth' ? 'ntlm' : 'default',
              options: {
                userName: config.username || 'sa',
                password: config.password || ''
              }
            },
            options: {
              port: Number(config.port) || 1433,
              database: config.database,
              encrypt: false,
              trustServerCertificate: true,
              connectTimeout: 5000
            }
          }

          const connection = new TediousConnection(tediousConfig)
          connection.on('connect', (err) => {
            if (err) {
              connection.close()
              resolve({
                success: false,
                error: `Gagal otentikasi SQL Server: ${err.message}`
              })
            } else {
              const latency = Date.now() - startTime
              connection.close()
              resolve({
                success: true,
                latencyMs: latency,
                message: `Berhasil terhubung ke SQL Server (${config.database}) pada ${config.host}:${config.port || 1433}. Latency: ${latency}ms.`
              })
            }
          })
          connection.on('error', (err) => {
            connection.close()
            resolve({
              success: false,
              error: `Koneksi SQL Server error: ${err.message}`
            })
          })
          connection.connect()
        })
      }

      return {
        success: false,
        error: `Tipe database "${dbType}" belum didukung.`
      }
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err)
      }
    }
  }

  /**
   * Inspect live tables and column schema from target database
   */
  public async inspectSchema(config: DbConnectionConfig): Promise<SchemaInspectionResult> {
    const dbType = (config.type || 'postgres').toLowerCase()

    try {
      if (dbType === 'postgres') {
        const client = new PgClient({
          host: config.host || 'localhost',
          port: Number(config.port) || 5432,
          database: config.database || 'postgres',
          user: config.username || 'postgres',
          password: config.password || '',
          connectionTimeoutMillis: 5000
        })

        await client.connect()

        // Ambil daftar tabel yang ada di public schema atau user schemas
        const tablesQuery = `
          SELECT 
            table_schema, 
            table_name
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema') 
            AND table_type = 'BASE TABLE'
          ORDER BY table_schema, table_name;
        `
        const tablesRes = await client.query(tablesQuery)

        const columnsQuery = `
          SELECT 
            table_schema,
            table_name,
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name, ordinal_position;
        `
        const columnsRes = await client.query(columnsQuery)
        await client.end()

        const tablesMap = new Map<string, TableSchemaInfo>()

        for (const t of tablesRes.rows) {
          const key = t.table_schema === 'public' ? t.table_name : `${t.table_schema}.${t.table_name}`
          tablesMap.set(key, {
            name: key,
            schema: t.table_schema,
            columns: []
          })
        }

        for (const col of columnsRes.rows) {
          const key = col.table_schema === 'public' ? col.table_name : `${col.table_schema}.${col.table_name}`
          const table = tablesMap.get(key)
          if (table) {
            table.columns.push({
              name: col.column_name,
              type: col.data_type,
              isNullable: col.is_nullable === 'YES',
              defaultValue: col.column_default || undefined
            })
          }
        }

        const tables = Array.from(tablesMap.values())
        return {
          success: true,
          database: config.database,
          dbType: 'PostgreSQL',
          tableCount: tables.length,
          tables,
          message:
            tables.length > 0
              ? `Ditemukan ${tables.length} tabel di basis data PostgreSQL "${config.database}".`
              : `Basis data PostgreSQL "${config.database}" saat ini kosong (belum ada tabel yang dibuat).`
        }
      }

      if (dbType === 'mysql') {
        const connection = await mysql.createConnection({
          host: config.host || 'localhost',
          port: Number(config.port) || 3306,
          database: config.database,
          user: config.username || 'root',
          password: config.password || '',
          connectTimeout: 5000
        })

        const [tablesRows]: any = await connection.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = ? AND table_type = 'BASE TABLE'
          ORDER BY table_name;
        `, [config.database])

        const [colsRows]: any = await connection.query(`
          SELECT table_name, column_name, data_type, is_nullable, column_default, column_key
          FROM information_schema.columns
          WHERE table_schema = ?
          ORDER BY table_name, ordinal_position;
        `, [config.database])

        await connection.end()

        const tablesMap = new Map<string, TableSchemaInfo>()
        for (const t of tablesRows) {
          tablesMap.set(t.table_name, {
            name: t.table_name,
            columns: []
          })
        }

        for (const col of colsRows) {
          const table = tablesMap.get(col.table_name)
          if (table) {
            table.columns.push({
              name: col.column_name,
              type: col.data_type,
              isPrimary: col.column_key === 'PRI',
              isNullable: col.is_nullable === 'YES',
              defaultValue: col.column_default || undefined
            })
          }
        }

        const tables = Array.from(tablesMap.values())
        return {
          success: true,
          database: config.database,
          dbType: 'MySQL',
          tableCount: tables.length,
          tables,
          message:
            tables.length > 0
              ? `Ditemukan ${tables.length} tabel di basis data MySQL "${config.database}".`
              : `Basis data MySQL "${config.database}" saat ini kosong (belum ada tabel).`
        }
      }

      return {
        success: false,
        database: config.database,
        dbType,
        tableCount: 0,
        tables: [],
        error: `Inspeksi skema untuk ${dbType} belum diimplementasikan atau memerlukan driver khusus.`
      }
    } catch (err: any) {
      return {
        success: false,
        database: config.database,
        dbType,
        tableCount: 0,
        tables: [],
        error: `Gagal membaca skema database: ${err?.message || String(err)}`
      }
    }
  }

  /**
   * Execute real live query on target database
   */
  public async executeQuery(
    config: DbConnectionConfig,
    sql: string,
    limit: number = 20
  ): Promise<QueryExecutionResult> {
    const startTime = Date.now()
    const dbType = (config.type || 'postgres').toLowerCase()

    try {
      if (dbType === 'postgres') {
        const client = new PgClient({
          host: config.host || 'localhost',
          port: Number(config.port) || 5432,
          database: config.database || 'postgres',
          user: config.username || 'postgres',
          password: config.password || '',
          connectionTimeoutMillis: 5000
        })

        await client.connect()
        const queryToRun = /^\s*SELECT\b/i.test(sql) && !/\bLIMIT\b/i.test(sql)
          ? `${sql.trim().replace(/;$/, '')} LIMIT ${limit};`
          : sql

        const res = await client.query(queryToRun)
        await client.end()

        const duration = Date.now() - startTime
        const columns = res.fields ? res.fields.map((f) => f.name) : []

        return {
          success: true,
          rowCount: res.rowCount || (res.rows ? res.rows.length : 0),
          columns,
          rows: res.rows || [],
          durationMs: duration
        }
      }

      if (dbType === 'mysql') {
        const connection = await mysql.createConnection({
          host: config.host || 'localhost',
          port: Number(config.port) || 3306,
          database: config.database,
          user: config.username || 'root',
          password: config.password || '',
          connectTimeout: 5000
        })

        const queryToRun = /^\s*SELECT\b/i.test(sql) && !/\bLIMIT\b/i.test(sql)
          ? `${sql.trim().replace(/;$/, '')} LIMIT ${limit};`
          : sql

        const [results, fields]: any = await connection.query(queryToRun)
        await connection.end()

        const duration = Date.now() - startTime
        const columns = Array.isArray(fields) ? fields.map((f: any) => f.name) : []
        const rows = Array.isArray(results) ? results : []

        return {
          success: true,
          rowCount: rows.length,
          columns,
          rows,
          durationMs: duration
        }
      }

      return {
        success: false,
        rowCount: 0,
        columns: [],
        rows: [],
        durationMs: Date.now() - startTime,
        error: `Eksekusi kueri langsung untuk ${dbType} belum diaktifkan.`
      }
    } catch (err: any) {
      return {
        success: false,
        rowCount: 0,
        columns: [],
        rows: [],
        durationMs: Date.now() - startTime,
        error: `Gagal mengeksekusi kueri: ${err?.message || String(err)}`
      }
    }
  }
}

export const liveDatabaseDriverService = new LiveDatabaseDriverService()
