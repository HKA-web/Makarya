import type { BrowserWindow } from 'electron'
import type { ModelMessage } from 'ai'
import { z } from 'zod'
import { AgentToolExecutor, type ToolExecutionResult } from './agentTools'
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

export interface CustomToolDefinition {
  name: string
  description: string
  parameters?: any
  pluginId?: string
}

export interface StreamChatRequest {
  requestId: string
  model?: string
  messages: ChatMessagePayload[]
  projectRoot?: string
  autoExecution?: 'always_proceed' | 'ask_before' | 'never'
  reviewPolicy?: 'request_review' | 'auto_apply' | 'always_ask'
  customTools?: CustomToolDefinition[]
}

export interface AiServiceConfiguration {
  baseUrl: string
  apiKey: string
  defaultModel: string
}

// Dynamic ESM loader helper for Electron CommonJS main process
const importEsm = new Function('specifier', 'return import(specifier)') as <T = any>(
  specifier: string
) => Promise<T>

let aiSdkModules: {
  createOpenAI: typeof import('@ai-sdk/openai').createOpenAI
  streamText: typeof import('ai').streamText
  tool: typeof import('ai').tool
  isStepCount: typeof import('ai').isStepCount
} | null = null

async function getAiSdk() {
  if (!aiSdkModules) {
    const [openaiMod, aiMod] = await Promise.all([
      importEsm<typeof import('@ai-sdk/openai')>('@ai-sdk/openai'),
      importEsm<typeof import('ai')>('ai')
    ])
    aiSdkModules = {
      createOpenAI: openaiMod.createOpenAI,
      streamText: aiMod.streamText,
      tool: aiMod.tool,
      isStepCount: aiMod.isStepCount
    }
  }
  return aiSdkModules
}

const defaultConfiguration: AiServiceConfiguration = {
  baseUrl: process.env.AI_BASE_URL || '',
  apiKey: process.env.AI_API_KEY || '',
  defaultModel: ''
}

