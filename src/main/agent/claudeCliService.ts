import { BrowserWindow } from 'electron'
import { spawn, exec, type ChildProcess } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { VercelAiAgentService } from './vercelAiService'

export interface ClaudeStreamRequest {
  requestId: string
  model?: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>
  projectRoot?: string
  executionMode?: 'agent' | 'chat' | 'plan'
}

export interface ClaudeDiscoveredModel {
  id: string
  name: string
  provider?: string
  category: string
  isFree?: boolean
  source?: 'claude_config' | 'claude_cli' | '9router'
}

export interface ClaudeSessionItem {
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
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export class ClaudeCliService {
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private aiAgentService: VercelAiAgentService

  constructor(aiAgentService: VercelAiAgentService) {
    this.aiAgentService = aiAgentService
  }

  /**
   * Discover Claude models dynamically from:
   * 1. Claude config file (~/.config/claude/config.json or ~/.claude.json)
   * 2. Claude CLI command (claude models or claude --version)
   * 3. 9Router / AI Gateway endpoint (/v1/models)
   */
  public async getDiscoveredModels(): Promise<ClaudeDiscoveredModel[]> {
    const discovered: ClaudeDiscoveredModel[] = []
    const seenIds = new Set<string>()

    // Default built-in curated Claude models (Official Anthropic)
    const defaultCurated: ClaudeDiscoveredModel[] = [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Thinking)', provider: 'Anthropic', category: 'Claude Recommended', isFree: false, source: 'claude_config' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: 'Anthropic', category: 'Claude 3.5 Series', isFree: false, source: 'claude_config' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'Anthropic', category: 'Claude 3.5 Series', isFree: true, source: 'claude_config' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic', category: 'Claude Legacy', isFree: false, source: 'claude_config' }
    ]

    for (const d of defaultCurated) {
      seenIds.add(d.id)
      discovered.push(d)
    }

    // 1. Read Claude Config (~/.claude/config.json, ~/.claude.json, ~/.claude/settings.json, etc.)
    const possibleConfigPaths = [
      join(homedir(), '.claude', 'config.json'),
      join(homedir(), '.config', 'claude', 'config.json'),
      join(homedir(), '.claude.json'),
      join(homedir(), '.claude', 'settings.json'),
      join(process.env.APPDATA || '', 'Claude', 'config.json')
    ]

    for (const cfgPath of possibleConfigPaths) {
      if (existsSync(cfgPath)) {
        try {
          const raw = readFileSync(cfgPath, 'utf-8')
          const parsed = parseJsonc(raw)
          if (parsed && typeof parsed === 'object') {
            // Models array
            if (Array.isArray(parsed.models)) {
              for (const m of parsed.models) {
                const modelId = typeof m === 'string' ? m : m.id || m.name
                if (modelId && !seenIds.has(modelId)) {
                  seenIds.add(modelId)
                  discovered.push({
                    id: modelId,
                    name: formatModelDisplayName(modelId),
                    provider: 'Custom',
                    category: 'Config',
                    isFree: false,
                    source: 'claude_config'
                  })
                }
              }
            }
            // Custom models list / object
            if (parsed.custom_models) {
              const list = Array.isArray(parsed.custom_models)
                ? parsed.custom_models
                : Object.keys(parsed.custom_models)
              for (const m of list) {
                const modelId = typeof m === 'string' ? m : (m as any).id || (m as any).name
                if (modelId && !seenIds.has(modelId)) {
                  seenIds.add(modelId)
                  discovered.push({
                    id: modelId,
                    name: formatModelDisplayName(modelId),
                    provider: 'Custom',
                    category: 'Config',
                    isFree: false,
                    source: 'claude_config'
                  })
                }
              }
            }
            // Preferred / Selected model
            const prefModel = parsed.preferredModel || parsed.model
            if (prefModel && typeof prefModel === 'string' && !seenIds.has(prefModel)) {
              seenIds.add(prefModel)
              discovered.push({
                id: prefModel,
                name: formatModelDisplayName(prefModel),
                provider: 'Custom',
                category: 'Config',
                isFree: false,
                source: 'claude_config'
              })
            }
          }
        } catch (err) {
          console.warn('[ClaudeCliService] Error reading claude config:', err)
        }
        break
      }
    }

