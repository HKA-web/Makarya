import { app } from 'electron'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'

export interface DbInfo {
  dbPath: string
  exists: boolean
  sizeBytes: number
  tableCount: number
  tables: string[]
  version: string
}

export class DatabaseService {
  private db: Database | null = null
  private SQL: SqlJsStatic | null = null
  private dbFilePath: string = ''
  private isInitialized = false
  private saveDebounceTimer: NodeJS.Timeout | null = null

  constructor() {
    try {
      const userDataDir = app.getPath('userData')
      this.dbFilePath = join(userDataDir, 'makarya_main.sqlite')
    } catch {
      // Fallback for testing environments where electron app is not yet ready
      this.dbFilePath = join(process.cwd(), 'makarya_main.sqlite')
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized && this.db) return

    try {
      this.SQL = await initSqlJs()

      if (existsSync(this.dbFilePath)) {
        const fileBuffer = await readFile(this.dbFilePath)
        this.db = new this.SQL.Database(new Uint8Array(fileBuffer))
        console.log(`[DatabaseService] Berhasil memuat SQLite dari: ${this.dbFilePath}`)
      } else {
        this.db = new this.SQL.Database()
        console.log(`[DatabaseService] Membuat database SQLite baru di: ${this.dbFilePath}`)
      }

      this.runInitialMigrations()
      await this.saveToDiskImmediately()
      this.isInitialized = true
    } catch (err) {
      console.error('[DatabaseService] Gagal menginisialisasi database SQLite:', err)
      throw err
    }
  }

  private runInitialMigrations(): void {
    if (!this.db) return

    // 1. Settings & Config
    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // 2. Workspace History
    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspace_history (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        last_opened_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // 3. AI Agent Chat Sessions
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        model TEXT,
        project_root TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // 4. AI Agent Chat Messages
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT DEFAULT 'default',
        role TEXT NOT NULL,
        content TEXT,
        thoughts TEXT,
        attached_files TEXT,
        images TEXT,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
    `)

    // 5. Database Metadata
    this.db.run(`
      CREATE TABLE IF NOT EXISTS db_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)

    // Seed initial metadata
    this.db.run(
      `INSERT OR IGNORE INTO db_metadata (key, value) VALUES ('schema_version', '1.0.0'), ('app_name', 'Makarya IDE');`
    )
  }

