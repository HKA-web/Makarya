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
  'PANDUAN EKSEKUSI & EFISIENSI (AKSI LANGSUNG):\n' +
  '- PROAKTIF & LANGSUNG EKSEKUSI: Jika pengguna meminta optimasi, perbaikan, atau pembuatan file baru, JANGAN HANYA bertanya atau menawarkan "Apakah Anda ingin saya buatkan...". LANGSUNG buat atau perbarui berkas menggunakan tool `write_file` dan tampilkan kode solusinya kepada pengguna!\n' +
  '- EFISIENSI MEMBACA: Jangan memanggil tool `read_file` atau `list_dir` berkali-kali untuk seluruh file yang tidak relevan. Cukup baca 1 atau 2 file target yang diperlukan, lalu segera lakukan modifikasi dengan `write_file`.\n' +
  '- Sebelum memanggil tool atau menjawab, Anda dapat menuliskan analisis singkat di dalam tag <thought>...</thought>.\n' +
  '- Jika pengguna meminta untuk memeriksa, menguji (test), memperbaiki (debug), atau menjalankan perintah/kueri database, LANGSUNG panggil tool yang relevan!\n' +
  '- Jika hasil tool error atau ada kegagalan sintaks/test, analisis pesan error, perbaiki masalahnya, dan uji kembali.\n' +
  '- ATURAN WAJIB AKHIR (FINAL RESPONSE): Setelah Anda selesai mengeksekusi tool (mencari, membaca, atau menulis perubahan), Anda HARUS SELALU menuliskan penjelasan perubahan yang telah dilakukan, path file yang dimodifikasi, dan ringkasan kode hasil optimalisasi langsung kepada pengguna dalam format Markdown Bahasa Indonesia.'

class StreamingThoughtParser {
  private buffer = ''
  private inThought = false

  public processChunk(text: string): { thoughtDelta: string; contentDelta: string } {
    this.buffer += text
    let thoughtDelta = ''
    let contentDelta = ''

    while (this.buffer.length > 0) {
      if (!this.inThought) {
        const thoughtStartIdx = this.findStartTag(this.buffer)
        if (thoughtStartIdx === -1) {
          const partialLen = this.getPartialStartTagLength(this.buffer)
          if (partialLen > 0) {
            const emitLen = this.buffer.length - partialLen
            if (emitLen > 0) {
              contentDelta += this.buffer.slice(0, emitLen)
              this.buffer = this.buffer.slice(emitLen)
            }
            break
          } else {
            contentDelta += this.buffer
            this.buffer = ''
            break
          }
        } else {
          if (thoughtStartIdx > 0) {
            contentDelta += this.buffer.slice(0, thoughtStartIdx)
          }
          const tagLen = this.getStartTagLengthAt(this.buffer, thoughtStartIdx)
          this.buffer = this.buffer.slice(thoughtStartIdx + tagLen)
          this.inThought = true
        }
      } else {
        const thoughtEndIdx = this.findEndTag(this.buffer)
        if (thoughtEndIdx === -1) {
          const partialLen = this.getPartialEndTagLength(this.buffer)
          if (partialLen > 0) {
            const emitLen = this.buffer.length - partialLen
            if (emitLen > 0) {
              thoughtDelta += this.buffer.slice(0, emitLen)
              this.buffer = this.buffer.slice(emitLen)
            }
            break
          } else {
            thoughtDelta += this.buffer
            this.buffer = ''
            break
          }
        } else {
          if (thoughtEndIdx > 0) {
            thoughtDelta += this.buffer.slice(0, thoughtEndIdx)
          }
          const tagLen = this.getEndTagLengthAt(this.buffer, thoughtEndIdx)
          this.buffer = this.buffer.slice(thoughtEndIdx + tagLen)
          this.inThought = false
        }
      }
    }

    return { thoughtDelta, contentDelta }
  }

  public flush(): { thoughtDelta: string; contentDelta: string } {
    const remaining = this.buffer
    this.buffer = ''
    if (this.inThought) {
      this.inThought = false
      return { thoughtDelta: remaining, contentDelta: '' }
    } else {
      return { thoughtDelta: '', contentDelta: remaining }
    }
  }

  private findStartTag(str: string): number {
    const t1 = str.indexOf('<thought>')
    const t2 = str.indexOf('<think>')
    if (t1 !== -1 && t2 !== -1) return Math.min(t1, t2)
    if (t1 !== -1) return t1
    return t2
  }

  private getStartTagLengthAt(str: string, idx: number): number {
    if (str.startsWith('<thought>', idx)) return 9
    if (str.startsWith('<think>', idx)) return 7
    return 0
  }

  private findEndTag(str: string): number {
    const t1 = str.indexOf('</thought>')
    const t2 = str.indexOf('</think>')
    if (t1 !== -1 && t2 !== -1) return Math.min(t1, t2)
    if (t1 !== -1) return t1
    return t2
  }

  private getEndTagLengthAt(str: string, idx: number): number {
    if (str.startsWith('</thought>', idx)) return 10
    if (str.startsWith('</think>', idx)) return 8
    return 0
  }