    // 2. Fetch Models from Claude CLI command if installed
    try {
      const cliModelsOutput = await new Promise<string>((resolve) => {
        exec('claude models', { timeout: 3000 }, (error, stdout) => {
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
          if (!seenIds.has(line) && line.toLowerCase().includes('claude')) {
            seenIds.add(line)
            discovered.push({
              id: line,
              name: formatModelDisplayName(line),
              provider: 'Anthropic Claude CLI',
              category: 'Claude CLI',
              isFree: false,
              source: 'claude_cli'
            })
          }
        }
      }
    } catch {
      // CLI not available, ignore
    }

    // 3. Fetch active models from 9Router Gateway (/v1/models)
    try {
      const gatewayModels = await this.aiAgentService.fetchAvailableModels()
      if (Array.isArray(gatewayModels) && gatewayModels.length > 0) {
        for (const gModel of gatewayModels) {
          if (!seenIds.has(gModel)) {
            const isClaude = gModel.toLowerCase().includes('claude') || gModel.toLowerCase().includes('anthropic')
            const isAntigravity = gModel.toLowerCase().includes('antigravity') || gModel.startsWith('ag/')
            if (isClaude || isAntigravity) {
              seenIds.add(gModel)
              discovered.push({
                id: gModel,
                name: formatModelDisplayName(gModel),
                provider: isAntigravity ? 'Antigravity' : 'Anthropic',
                category: isAntigravity ? 'Recent' : 'Claude Gateway',
                isFree: gModel.includes('haiku') || gModel.includes('free') || isAntigravity,
                source: '9router'
              })
            }
          }
        }
      }
    } catch (gErr) {
      console.warn('[ClaudeCliService] Error fetching 9Router models:', gErr)
    }

    return discovered
  }

  public async streamClaude(
    payload: ClaudeStreamRequest,
    targetWindow: BrowserWindow
  ): Promise<void> {
    const { requestId, messages, projectRoot, executionMode = 'agent', model } = payload

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || ''

    if (!lastUserMessage) {
      targetWindow.webContents.send('claude:stream-error', {
        requestId,
        error: 'Pesan pengguna kosong'
      })
      return
    }

    try {
      let systemPrompt = ''
      if (executionMode === 'chat') {
        systemPrompt = `Anda adalah Claude Code Assistant — asisten AI bertenaga model Claude dari Anthropic di dalam Makarya IDE.
Workspace root saat ini: "${projectRoot || 'Workspace aktif'}".
Mode kerja saat ini: MODE CHAT (Percakapan & Q&A).

PANDUAN MODE CHAT:
1. Anda berada dalam Mode Chat murni untuk diskusi teknis, tanya jawab kode, pemikiran mendalam (*deep reasoning*), debugging konseptual, dan analisis arsitektur.
2. Dalam mode ini, Anda fokus memberikan penjelasan yang mendalam, terstruktur rapi, elegan, dan cuplikan kode format Markdown.
3. Anda TIDAK menjalankan tools eksekusi file/terminal secara otomatis.
4. Jika pengguna menanyakan mode kerja Anda saat ini, jawab dengan tegas dan jelas bahwa Anda sedang berada di "Mode Chat Claude (Percakapan/Q&A)".
5. Gunakan gaya bahasa Indonesia yang profesional, hangat, cerdas, dan ringkas.`
      } else {
        systemPrompt = `Anda adalah Claude Autonomous Coding Agent — agen pemrograman otonom tingkat lanjut bertenaga Claude di dalam Makarya IDE.
Workspace root saat ini: "${projectRoot || 'Workspace aktif'}".
Mode kerja saat ini: MODE AGENT (Autonomous Coding Agent).

PANDUAN MODE AGENT:
1. Anda berada dalam Mode Agent otonom dengan akses penuh ke tools (read_file, write_file, execute_command, database, ask_question).
2. Sebelum memanggil tool, berikan penjelasan singkat/alasan (*chain-of-thought*) secara streaming tentang apa yang akan Anda periksa atau lakukan.
3. ATURAN PENTING 'ask_question': Jika Anda memanggil tool 'ask_question', Anda TIDAK BOLEH memanggil tool lain secara paralel (seperti 'list_dir' atau 'read_file') dalam langkah yang sama. Panggil HANYA 1 tool 'ask_question' dan hentikan output Anda sampai pengguna memberikan jawaban.
4. Setelah tool selesai dijalankan atau setelah pengguna menjawab 'ask_question', lanjutkan eksekusi secara komprehensif dan solutif dengan format Markdown yang rapi.
5. Selalu gunakan path file relatif terhadap workspace project "${projectRoot || ''}" atau gunakan full absolute path yang valid di Windows.
6. Jika pengguna menanyakan mode kerja Anda saat ini, jawab bahwa Anda sedang berada di "Mode Agent Claude (Autonomous Coding Agent)".
7. Gunakan gaya bahasa Indonesia yang profesional, presisi, elegan, dan solutif.`
      }

      const convertedMessages: any[] = [
        { role: 'system', content: systemPrompt },
        ...messages
      ]

      // Determine model to use
      const chosenModel = model || 'claude-3-7-sonnet-20250219'

      await this.aiAgentService.streamChat(
        {
          requestId,
          model: chosenModel,
          messages: convertedMessages,
          projectRoot,
          autoExecution: 'always_proceed',
          executionMode: executionMode,
          systemPrompt: systemPrompt
        },
        targetWindow
      )
    } catch (err: any) {
      console.warn('[ClaudeCliService] Direct AI error, trying CLI fallback:', err)

      try {
        const cwd = projectRoot || process.cwd()
        const cliArgs = ['-p', `"${lastUserMessage.replace(/"/g, '\\"')}"`, '--output-format', 'json']

        const proc = spawn('claude', cliArgs, {
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
          errorMessage: fallbackErr.message || 'Gagal menjalankan Claude CLI'
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
        console.warn('Gagal mematikan proses Claude:', e)
      }
      this.activeProcesses.delete(requestId)
      return true
    }
    return this.aiAgentService.abortStream(requestId)
  }

  /**
   * List all Claude sessions from CLI if available
   */
  public async listSessions(): Promise<ClaudeSessionItem[]> {
    return new Promise((resolve) => {
      exec('claude session list', { timeout: 5000 }, (error, stdout) => {
        if (error || !stdout) {
          resolve([])
          return
        }

        try {
          const lines = stdout.split(/\r?\n/)
          const sessions: ClaudeSessionItem[] = []
          let separatorPassed = false

          for (const rawLine of lines) {
            const line = rawLine.trim()
            if (!line) continue

            if (line.includes('───') || line.includes('===') || line.startsWith('---')) {
              separatorPassed = true
              continue
            }

            if (!separatorPassed) {
              if (line.startsWith('Session ID') || line.startsWith('ID')) continue
            }

            const match = line.match(/^([a-zA-Z0-9_-]+)\s+(.+?)(?:\s{2,}(\d{1,2}:\d{2}\s*·\s*\d{1,2}\/\d{1,2}\/\d{4}|.*?))?$/)
            if (match) {
              const id = match[1]
              const title = match[2].trim()
              const updated = match[3] ? match[3].trim() : ''

              let dateGroup = 'Today'
              let timestamp = Date.now()

              sessions.push({
                id,
                title,
                updated,
                dateGroup,
                timestamp,
                subtitle: title.startsWith('New session') ? 'Claude Chat' : undefined
              })
            }
          }

          resolve(sessions)
        } catch (parseErr) {
          console.warn('[ClaudeCliService] Error parsing Claude sessions:', parseErr)
          resolve([])
        }
      })
    })
  }

  /**
   * Load messages of a specific session via `claude session export <sessionId>`
   */
  public async loadSession(sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> {
    return new Promise((resolve) => {
      exec(`claude session export ${sessionId}`, { timeout: 8000 }, (error, stdout) => {
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
              const role = item.role || item.info?.role || 'assistant'
              const createdTime = item.timestamp || item.info?.time?.created || Date.now()
              const content = item.content || ''
              const reasoning = item.thinking || item.reasoning || ''

              parsedMessages.push({
                id: item.id || 'cmsg-' + Math.random().toString(36).substr(2, 9),
                role,
                content,
                thinking: reasoning || undefined,
                timestamp: createdTime
              })
            }
          }

          resolve({
            id: data.id || sessionId,
            title: data.title || 'Claude Session',
            messages: parsedMessages
          })
        } catch (err) {
          console.warn('[ClaudeCliService] Error loading Claude session export:', err)
          resolve(null)
        }
      })
    })
  }

  /**
   * Delete a Claude session via `claude session delete <sessionId>`
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(`claude session delete ${sessionId}`, { timeout: 5000 }, (error) => {
        if (error) {
          console.warn('[ClaudeCliService] Error deleting Claude session:', error)
          resolve(false)
        } else {
          resolve(true)
        }
      })
    })
  }
}