  public async saveToDiskImmediately(): Promise<void> {
    if (!this.db) return
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      const parentDir = join(this.dbFilePath, '..')
      if (!existsSync(parentDir)) {
        await mkdir(parentDir, { recursive: true })
      }
      await writeFile(this.dbFilePath, buffer)
    } catch (err) {
      console.error('[DatabaseService] Gagal menyimpan file SQLite ke disk:', err)
    }
  }

  private queueSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
    }
    this.saveDebounceTimer = setTimeout(() => {
      this.saveToDiskImmediately()
    }, 500)
  }

  public async getDbInfo(): Promise<DbInfo> {
    await this.initialize()
    let sizeBytes = 0
    let fileExists = false

    if (existsSync(this.dbFilePath)) {
      fileExists = true
      const fileStat = await stat(this.dbFilePath)
      sizeBytes = fileStat.size
    }

    const tables: string[] = []
    if (this.db) {
      const res = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
      if (res.length > 0 && res[0].values) {
        for (const row of res[0].values) {
          tables.push(String(row[0]))
        }
      }
    }

    return {
      dbPath: this.dbFilePath,
      exists: fileExists,
      sizeBytes,
      tableCount: tables.length,
      tables,
      version: 'SQLite 3 (WASM / sql.js)'
    }
  }

  // --- Setting Operations ---
  public getSetting(key: string): string | null {
    if (!this.db) return null
    try {
      const stmt = this.db.prepare('SELECT value FROM app_settings WHERE key = ?')
      stmt.bind([key])
      if (stmt.step()) {
        const row = stmt.getAsObject()
        stmt.free()
        return String(row.value)
      }
      stmt.free()
      return null
    } catch {
      return null
    }
  }

  public setSetting(key: string, value: string): boolean {
    if (!this.db) return false
    try {
      this.db.run(
        'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value]
      )
      this.queueSave()
      return true
    } catch (err) {
      console.error('[DatabaseService] setSetting error:', err)
      return false
    }
  }

  // --- Workspace History Operations ---
  public getWorkspaces(): Array<{ id: string; path: string; name: string; last_opened_at: string }> {
    if (!this.db) return []
    try {
      const res = this.db.exec('SELECT id, path, name, last_opened_at FROM workspace_history ORDER BY last_opened_at DESC')
      if (res.length === 0 || !res[0].values) return []
      return res[0].values.map((v) => ({
        id: String(v[0]),
        path: String(v[1]),
        name: String(v[2]),
        last_opened_at: String(v[3])
      }))
    } catch {
      return []
    }
  }

  public saveWorkspace(folderPath: string, folderName: string): boolean {
    if (!this.db) return false
    try {
      const id = `ws-${Date.now()}`
      this.db.run(
        'INSERT OR REPLACE INTO workspace_history (id, path, name, last_opened_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [id, folderPath, folderName]
      )
      this.queueSave()
      return true
    } catch (err) {
      console.error('[DatabaseService] saveWorkspace error:', err)
      return false
    }
  }

  public deleteWorkspace(folderPath: string): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM workspace_history WHERE path = ?', [folderPath])
      this.queueSave()
      return true
    } catch {
      return false
    }
  }

  // --- Chat Sessions Master-Detail Operations ---
  public getChatSessions(): any[] {
    if (!this.db) return []
    try {
      const sql = `
        SELECT 
          s.id, 
          s.title, 
          s.model, 
          s.project_root, 
          s.created_at, 
          s.updated_at,
          COUNT(m.id) AS message_count,
          (
            SELECT content FROM chat_messages 
            WHERE session_id = s.id 
            ORDER BY created_at DESC LIMIT 1
          ) AS last_message
        FROM chat_sessions s
        LEFT JOIN chat_messages m ON m.session_id = s.id
        GROUP BY s.id
        ORDER BY s.updated_at DESC
      `
      const stmt = this.db.prepare(sql)
      const results: any[] = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        results.push({
          id: row.id,
          title: row.title || 'Obrolan Tanpa Judul',
          model: row.model || 'Antigravity',
          projectRoot: row.project_root,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          messageCount: Number(row.message_count) || 0,
          lastMessage: row.last_message ? String(row.last_message).slice(0, 120) : ''
        })
      }
      stmt.free()
      return results
    } catch (err) {
      console.error('[DatabaseService] getChatSessions error:', err)
      return []
    }
  }

  public createOrUpdateSession(session: {
    id: string
    title?: string
    model?: string
    projectRoot?: string
  }): boolean {
    if (!this.db) return false
    try {
      this.db.run(
        `INSERT INTO chat_sessions (id, title, model, project_root, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           title = COALESCE(?, title),
           model = COALESCE(?, model),
           project_root = COALESCE(?, project_root),
           updated_at = CURRENT_TIMESTAMP`,
        [
          session.id,
          session.title || 'Obrolan Baru',
          session.model || null,
          session.projectRoot || null,
          session.title || null,
          session.model || null,
          session.projectRoot || null
        ]
      )
      this.queueSave()
      return true
    } catch (err) {
      console.error('[DatabaseService] createOrUpdateSession error:', err)
      return false
    }
  }

  public deleteSession(sessionId: string): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId])
      this.db.run('DELETE FROM chat_sessions WHERE id = ?', [sessionId])
      this.queueSave()
      return true
    } catch (err) {
      console.error('[DatabaseService] deleteSession error:', err)
      return false
    }
  }

  // --- Chat Messages Operations ---
  public saveChatMessage(msg: {
    id: string
    sessionId?: string
    role: string
    content: string
    thoughts?: string
    attachedFiles?: any
    images?: any
    model?: string
    projectRoot?: string
  }): boolean {
    if (!this.db) return false
    const sessionId = msg.sessionId || 'default'
    try {
      // 1. Ensure master session exists or update timestamp
      this.db.run(
        `INSERT INTO chat_sessions (id, title, model, project_root, created_at, updated_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           updated_at = CURRENT_TIMESTAMP,
           model = COALESCE(?, model)`,
        [
          sessionId,
          msg.role === 'user' && msg.content ? msg.content.slice(0, 45).replace(/[\r\n]+/g, ' ') : 'Obrolan AI',
          msg.model || null,
          msg.projectRoot || null,
          msg.model || null
        ]
      )

      // 2. Insert chat message detail
      this.db.run(
        `INSERT OR REPLACE INTO chat_messages (id, session_id, role, content, thoughts, attached_files, images, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          msg.id,
          sessionId,
          msg.role,
          msg.content,
          msg.thoughts || null,
          msg.attachedFiles ? JSON.stringify(msg.attachedFiles) : null,
          msg.images ? JSON.stringify(msg.images) : null,
          msg.model || null
        ]
      )
      this.queueSave()
      return true
    } catch (err) {
      console.error('[DatabaseService] saveChatMessage error:', err)
      return false
    }
  }

  public getChatHistory(sessionId = 'default', limit = 200): any[] {
    if (!this.db) return []
    try {
      const stmt = this.db.prepare(
        'SELECT id, session_id, role, content, thoughts, attached_files, images, model, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
      )
      stmt.bind([sessionId, limit])
      const results: any[] = []
      while (stmt.step()) {
        const row = stmt.getAsObject()
        results.push({
          id: row.id,
          sessionId: row.session_id,
          role: row.role,
          content: row.content,
          thoughts: row.thoughts,
          attachedFiles: row.attached_files ? JSON.parse(String(row.attached_files)) : undefined,
          images: row.images ? JSON.parse(String(row.images)) : undefined,
          model: row.model,
          timestamp: row.created_at
        })
      }
      stmt.free()
      return results
    } catch {
      return []
    }
  }

  public clearChatHistory(sessionId = 'default'): boolean {
    if (!this.db) return false
    try {
      this.db.run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId])
      this.db.run('DELETE FROM chat_sessions WHERE id = ?', [sessionId])
      this.queueSave()
      return true
    } catch {
      return false
    }
  }

  // --- Generic SQL Query Executor (Useful for AI and developer tools) ---
  public executeQuery(sql: string, params: any[] = []): { success: boolean; data?: any; error?: string } {
    if (!this.db) return { success: false, error: 'Database belum terinisialisasi' }
    try {
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const res = this.db.exec(sql)
        if (res.length === 0) return { success: true, data: [] }
        const columns = res[0].columns
        const rows = res[0].values.map((val) => {
          const obj: Record<string, any> = {}
          columns.forEach((col, idx) => {
            obj[col] = val[idx]
          })
          return obj
        })
        return { success: true, data: rows }
      } else {
        this.db.run(sql, params)
        this.queueSave()
        return { success: true, data: { message: 'Perintah SQL berhasil dijalankan' } }
      }
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) }
    }
  }
}

export const databaseService = new DatabaseService()
