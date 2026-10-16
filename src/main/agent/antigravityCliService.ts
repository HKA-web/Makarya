import { BrowserWindow } from 'electron'
import { spawn, exec, type ChildProcess } from 'child_process'
import { existsSync, readFileSync, readdirSync, statSync, rmSync } from 'fs'
import { join, resolve, isAbsolute, basename } from 'path'
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

function formatToolDisplayName(toolName: string): string {
  const map: Record<string, string> = {
    search_web: 'WebSearch',
    WebSearch: 'WebSearch',
    run_command: 'Bash',
    bash: 'Bash',
    BashTool: 'Bash',
    Execute: 'Bash',
    view_file: 'Read',
    read_file: 'Read',
    FileReadTool: 'Read',
    View: 'Read',
    write_to_file: 'Write',
    file_write: 'Write',
    FileWriteTool: 'Write',
    Write: 'Write',
    replace_file_content: 'Edit',
    multi_replace_file_content: 'Edit',
    file_edit: 'Edit',
    edit_file: 'Edit',
    FileEditTool: 'Edit',
    Edit: 'Edit',
    list_dir: 'LS',
    LSTool: 'LS',
    DirectoryList: 'LS',
    grep_search: 'Grep',
    grep: 'Grep',
    GrepTool: 'Grep',
    glob: 'Glob',
    GlobTool: 'Glob',
    open_browser_url: 'Browser',
    read_url_content: 'WebFetch',
    browser_subagent: 'BrowserAgent',
    invoke_subagent: 'Subagent',
    ask_question: 'Question',
    generate_image: 'GenerateImage'
  }
  return map[toolName] || toolName.charAt(0).toUpperCase() + toolName.slice(1)
}