  private getPartialStartTagLength(str: string): number {
    const candidates = ['<thought>', '<think>']
    for (const tag of candidates) {
      for (let i = tag.length - 1; i > 0; i--) {
        if (str.endsWith(tag.slice(0, i))) return i
      }
    }
    return 0
  }

  private getPartialEndTagLength(str: string): number {
    const candidates = ['</thought>', '</think>']
    for (const tag of candidates) {
      for (let i = tag.length - 1; i > 0; i--) {
        if (str.endsWith(tag.slice(0, i))) return i
      }
    }
    return 0
  }
}

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
    let resolvedAny = false
    const resolver = this.pendingCustomToolExecutions.get(toolCallId)
    if (resolver) {
      resolver(result)
      this.pendingCustomToolExecutions.delete(toolCallId)
      resolvedAny = true
    }

    // Resolve any remaining pending custom tools (e.g. duplicate parallel questions) so the LLM stream never hangs
    for (const [id, pendingResolver] of Array.from(this.pendingCustomToolExecutions.entries())) {
      try {
        pendingResolver(result)
      } catch (e) {
        console.warn('Error resolving secondary custom tool promise:', e)
      }
      this.pendingCustomToolExecutions.delete(id)
      resolvedAny = true
    }

    return resolvedAny
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

      let selectedModel = model || this.configuration.defaultModel || 'Antigravity'

      // Direct clean mapping for OpenCode models to 9Router provider endpoints
      if (
        selectedModel === 'router/Antigravity' ||
        selectedModel === 'Antigravity router' ||
        selectedModel === 'Antigravity'
      ) {
        selectedModel = 'Antigravity'
      } else if (selectedModel === 'OpenCode') {
        selectedModel = 'OpenCode'
      } else if (selectedModel.startsWith('opencode/')) {
        selectedModel = selectedModel.replace(/^opencode\//, '')
      }

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
        }),

        ask_question: tool({
          description:
            'Gunakan tool ini untuk mengajukan pertanyaan interaktif berupa pilihan ganda (multiple choice) kepada pengguna saat Anda memerlukan klarifikasi, konfirmasi rencana pembuatan, preferensi teknologi/arsitektur, atau pemilihan opsi. Tool ini akan menampilkan kartu opsi pilihan interaktif di chat pengguna dan menunggu pengguna memilih atau menuliskan jawabannya.',
          inputSchema: z.object({
            question: z.string().describe('Pertanyaan klarifikasi yang diajukan ke pengguna'),
            options: z.array(z.string()).describe('Daftar opsi pilihan (minimal 2 opsi) yang dapat dipilih oleh pengguna'),
            is_multi_select: z.boolean().optional().describe('Set true jika pengguna boleh memilih lebih dari 1 opsi')
          }),
          execute: async (
            args: { question: string; options: string[]; is_multi_select?: boolean },
            { toolCallId }: { toolCallId: string }
          ) => {
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('agent:ask-question', {
                requestId,
                toolCallId,
                question: args.question,
                options: args.options,
                is_multi_select: args.is_multi_select || false
              })
            }

            const answer = await new Promise<any>((resolve) => {
              this.pendingCustomToolExecutions.set(toolCallId, resolve)
            })
            this.pendingCustomToolExecutions.delete(toolCallId)

            const formatted = Array.isArray(answer) ? answer.join(', ') : String(answer || '')
            return {
              toolCallId,
              toolName: 'ask_question',
              status: 'success',
              output: `Pengguna telah memilih jawaban: "${formatted}"`,
              durationMs: 0
            }
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
        stopWhen: isStepCount(40),
        abortSignal: abortController.signal
      })

      let fullContent = ''
      let executedToolsCount = 0
      const thoughtParser = new StreamingThoughtParser()

      for await (const chunk of streamResult.fullStream) {
        if (abortController.signal.aborted) break

        if (chunk.type === 'text-delta') {
          const { thoughtDelta, contentDelta } = thoughtParser.processChunk(chunk.text)

          if (thoughtDelta && targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.webContents.send('agent:thought-token', {
              requestId,
              deltaThought: thoughtDelta
            })
          }

          if (contentDelta) {
            fullContent += contentDelta
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.webContents.send('agent:stream-token', {
                requestId,
                deltaContent: contentDelta
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
          executedToolsCount++
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

      // Flush remaining buffered text from thoughtParser
      const { thoughtDelta: remainingThought, contentDelta: remainingContent } = thoughtParser.flush()
      if (remainingThought && targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('agent:thought-token', {
          requestId,
          deltaThought: remainingThought
        })
      }
      if (remainingContent) {
        fullContent += remainingContent
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('agent:stream-token', {
            requestId,
            deltaContent: remainingContent
          })
        }
      }

      // If model executed tools but produced no final text, send a completion note so message isn't blank
      if (!fullContent.trim() && executedToolsCount > 0 && !abortController.signal.aborted) {
        const fallbackNote = '✅ *Semua tindakan dan analisis tool telah selesai dijalankan. Silakan periksa detail eksekusi tool di atas.*'
        fullContent = fallbackNote
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('agent:stream-token', {
            requestId,
            deltaContent: fallbackNote
          })
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
