import { ipcMain, BrowserWindow } from 'electron'
import * as pty from 'node-pty'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

interface TerminalSession {
  id: string
  ptyProcess: pty.IPty
  shell: string
  cwd: string
}

class TerminalService {
  private sessions = new Map<string, TerminalSession>()

  public init(): void {
    // 1. Create a new PTY terminal session
    ipcMain.handle(
      'terminal:create',
      async (
        event,
        options: {
          id: string
          cols?: number
          rows?: number
          cwd?: string
          shell?: string
        }
      ) => {
        try {
          const targetWindow = BrowserWindow.fromWebContents(event.sender)
          const targetId = options.id || `term-${Date.now()}`

          // If a session with this ID already exists, kill it first
          this.killSession(targetId)

          // Determine working directory
          let initialCwd = process.cwd()
          if (options.cwd && existsSync(options.cwd)) {
            initialCwd = resolve(options.cwd)
          }

          // Determine shell on Windows
          let shellExecutable = 'powershell.exe'
          if (options.shell === 'cmd') {
            shellExecutable = process.env.COMSPEC || 'cmd.exe'
          } else if (options.shell === 'bash') {
            // Check Git Bash and WSL standard locations
            const localAppData = process.env.LOCALAPPDATA || ''
            const gitBashPaths = [
              'C:\\Program Files\\Git\\bin\\bash.exe',
              'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
              resolve(localAppData, 'Programs', 'Git', 'bin', 'bash.exe'),
              'C:\\Git\\bin\\bash.exe',
              'C:\\Git\\usr\\bin\\bash.exe'
            ]
            const foundBash = gitBashPaths.find((p) => existsSync(p))
            if (foundBash) {
              shellExecutable = foundBash
            } else {
              shellExecutable = 'bash.exe'
            }
          }

          const cols = Math.max(20, options.cols || 80)
          const rows = Math.max(5, options.rows || 24)

          const ptyProcess = pty.spawn(shellExecutable, [], {
            name: 'xterm-256color',
            cols,
            rows,
            cwd: initialCwd,
            env: {
              ...process.env,
              COLORTERM: 'truecolor',
              TERM: 'xterm-256color'
            }
          })

          ptyProcess.onData((data: string) => {
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('terminal:data', {
                id: targetId,
                data
              })
            }
          })

          ptyProcess.onExit((exitStatus: { exitCode: number; signal?: number }) => {
            this.sessions.delete(targetId)
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('terminal:exit', {
                id: targetId,
                exitCode: exitStatus.exitCode
              })
            }
          })

          this.sessions.set(targetId, {
            id: targetId,
            ptyProcess,
            shell: shellExecutable,
            cwd: initialCwd
          })

          return { success: true, id: targetId, shell: shellExecutable, cwd: initialCwd }
        } catch (error: any) {
          console.error('[TerminalService] Failed to create terminal session:', error)
          return { success: false, error: error?.message || 'Gagal memulai sesi terminal' }
        }
      }
    )

    // 2. Write data into PTY stdin
    ipcMain.handle('terminal:write', async (_event, payload: { id: string; data: string }) => {
      const session = this.sessions.get(payload.id)
      if (session) {
        try {
          session.ptyProcess.write(payload.data)
          return { success: true }
        } catch (err: any) {
          return { success: false, error: err?.message }
        }
      }
      return { success: false, error: 'Terminal session not found' }
    })

    // 3. Resize PTY terminal geometry
    ipcMain.handle(
      'terminal:resize',
      async (_event, payload: { id: string; cols: number; rows: number }) => {
        const session = this.sessions.get(payload.id)
        if (session) {
          try {
            const cols = Math.max(10, Math.floor(payload.cols))
            const rows = Math.max(2, Math.floor(payload.rows))
            session.ptyProcess.resize(cols, rows)
            return { success: true }
          } catch (err: any) {
            return { success: false, error: err?.message }
          }
        }
        return { success: false, error: 'Terminal session not found' }
      }
    )

    // 4. Kill/close PTY terminal session
    ipcMain.handle('terminal:kill', async (_event, payload: { id: string }) => {
      this.killSession(payload.id)
      return { success: true }
    })
  }

  public killSession(id: string): void {
    const session = this.sessions.get(id)
    if (session) {
      try {
        session.ptyProcess.kill()
      } catch {
        // Ignored if already terminated
      }
      this.sessions.delete(id)
    }
  }

  public destroyAll(): void {
    for (const [id, session] of this.sessions.entries()) {
      try {
        session.ptyProcess.kill()
      } catch {
        // Ignored
      }
      this.sessions.delete(id)
    }
  }
}

export const terminalService = new TerminalService()