const AGENT_SYSTEM_PROMPT =
  'Anda adalah Makarya AI Agent — agen pemrograman otonom tingkat lanjut yang terintegrasi di dalam Makarya IDE (setara kemampuan Zed AI, Cursor, dan Antigravity Agent).\n\n' +
  'KEMAMPUAN OTONOM:\n' +
  '1. Anda memiliki izin eksekusi penuh ke sistem operasi dan database melalui tool:\n' +
  '   - `execute_command`: Menjalankan perintah terminal/shell di folder project pengguna (misal: php -l, npm test, git status, git diff, composer, pytest, tsc, dsb).\n' +
  '   - `read_file`: Membaca kode sumber atau file konfigurasi dari disk.\n' +
  '   - `write_file`: Menulis, memodifikasi, atau membuat berkas baru untuk memperbaiki bug.\n' +
  '   - `list_dir`: Memeriksa struktur berkas dan folder project.\n' +
  '   - Tool Database Terintegrasi:\n' +
  '     * `db_execute_query`: Mengeksekusi query SQL (SELECT, dsb) langsung ke database aktif.\n' +
  '     * `db_inspect_schema`: Memeriksa tabel dan skema kolom nyata di database aktif.\n' +
  '     * `db_check_connection_status`: Memeriksa status dan detail profil database yang terhubung.\n\n' +
  'PROTOKOL RENCANA IMPLEMENTASI (IMPLEMENTATION PLAN):\n' +
  '- Jika pengguna menggunakan perintah `/plan <topik>` atau meminta dibuatkan rencana implementasi / arsitektur sebelum coding:\n' +
  '  1. Selalu buatkan dokumen rencana implementasi terstruktur lengkap dan simpan ke folder `.makarya/plans/<nama_rencana>.md` menggunakan tool `write_file`.\n' +
  '  2. Format dokumen rencana implementasi harus mencakup:\n' +
  '     * `# Implementation Plan - <Judul Rencana>`\n' +
  '     * `### Ringkasan & Tujuan`: Penjelasan singkat apa yang akan dibangun atau diperbaiki.\n' +
  '     * `### Berkas yang Dibuat / Dimodifikasi`: Daftar path file yang terlibat (misal: `src/auth.ts`).\n' +
  '     * `### Tahapan Pekerjaan (Tasks Checklist)`: Daftar tahapan terukur menggunakan format checkbox markdown `- [ ] Task 1`, `- [ ] Task 2`, dsb.\n' +
  '     * `### Rencana Verifikasi & Pengujian`: Langkah pengujian (unit test, syntax check, browser test).\n' +
  '  3. Pada output chat, sajikan ringkasan rencana tersebut lengkap dengan checklist `- [ ]` dan sebutkan lokasi file `.makarya/plans/<nama_rencana>.md` agar UI Makarya IDE dapat merender widget interaktif Implementation Plan secara otomatis dengan tombol Proceed (Eksekusi Rencana).\n' +
  '  4. Tunggu persetujuan pengguna sebelum melakukan perubahan kode besar, atau lakukan eksekusi bertahap jika pengguna menginstruksikan atau menekan "Eksekusi Rencana".\n\n' +
  'ATURAN UTAMA DATABASE (PENTING):\n' +
  '- Jika pengguna meminta menjalankan query SQL (seperti "select * from ...", "cek tabel database", query SELECT/DML lainnya), JANGAN PERNAH menjalankan perintah terminal (seperti python script, pip install pg8000/psycopg2, psql, mysql cli)! Selalu langsung panggil tool `db_execute_query` atau `db_inspect_schema`.\n' +
  '- Sebelum menjalankan UPDATE/DELETE, selalu jalankan SELECT terlebih dahulu untuk memverifikasi data.\n' +
  '- Jangan pernah menjalankan DROP TABLE tanpa konfirmasi pengguna.\n' +
  '- Gunakan indexing jika query menyaring lebih dari 10.000 baris.\n' +
  '- Makarya IDE sudah memiliki driver native terintegrasi (PostgreSQL, MySQL, SQL Server, SQLite) yang langsung mengeksekusi kueri ke server database secara instan dan aman.\n\n' +
  'PANDUAN EKSEKUSI & EFISIENSI:\n' +
  '- Sebelum memanggil tool atau menjawab, tuliskan proses berpikir / rencana tindakan Anda di dalam tag <thought>...</thought>.\n' +
  '- Jangan membaca/mendaftar seluruh file secara berlebihan jika tidak diperlukan. Fokus langsung ke file target yang relevan dengan instruksi pengguna.\n' +
  '- Jika pengguna meminta untuk memeriksa, menguji (test), memperbaiki (debug), atau menjalankan perintah/kueri database, LANGSUNG panggil tool yang relevan!\n' +
  '- Jika hasil tool error atau ada kegagalan sintaks/test, analisis pesan error, perbaiki masalahnya, dan uji kembali.\n' +
  '- PENTING: Setelah semua tindakan tool selesai, SELALU berikan kesimpulan akhir, penjelasan perubahan yang telah dilakukan, atau solusi kepada pengguna secara jelas dan rapi dalam format Markdown Bahasa Indonesia.'

function buildZodSchemaFromJsonSchema(schema: any): z.ZodTypeAny {
  if (!schema || typeof schema !== 'object') {
    return z.record(z.any()).or(z.object({}))
  }

  if (schema.type === 'object' && schema.properties) {
    const shape: Record<string, z.ZodTypeAny> = {}
    const required = Array.isArray(schema.required) ? schema.required : []

    for (const [key, prop] of Object.entries<any>(schema.properties)) {
      let fieldSchema: z.ZodTypeAny
      const pType = (prop?.type || 'string').toLowerCase()

      if (pType === 'string') {
        fieldSchema = z.string()
      } else if (pType === 'number' || pType === 'integer') {
        fieldSchema = z.number()
      } else if (pType === 'boolean') {
        fieldSchema = z.boolean()
      } else if (pType === 'array') {
        fieldSchema = z.array(z.any())
      } else {
        fieldSchema = z.any()
      }

      if (prop?.description) {
        fieldSchema = fieldSchema.describe(prop.description)
      }

      if (!required.includes(key)) {
        fieldSchema = fieldSchema.optional()
      }

      shape[key] = fieldSchema
    }

    return z.object(shape).passthrough()
  }

  return z.record(z.any()).or(z.object({}))
}

