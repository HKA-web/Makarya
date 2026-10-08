import { BrowserWindow } from 'electron'
import { spawn, exec, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { VercelAiAgentService } from './vercelAiService'

export interface OpenCodeStreamRequest {
  requestId: string
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
  source?: 'opencode_config' | 'opencode_cli' | '9router'
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
    const cleaned = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
      .replace(/,\s*([\]}])/g, '$1')
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

function formatModelDisplayName(rawId: string): string {
  const base = rawId.split('/').pop() || rawId
  return base
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export class OpenCodeCliService {
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private aiAgentService: VercelAiAgentService

  constructor(aiAgentService: VercelAiAgentService) {
    this.aiAgentService = aiAgentService
  }

  /**
   * Discover models dynamically from:
   * 1. OpenCode config file (~/.config/opencode/opencode.jsonc)
   * 2. OpenCode CLI command (opencode models)
   * 3. 9Router / AI Gateway endpoint (/v1/models)
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
          if (parsed && typeof parsed.provider === 'object') {
            const disabledProviders = Array.isArray(parsed.disabled_providers)
              ? parsed.disabled_providers
              : []

            for (const [providerKey, providerVal] of Object.entries<any>(parsed.provider)) {
              if (disabledProviders.includes(providerKey)) continue

              if (providerVal?.models && typeof providerVal.models === 'object') {
                for (const [modelKey, modelVal] of Object.entries<any>(providerVal.models)) {
                  const modelId = `${providerKey}/${modelKey}`
                  const cleanName = modelVal?.name || modelKey
                  const displayName = `${cleanName} ${providerKey}`

                  if (!seenIds.has(modelId)) {
                    seenIds.add(modelId)
                    discovered.push({
                      id: modelId,
                      name: displayName,
                      provider: providerKey,
                      category: 'Recent',
                      isFree: true,
                      source: 'opencode_config'
                    })
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('[OpenCodeCliService] Error reading opencode config:', err)
        }
        break
      }
    }

    // 2. Fetch Models from OpenCode CLI command (opencode models)
    try {
      const cliModelsOutput = await new Promise<string>((resolve) => {
        exec('opencode models', { timeout: 3000 }, (error, stdout) => {
          if (error) {
            resolve('')
          } else {
            resolve(stdout || '')
          }
        })
      })

      if (cliModelsOutput.trim()) {
        const lines = cliModelsOutput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
        for (const line of lines) {
          if (line.startsWith('opencode/')) {
            if (!seenIds.has(line)) {
              seenIds.add(line)
              const cleanName = formatModelDisplayName(line.replace('opencode/', ''))
              discovered.push({
                id: line,
                name: cleanName,
                provider: 'OpenCode Zen',
                category: 'OpenCode Zen',
                isFree: true,
                source: 'opencode_cli'
              })
            }
          } else if (line.includes('/')) {
            if (!seenIds.has(line)) {
              seenIds.add(line)
              const [prov, mdl] = line.split('/')
              discovered.push({
                id: line,
                name: `${mdl} ${prov}`,
                provider: prov,
                category: 'Recent',
                isFree: true,
                source: 'opencode_cli'
              })
            }
          }
        }
      }
    } catch {
      // CLI not available or timeout, ignore
    }

    // 3. Fetch active models from 9Router Gateway (/v1/models)
    try {
      const gatewayModels = await this.aiAgentService.fetchAvailableModels()
      if (Array.isArray(gatewayModels) && gatewayModels.length > 0) {
        for (const gModel of gatewayModels) {
          if (!seenIds.has(gModel)) {
            seenIds.add(gModel)

            let cat = '9Router Gateway'
            let provider = '9Router'
            let isFree = false

            if (gModel === 'Antigravity') {
              cat = 'Recent'
              provider = 'Antigravity'
              isFree = true
            } else if (gModel === 'OpenCode') {
              cat = 'Recent'
              provider = 'OpenCode Zen'
              isFree = true
            } else if (gModel.startsWith('ag/')) {
              cat = 'Antigravity'
              provider = 'Antigravity'
              isFree = gModel.includes('flash') || gModel.includes('free')
            }

            discovered.push({
              id: gModel,
              name: formatModelDisplayName(gModel),
              provider,
              category: cat,
              isFree,
              source: '9router'
            })
          }
        }
      }
    } catch (gErr) {
      console.warn('[OpenCodeCliService] Error fetching 9Router models:', gErr)
    }

    return discovered
  }

  public async streamOpenCode(
    payload: OpenCodeStreamRequest,
    targetWindow: BrowserWindow
  ): Promise<void> {
    const { requestId, messages, projectRoot, executionMode = 'agent', model } = payload

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

    if (!lastUserMessage) {
      targetWindow.webContents.send('opencode:stream-error', {
        requestId,
        error: 'Pesan pengguna kosong'
      })
      return
    }

    try {
      let systemPrompt = ''
      if (executionMode === 'chat') {
        systemPrompt = `Anda adalah OpenCode Assistant di dalam Makarya IDE.
Workspace root saat ini: "${projectRoot || 'Workspace aktif'}".
Mode kerja saat ini: MODE CHAT (Percakapan & Q&A).

PANDUAN MODE CHAT:
1. Anda berada dalam Mode Chat murni untuk diskusi teknis, tanya jawab kode, debugging konseptual, dan analisis arsitektur.
2. Dalam mode ini, Anda fokus memberikan penjelasan yang jelas, solutif, dan cuplikan kode format Markdown.
3. Anda TIDAK menjalankan tools eksekusi file/terminal secara otomatis.
4. Jika pengguna menanyakan mode kerja Anda saat ini, jawab dengan tegas dan jelas bahwa Anda sedang berada di "Mode Chat (Percakapan/Q&A)".
5. Gunakan gaya bahasa Indonesia yang profesional, ramah, dan ringkas.`
      } else {
        systemPrompt = `Anda adalah OpenCode Agent — agen pemrograman otonom tingkat lanjut yang terintegrasi di dalam Makarya IDE.
Workspace root saat ini: "${projectRoot || 'Workspace aktif'}".
Mode kerja saat ini: MODE AGENT (Autonomous Coding Agent).

PANDUAN MODE AGENT:
1. Anda berada dalam Mode Agent otonom dengan akses penuh ke tools (read_file, write_file, execute_command, database, ask_question).
2. Sebelum memanggil tool, berikan penjelasan singkat/alasan (*chain-of-thought*) secara streaming tentang apa yang akan Anda periksa atau lakukan.
3. ATURAN PENTING 'ask_question': Jika Anda memanggil tool 'ask_question', Anda TIDAK BOLEH memanggil tool lain secara paralel (seperti 'list_dir' atau 'read_file') dalam langkah yang sama. Panggil HANYA 1 tool 'ask_question' dan hentikan output Anda sampai pengguna memberikan jawaban.
4. Setelah tool selesai dijalankan atau setelah pengguna menjawab 'ask_question', lanjutkan eksekusi secara komprehensif dan solutif dengan format Markdown yang rapi.
5. Selalu gunakan path file relatif terhadap workspace project "${projectRoot || ''}" atau gunakan full absolute path yang valid di Windows.
6. Jika pengguna menanyakan mode kerja Anda saat ini, jawab bahwa Anda sedang berada di "Mode Agent (Autonomous Coding Agent)".
7. Gunakan gaya bahasa Indonesia yang profesional, ramah, dan solutif.`
      }

      const convertedMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...messages
      ]

      await this.aiAgentService.streamChat(
        {
          requestId,
          model: model || 'Antigravity',
          messages: convertedMessages,
          projectRoot,
          autoExecution: 'always_proceed',
          executionMode: executionMode,
          systemPrompt: systemPrompt
        },
        targetWindow
      )
    } catch (err: any) {
      console.warn('[OpenCodeCliService] Direct AI error, trying CLI fallback:', err)

      try {
        const cwd = projectRoot || process.cwd()
        const cliArgs = ['run', `"${lastUserMessage.replace(/"/g, '\\"')}"`, '--format', 'json']

        const proc = spawn('opencode', cliArgs, {
          cwd,
          shell: true,
          env: { ...process.env }
        })

        this.activeProcesses.set(requestId, proc)

        proc.stdout?.on('data', (data) => {
          const text = data.toString()
          targetWindow.webContents.send('agent:stream-token', {
            requestId,
            deltaContent: text
          })
        })

        proc.stderr?.on('data', (data) => {
          const text = data.toString()
          targetWindow.webContents.send('agent:thought-token', {
            requestId,
            deltaThought: text
          })
        })

        proc.on('close', () => {
          this.activeProcesses.delete(requestId)
          targetWindow.webContents.send('agent:stream-done', { requestId })
        })

        proc.on('error', (procErr) => {
          this.activeProcesses.delete(requestId)
          targetWindow.webContents.send('agent:stream-error', {
            requestId,
            errorMessage: procErr.message
          })
        })
      } catch (fallbackErr: any) {
        targetWindow.webContents.send('agent:stream-error', {
          requestId,
          errorMessage: fallbackErr.message || 'Gagal menjalankan OpenCode'
        })
      }
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
    return this.aiAgentService.abortStream(requestId)
  }

  /**
   * List all OpenCode sessions from CLI (opencode session list)
   */
  public async listSessions(): Promise<OpenCodeSessionItem[]> {
    return new Promise((resolve) => {
      exec('opencode session list', { timeout: 5000 }, (error, stdout) => {
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

            // Regex match session line: e.g. "ses_f54d67ed9ffefKATvJOIzs94F9   Greeting   00:00 · 17/09/2026"
            const match = line.match(/^(ses_[a-zA-Z0-9]+)\s+(.+?)(?:\s{2,}(\d{1,2}:\d{2}\s*·\s*\d{1,2}\/\d{1,2}\/\d{4}|.*?))?$/)
            if (match) {
              const id = match[1]
              const title = match[2].trim()
              const updated = match[3] ? match[3].trim() : ''

              // Parse date for grouping
              let dateGroup = 'Other'
              let timestamp = Date.now()

              if (updated) {
                const dateMatch = updated.match(/(\d{1,2}):(\d{2})\s*·\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
                if (dateMatch) {
                  const hour = parseInt(dateMatch[1], 10)
                  const minute = parseInt(dateMatch[2], 10)
                  const day = parseInt(dateMatch[3], 10)
                  const month = parseInt(dateMatch[4], 10) - 1
                  const year = parseInt(dateMatch[5], 10)
                  const sessionDate = new Date(year, month, day, hour, minute)
                  timestamp = sessionDate.getTime()

                  const now = new Date()
                  const isToday =
                    now.getFullYear() === year &&
                    now.getMonth() === month &&
                    now.getDate() === day

                  const yesterday = new Date(now)
                  yesterday.setDate(now.getDate() - 1)
                  const isYesterday =
                    yesterday.getFullYear() === year &&
                    yesterday.getMonth() === month &&
                    yesterday.getDate() === day

                  if (isToday) {
                    dateGroup = 'Today'
                  } else if (isYesterday) {
                    dateGroup = 'Yesterday'
                  } else {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                    dateGroup = `${days[sessionDate.getDay()]} ${months[sessionDate.getMonth()]} ${sessionDate.getDate()} ${sessionDate.getFullYear()}`
                  }
                }
              }

              sessions.push({
                id,
                title,
                updated,
                dateGroup,
                timestamp,
                subtitle: title.startsWith('New session') ? 'Greeting' : undefined
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
  }

  /**
   * Load messages of a specific session via `opencode export <sessionId>`
   */
  public async loadSession(sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> {
    return new Promise((resolve) => {
      exec(`opencode export ${sessionId}`, { timeout: 8000 }, (error, stdout) => {
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
                    if (part.name || part.toolName) {
                      tools.push({
                        id: part.id || 't-' + Date.now(),
                        name: part.name || part.toolName,
                        args: part.args || {},
                        status: 'completed',
                        output: part.output || ''
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
            id: data.info?.id || sessionId,
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


