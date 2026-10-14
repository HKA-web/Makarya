import { BrowserWindow } from 'electron'
import { spawn, exec, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface AntigravityStreamRequest {
  requestId: string
  sessionId?: string
  model?: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  projectRoot?: string
  executionMode?: 'agent' | 'chat' | 'plan'
}

export interface AntigravityDiscoveredModel {
  id: string
  name: string
  provider?: string
  category: string
  isFree?: boolean
  source?: 'agy_cli'
}

export interface AntigravitySessionItem {
  id: string
  title: string
  updated?: string
  dateGroup?: string
  timestamp?: number
  updatedAt?: string
  lastMessage?: string
  subtitle?: string
  messageCount?: number
  isPinned?: boolean
  model?: string
}

export class AntigravityCliService {
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private sessionMap: Map<string, string> = new Map()

  private getBrainDirs(): string[] {
    const dirs: string[] = [
      join(homedir(), '.gemini', 'antigravity-cli', 'brain'),
      join(homedir(), '.gemini', 'antigravity-ide', 'brain')
    ]
    return dirs.filter((d) => existsSync(d))
  }

  private getAnnotationsDirs(): string[] {
    const dirs: string[] = [
      join(homedir(), '.gemini', 'antigravity-cli', 'annotations'),
      join(homedir(), '.gemini', 'antigravity-ide', 'annotations')
    ]
    return dirs.filter((d) => existsSync(d))
  }

  private getDateGroup(timestamp: number): string {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const oneDay = 24 * 60 * 60 * 1000

    if (timestamp >= startOfToday) return 'HARI INI'
    if (timestamp >= startOfToday - oneDay) return 'KEMARIN'
    if (timestamp >= startOfToday - 7 * oneDay) return '7 HARI TERAKHIR'
    return 'LEBIH LAMA'
  }

  /**
   * Discover available models from `agy models`
   */
  public async getDiscoveredModels(): Promise<AntigravityDiscoveredModel[]> {
    return new Promise((resolve) => {
      exec('agy models', { timeout: 6000 }, (error, stdout) => {
        if (error || !stdout) {
          // Fallback default list if command fails
          resolve([
            { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', provider: 'Google', category: 'Antigravity CLI', isFree: false, source: 'agy_cli' },
            { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)', provider: 'Google', category: 'Antigravity CLI', isFree: false, source: 'agy_cli' },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', provider: 'Anthropic', category: 'Antigravity CLI', isFree: false, source: 'agy_cli' },
            { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', provider: 'Anthropic', category: 'Antigravity CLI', isFree: false, source: 'agy_cli' },
            { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', provider: 'OpenAI', category: 'Antigravity CLI', isFree: false, source: 'agy_cli' }
          ])
          return
        }

        try {
          const lines = stdout.split(/\r?\n/)
          const models: AntigravityDiscoveredModel[] = []
          const seen = new Set<string>()

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('Fetching')) continue

            const parts = trimmed.split(/\t+|\s{2,}/)
            const id = parts[0]?.trim()
            if (!id || seen.has(id)) continue
            seen.add(id)

            const displayName = parts[1]?.trim() || id
            let provider = 'Google'
            if (id.toLowerCase().includes('claude')) provider = 'Anthropic'
            else if (id.toLowerCase().includes('gpt')) provider = 'OpenAI'

            models.push({
              id,
              name: displayName,
              provider,
              category: 'Antigravity CLI',
              isFree: id.includes('flash') || id.includes('low'),
              source: 'agy_cli'
            })
          }

          resolve(models.length > 0 ? models : [
            { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', provider: 'Google', category: 'Antigravity CLI', isFree: false, source: 'agy_cli' }
          ])
        } catch {
          resolve([])
        }
      })
    })
  }

  /**
   * Stream Antigravity agent prompt using `agy` CLI
   */
  public async streamAntigravity(
    payload: AntigravityStreamRequest,
    targetWindow: BrowserWindow
  ): Promise<void> {
    const { requestId, sessionId, messages, projectRoot, executionMode = 'agent', model } = payload

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

    if (!lastUserMessage) {
      targetWindow.webContents.send('agent:stream-error', {
        requestId,
        errorMessage: 'Pesan pengguna kosong'
      })
      return
    }

    let validProjectRoot: string | undefined = undefined
    if (projectRoot && projectRoot.trim() && existsSync(projectRoot.trim())) {
      validProjectRoot = projectRoot.trim()
    }

    const cwd = validProjectRoot || process.cwd()
    const cleanSessionId = sessionId ? sessionId.replace(/^agy_/, '') : undefined
    let effectiveConversationId: string | undefined = undefined

    const isUUID = cleanSessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSessionId)

    if (isUUID) {
      effectiveConversationId = cleanSessionId
    } else if (cleanSessionId && this.sessionMap.has(cleanSessionId)) {
      effectiveConversationId = this.sessionMap.get(cleanSessionId)
    }

    const cliArgs: string[] = [
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions'
    ]

    if (effectiveConversationId) {
      cliArgs.push('--conversation', effectiveConversationId)
    }

    if (model && model.trim()) {
      cliArgs.push('--model', model.trim())
    }

    if (executionMode === 'chat' || executionMode === 'plan') {
      cliArgs.push('--mode', 'plan')
    } else {
      cliArgs.push('--mode', 'accept-edits')
    }

    try {
      const proc = spawn('agy', cliArgs, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0' }
      })

      this.activeProcesses.set(requestId, proc)

      // Send user prompt via stdin safely
      proc.stdin?.write(lastUserMessage + '\n')
      proc.stdin?.end()

      // Announce mode & model immediately in thought box
      const activeModeName = executionMode === 'chat' || executionMode === 'plan' ? 'plan' : 'agent'
      const activeModelName = model || 'Gemini 3.8 Flash'
      targetWindow.webContents.send('agent:thought-token', {
        requestId,
        deltaThought: `> ${activeModeName} · ${activeModelName} · Antigravity CLI (agy)\n`
      })

      let buffer = ''
      let hasReceivedContent = false

      proc.stdout?.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const eventObj = JSON.parse(trimmed)

            // Event: init
            if (eventObj.event === 'init' && eventObj.conversation_id) {
              const assignedId = eventObj.conversation_id
              if (cleanSessionId) {
                this.sessionMap.set(cleanSessionId, assignedId)
              }
              targetWindow.webContents.send('agent:session-linked', {
                clientSessionId: sessionId || assignedId,
                antigravitySessionId: assignedId
              })
            }

            // Event: step_update
            if (eventObj.event === 'step_update' && eventObj.step_update) {
              const step = eventObj.step_update
              if (step.text_delta) {
                hasReceivedContent = true
                targetWindow.webContents.send('agent:stream-token', {
                  requestId,
                  deltaContent: step.text_delta
                })
              }
              if (step.thought_delta || step.reasoning_delta) {
                targetWindow.webContents.send('agent:thought-token', {
                  requestId,
                  deltaThought: step.thought_delta || step.reasoning_delta
                })
              }
            }

            // Event: result
            if (eventObj.event === 'result') {
              if (eventObj.result?.response && !hasReceivedContent) {
                hasReceivedContent = true
                targetWindow.webContents.send('agent:stream-token', {
                  requestId,
                  deltaContent: eventObj.result.response
                })
              }
            }
          } catch {
            // Non-JSON output fallback (e.g. raw text from CLI)
            hasReceivedContent = true
            targetWindow.webContents.send('agent:stream-token', {
              requestId,
              deltaContent: trimmed + '\n'
            })
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        const text = data.toString().replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
        if (text.trim()) {
          targetWindow.webContents.send('agent:thought-token', {
            requestId,
            deltaThought: text
          })
        }
      })

      proc.on('close', (code) => {
        this.activeProcesses.delete(requestId)
        if (code === 0 || hasReceivedContent) {
          targetWindow.webContents.send('agent:stream-done', { requestId })
        } else {
          targetWindow.webContents.send('agent:stream-error', {
            requestId,
            errorMessage: `Proses Antigravity CLI (agy) keluar dengan kode ${code}`
          })
        }
      })

      proc.on('error', (err) => {
        this.activeProcesses.delete(requestId)
        targetWindow.webContents.send('agent:stream-error', {
          requestId,
          errorMessage: `Gagal menjalankan Antigravity CLI (agy): ${err.message}. Pastikan 'agy' terpasang di sistem.`
        })
      })
    } catch (err: any) {
      this.activeProcesses.delete(requestId)
      targetWindow.webContents.send('agent:stream-error', {
        requestId,
        errorMessage: err.message || 'Gagal memulai Antigravity CLI'
      })
    }
  }

  public abortStream(requestId: string): boolean {
    const proc = this.activeProcesses.get(requestId)
    if (proc) {
      const pid = proc.pid
      try {
        proc.stdin?.destroy()
        proc.stdout?.destroy()
        proc.stderr?.destroy()
      } catch {}

      if (pid) {
        if (process.platform === 'win32') {
          try {
            spawn('taskkill', ['/PID', pid.toString(), '/T', '/F'], { windowsHide: true })
          } catch (e) {
            console.warn('Gagal taskkill Antigravity CLI:', e)
          }
        }
        try {
          proc.kill('SIGKILL')
        } catch (e) {
          console.warn('Gagal mematikan proses Antigravity CLI:', e)
        }
      }
      this.activeProcesses.delete(requestId)
      return true
    }
    return false
  }

  /**
   * List sessions from Antigravity CLI storage (~/.gemini/antigravity-cli/brain/)
   */
  public async listSessions(): Promise<AntigravitySessionItem[]> {
    const brainDirs = this.getBrainDirs()
    const annotationsDirs = this.getAnnotationsDirs()
    const sessions: AntigravitySessionItem[] = []
    const seenIds = new Set<string>()

    for (const bDir of brainDirs) {
      try {
        const entries = readdirSync(bDir)
        for (const entry of entries) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry)) continue
          if (seenIds.has(entry)) continue
          seenIds.add(entry)

          const sessionDir = join(bDir, entry)
          const transcriptPath = join(sessionDir, '.system_generated', 'logs', 'transcript.jsonl')
          let title = ''
          let timestamp = Date.now()

          // 1. Try reading title from annotations (.pbtxt)
          for (const aDir of annotationsDirs) {
            const pbtxtPath = join(aDir, `${entry}.pbtxt`)
            if (existsSync(pbtxtPath)) {
              try {
                const txt = readFileSync(pbtxtPath, 'utf-8')
                const m = txt.match(/title:\s*"([^"]+)"/)
                if (m && m[1]) {
                  title = m[1].trim()
                  break
                }
              } catch {}
            }
          }

          // 2. Read transcript for stats & title fallback
          let turnCount = 0
          let lastMessage = ''

          if (existsSync(transcriptPath)) {
            try {
              const stat = statSync(transcriptPath)
              timestamp = stat.mtimeMs || stat.mtime.getTime()

              const raw = readFileSync(transcriptPath, 'utf-8')
              const lines = raw.split(/\r?\n/).filter(Boolean)

              for (const line of lines) {
                try {
                  const item = JSON.parse(line)
                  if (item.type === 'USER_INPUT' && item.content) {
                    turnCount++
                    if (!title) {
                      const userClean = item.content
                        .replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i, '$1')
                        .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
                        .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
                        .trim()
                      title = userClean.split('\n')[0].slice(0, 50)
                    }
                  } else if (item.type === 'PLANNER_RESPONSE' && item.content) {
                    turnCount++
                    lastMessage = item.content.slice(0, 100)
                  }
                } catch {}
              }
            } catch {}
          } else {
            try {
              const stat = statSync(sessionDir)
              timestamp = stat.mtimeMs || stat.mtime.getTime()
            } catch {}
          }

          if (!title) {
            title = `Sesi Antigravity ${entry.slice(0, 8)}`
          }

          const dateObj = new Date(timestamp)
          const dateStr = dateObj.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
          const timeStr = dateObj.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
          })

          sessions.push({
            id: entry,
            title,
            updated: `${dateStr}, ${timeStr}`,
            updatedAt: dateObj.toISOString(),
            dateGroup: this.getDateGroup(timestamp),
            timestamp,
            subtitle: lastMessage || 'Percakapan Antigravity CLI',
            lastMessage: lastMessage || undefined,
            messageCount: turnCount || 1,
            model: 'Antigravity'
          })
        }
      } catch {}
    }

    sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    return sessions
  }

  /**
   * Load messages from Antigravity transcript
   */
  public async loadSession(sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> {
    const cleanId = sessionId.replace(/^agy_/, '')
    const brainDirs = this.getBrainDirs()
    const annotationsDirs = this.getAnnotationsDirs()

    let transcriptPath: string | undefined = undefined
    for (const bDir of brainDirs) {
      const p = join(bDir, cleanId, '.system_generated', 'logs', 'transcript.jsonl')
      if (existsSync(p)) {
        transcriptPath = p
        break
      }
    }

    if (!transcriptPath || !existsSync(transcriptPath)) {
      return null
    }

    let title = ''
    for (const aDir of annotationsDirs) {
      const pbtxt = join(aDir, `${cleanId}.pbtxt`)
      if (existsSync(pbtxt)) {
        try {
          const txt = readFileSync(pbtxt, 'utf-8')
          const m = txt.match(/title:\s*"([^"]+)"/)
          if (m && m[1]) {
            title = m[1].trim()
            break
          }
        } catch {}
      }
    }

    try {
      const raw = readFileSync(transcriptPath, 'utf-8')
      const lines = raw.split(/\r?\n/).filter(Boolean)
      const parsedMessages: any[] = []

      for (let i = 0; i < lines.length; i++) {
        try {
          const item = JSON.parse(lines[i])

          if (item.type === 'USER_INPUT' && item.content) {
            const rawContent = item.content
            const cleanUser = rawContent
              .replace(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i, '$1')
              .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
              .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
              .trim()

            if (!cleanUser) continue
            if (!title) {
              title = cleanUser.split('\n')[0].slice(0, 50)
            }

            parsedMessages.push({
              id: `msg-u-${i}`,
              role: 'user',
              content: cleanUser,
              displayPrompt: cleanUser,
              timestamp: Date.now()
            })
          } else if (item.type === 'PLANNER_RESPONSE' && item.content) {
            let tools: any[] = []
            if (Array.isArray(item.tool_calls) && item.tool_calls.length > 0) {
              tools = item.tool_calls.map((t: any, tIdx: number) => ({
                id: `t-${i}-${tIdx}`,
                name: t.name,
                args: t.args || {},
                status: 'completed'
              }))
            }

            parsedMessages.push({
              id: `msg-a-${i}`,
              role: 'assistant',
              content: item.content,
              tools: tools.length > 0 ? tools : undefined,
              timestamp: Date.now()
            })
          }
        } catch {}
      }

      return {
        id: cleanId,
        title: title || `Antigravity Session ${cleanId.slice(0, 8)}`,
        messages: parsedMessages
      }
    } catch (err) {
      console.warn(`[AntigravityCliService] Error loading session ${sessionId}:`, err)
      return null
    }
  }

  /**
   * Delete an Antigravity session
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    const cleanId = sessionId.replace(/^agy_/, '')
    let deleted = false

    for (const bDir of this.getBrainDirs()) {
      const p = join(bDir, cleanId)
      if (existsSync(p)) {
        try {
          rmSync(p, { recursive: true, force: true })
          deleted = true
        } catch {}
      }
    }

    for (const aDir of this.getAnnotationsDirs()) {
      const p = join(aDir, `${cleanId}.pbtxt`)
      if (existsSync(p)) {
        try {
          rmSync(p, { force: true })
        } catch {}
      }
    }

    return deleted
  }
}
