import type { BrowserWindow } from 'electron'
import { AGENT_TOOLS, AgentToolExecutor, type ToolExecutionResult } from './agentTools'

export type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessagePayload {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | MultimodalContentPart[] | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
  name?: string
}

export interface StreamChatRequest {
  requestId: string
  model?: string
  messages: ChatMessagePayload[]
  projectRoot?: string
  autoExecution?: 'always_proceed' | 'ask_before' | 'never'
}

export interface AiServiceConfiguration {
  baseUrl: string
  apiKey: string
  defaultModel: string
}

const defaultConfiguration: AiServiceConfiguration = {
  baseUrl: process.env.AI_BASE_URL || '',
  apiKey: process.env.AI_API_KEY || '',
  defaultModel: ''
}

const AGENT_SYSTEM_PROMPT =
  'Anda adalah Makarya AI Agent — agen pemrograman otonom tingkat lanjut yang terintegrasi di dalam Makarya IDE (setara kemampuan Zed AI, Cursor, dan VS Code Copilot Agent).\n\n' +
  'KEMAMPUAN OTONOM:\n' +
  '1. Anda memiliki izin eksekusi penuh ke sistem operasi melalui tool:\n' +
  '   - `execute_command`: Menjalankan perintah terminal/shell di folder project pengguna (misal: php -l, npm test, git status, git diff, composer, pytest, tsc, dsb).\n' +
  '   - `read_file`: Membaca kode sumber atau file konfigurasi dari disk.\n' +
  '   - `write_file`: Menulis, memodifikasi, atau membuat berkas baru untuk memperbaiki bug.\n' +
  '   - `list_dir`: Memeriksa struktur berkas dan folder project.\n\n' +
  'PANDUAN EKSEKUSI:\n' +
  '- Sebelum memanggil tool atau menjawab, tuliskan proses berpikir / rencana tindakan Anda di dalam tag <thought>...</thought> (contoh: <thought>Pengguna meminta status git. Saya akan mengeksekusi git status...</thought>).\n' +
  '- Jika pengguna meminta untuk memeriksa, menguji (test), memperbaiki (debug), atau menjalankan perintah, LANGSUNG panggil tool yang relevan!\n' +
  '- Jika hasil tool error atau ada kegagalan sintaks/test, baca file terkait, perbaiki dengan `write_file`, dan uji kembali untuk memverifikasi perbaikan.\n' +
  '- Berikan ringkasan akhir yang profesional, jelas, dan dalam Bahasa Indonesia yang ringkas.'

export class AiAgentService {
  private activeAbortControllers: Map<string, AbortController> = new Map()
  private pendingApprovals: Map<string, (approved: boolean) => void> = new Map()
  private configuration: AiServiceConfiguration

  constructor(customConfig?: Partial<AiServiceConfiguration>) {
    this.configuration = { ...defaultConfiguration, ...customConfig }
  }

  public getConfiguration(): AiServiceConfiguration {
    return { ...this.configuration }
  }

  public updateConfiguration(newConfig: Partial<AiServiceConfiguration>): void {
    this.configuration = { ...this.configuration, ...newConfig }
  }

  public respondToolApproval(toolCallId: string, approved: boolean): boolean {
    const resolver = this.pendingApprovals.get(toolCallId)
    if (resolver) {
      resolver(approved)
      this.pendingApprovals.delete(toolCallId)
      return true
    }
    return false
  }

  public abortStream(requestId: string): boolean {
    // Reject any pending tool approvals for this stream
    for (const [toolId, resolver] of this.pendingApprovals.entries()) {
      resolver(false)
      this.pendingApprovals.delete(toolId)
    }

    const controller = this.activeAbortControllers.get(requestId)
    if (controller) {
      controller.abort()
      this.activeAbortControllers.delete(requestId)
      return true
    }
    return false
  }