export class VercelAiAgentService {
  private activeAbortControllers: Map<string, AbortController> = new Map()
  private pendingApprovals: Map<string, (approved: boolean) => void> = new Map()
  private pendingCustomToolExecutions: Map<string, (result: any) => void> = new Map()
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

  public respondCustomTool(toolCallId: string, result: any): boolean {
    const resolver = this.pendingCustomToolExecutions.get(toolCallId)
    if (resolver) {
      resolver(result)
      this.pendingCustomToolExecutions.delete(toolCallId)
      return true
    }
    return false
  }

  public abortStream(requestId: string): boolean {
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
    try {
      const baseUrl = this.configuration.baseUrl || 'http://127.0.0.1:20128/v1'
      const cleanBase = baseUrl.replace(/\/+$/, '')

      const headers: Record<string, string> = {}
      if (this.configuration.apiKey) {
        headers['Authorization'] = `Bearer ${this.configuration.apiKey}`
      }

      const response = await fetch(`${cleanBase}/models`, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`)
      }

      const data = await response.json()
      if (Array.isArray(data?.data)) {
        return data.data
          .map((item: any) => item.id || item.name)
          .filter((id: string) => Boolean(id) && !id.includes('embedding'))
      }

      return []
    } catch (error) {
      console.warn('[VercelAiAgentService] Gagal mengambil model dari AI gateway:', error)
      return []
    }
  }

  public async streamChat(
    request: StreamChatRequest,
    targetWindow: BrowserWindow | null
  ): Promise<void> {
    const {
      requestId,
      model,
      messages,
      projectRoot,
      autoExecution = 'always_proceed',
      reviewPolicy = 'request_review'
    } = request

    const abortController = new AbortController()
    this.activeAbortControllers.set(requestId, abortController)

    const toolExecutor = new AgentToolExecutor(projectRoot)

    try {
      const { createOpenAI, streamText, tool, isStepCount } = await getAiSdk()

      const baseUrl = this.configuration.baseUrl || 'http://127.0.0.1:20128/v1'
      const cleanBase = baseUrl.replace(/\/+$/, '')

      const selectedModel =
        model ||
        this.configuration.defaultModel ||
        'ag/gemini-3.6-flash-medium'

      // Instansiasi OpenAI provider Vercel AI SDK dengan endpoint konfigurasi
      const openaiProvider = createOpenAI({
        baseURL: cleanBase,
        apiKey: this.configuration.apiKey || 'dummy-key'
      })

      const aiModel = openaiProvider.chat(selectedModel)

      // Transform pesan dari format Makarya ke Vercel AI SDK ModelMessage
      const formattedMessages: ModelMessage[] = []

      for (const msg of messages) {
        if (msg.role === 'system') {
          continue // System prompt dipisah ke parameter system
        }

        if (msg.role === 'user') {
          if (typeof msg.content === 'string') {
            formattedMessages.push({
              role: 'user',
              content: msg.content
            })
          } else if (Array.isArray(msg.content)) {
            const parts: any[] = []
            for (const part of msg.content) {
              if (part.type === 'text') {
                parts.push({ type: 'text', text: part.text })
              } else if (part.type === 'image_url') {
                parts.push({ type: 'image', image: part.image_url.url })
              }
            }
            formattedMessages.push({
              role: 'user',
              content: parts
            })
          }
        } else if (msg.role === 'assistant') {
          if (typeof msg.content === 'string' && msg.content.trim()) {
            formattedMessages.push({
              role: 'assistant',
              content: msg.content
            })
          }
        }
      }

      // Pastikan ada setidaknya satu pesan user
      if (formattedMessages.length === 0) {
        formattedMessages.push({
          role: 'user',
          content: 'Halo, mohon bantu saya.'
        })
      }

      // Definisi tools berbasis Zod type-safe (Vercel AI SDK)
      const agentTools = {
        execute_command: tool({
          description:
            'Menjalankan perintah shell/CLI di terminal pada direktori root project pengguna. Gunakan untuk test, build, git, dsb.',
          inputSchema: z.object({
            command: z.string().describe('Perintah shell yang ingin dijalankan')
          }),
          execute: async ({ command }: { command: string }, { toolCallId }: { toolCallId: string }) => {
            const isCommandTool = true
            const shouldAskApproval = autoExecution === 'ask_before' && isCommandTool
            const isBlocked = autoExecution === 'never' && isCommandTool

            if (isBlocked) {
              const res: ToolExecutionResult = {
                toolCallId,
                toolName: 'execute_command',
                status: 'error',
                output: 'Eksekusi dibatalkan: Auto Execution policy disetel ke "Never Execute".',
                durationMs: 0
              }
              return res
            }

            if (shouldAskApproval) {
              if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('agent:tool-require-approval', {
                  requestId,
                  toolCallId,
                  toolName: 'execute_command',
                  args: { command }
                })
              }

              const approved = await new Promise<boolean>((resolve) => {
                this.pendingApprovals.set(toolCallId, resolve)
              })
              this.pendingApprovals.delete(toolCallId)

              if (!approved) {
                const res: ToolExecutionResult = {
                  toolCallId,
                  toolName: 'execute_command',
                  status: 'error',
                  output: 'Eksekusi dibatalkan oleh pengguna (Perintah tidak diizinkan dijalankan).',
                  durationMs: 0
                }
                return res
              }
            }

            return await toolExecutor.execute(toolCallId, 'execute_command', { command })
          }
        }),

        read_file: tool({
          description:
            'Membaca isi berkas dari disk. Dapat membaca seluruh isi atau range baris tertentu.',
          inputSchema: z.object({
            filePath: z.string().describe('Path relatif atau absolut ke berkas yang ingin dibaca'),
            startLine: z.number().optional().describe('Nomor baris awal (1-indexed, opsional)'),
            endLine: z.number().optional().describe('Nomor baris akhir (1-indexed, opsional)')
          }),
          execute: async (
            args: { filePath: string; startLine?: number; endLine?: number },
            { toolCallId }: { toolCallId: string }
          ) => {
            return await toolExecutor.execute(toolCallId, 'read_file', args)
          }
        }),

        write_file: tool({
          description:
            'Menulis atau memperbarui isi berkas pada disk untuk memperbaiki bug atau membuat file baru.',
          inputSchema: z.object({
            filePath: z.string().describe('Path relatif atau absolut ke berkas'),
            content: z.string().describe('Isi konten lengkap yang akan ditulis')
          }),
          execute: async (
            args: { filePath: string; content: string },
            { toolCallId }: { toolCallId: string }
          ) => {
            const shouldAskFileApproval = reviewPolicy === 'always_ask'

            if (shouldAskFileApproval) {
              if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('agent:tool-require-approval', {
                  requestId,
                  toolCallId,
                  toolName: 'write_file',
                  args: { filePath: args.filePath, content: args.content }
                })
              }

              const approved = await new Promise<boolean>((resolve) => {
                this.pendingApprovals.set(toolCallId, resolve)
              })
              this.pendingApprovals.delete(toolCallId)

              if (!approved) {
                const res: ToolExecutionResult = {
                  toolCallId,
                  toolName: 'write_file',
                  status: 'error',
                  output: `Penulisan berkas "${args.filePath}" dibatalkan oleh pengguna (tidak disetujui).`,
                  durationMs: 0
                }
                return res
              }
            }

            return await toolExecutor.execute(toolCallId, 'write_file', args)
          }
        }),

        list_dir: tool({
          description: 'Memindai dan mendaftar berkas serta folder di dalam suatu direktori.',
          inputSchema: z.object({
            dirPath: z.string().optional().describe('Path relatif atau absolut ke direktori')
          }),
          execute: async (
            args: { dirPath?: string },
            { toolCallId }: { toolCallId: string }
          ) => {
            return await toolExecutor.execute(toolCallId, 'list_dir', args)
          }
        })
      }

      // Integrasi Custom Dynamic Tools dari Plugin SDK (misal: Database Assistant, dsb)
      if (request.customTools && Array.isArray(request.customTools)) {
        for (const customTool of request.customTools) {
          const dynamicInputSchema = buildZodSchemaFromJsonSchema(customTool.parameters)
          ;(agentTools as Record<string, any>)[customTool.name] = tool({
            description: customTool.description || `Plugin tool: ${customTool.name}`,
            inputSchema: dynamicInputSchema,
            execute: async (args: any, { toolCallId }: { toolCallId: string }) => {
              if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('agent:execute-custom-tool', {
                  requestId,
                  toolCallId,
                  toolName: customTool.name,
                  args: args || {}
                })
              }

              const customResult = await new Promise<any>((resolve) => {
                this.pendingCustomToolExecutions.set(toolCallId, resolve)
              })
              this.pendingCustomToolExecutions.delete(toolCallId)

              return {
                toolCallId,
                toolName: customTool.name,
                status: customResult?.status === 'error' ? 'error' : 'success',
                output:
                  typeof customResult === 'string'
                    ? customResult
                    : JSON.stringify(customResult ?? {}, null, 2),
                durationMs: 0
              }
            }
          })
        }
      }

      // Stream text dengan Vercel AI SDK
      const streamResult = streamText({
        model: aiModel,
        system: AGENT_SYSTEM_PROMPT,
        messages: formattedMessages,
        tools: agentTools,
        stopWhen: isStepCount(25),
        abortSignal: abortController.signal
      })

      let fullContent = ''
      let insideThoughtTag = false

      for await (const chunk of streamResult.fullStream) {
        if (abortController.signal.aborted) break

        if (chunk.type === 'text-delta') {
          const text = chunk.text

          if (text.includes('<thought>')) {
            insideThoughtTag = true
          }

          if (insideThoughtTag) {
            if (text.includes('</thought>')) {
              insideThoughtTag = false
              const parts = text.split('</thought>')
              if (parts[0] && targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('agent:thought-token', {
                  requestId,
                  deltaThought: parts[0].replace('<thought>', '')
                })
              }
              if (parts[1]) {
                fullContent += parts[1]
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
                  deltaThought: text.replace('<thought>', '')
                })
              }
            }
          } else {
            fullContent += text
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('agent:stream-token', {
                requestId,
                deltaContent: text
              })
            }
          }
        } else if (chunk.type === 'reasoning-delta') {
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('agent:thought-token', {
              requestId,
              deltaThought: chunk.text
            })
          }
        } else if (chunk.type === 'tool-call') {
          const anyChunk = chunk as any
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('agent:tool-start', {
              requestId,
              toolCallId: anyChunk.toolCallId,
              toolName: anyChunk.toolName,
              args: anyChunk.input ?? anyChunk.args ?? {}
            })
          }
        } else if (chunk.type === 'tool-result') {
          const anyChunk = chunk as any
          const res = (anyChunk.output ?? anyChunk.result) as ToolExecutionResult

          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('agent:tool-finish', {
              requestId,
              toolCallId: anyChunk.toolCallId,
              toolName: anyChunk.toolName,
              status: res?.status || 'success',
              output: typeof res?.output === 'string' ? res.output : JSON.stringify(res?.output ?? ''),
              durationMs: res?.durationMs || 0
            })
          }

          if (anyChunk.toolName === 'write_file' && res?.status === 'success') {
            try {
              const parsedOutput = JSON.parse(res.output)
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
        }
      }

      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('agent:stream-done', {
          requestId,
          fullContent
        })
      }
    } catch (streamError: any) {
      if (streamError.name === 'AbortError' || abortController.signal.aborted) {
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('agent:stream-done', {
            requestId,
            isAborted: true
          })
        }
      } else {
        console.error(`[VercelAiAgentService] Error in stream ${requestId}:`, streamError)
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