function formatToolArgSummary(args: any): string {
  if (!args || typeof args !== 'object') return ''
  const pattern = args.query || args.Query || args.pattern || args.glob || args.file_pattern
  if (pattern) return `"${pattern}"`

  const url = args.Url || args.url
  if (url) return `"${url}"`

  const path = args.TargetFile || args.AbsolutePath || args.file_path || args.path || args.filePath || args.dir_path || args.dirPath
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

  const cmd = args.CommandLine || args.command || args.cmd
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
  if (normName.includes('bash') || normName.includes('exec') || normName.includes('command') || normName.includes('run_command')) {
    if (trimmed.toLowerCase().includes('error')) return 'error'
    return 'done'
  }
  if (normName.includes('search') || normName.includes('fetch')) {
    return 'done'
  }

  if (lines.length === 1 && lines[0].length <= 25) {
    return lines[0]
  }
  return `${lines.length} lines`
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

    const brainDirs = this.getBrainDirs()
    const isUUID = cleanSessionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSessionId)

    // Only pass --conversation if this conversation actually exists in the brain directories or has already been mapped
    if (cleanSessionId && this.sessionMap.has(cleanSessionId)) {
      effectiveConversationId = this.sessionMap.get(cleanSessionId)
    } else if (isUUID) {
      const existsInBrain = brainDirs.some((bDir) => existsSync(join(bDir, cleanSessionId!)))
      if (existsInBrain) {
        effectiveConversationId = cleanSessionId
      }
    }

    const cliArgs: string[] = []

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

    cliArgs.push(
      '--output-format',
      'stream-json',
      '--dangerously-skip-permissions'
    )

    try {
      const proc = spawn('agy', cliArgs, {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, FORCE_COLOR: '0' }
      })

      this.activeProcesses.set(requestId, proc)

      // Send user prompt via stdin safely with UTF-8 encoding
      proc.stdin?.setDefaultEncoding('utf-8')
      proc.stdin?.write(lastUserMessage + '\n', 'utf-8')
      proc.stdin?.end()

      // Announce mode & model immediately in thought box
      const activeModeName = executionMode === 'chat' || executionMode === 'plan' ? 'plan' : 'agent'
      const activeModelName = model || 'Gemini 3.8 Flash'

      let lastThoughtEndedWithNewline = true
      const sendThought = (delta: string) => {
        if (!delta) return
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('agent:thought-token', {
            requestId,
            deltaThought: delta
          })
        }
        lastThoughtEndedWithNewline = delta.endsWith('\n')
      }

      sendThought(`> ${activeModeName} · ${activeModelName} · Antigravity CLI (agy)\n\n`)

      const activeTools = new Map<string, { name: string; args: any; startTime: number; printedStart: boolean }>()
      const toolOriginalContents = new Map<string, { fullPath: string; originalContent: string }>()

      let buffer = ''
      let hasReceivedContent = false

      proc.stdout?.on('data', (data) => {
        buffer += data.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''

        for (const line of lines) {
          const rawTrimmed = line.trim()
          if (!rawTrimmed) continue

          const cleanLine = rawTrimmed.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '').trim()
          if (!cleanLine) continue

          try {
            const startIdx = cleanLine.indexOf('{')
            const endIdx = cleanLine.lastIndexOf('}')
            if (startIdx === -1 || endIdx <= startIdx) {
              throw new Error('Not JSON')
            }
            const jsonStr = cleanLine.substring(startIdx, endIdx + 1)
            const eventObj = JSON.parse(jsonStr)

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

              // 1. Tool execution in agy (step_type === 'tool')
              if (step.step_type === 'tool') {
                const toolName = step.tool_name || step.tool_info?.name || 'tool'
                const callId = 'tool_' + (step.step_index !== undefined ? step.step_index : Date.now())
                const args = step.tool_info?.parameters || step.tool_info?.args || step.tool_info?.input || {}

                // Handle ask_question specifically
                if (toolName === 'ask_question') {
                  const qList = args.questions || (args.question ? [args] : [])
                  const firstQ = qList[0] || {}
                  targetWindow.webContents.send('agent:ask-question', {
                    requestId,
                    toolCallId: callId,
                    question: firstQ.question || args.question || 'Pertanyaan klarifikasi Antigravity',
                    options: firstQ.options || args.options || [],
                    is_multi_select: firstQ.is_multi_select || args.is_multi_select || false
                  })
                }

                if (step.state === 'ACTIVE') {
                  // Snapshot file before modification
                  const isFileEditTool = /write|replace|edit|modify|patch/i.test(toolName)
                  const targetRawPath = args.TargetFile || args.AbsolutePath || args.file_path || args.path || args.filePath || args.targetFile
                  if (isFileEditTool && targetRawPath && typeof targetRawPath === 'string') {
                    const fullPath = isAbsolute(targetRawPath) ? targetRawPath : resolve(cwd, targetRawPath)
                    let originalContent = ''
                    try {
                      if (existsSync(fullPath)) {
                        originalContent = readFileSync(fullPath, 'utf8')
                      }
                    } catch {}
                    toolOriginalContents.set(callId, { fullPath, originalContent })
                  }

                  const disp = formatToolDisplayName(toolName)
                  const arg = formatToolArgSummary(args)
                  const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                  sendThought(`${prefix}* ${disp}${arg ? ' ' + arg : ''} `)

                  activeTools.set(callId, {
                    name: toolName,
                    args,
                    startTime: Date.now(),
                    printedStart: true
                  })

                  targetWindow.webContents.send('agent:tool-start', {
                    requestId,
                    toolCallId: callId,
                    toolName,
                    args
                  })
                } else if (step.state === 'DONE') {
                  const output =
                    typeof step.tool_info?.output === 'string'
                      ? step.tool_info.output
                      : JSON.stringify(step.tool_info?.output || '', null, 2)
                  const isError = Boolean(step.tool_info?.error || step.error)
                  const toolInfo = activeTools.get(callId)
                  const durationMs = step.duration_seconds
                    ? Math.round(step.duration_seconds * 1000)
                    : (toolInfo ? Math.max(1, Date.now() - toolInfo.startTime) : 1)

                  const resultSummary = formatToolResultSummary(toolName, output, isError)

                  if (toolInfo && !toolInfo.printedStart) {
                    const disp = formatToolDisplayName(toolName)
                    const arg = formatToolArgSummary(toolInfo.args)
                    const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                    sendThought(`${prefix}* ${disp}${arg ? ' ' + arg : ''} ${resultSummary}\n`)
                  } else {
                    sendThought(`${resultSummary}\n`)
                  }

                  targetWindow.webContents.send('agent:tool-finish', {
                    requestId,
                    toolCallId: callId,
                    toolName,
                    status: isError ? 'failed' : 'completed',
                    output,
                    durationMs
                  })

                  // Emit file-modified if file write/edit tool completed successfully
                  const snapshot = toolOriginalContents.get(callId)
                  if (snapshot && !isError) {
                    toolOriginalContents.delete(callId)
                    let newContent = ''
                    try {
                      if (existsSync(snapshot.fullPath)) {
                        newContent = readFileSync(snapshot.fullPath, 'utf8')
                      }
                    } catch {}

                    const prevLines = snapshot.originalContent ? snapshot.originalContent.split('\n').length : 0
                    const newLines = newContent ? newContent.split('\n').length : 0
                    const additions = Math.max(1, newLines >= prevLines ? newLines - prevLines : 1)
                    const deletions = Math.max(0, prevLines - newLines)
                    const fileName = basename(snapshot.fullPath)

                    const modPayload = {
                      filePath: snapshot.fullPath,
                      fileName,
                      additions,
                      deletions,
                      originalContent: snapshot.originalContent,
                      newContent
                    }

                    if (targetWindow && !targetWindow.isDestroyed()) {
                      targetWindow.webContents.send('agent:file-modified', modPayload)
                    }
                    for (const w of BrowserWindow.getAllWindows()) {
                      if (!w.isDestroyed() && w !== targetWindow) {
                        w.webContents.send('agent:file-modified', modPayload)
                      }
                    }
                  }
                }
              }

              // 2. Assistant text and reasoning (step_type === 'agent_response')
              if (step.step_type === 'agent_response') {
                if (step.text_delta) {
                  hasReceivedContent = true
                  targetWindow.webContents.send('agent:stream-token', {
                    requestId,
                    deltaContent: step.text_delta
                  })
                }

                if (step.thought_delta || step.reasoning_delta) {
                  sendThought(step.thought_delta || step.reasoning_delta)
                }

                // When step is DONE and has thinking tokens or duration
                if (step.state === 'DONE' && step.duration_seconds && (step.usage?.thinking_tokens || step.duration_seconds >= 1)) {
                  const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                  const tokenStr = step.usage?.thinking_tokens ? ` (${step.usage.thinking_tokens} tokens)` : ''
                  sendThought(`${prefix}* Menalar ${step.duration_seconds.toFixed(1)}s${tokenStr}\n`)
                }
              }

              // Fallback tool calls inside step_update (if formatted as tool_calls array)
              const stepCalls = step.tool_calls || (step.tool_call ? [step.tool_call] : null)
              if (Array.isArray(stepCalls)) {
                for (const tc of stepCalls) {
                  if (!tc) continue
                  const toolName = tc.name || tc.tool || 'tool'
                  const callId = tc.id || tc.call_id || 'call_' + Date.now()
                  const args = tc.args || tc.input || {}
                  const isFileEditTool = /write|replace|edit|modify|patch/i.test(toolName)
                  const targetRawPath = args.TargetFile || args.AbsolutePath || args.file_path || args.path || args.filePath || args.targetFile
                  if (isFileEditTool && targetRawPath && typeof targetRawPath === 'string') {
                    const fullPath = isAbsolute(targetRawPath) ? targetRawPath : resolve(cwd, targetRawPath)
                    if (existsSync(fullPath)) {
                      try {
                        toolOriginalContents.set(callId, { fullPath, originalContent: readFileSync(fullPath, 'utf8') })
                      } catch {}
                    }
                  }
                  targetWindow.webContents.send('agent:tool-start', {
                    requestId,
                    toolCallId: callId,
                    toolName,
                    args
                  })
                  const prefix = lastThoughtEndedWithNewline ? '' : '\n'
                  sendThought(`${prefix}* ${formatToolDisplayName(toolName)} ${formatToolArgSummary(args)}\n`)
                }
              }
            }

            // Direct tool_use fallback
            if (eventObj.event === 'tool_use' || eventObj.type === 'tool_use' || eventObj.event === 'tool_call') {
              const toolName = eventObj.tool || eventObj.name || eventObj.tool_name || 'tool'
              const callId = eventObj.id || eventObj.tool_call_id || eventObj.call_id || 'call_' + Date.now()
              const args = eventObj.args || eventObj.input || {}
              const isFileEditTool = /write|replace|edit|modify|patch/i.test(toolName)
              const targetRawPath = args.TargetFile || args.AbsolutePath || args.file_path || args.path || args.filePath || args.targetFile
              if (isFileEditTool && targetRawPath && typeof targetRawPath === 'string') {
                const fullPath = isAbsolute(targetRawPath) ? targetRawPath : resolve(cwd, targetRawPath)
                if (existsSync(fullPath)) {
                  try {
                    toolOriginalContents.set(callId, { fullPath, originalContent: readFileSync(fullPath, 'utf8') })
                  } catch {}
                }
              }
              targetWindow.webContents.send('agent:tool-start', {
                requestId,
                toolCallId: callId,
                toolName,
                args
              })
              const prefix = lastThoughtEndedWithNewline ? '' : '\n'
              sendThought(`${prefix}* ${formatToolDisplayName(toolName)} ${formatToolArgSummary(args)}\n`)
            }

            // Direct tool_result fallback
            if (eventObj.event === 'tool_result' || eventObj.event === 'tool_finish' || eventObj.type === 'tool_result') {
              const callId = eventObj.tool_call_id || eventObj.call_id || eventObj.id || ''
              const toolName = eventObj.tool_name || eventObj.tool || 'tool'
              const output = typeof eventObj.output === 'string' ? eventObj.output : JSON.stringify(eventObj.output || eventObj.result || '')
              const isError = Boolean(eventObj.error || eventObj.is_error)

              targetWindow.webContents.send('agent:tool-finish', {
                requestId,
                toolCallId: callId,
                toolName,
                status: isError ? 'failed' : 'completed',
                output,
                durationMs: 1
              })

              const snapshot = toolOriginalContents.get(callId)
              if (snapshot && !isError) {
                toolOriginalContents.delete(callId)
                let newContent = ''
                try {
                  if (existsSync(snapshot.fullPath)) {
                    newContent = readFileSync(snapshot.fullPath, 'utf8')
                  }
                } catch {}

                const prevLines = snapshot.originalContent ? snapshot.originalContent.split('\n').length : 0
                const newLines = newContent ? newContent.split('\n').length : 0
                const additions = Math.max(1, newLines >= prevLines ? newLines - prevLines : 1)
                const deletions = Math.max(0, prevLines - newLines)
                const fileName = basename(snapshot.fullPath)

                const modPayload = {
                  filePath: snapshot.fullPath,
                  fileName,
                  additions,
                  deletions,
                  originalContent: snapshot.originalContent,
                  newContent
                }

                if (targetWindow && !targetWindow.isDestroyed()) {
                  targetWindow.webContents.send('agent:file-modified', modPayload)
                }
                for (const w of BrowserWindow.getAllWindows()) {
                  if (!w.isDestroyed() && w !== targetWindow) {
                    w.webContents.send('agent:file-modified', modPayload)
                  }
                }
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
              deltaContent: cleanLine + '\n'
            })
          }
        }
      })

      proc.stderr?.on('data', (data) => {
        const text = data.toString().replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
        const trimmed = text.trim()
        if (!trimmed) return

        // Filter out benign conversation warnings or plugin notices
        if (
          trimmed.includes('warning: conversation') ||
          trimmed.includes('ExperimentalWarning') ||
          trimmed.includes('Failed to load plugin')
        ) {
          console.warn('[Antigravity CLI stderr warning ignored]:', trimmed)
          return
        }

        targetWindow.webContents.send('agent:thought-token', {
          requestId,
          deltaThought: text
        })
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