  public async fetchAvailableModels(): Promise<string[]> {
    if (!this.configuration.baseUrl) {
      return []
    }
    try {
      const cleanBase = this.configuration.baseUrl.replace(/\/+$/, '')
      const headers: Record<string, string> = {}
      if (this.configuration.apiKey) {
        headers['Authorization'] = `Bearer ${this.configuration.apiKey}`
      }
      const response = await fetch(`${cleanBase}/models`, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch models: HTTP ${response.status}`)
      }

      const responseJson = (await response.json()) as { data?: Array<{ id: string }> }
      if (Array.isArray(responseJson.data) && responseJson.data.length > 0) {
        return responseJson.data.map((item) => item.id).filter(Boolean)
      }
      return []
    } catch (error) {
      console.warn('[AiAgentService] Gagal mengambil model dari AI router / 9router offline:', error)
      return []
    }
  }

  public async streamChat(
    request: StreamChatRequest,
    targetWindow: BrowserWindow | null
  ): Promise<void> {
    const { requestId, messages, model, projectRoot, autoExecution = 'always_proceed' } = request
    if (!this.configuration.baseUrl) {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('agent:stream-error', {
          requestId,
          errorMessage: 'Base URL 9router belum dikonfigurasi. Harap masukkan Base URL di Pengaturan (Settings > AI Provider).'
        })
      }
      return
    }

    const selectedModel = model || this.configuration.defaultModel
    if (!selectedModel) {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('agent:stream-error', {
          requestId,
          errorMessage: 'Tidak ada model AI yang dipilih atau tersedia. Pastikan 9router aktif dan model terdeteksi.'
        })
      }
      return
    }
    const abortController = new AbortController()
    this.activeAbortControllers.set(requestId, abortController)

    const toolExecutor = new AgentToolExecutor(projectRoot)
    const activeWorkspaceRoot = toolExecutor.getProjectRoot()

    const dynamicSystemPrompt =
      AGENT_SYSTEM_PROMPT +
      `\n\n[INFORMASI WORKSPACE PROJECT AKTIF SAAT INI]:\n` +
      `- Direktori Kerja Root: "${activeWorkspaceRoot}"\n` +
      `- Jika pengguna menanyakan path project atau letak berkas, ketahuilah bahwa project yang sedang dibuka berada di "${activeWorkspaceRoot}".\n` +
      `- Semua pemanggilan execute_command, read_file, dan write_file dijalankan dengan basis direktori kerja ini.`

    // Ensure system prompt is present at the beginning
    const conversationMessages: ChatMessagePayload[] = [
      {
        role: 'system',
        content: dynamicSystemPrompt
      },
      ...messages
    ]

    const MAX_TURNS = 8
    let turnCount = 0
    let accumulatedFinalText = ''

    try {
      while (turnCount < MAX_TURNS) {
        turnCount++

        if (abortController.signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError')
        }

        const cleanBase = this.configuration.baseUrl.replace(/\/+$/, '')
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (this.configuration.apiKey) {
          headers['Authorization'] = `Bearer ${this.configuration.apiKey}`
        }

        const response = await fetch(`${cleanBase}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: selectedModel,
            messages: conversationMessages,
            tools: AGENT_TOOLS,
            tool_choice: 'auto',
            stream: true
          }),
          signal: abortController.signal
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
        }

        if (!response.body) {
          throw new Error('Response body kosong dari AI gateway')
        }

        const bodyReader = response.body.getReader()
        const textDecoder = new TextDecoder('utf-8')
        let buffer = ''

        let turnContent = ''
        let hasEmittedThought = false
        const accumulatedToolCalls: Map<
          number,
          { id: string; name: string; arguments: string }
        > = new Map()

        let insideThoughtTag = false

        while (true) {
          const { done, value } = await bodyReader.read()
          if (done) break

          buffer += textDecoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine || trimmedLine.startsWith(':')) continue

            if (trimmedLine === 'data: [DONE]') {
              continue
            }

