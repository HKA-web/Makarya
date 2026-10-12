import { BrowserWindow } from 'electron'
import { spawn, exec, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface OpenCodeStreamRequest {
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

export interface OpenCodeDiscoveredModel {
  id: string
  name: string
  provider?: string
  category: string
  isFree?: boolean
  source?: 'opencode_config' | 'opencode_cli'
}

export interface OpenCodeSessionItem {
  id: string
  title: string
  updated?: string
  dateGroup?: string
  timestamp?: number
  subtitle?: string
  isPinned?: boolean
}

function parseJsonc(content: string): any {
  try {
    return JSON.parse(content)
  } catch {
    try {
      const cleaned = content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('#')) return ''
          return line
        })
        .join('\n')
        .replace(/,\s*([\]}])/g, '$1')
      return JSON.parse(cleaned)
    } catch {
      return null
    }
  }
}

function formatModelDisplayName(rawId: string): string {
  const base = rawId.split('/').pop() || rawId
  return base
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function categorizeDiscoveredModel(
  modelId: string,
  customCategory?: string
): { name: string; provider: string; category: string; isFree: boolean } {
  const cleanName = formatModelDisplayName(modelId)

  if (customCategory) {
    const catName = customCategory.charAt(0).toUpperCase() + customCategory.slice(1)
    return {
      name: cleanName,
      provider: customCategory,
      category: catName,
      isFree: true
    }
  }

  if (modelId.startsWith('opencode/')) {
    return {
      name: cleanName,
      provider: 'OpenCode Zen',
      category: 'OpenCode Zen',
      isFree: true
    }
  }

  if (modelId.includes('/')) {
    const [prov, ...rest] = modelId.split('/')
    const catName = prov.charAt(0).toUpperCase() + prov.slice(1)
    return {
      name: formatModelDisplayName(rest.join('/')),
      provider: prov,
      category: catName,
      isFree: true
    }
  }

  return {
    name: cleanName,
    provider: 'OpenCode',
    category: 'Custom Model',
    isFree: true
  }
}

export class OpenCodeCliService {
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private sessionMap: Map<string, string> = new Map()

  constructor() {}

  public getConfigPath(): string {
    const possibleConfigPaths = [
      join(homedir(), '.config', 'opencode', 'opencode.jsonc'),
      join(homedir(), '.config', 'opencode', 'opencode.json'),
      join(homedir(), '.opencode', 'opencode.jsonc'),
      join(homedir(), '.opencode', 'opencode.json'),
      join(process.env.APPDATA || '', 'opencode', 'opencode.jsonc')
    ]
    for (const p of possibleConfigPaths) {
      if (existsSync(p)) return p
    }
    return join(homedir(), '.config', 'opencode', 'opencode.jsonc')
  }

  /**
   * Discover models dynamically from:
   * 1. OpenCode config file (~/.config/opencode/opencode.jsonc)
   * 2. OpenCode CLI command (opencode models)
   */
  public async getDiscoveredModels(): Promise<OpenCodeDiscoveredModel[]> {
    const discovered: OpenCodeDiscoveredModel[] = []
    const seenIds = new Set<string>()

    // 1. Read OpenCode Config (~/.config/opencode/opencode.jsonc)
    const possibleConfigPaths = [
      join(homedir(), '.config', 'opencode', 'opencode.jsonc'),
      join(homedir(), '.config', 'opencode', 'opencode.json'),
      join(homedir(), '.opencode', 'opencode.jsonc'),
      join(homedir(), '.opencode', 'opencode.json'),
      join(process.env.APPDATA || '', 'opencode', 'opencode.jsonc')
    ]

    for (const cfgPath of possibleConfigPaths) {
      if (existsSync(cfgPath)) {
        try {
          const raw = readFileSync(cfgPath, 'utf-8')
          const parsed = parseJsonc(raw)
          if (parsed && typeof parsed === 'object') {
            const disabledProviders = Array.isArray(parsed.disabled_providers)
              ? parsed.disabled_providers
              : []

            const providersObj = parsed.provider || parsed.providers || {}
            if (typeof providersObj === 'object') {
              for (const [providerKey, providerVal] of Object.entries<any>(providersObj)) {
                if (disabledProviders.includes(providerKey) || providerKey.toLowerCase().includes('9router')) continue

                if (providerVal?.models && typeof providerVal.models === 'object') {
                  for (const [modelKey, modelVal] of Object.entries<any>(providerVal.models)) {
                    const modelId = `${providerKey}/${modelKey}`
                    if (modelId.toLowerCase().includes('9router')) continue
                    const cleanName =
                      typeof modelVal === 'object' && modelVal?.name
                        ? modelVal.name
                        : typeof modelVal === 'string'
                          ? modelVal
                          : formatModelDisplayName(modelKey)
                    const provName =
                      typeof providerVal === 'object' && providerVal?.name
                        ? providerVal.name
                        : providerKey
                    const catName = provName.charAt(0).toUpperCase() + provName.slice(1)

                    if (!seenIds.has(modelId)) {
                      seenIds.add(modelId)
                      discovered.push({
                        id: modelId,
                        name: cleanName,
                        provider: provName,
                        category: catName,
                        isFree: true,
                        source: 'opencode_config'
                      })
                    }
                  }
                }
              }
            }

            // Check if a root model is configured (e.g. "model": "router/Antigravity")
            if (typeof parsed.model === 'string' && parsed.model.trim()) {
              const rootM = parsed.model.trim()
              if (!seenIds.has(rootM) && !rootM.toLowerCase().includes('9router')) {
                seenIds.add(rootM)
                const info = categorizeDiscoveredModel(rootM)
                discovered.push({
                  id: rootM,
                  name: info.name,
                  provider: info.provider,
                  category: info.category,
                  isFree: true,
                  source: 'opencode_config'
                })
              }
            }
          }
        } catch (err) {
          console.warn('[OpenCodeCliService] Error reading opencode config:', err)
        }
        break
      }
    }

    // 2. Discover OpenCode Zen Models via official models.dev / OpenCode API
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3500)
      const res = await fetch('https://models.dev/api.json', { signal: controller.signal })
      clearTimeout(timeoutId)

      if (res.ok) {
        const data = await res.json()
        const zenModels = data?.opencode?.models || {}
        for (const [modelKey, modelVal] of Object.entries<any>(zenModels)) {
          const modelId = `opencode/${modelKey}`
          if (!seenIds.has(modelId) && !modelId.toLowerCase().includes('9router')) {
            seenIds.add(modelId)
            const cleanName =
              typeof modelVal === 'object' && modelVal?.name
                ? modelVal.name
                : formatModelDisplayName(modelKey)
            const isFree = modelKey.includes('free') || !modelVal?.cost?.input

            discovered.push({
              id: modelId,
              name: cleanName,
              provider: 'OpenCode Zen',
              category: 'OpenCode Zen',
              isFree,
              source: 'opencode_cli'
            })
          }
        }
      }
    } catch (apiErr) {
      console.warn('[OpenCodeCliService] Gagal memuat models.dev API, mencoba fallback CLI:', apiErr)
    }

    // 3. Fallback / Additional discovery via `opencode models` CLI
    try {
      const cliModels = await new Promise<string[]>((resolve) => {
        exec('opencode models', { timeout: 3000 }, (err, stdout) => {
          if (err || !stdout) {
            resolve([])
            return
          }
          const lines = stdout
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => Boolean(l) && !l.startsWith('#') && !l.includes('──') && !l.includes('===') && !l.includes('█'))
          resolve(lines)
        })
      })

      for (const rawModelId of cliModels) {
        if (!seenIds.has(rawModelId) && !rawModelId.toLowerCase().includes('9router')) {
          seenIds.add(rawModelId)
          const info = categorizeDiscoveredModel(rawModelId)
          discovered.push({
            id: rawModelId,
            name: info.name,
            provider: info.provider,
            category: info.category,
            isFree: info.isFree,
            source: 'opencode_cli'
          })
        }
      }
    } catch (e) {
      console.warn('[OpenCodeCliService] Error running opencode models CLI fallback:', e)
    }

    // Filter out any 9router models
    return discovered.filter((m) => {
      const p = (m.provider || '').toLowerCase()
      const id = (m.id || '').toLowerCase()
      const cat = (m.category || '').toLowerCase()
      return !p.includes('9router') && !id.includes('9router') && !cat.includes('9router')
    })
  }

  public async streamOpenCode(
    payload: OpenCodeStreamRequest,
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
    const cliArgs: string[] = ['run', '--auto']

    if (validProjectRoot) {
      cliArgs.push('--dir', validProjectRoot)
    }

    // Attach model flag if provided
    if (model && model.trim()) {
      cliArgs.push('-m', model.trim())
    }

    // Attach agent mode based on OpenCode agents: 'build' (agent) vs 'plan' (chat)
    if (executionMode === 'chat' || executionMode === 'plan') {
      cliArgs.push('--agent', 'plan')
    } else {
      cliArgs.push('--agent', 'build')
    }

    // Check if session ID is provided and matches OpenCode session format or mapped session
    const cleanSessionId = sessionId ? sessionId.replace(/^opencode_/, '') : undefined
    let effectiveSessionId: string | undefined = undefined

    if (cleanSessionId && cleanSessionId.startsWith('ses_') && cleanSessionId.length >= 20) {
      effectiveSessionId = cleanSessionId
    } else if (cleanSessionId && this.sessionMap.has(cleanSessionId)) {
      effectiveSessionId = this.sessionMap.get(cleanSessionId)
    }

    // Attach session flag if continuing an existing OpenCode session
    if (effectiveSessionId) {
      cliArgs.push('-s', effectiveSessionId)
    }

    try {
      const proc = spawn('opencode', cliArgs, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' }
      })

      this.activeProcesses.set(requestId, proc)

      // Send prompt via stdin to avoid Windows shell quoting/escaping limits and newline breakage
      proc.stdin?.write(lastUserMessage + '\n')
      proc.stdin?.end()

      let hasReceivedStdout = false

      proc.stdout?.on('data', (data) => {
        hasReceivedStdout = true
        const text = data.toString()
        const cleanText = text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
        targetWindow.webContents.send('agent:stream-token', {
          requestId,
          deltaContent: cleanText
        })
      })

      proc.stderr?.on('data', (data) => {
        const text = data.toString()
        const cleanText = text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
        if (cleanText.trim()) {
          targetWindow.webContents.send('agent:thought-token', {
            requestId,
            deltaThought: cleanText
          })
        }
      })

      proc.on('close', (code) => {
        this.activeProcesses.delete(requestId)

        // If this was a new session without an established OpenCode session ID, detect the newly created session
        if (!effectiveSessionId && cleanSessionId) {
          exec('opencode session list -n 1', { cwd, timeout: 3000 }, (_err, stdout) => {
            if (stdout) {
              const match = stdout.match(/(ses_[a-zA-Z0-9]+)/)
              if (match && match[1]) {
                const newCliSessionId = match[1]
                this.sessionMap.set(cleanSessionId, newCliSessionId)
                targetWindow.webContents.send('agent:session-linked', {
                  clientSessionId: cleanSessionId,
                  openCodeSessionId: newCliSessionId
                })
              }
            }
          })
        }

        if (code === 0 || hasReceivedStdout) {
          targetWindow.webContents.send('agent:stream-done', { requestId })
        } else {
          targetWindow.webContents.send('agent:stream-error', {
            requestId,
            errorMessage: `Proses OpenCode CLI keluar dengan kode ${code}`
          })
        }
      })

      proc.on('error', (err) => {
        this.activeProcesses.delete(requestId)
        targetWindow.webContents.send('agent:stream-error', {
          requestId,
          errorMessage: `Gagal menjalankan OpenCode CLI: ${err.message}. Pastikan 'opencode' terpasang di sistem.`
        })
      })
    } catch (err: any) {
      this.activeProcesses.delete(requestId)
      targetWindow.webContents.send('agent:stream-error', {
        requestId,
        errorMessage: err.message || 'Gagal memulai OpenCode CLI'
      })
    }
  }

  public abortStream(requestId: string): boolean {
    const proc = this.activeProcesses.get(requestId)
    if (proc) {
      try {
        proc.kill()
      } catch (e) {
        console.warn('Gagal mematikan proses OpenCode:', e)
      }
      this.activeProcesses.delete(requestId)
      return true
    }
    return false
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
   * List all OpenCode sessions from CLI (opencode session list, matching /session)
   */
  public async listSessions(projectRoot?: string): Promise<OpenCodeSessionItem[]> {
    let validProjectRoot: string | undefined = undefined
    if (projectRoot && projectRoot.trim() && existsSync(projectRoot.trim())) {
      validProjectRoot = projectRoot.trim()
    }
    const cwd = validProjectRoot || process.cwd()

    return new Promise((resolve) => {
      // 1. Try JSON format first (opencode session list --format json)
      exec('opencode session list --format json', { cwd, timeout: 6000 }, (jsonErr, jsonStdout) => {
        if (!jsonErr && jsonStdout) {
          try {
            const jsonStart = jsonStdout.indexOf('[')
            if (jsonStart !== -1) {
              const rawJson = jsonStdout.slice(jsonStart)
              const rawList = JSON.parse(rawJson)
              if (Array.isArray(rawList)) {
                const sessions: OpenCodeSessionItem[] = []
                for (const item of rawList) {
                  const id = item.id
                  if (!id) continue
                  const title = item.title || `Session ${id.slice(0, 8)}`
                  const timestamp =
                    typeof item.updated === 'number'
                      ? item.updated
                      : typeof item.created === 'number'
                        ? item.created
                        : Date.now()
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
                    id,
                    title,
                    updated: `${dateStr}, ${timeStr}`,
                    updatedAt: dateObj.toISOString(),
                    dateGroup: this.getDateGroup(timestamp),
                    timestamp,
                    subtitle: title.startsWith('New session') ? 'Sesi OpenCode Baru' : 'Percakapan OpenCode CLI'
                  })
                }
                resolve(sessions)
                return
              }
            }
          } catch {}
        }

        // 2. Fallback: Table parsing (opencode session list)
        exec('opencode session list', { cwd, timeout: 6000 }, (error, stdout) => {
          if (error || !stdout) {
            resolve([])
            return
          }

          try {
            const lines = stdout.split(/\r?\n/)
            const sessions: OpenCodeSessionItem[] = []
            let separatorPassed = false

            for (const rawLine of lines) {
              const line = rawLine.trim()
              if (!line) continue

              if (line.includes('───') || line.includes('===') || line.startsWith('---')) {
                separatorPassed = true
                continue
              }

              if (!separatorPassed) {
                if (line.startsWith('Session ID')) continue
              }

              const match = line.match(/^(ses_[a-zA-Z0-9]+)\s+(.+?)(?:\s{2,}(\d{1,2}:\d{2}\s*·\s*\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}|.*?))?$/)
              if (match) {
                const id = match[1]
                const title = match[2].trim()
                const updated = match[3] ? match[3].trim() : ''

                let timestamp = Date.now()
                if (updated) {
                  const fullMatch = updated.match(/(\d{1,2}):(\d{2})\s*·\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
                  if (fullMatch) {
                    const hour = parseInt(fullMatch[1], 10)
                    const minute = parseInt(fullMatch[2], 10)
                    const day = parseInt(fullMatch[3], 10)
                    const month = parseInt(fullMatch[4], 10) - 1
                    const year = parseInt(fullMatch[5], 10)
                    timestamp = new Date(year, month, day, hour, minute).getTime()
                  } else {
                    const timeOnlyMatch = updated.match(/^(\d{1,2}):(\d{2})$/)
                    if (timeOnlyMatch) {
                      const hour = parseInt(timeOnlyMatch[1], 10)
                      const minute = parseInt(timeOnlyMatch[2], 10)
                      const d = new Date()
                      d.setHours(hour, minute, 0, 0)
                      timestamp = d.getTime()
                    }
                  }
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
                  id,
                  title,
                  updated: `${dateStr}, ${timeStr}`,
                  updatedAt: dateObj.toISOString(),
                  dateGroup: this.getDateGroup(timestamp),
                  timestamp,
                  subtitle: title.startsWith('New session') ? 'Sesi OpenCode Baru' : 'Percakapan OpenCode CLI'
                })
              }
            }

            resolve(sessions)
          } catch (parseErr) {
            console.warn('[OpenCodeCliService] Error parsing sessions:', parseErr)
            resolve([])
          }
        })
      })
    })
  }

  /**
   * Load messages of a specific session via `opencode export <sessionId>`
   */
  public async loadSession(sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> {
    const cleanId = sessionId.replace(/^opencode_/, '')
    return new Promise((resolve) => {
      exec(`opencode export ${cleanId}`, { timeout: 10000, maxBuffer: 15 * 1024 * 1024 }, (error, stdout) => {
        if (error || !stdout) {
          resolve(null)
          return
        }

        try {
          const jsonStart = stdout.indexOf('{')
          if (jsonStart === -1) {
            resolve(null)
            return
          }

          const rawJson = stdout.slice(jsonStart)
          const data = JSON.parse(rawJson)

          const parsedMessages: any[] = []
          if (Array.isArray(data.messages)) {
            for (const item of data.messages) {
              const role = item.info?.role || 'assistant'
              const createdTime = item.info?.time?.created || Date.now()

              let textContent = ''
              let reasoningContent = ''
              const tools: any[] = []

              if (Array.isArray(item.parts)) {
                for (const part of item.parts) {
                  if (part.type === 'text' && part.text) {
                    textContent += (textContent ? '\n\n' : '') + part.text
                  } else if (part.type === 'reasoning' && part.text) {
                    reasoningContent += (reasoningContent ? '\n\n' : '') + part.text
                  } else if (part.type === 'tool' || part.type === 'tool_use' || part.type === 'step-start') {
                    const toolName = part.tool || part.name || part.toolName
                    if (toolName) {
                      tools.push({
                        id: part.callID || part.id || 't-' + Date.now(),
                        name: toolName,
                        args: part.state?.input || part.args || {},
                        status: part.state?.status || 'completed',
                        output: part.state?.output || part.output || ''
                      })
                    }
                  }
                }
              }

              parsedMessages.push({
                id: item.info?.id || 'msg-' + Math.random().toString(36).substr(2, 9),
                role,
                content: textContent,
                thinking: reasoningContent || undefined,
                timestamp: createdTime,
                tools: tools.length > 0 ? tools : undefined
              })
            }
          }

          resolve({
            id: data.info?.id || cleanId,
            title: data.info?.title || 'OpenCode Session',
            messages: parsedMessages
          })
        } catch (err) {
          console.warn('[OpenCodeCliService] Error loading session export:', err)
          resolve(null)
        }
      })
    })
  }

  /**
   * Delete an OpenCode session via `opencode session delete <sessionId>`
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`opencode session delete ${sessionId}`, { timeout: 5000 }, (error) => {
        if (error) {
          console.warn('[OpenCodeCliService] Error deleting session:', error)
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }
}


