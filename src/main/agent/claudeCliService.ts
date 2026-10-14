import { BrowserWindow } from 'electron'
import { spawn, exec, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join, resolve, isAbsolute, basename } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'node:crypto'
import { VercelAiAgentService } from './vercelAiService'

export interface ClaudeStreamRequest {
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

function formatToolDisplayName(toolName: string): string {
  const map: Record<string, string> = {
    GlobTool: 'Glob',
    glob_tool: 'Glob',
    glob: 'Glob',
    GrepTool: 'Grep',
    grep_tool: 'Grep',
    grep: 'Grep',
    FileReadTool: 'Read',
    file_read: 'Read',
    read_file: 'Read',
    View: 'Read',
    FileEditTool: 'Edit',
    file_edit: 'Edit',
    edit_file: 'Edit',
    Edit: 'Edit',
    FileWriteTool: 'Write',
    file_write: 'Write',
    write_to_file: 'Write',
    Write: 'Write',
    BashTool: 'Bash',
    bash: 'Bash',
    run_command: 'Bash',
    Execute: 'Bash',
    LSTool: 'LS',
    list_dir: 'LS',
    DirectoryList: 'LS'
  }
  return map[toolName] || toolName.replace(/Tool$/, '')
}

function formatToolArgSummary(args: any): string {
  if (!args || typeof args !== 'object') return ''
  const pattern = args.pattern || args.glob || args.query || args.file_pattern
  if (pattern) return `"${pattern}"`

  const path = args.file_path || args.path || args.filePath || args.dir_path || args.dirPath
  if (path) {
    let cleanPath = typeof path === 'string' ? path.replace(/\\/g, '/') : String(path)
    if (cleanPath.length > 45) {
      const parts = cleanPath.split('/')
      if (parts.length > 2) {
        cleanPath = parts.slice(-2).join('/')
      }
    }
    return `"${cleanPath}"`
  }

  const cmd = args.command || args.cmd
  if (cmd) {
    const trimmedCmd = typeof cmd === 'string' ? cmd.trim() : String(cmd)
    const shortCmd = trimmedCmd.length > 45 ? trimmedCmd.slice(0, 42) + '...' : trimmedCmd
    return `"${shortCmd}"`
  }

  const keys = Object.keys(args)
  if (keys.length > 0 && typeof args[keys[0]] === 'string') {
    const val = args[keys[0]].trim()
    return `"${val.length > 35 ? val.slice(0, 32) + '...' : val}"`
  }

  return ''
}

function formatToolResultSummary(toolName: string, output: string, isError: boolean): string {
  if (isError) return 'failed'
  if (!output || !output.trim()) return 'done'

  const trimmed = output.trim()
  if (trimmed.toLowerCase().includes('no matches') || trimmed.toLowerCase().includes('0 matches')) {
    return '0 matches'
  }
  const lines = trimmed.split('\n').filter((l) => l.trim().length > 0)
  const normName = toolName.toLowerCase()

  if (normName.includes('glob') || normName.includes('grep')) {
    const count = lines.length
    return `${count} match${count === 1 ? '' : 'es'}`
  }
  if (normName.includes('read') || normName.includes('view')) {
    const count = lines.length
    return `${count} line${count === 1 ? '' : 's'}`
  }
  if (normName.includes('edit') || normName.includes('write')) {
    return 'ok'
  }
  if (normName.includes('bash') || normName.includes('exec') || normName.includes('command')) {
    if (trimmed.toLowerCase().includes('error')) return 'error'
    return 'done'
  }

  if (lines.length === 1 && lines[0].length <= 25) {
    return lines[0]
  }
  return `${lines.length} lines`
}

export class ClaudeCliService {
  private activeProcesses: Map<string, ChildProcess> = new Map()
  private sessionMap: Map<string, string> = new Map()
  private aiAgentService?: VercelAiAgentService

  constructor(aiAgentService?: VercelAiAgentService) {
    this.aiAgentService = aiAgentService
  }

  public getConfigPath(): string {
    const possibleConfigPaths = [
      join(homedir(), '.claude', 'settings.json'),
      join(homedir(), '.claude', 'setting.json'),
      join(homedir(), '.claude.json'),
      join(homedir(), '.claude', 'config.json'),
      join(homedir(), '.config', 'claude', 'config.json'),
      join(process.env.APPDATA || '', 'Claude', 'config.json')
    ]
    for (const p of possibleConfigPaths) {
      if (existsSync(p)) return p
    }
    return join(homedir(), '.claude', 'settings.json')
  }