            if (trimmedLine.startsWith('data: ')) {
              const jsonPayload = trimmedLine.slice(6)
              try {
                const parsed = JSON.parse(jsonPayload)
                const choice = parsed.choices?.[0]
                const delta = choice?.delta

                if (!delta) continue

                // 1. Check for reasoning / thinking tokens (e.g. reasoning_content)
                if (delta.reasoning_content) {
                  hasEmittedThought = true
                  if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send('agent:thought-token', {
                      requestId,
                      deltaThought: delta.reasoning_content
                    })
                  }
                }

                // 2. Check for content tokens and filter <thought> tags if present
                if (delta.content) {
                  const contentChunk = delta.content

                  if (contentChunk.includes('<thought>')) {
                    insideThoughtTag = true
                  }

                  if (insideThoughtTag) {
                    hasEmittedThought = true
                    if (contentChunk.includes('</thought>')) {
                      insideThoughtTag = false
                      const parts = contentChunk.split('</thought>')
                      if (parts[0] && targetWindow && !targetWindow.isDestroyed()) {
                        targetWindow.webContents.send('agent:thought-token', {
                          requestId,
                          deltaThought: parts[0].replace('<thought>', '')
                        })
                      }
                      if (parts[1]) {
                        turnContent += parts[1]
                        accumulatedFinalText += parts[1]
                        if (targetWindow && !targetWindow.isDestroyed()) {
                          targetWindow.webContents.send('agent:stream-token', {
                            requestId,
                            deltaContent: parts[1]
                          })
                        }
                      }
                    } else {
                      if (targetWindow && !targetWindow.isDestroyed()) {
                        targetWindow.webContents.send('agent:thought-token', {
                          requestId,
                          deltaThought: contentChunk.replace('<thought>', '')
                        })
                      }
                    }
                  } else {
                    turnContent += contentChunk
                    accumulatedFinalText += contentChunk
                    if (targetWindow && !targetWindow.isDestroyed()) {
                      targetWindow.webContents.send('agent:stream-token', {
                        requestId,
                        deltaContent: contentChunk
                      })
                    }
                  }
                }

                // 3. Accumulate streaming tool calls
                if (Array.isArray(delta.tool_calls)) {
                  for (const toolCallChunk of delta.tool_calls) {
                    const idx = toolCallChunk.index ?? 0
                    const existing = accumulatedToolCalls.get(idx) || {
                      id: toolCallChunk.id || `call_${Date.now()}_${idx}`,
                      name: '',
                      arguments: ''
                    }

                    if (toolCallChunk.id) existing.id = toolCallChunk.id
                    if (toolCallChunk.function?.name) existing.name += toolCallChunk.function.name
                    if (toolCallChunk.function?.arguments)
                      existing.arguments += toolCallChunk.function.arguments

                    accumulatedToolCalls.set(idx, existing)
                  }
                }
              } catch {
                // Ignore partial JSON chunks
              }
            }
          }
        }

        // If tools were called in this turn, execute them and continue ReAct loop
        if (accumulatedToolCalls.size > 0) {
          const toolCallsList = Array.from(accumulatedToolCalls.values()).map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments
            }
          }))

          // If model did not emit a thought tag, generate an analysis summary to populate Thinking block
          if (!hasEmittedThought) {
            const planParts = toolCallsList.map((tc) => {
              try {
                const parsed = JSON.parse(tc.function.arguments)
                if (parsed.command) return `Mengeksekusi perintah terminal "${parsed.command}" untuk memverifikasi kondisi sistem.`
                if (parsed.filePath) return `Membaca berkas "${parsed.filePath}" untuk menginspeksi kode sumber.`
                if (parsed.dirPath) return `Memindai direktori "${parsed.dirPath}".`
              } catch {
                // fallback
              }
              return `Menjalankan aksi "${tc.function.name}".`
            })

            const synthesizedThought = `Menganalisis instruksi pengguna.\nRencana: ${planParts.join(' ')}\n`
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('agent:thought-token', {
                requestId,
                deltaThought: synthesizedThought
              })
            }
          }

          // Record assistant message with tool calls in history
          conversationMessages.push({
            role: 'assistant',
            content: turnContent || null,
            tool_calls: toolCallsList
          })

          // Execute each tool sequentially
          for (const tc of toolCallsList) {
            let parsedArgs: Record<string, any> = {}
            try {
              parsedArgs = JSON.parse(tc.function.arguments)
            } catch {
              parsedArgs = { raw: tc.function.arguments }
            }

            // Emit tool start to UI
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('agent:tool-start', {
                requestId,
                toolCallId: tc.id,
                toolName: tc.function.name,
                args: parsedArgs
              })
            }

            const isCommandTool = tc.function.name === 'execute_command'
            const shouldAskApproval = autoExecution === 'ask_before' && isCommandTool
            const isBlocked = autoExecution === 'never' && isCommandTool

            let executionResult: ToolExecutionResult

            if (isBlocked) {
              executionResult = {
                toolCallId: tc.id,
                toolName: tc.function.name,
                status: 'error',
                output: 'Eksekusi dibatalkan: Auto Execution policy disetel ke "Never Execute".',
                durationMs: 0
              }
            } else if (shouldAskApproval) {
              // Emit approval request to UI
              if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('agent:tool-require-approval', {
                  requestId,
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  args: parsedArgs
                })
              }

              // Wait for user to approve or reject
              const approved = await new Promise<boolean>((resolve) => {
                this.pendingApprovals.set(tc.id, resolve)
              })
              this.pendingApprovals.delete(tc.id)

              if (!approved) {
                executionResult = {
                  toolCallId: tc.id,
                  toolName: tc.function.name,
                  status: 'error',
                  output: 'Eksekusi dibatalkan oleh pengguna (Perintah tidak diizinkan dijalankan).',
                  durationMs: 0
                }
              } else {
                executionResult = await toolExecutor.execute(
                  tc.id,
                  tc.function.name,
                  parsedArgs
                )
              }
            } else {
              // Execute directly in Node.js
              executionResult = await toolExecutor.execute(
                tc.id,
                tc.function.name,
                parsedArgs
              )
            }

            // Emit tool finish with results to UI
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('agent:tool-finish', {
                requestId,
                toolCallId: tc.id,
                toolName: tc.function.name,
                status: executionResult.status,
                output: executionResult.output,
                durationMs: executionResult.durationMs
              })
            }

            // Emit file modified notification for UI drawer & review badge
            if (tc.function.name === 'write_file' && executionResult.status === 'success') {
              try {
                const parsedOutput = JSON.parse(executionResult.output)
                if (parsedOutput && parsedOutput.filePath) {
                  const fileName = parsedOutput.filePath.split(/[\\/]/).pop() || parsedOutput.filePath
                  if (targetWindow && !targetWindow.isDestroyed()) {
                    targetWindow.webContents.send('agent:file-modified', {
                      filePath: parsedOutput.fullPath || parsedOutput.filePath,
                      fileName,
                      additions: parsedOutput.additions ?? 1,
                      deletions: parsedOutput.deletions ?? 0,
                      originalContent: parsedOutput.originalContent,
                      newContent: parsedOutput.newContent
                    })
                  }
                }
              } catch {
                // Non-JSON output, skip
              }
            }

            // Append tool response to conversation messages for next turn
            conversationMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: executionResult.output
            })
          }

          // Continue to next turn to let LLM analyze tool outputs
          continue
        }

        // If no tools called, model reached its final answer
        break
      }

      // Stream fully finished
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('agent:stream-done', {
          requestId,
          fullContent: accumulatedFinalText
        })
      }
    } catch (streamError: any) {
      if (streamError.name === 'AbortError') {
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('agent:stream-done', {
            requestId,
            isAborted: true
          })
        }
      } else {
        console.error(`[AiAgentService] Error in stream ${requestId}:`, streamError)
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('agent:stream-error', {
            requestId,
            errorMessage: streamError?.message || 'Gagal berkomunikasi dengan AI'
          })
        }
      }
    } finally {
      this.activeAbortControllers.delete(requestId)
    }
  }
}