  /**
   * Discover Claude models dynamically from:
   * 1. Claude config files (~/.claude/settings.json, ~/.claude.json, ~/.config/claude/config.json)
   * 2. Claude CLI command (claude models or claude --version)
   */
  public async getDiscoveredModels(): Promise<ClaudeDiscoveredModel[]> {
    const configDiscovered: ClaudeDiscoveredModel[] = []
    const seenIds = new Set<string>()

    // Helper to add config models
    const addModel = (modelId: string, customCategory = 'Config', provider = 'Custom') => {
      if (!modelId || typeof modelId !== 'string' || !modelId.trim()) return
      const cleanId = modelId.trim()
      if (seenIds.has(cleanId)) return
      seenIds.add(cleanId)

      configDiscovered.push({
        id: cleanId,
        name: formatModelDisplayName(cleanId),
        provider,
        category: customCategory,
        isFree: cleanId.toLowerCase().includes('free') || cleanId.toLowerCase().includes('haiku'),
        source: 'claude_config'
      })
    }

    // 1. Read Claude Configs (~/.claude/settings.json, ~/.claude.json, ~/.claude/config.json, etc.)
    const possibleConfigPaths = [
      join(homedir(), '.claude', 'settings.json'),
      join(homedir(), '.claude.json'),
      join(homedir(), '.claude', 'config.json'),
      join(homedir(), '.config', 'claude', 'config.json'),
      join(process.env.APPDATA || '', 'Claude', 'config.json')
    ]

    for (const cfgPath of possibleConfigPaths) {
      if (existsSync(cfgPath)) {
        try {
          const raw = readFileSync(cfgPath, 'utf-8')
          const parsed = parseJsonc(raw)
          if (parsed && typeof parsed === 'object') {
            // Check direct model field
            if (typeof parsed.model === 'string') {
              addModel(parsed.model, 'Claude Config', 'Anthropic')
            }

            // Check env ANTHROPIC_MODEL
            if (parsed.env && typeof parsed.env.ANTHROPIC_MODEL === 'string') {
              addModel(parsed.env.ANTHROPIC_MODEL, 'Claude Config', 'Anthropic')
            }

            // Check models array
            if (Array.isArray(parsed.models)) {
              for (const m of parsed.models) {
                const modelId = typeof m === 'string' ? m : m.id || m.name
                if (modelId) addModel(modelId, 'Claude Config', m.provider || 'Custom')
              }
            }

            // Check custom_models list / object
            if (parsed.custom_models) {
              const list = Array.isArray(parsed.custom_models)
                ? parsed.custom_models
                : Object.keys(parsed.custom_models)
              for (const m of list) {
                const modelId = typeof m === 'string' ? m : (m as any).id || (m as any).name
                if (modelId) addModel(modelId, 'Custom Models', 'Custom')
              }
            }

            // Check providers / provider object
            const providersObj = parsed.provider || parsed.providers
            if (providersObj && typeof providersObj === 'object') {
              for (const [provKey, provVal] of Object.entries<any>(providersObj)) {
                if (provVal?.models && typeof provVal.models === 'object') {
                  for (const [mKey, mVal] of Object.entries<any>(provVal.models)) {
                    const modelId = `${provKey}/${mKey}`
                    const provName = provVal?.name || provKey
                    addModel(modelId, provName.charAt(0).toUpperCase() + provName.slice(1), provName)
                  }
                }
              }
            }

            // Check projects lastModelUsage in .claude.json
            if (parsed.projects && typeof parsed.projects === 'object') {
              for (const projVal of Object.values<any>(parsed.projects)) {
                if (projVal?.lastModelUsage && typeof projVal.lastModelUsage === 'object') {
                  for (const usedModel of Object.keys(projVal.lastModelUsage)) {
                    addModel(usedModel, 'Claude Config', 'Custom')
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('[ClaudeCliService] Error reading claude config:', err)
        }
      }
    }

    // If config models are found (e.g. Antigravity), strictly return Claude Config models only!
    if (configDiscovered.length > 0) {
      return configDiscovered
    }

    // Fallback only if no models were found in any Claude config files
    const defaultCurated: ClaudeDiscoveredModel[] = [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Thinking)', provider: 'Anthropic', category: 'Claude Recommended', isFree: false, source: 'claude_config' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: 'Anthropic', category: 'Claude 3.5 Series', isFree: false, source: 'claude_config' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'Anthropic', category: 'Claude 3.5 Series', isFree: true, source: 'claude_config' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'Anthropic', category: 'Claude Legacy', isFree: false, source: 'claude_config' }
    ]

    const discovered: ClaudeDiscoveredModel[] = []

    for (const d of defaultCurated) {
      if (!seenIds.has(d.id)) {
        seenIds.add(d.id)
        discovered.push(d)
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

    return discovered
  }

  public async streamClaude(
    payload: ClaudeStreamRequest,
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
    const cliArgs: string[] = [
      '-p',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--verbose',
      '--forward-subagent-text'
    ]

    // Session handling: use native Claude CLI session persistence (--resume if ongoing, --session-id if new)
    const cleanSessionId = sessionId ? sessionId.replace(/^claude_/, '') : undefined
    let effectiveSessionId: string | undefined = undefined

    const isUUID = cleanSessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSessionId)

    if (isUUID) {
      effectiveSessionId = cleanSessionId
      cliArgs.push('--resume', effectiveSessionId)
    } else if (cleanSessionId && this.sessionMap.has(cleanSessionId)) {
      effectiveSessionId = this.sessionMap.get(cleanSessionId)
      cliArgs.push('--resume', effectiveSessionId!)
    } else {
      effectiveSessionId = randomUUID()
      if (cleanSessionId) {
        this.sessionMap.set(cleanSessionId, effectiveSessionId)
      }
      cliArgs.push('--session-id', effectiveSessionId)
    }

    // Pass model flag if specified
    if (model && model.trim()) {
      cliArgs.push('--model', model.trim())
    }

    // Pass execution mode: Agent vs Chat / Plan
    if (executionMode === 'chat' || executionMode === 'plan') {
      cliArgs.push('--permission-mode', 'plan')
      cliArgs.push(
        '--append-system-prompt',
        'MODE: CHAT & PLAN. Do NOT modify, edit, create, or delete any files, and do NOT execute terminal or build commands. Focus strictly on answering questions, deep reasoning, explaining code, and providing architectural plans or code suggestions for the user.'
      )
    } else {
      cliArgs.push('--permission-mode', 'bypassPermissions')
      cliArgs.push('--dangerously-skip-permissions')
    }

    try {
      const proc = spawn('claude', cliArgs, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0' }
      })

      this.activeProcesses.set(requestId, proc)

      // Emit dynamic session link so renderer knows the native Claude CLI session UUID
      if (effectiveSessionId) {
        targetWindow.webContents.send('agent:session-linked', {
          clientSessionId: sessionId || effectiveSessionId,
          claudeSessionId: effectiveSessionId
        })
      }

      // Immediately announce active mode & model into the live thinking stream
      const activeModeName = executionMode === 'chat' || executionMode === 'plan' ? 'plan' : 'agent'
      const activeModelName = model || 'Claude 3.7 Sonnet'

      let lastThoughtEndedWithNewline = true
      const sendThought = (delta: string) => {
        if (!delta) return
        targetWindow.webContents.send('agent:thought-token', {
          requestId,
          deltaThought: delta
        })
        lastThoughtEndedWithNewline = delta.endsWith('\n')
      }

      sendThought(`> ${activeModeName} · ${activeModelName} · Claude Code Engine\n\n`)

      // Send prompt via stdin immediately and close stdin to signal EOF
      proc.stdin?.write(lastUserMessage + '\n')
      proc.stdin?.end()

      let buffer = ''
      let hasReceivedContent = false
      const activeTools = new Map<string, { name: string; args: any; startTime: number; printedStart: boolean }>()
      const toolOriginalContents = new Map<string, { fullPath: string; originalContent: string }>()

      proc.stdout?.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          try {
            const eventObj = JSON.parse(trimmed)

            // 1. System events (init, status)
            if (eventObj.type === 'system') {
              if (eventObj.subtype === 'init' && eventObj.session_id) {
                const assignedId = eventObj.session_id
                if (cleanSessionId) {
                  this.sessionMap.set(cleanSessionId, assignedId)
                }
                targetWindow.webContents.send('agent:session-linked', {
                  clientSessionId: sessionId || assignedId,
                  claudeSessionId: assignedId
                })
              }
              continue
            }

            // 2. Stream events (content_block_start, content_block_delta, content_block_stop, etc.)
            if (eventObj.type === 'stream_event' && eventObj.event) {
              const ev = eventObj.event

              // Tool start via stream event
              if (ev.type === 'content_block_start' && ev.content_block) {
                const cb = ev.content_block
                if (cb.type === 'tool_use') {
                  const toolCallId = cb.id || `call_${Date.now()}`
                  const toolName = cb.name || 'tool'
                  const toolArgs = cb.input || {}
                  const hasArgs = Object.keys(toolArgs).length > 0
                  const toolRecord = {
                    name: toolName,
                    args: toolArgs,
                    startTime: Date.now(),
                    printedStart: hasArgs
                  }
                  activeTools.set(toolCallId, toolRecord)

                  // Track file before modification
                  const isFileEditTool = /edit|write|create|modify|patch/i.test(toolName)
                  const targetRawPath = toolArgs.file_path || toolArgs.filePath || toolArgs.path || toolArgs.targetFile
                  if (isFileEditTool && targetRawPath && typeof targetRawPath === 'string') {
                    const fullPath = isAbsolute(targetRawPath) ? targetRawPath : resolve(cwd, targetRawPath)
                    let originalContent = ''
                    try {
                      if (existsSync(fullPath)) {
                        originalContent = readFileSync(fullPath, 'utf8')
                      }
                    } catch {}
                    toolOriginalContents.set(toolCallId, { fullPath, originalContent })
                  }

                  if (hasArgs) {
                    const disp = formatToolDisplayName(toolName)
                    const arg = formatToolArgSummary(toolArgs)
                    const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                    sendThought(`${prefix}* ${disp}${arg ? ' ' + arg : ''} `)
                  }

                  targetWindow.webContents.send('agent:tool-start', {
                    requestId,
                    toolCallId,
                    toolName,
                    args: toolArgs
                  })
                }
              }

              // Text or thinking delta
              if (ev.type === 'content_block_delta' && ev.delta) {
                const delta = ev.delta
                if (delta.type === 'text_delta' && delta.text) {
                  hasReceivedContent = true
                  targetWindow.webContents.send('agent:stream-token', {
                    requestId,
                    deltaContent: delta.text
                  })
                } else if (delta.type === 'thinking_delta' && delta.thinking) {
                  sendThought(delta.thinking)
                }
              }
              continue
            }

            // 3. Assistant message with complete blocks (tools, text, thinking)
            if (eventObj.type === 'assistant' && eventObj.message) {
              const msg = eventObj.message
              if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                  if (item.type === 'tool_use') {
                    const toolCallId = item.id || `call_${Date.now()}`
                    const toolName = item.name || 'tool'
                    const toolArgs = item.input || {}
                    let t = activeTools.get(toolCallId)
                    if (!t) {
                      t = {
                        name: toolName,
                        args: toolArgs,
                        startTime: Date.now(),
                        printedStart: false
                      }
                      activeTools.set(toolCallId, t)
                    } else {
                      t.args = { ...t.args, ...toolArgs }
                    }

                    // Track file before modification if not already tracked
                    if (!toolOriginalContents.has(toolCallId)) {
                      const isFileEditTool = /edit|write|create|modify|patch/i.test(toolName)
                      const targetRawPath = toolArgs.file_path || toolArgs.filePath || toolArgs.path || toolArgs.targetFile
                      if (isFileEditTool && targetRawPath && typeof targetRawPath === 'string') {
                        const fullPath = isAbsolute(targetRawPath) ? targetRawPath : resolve(cwd, targetRawPath)
                        let originalContent = ''
                        try {
                          if (existsSync(fullPath)) {
                            originalContent = readFileSync(fullPath, 'utf8')
                          }
                        } catch {}
                        toolOriginalContents.set(toolCallId, { fullPath, originalContent })
                      }
                    }

                    if (!t.printedStart) {
                      t.printedStart = true
                      const disp = formatToolDisplayName(t.name)
                      const arg = formatToolArgSummary(t.args)
                      const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                      sendThought(`${prefix}* ${disp}${arg ? ' ' + arg : ''} `)
                    }

                    targetWindow.webContents.send('agent:tool-start', {
                      requestId,
                      toolCallId,
                      toolName,
                      args: toolArgs
                    })
                  }
                }
              }
              continue
            }

            // 4. User message containing tool results
            if (eventObj.type === 'user' && eventObj.message) {
              const msg = eventObj.message
              if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                  if (item.type === 'tool_result' && item.tool_use_id) {
                    const toolInfo = activeTools.get(item.tool_use_id)
                    const durationMs = toolInfo ? Math.max(1, Date.now() - toolInfo.startTime) : 1
                    const toolName = toolInfo?.name || 'tool'
                    const output =
                      typeof item.content === 'string'
                        ? item.content
                        : JSON.stringify(item.content || '', null, 2)
                    const isError = Boolean(item.is_error)

                    const resultSummary = formatToolResultSummary(toolName, output, isError)

                    if (toolInfo && !toolInfo.printedStart) {
                      toolInfo.printedStart = true
                      const disp = formatToolDisplayName(toolName)
                      const arg = formatToolArgSummary(toolInfo.args)
                      const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                      sendThought(`${prefix}* ${disp}${arg ? ' ' + arg : ''} ${resultSummary}\n`)
                    } else {
                      sendThought(`${resultSummary}\n`)
                    }

                    targetWindow.webContents.send('agent:tool-finish', {
                      requestId,
                      toolCallId: item.tool_use_id,
                      toolName,
                      status: isError ? 'failed' : 'success',
                      output,
                      durationMs
                    })

                    // Emit agent:file-modified if file write/edit tool completed successfully
                    const fileSnapshot = toolOriginalContents.get(item.tool_use_id)
                    if (fileSnapshot && !isError) {
                      toolOriginalContents.delete(item.tool_use_id)
                      let newContent = ''
                      try {
                        if (existsSync(fileSnapshot.fullPath)) {
                          newContent = readFileSync(fileSnapshot.fullPath, 'utf8')
                        }
                      } catch {}

                      const prevLines = fileSnapshot.originalContent ? fileSnapshot.originalContent.split('\n').length : 0
                      const newLines = newContent ? newContent.split('\n').length : 0
                      const additions = Math.max(1, newLines >= prevLines ? newLines - prevLines : 1)
                      const deletions = Math.max(0, prevLines - newLines)
                      const fileName = basename(fileSnapshot.fullPath)

                      if (targetWindow && !targetWindow.isDestroyed()) {
                        targetWindow.webContents.send('agent:file-modified', {
                          filePath: fileSnapshot.fullPath,
                          fileName,
                          additions,
                          deletions,
                          originalContent: fileSnapshot.originalContent,
                          newContent
                        })
                      }
                    }

                    activeTools.delete(item.tool_use_id)
                  }
                }
              }
              continue
            }

            // 5. Result event (final success/error)
            if (eventObj.type === 'result') {
              if (eventObj.result && !hasReceivedContent) {
                hasReceivedContent = true
                targetWindow.webContents.send('agent:stream-token', {
                  requestId,
                  deltaContent: eventObj.result
                })
              }
              continue
            }
          } catch {
            // Non-JSON output fallback (e.g. raw text from CLI or ANSI banners)
            const cleanText = trimmed.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
            if (
              cleanText &&
              !cleanText.startsWith('[claude-code:') &&
              !cleanText.includes('DeprecationWarning') &&
              !cleanText.startsWith('Warning: no stdin')
            ) {
              const prefix = lastThoughtEndedWithNewline ? '' : '\n'
              sendThought(prefix + cleanText + '\n')
            }
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        const text = data.toString()
        const cleanText = text.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
        // Filter out internal CLI noise so the thinking box only shows actual reasoning
        const filtered = cleanText
          .replace(/\[claude-code:.*?\][^\n]*/g, '')
          .replace(/\{"model":.*?"query_source":.*?\}/g, '')
          .replace(/.*isn't described by this version's model catalog.*?\n?/g, '')
          .replace(/.*DeprecationWarning.*?\n?/g, '')
          .replace(/Warning: no stdin data received.*?\n?/g, '')
          .trim()

        if (filtered) {
          const prefix = lastThoughtEndedWithNewline ? '' : '\n'
          sendThought(prefix + filtered + '\n')
        }
      })

      proc.on('close', (code) => {
        this.activeProcesses.delete(requestId)

        // Process any remainder in the line buffer
        if (buffer.trim()) {
          try {
            const eventObj = JSON.parse(buffer.trim())
            if (eventObj.type === 'result' && eventObj.result && !hasReceivedContent) {
              hasReceivedContent = true
              targetWindow.webContents.send('agent:stream-token', {
                requestId,
                deltaContent: eventObj.result
              })
            }
          } catch {
            const cleanText = buffer.trim().replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
            if (cleanText && !hasReceivedContent && !cleanText.startsWith('[claude-code:') && !cleanText.startsWith('Warning:')) {
              targetWindow.webContents.send('agent:stream-token', {
                requestId,
                deltaContent: cleanText
              })
            }
          }
        }

        // Finish any remaining running tools
        for (const [toolId, toolInfo] of activeTools.entries()) {
          const statusText = code === 0 ? 'done' : 'failed'
          if (!toolInfo.printedStart) {
            const disp = formatToolDisplayName(toolInfo.name)
            const arg = formatToolArgSummary(toolInfo.args)
            const prefix = lastThoughtEndedWithNewline ? '' : '\n'
            sendThought(`${prefix}* ${disp}${arg ? ' ' + arg : ''} ${statusText}\n`)
          } else {
            sendThought(`${statusText}\n`)
          }
          targetWindow.webContents.send('agent:tool-finish', {
            requestId,
            toolCallId: toolId,
            toolName: toolInfo.name,
            status: code === 0 ? 'completed' : 'failed',
            output: '',
            durationMs: Math.max(1, Date.now() - toolInfo.startTime)
          })
        }
        activeTools.clear()

        if (cleanSessionId && effectiveSessionId) {
          targetWindow.webContents.send('agent:session-linked', {
            clientSessionId: cleanSessionId,
            claudeSessionId: effectiveSessionId
          })
        }

        if (code === 0 || hasReceivedContent) {
          targetWindow.webContents.send('agent:stream-done', { requestId })
        } else {
          targetWindow.webContents.send('agent:stream-error', {
            requestId,
            errorMessage: `Proses Claude CLI keluar dengan kode ${code}`
          })
        }
      })

      proc.on('error', (err) => {
        this.activeProcesses.delete(requestId)
        targetWindow.webContents.send('agent:stream-error', {
          requestId,
          errorMessage: `Gagal menjalankan Claude CLI: ${err.message}. Pastikan 'claude' CLI terpasang di sistem.`
        })
      })
    } catch (err: any) {
      this.activeProcesses.delete(requestId)
      targetWindow.webContents.send('agent:stream-error', {
        requestId,
        errorMessage: err.message || 'Gagal memulai Claude CLI'
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
            console.warn('Gagal menjalankan taskkill pada proses Claude:', e)
          }
        }
        try {
          proc.kill('SIGKILL')
        } catch (e) {
          console.warn('Gagal mematikan proses Claude:', e)
        }
      }
      this.activeProcesses.delete(requestId)
      return true
    }
    return this.aiAgentService?.abortStream(requestId) ?? false
  }

  /**
   * Get Claude projects directory (~/.claude/projects)
   */
  private getClaudeProjectsDir(): string {
    return join(homedir(), '.claude', 'projects')
  }

  private normalizeProjectToKey(p: string): string {
    return p.replace(/^[a-zA-Z]:[\\/]/, (m) => `${m[0]}--`).replace(/[\\/]/g, '-')
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
   * List all Claude sessions from native Claude CLI storage (~/.claude/projects)
   * This is the exact data source used by the `/resume` command in Claude CLI!
   */
  public async listSessions(projectRoot?: string): Promise<ClaudeSessionItem[]> {
    const projectsDir = this.getClaudeProjectsDir()
    if (!existsSync(projectsDir)) {
      return []
    }

    const sessions: ClaudeSessionItem[] = []
    const seenIds = new Set<string>()

    // Determine target project directory name if projectRoot is supplied
    let targetDirName: string | undefined = undefined
    if (projectRoot && projectRoot.trim()) {
      targetDirName = this.normalizeProjectToKey(projectRoot.trim()).toLowerCase()
    }

    try {
      const allDirs = readdirSync(projectsDir)

      // Prioritize the matching project directory, then others
      const sortedDirs = [...allDirs].sort((a, b) => {
        if (targetDirName) {
          if (a.toLowerCase() === targetDirName) return -1
          if (b.toLowerCase() === targetDirName) return 1
        }
        return 0
      })

      for (const dirName of sortedDirs) {
        // If targetDirName is provided, prioritize it first, but fallback to all directories if empty
        if (targetDirName && dirName.toLowerCase() !== targetDirName && !dirName.toLowerCase().startsWith('c--users-')) {
          // If we already collected sessions from the target project, don't mix other projects unless empty
          if (sessions.length > 0) {
            continue
          }
        }

        const projectPath = join(projectsDir, dirName)
        let files: string[] = []
        try {
          files = readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'))
        } catch {
          continue
        }

        for (const file of files) {
          const sessionId = file.replace(/\.jsonl$/i, '')
          if (seenIds.has(sessionId)) continue
          seenIds.add(sessionId)

          const filePath = join(projectPath, file)
          try {
            const stat = statSync(filePath)
            const raw = readFileSync(filePath, 'utf-8')
            const lines = raw.split(/\r?\n/).filter(Boolean)
            if (lines.length === 0) continue

            let title = ''
            let lastMessage = ''
            let model = 'Antigravity'
            let turnCount = 0

            for (const line of lines) {
              try {
                const entry = JSON.parse(line)
                if (entry.type === 'user' && entry.message) {
                  const c = entry.message.content
                  if (Array.isArray(c) && c.every((it: any) => it.type === 'tool_result')) {
                    continue
                  }

                  turnCount++
                  if (!title) {
                    if (typeof c === 'string') {
                      const clean = c
                        .replace(/\[Konteks Berkas Aktif:.*?\][\s\S]*?Instruksi Pengguna:\s*/i, '')
                        .replace(/\[Lampiran Gambar Proyek:.*?\]/g, '')
                        .trim()
                      title = clean || c.slice(0, 60)
                    } else if (Array.isArray(c)) {
                      const txt = c.find((it: any) => it.type === 'text')
                      if (txt?.text) title = txt.text.slice(0, 60)
                    }
                  }
                } else if (entry.type === 'assistant' && entry.message) {
                  turnCount++
                  if (entry.requestedModel) model = entry.requestedModel
                  else if (entry.message.model) model = entry.message.model

                  const c = entry.message.content
                  if (typeof c === 'string') {
                    lastMessage = c
                  } else if (Array.isArray(c)) {
                    const txt = c.find((it: any) => it.type === 'text')
                    if (txt?.text) lastMessage = txt.text
                  }
                }
              } catch {}
            }

            if (!title) {
              title = `Sesi Claude ${sessionId.slice(0, 8)}`
            }

            const timestamp = stat.mtimeMs || stat.mtime.getTime() || Date.now()
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
              id: sessionId,
              title: title.slice(0, 50),
              subtitle: lastMessage ? lastMessage.slice(0, 100) : 'Percakapan Claude CLI',
              lastMessage: lastMessage ? lastMessage.slice(0, 120) : undefined,
              messageCount: turnCount || 1,
              model: model || 'Antigravity',
              timestamp,
              updated: `${dateStr}, ${timeStr}`,
              updatedAt: dateObj.toISOString(),
              dateGroup: this.getDateGroup(timestamp)
            })
          } catch (fileErr) {
            console.warn(`[ClaudeCliService] Error parsing session file ${file}:`, fileErr)
          }
        }
      }

      // Sort by timestamp desc (newest first)
      sessions.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      return sessions
    } catch (err) {
      console.warn('[ClaudeCliService] Error listing Claude sessions:', err)
      return []
    }
  }

  /**
   * Load messages of a specific session directly from its native Claude CLI .jsonl transcript
   */
  public async loadSession(sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> {
    const cleanId = sessionId.replace(/^claude_/, '')
    const projectsDir = this.getClaudeProjectsDir()
    if (!existsSync(projectsDir)) return null

    // Search for <cleanId>.jsonl in all project folders
    let targetFilePath: string | undefined = undefined
    try {
      const dirs = readdirSync(projectsDir)
      for (const d of dirs) {
        const candidate = join(projectsDir, d, `${cleanId}.jsonl`)
        if (existsSync(candidate)) {
          targetFilePath = candidate
          break
        }
      }
    } catch {
      return null
    }

    if (!targetFilePath || !existsSync(targetFilePath)) {
      return null
    }

    try {
      const raw = readFileSync(targetFilePath, 'utf-8')
      const lines = raw.split(/\r?\n/).filter(Boolean)
      const parsedMessages: any[] = []
      let title = ''

      for (let i = 0; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i])
          if (entry.type === 'user' && entry.message) {
            const c = entry.message.content

            // If user message only contains tool_results, attach them to the matching assistant's tool
            if (Array.isArray(c) && c.every((it: any) => it.type === 'tool_result')) {
              for (const tr of c) {
                for (let mIdx = parsedMessages.length - 1; mIdx >= 0; mIdx--) {
                  const t = parsedMessages[mIdx].tools?.find((x: any) => x.id === tr.tool_use_id)
                  if (t) {
                    t.output = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content)
                    t.status = 'completed'
                    break
                  }
                }
              }
              continue
            }

            let userText = ''
            if (typeof c === 'string') {
              userText = c
            } else if (Array.isArray(c)) {
              userText = c
                .filter((it: any) => it.type === 'text')
                .map((it: any) => it.text)
                .join('\n')
            }

            if (!userText.trim()) continue

            const cleanDisplay = userText
              .replace(/\[Konteks Berkas Aktif:.*?\][\s\S]*?Instruksi Pengguna:\s*/i, '')
              .replace(/\[Lampiran Gambar Proyek:.*?\]/g, '')
              .trim()

            if (!title) {
              title = cleanDisplay || userText.slice(0, 60)
            }

            parsedMessages.push({
              id: entry.uuid || `msg-u-${i}`,
              role: 'user',
              content: userText,
              displayPrompt: cleanDisplay || userText,
              timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now()
            })
          } else if (entry.type === 'assistant' && entry.message) {
            let assistantText = ''
            let thinkingText = ''
            const tools: any[] = []

            const c = entry.message.content
            if (typeof c === 'string') {
              assistantText = c
            } else if (Array.isArray(c)) {
              for (const part of c) {
                if (part.type === 'text' && part.text) {
                  assistantText += part.text
                } else if (part.type === 'thinking' && part.thinking) {
                  thinkingText += part.thinking
                } else if (part.type === 'tool_use') {
                  tools.push({
                    id: part.id || `tool-${Date.now()}`,
                    name: part.name,
                    args: part.input || {},
                    status: 'completed'
                  })
                }
              }
            }

            // Check if previous message in list is also assistant (merge sequential assistant chunks of same turn)
            const lastMsg = parsedMessages[parsedMessages.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              if (assistantText) {
                lastMsg.content = (lastMsg.content ? lastMsg.content + '\n' : '') + assistantText
              }
              if (thinkingText) {
                lastMsg.thinking = (lastMsg.thinking ? lastMsg.thinking + '\n' : '') + thinkingText
              }
              if (tools.length > 0) {
                lastMsg.tools = (lastMsg.tools || []).concat(tools)
              }
            } else {
              parsedMessages.push({
                id: entry.uuid || `msg-a-${i}`,
                role: 'assistant',
                content: assistantText,
                thinking: thinkingText || undefined,
                isThinkingExpanded: false,
                tools: tools.length > 0 ? tools : undefined,
                timestamp: entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now()
              })
            }
          }
        } catch {}
      }

      return {
        id: cleanId,
        title: title || `Claude Session ${cleanId.slice(0, 8)}`,
        messages: parsedMessages
      }
    } catch (err) {
      console.warn(`[ClaudeCliService] Error loading session ${sessionId}:`, err)
      return null
    }
  }

  /**
   * Delete a Claude session from native Claude CLI storage
   */
  public async deleteSession(sessionId: string): Promise<boolean> {
    const cleanId = sessionId.replace(/^claude_/, '')
    const projectsDir = this.getClaudeProjectsDir()
    if (!existsSync(projectsDir)) return false

    try {
      const dirs = readdirSync(projectsDir)
      for (const d of dirs) {
        const candidate = join(projectsDir, d, `${cleanId}.jsonl`)
        if (existsSync(candidate)) {
          unlinkSync(candidate)
          return true
        }
      }
    } catch (err) {
      console.warn(`[ClaudeCliService] Error deleting session ${sessionId}:`, err)
    }
    return false
  }
}
