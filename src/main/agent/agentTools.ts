import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises'
import { join, isAbsolute, resolve, dirname } from 'node:path'
import { existsSync } from 'node:fs'

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export interface ToolExecutionResult {
  toolCallId: string
  toolName: string
  status: 'success' | 'error'
  output: string
  durationMs: number
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description:
        'Menjalankan perintah shell/CLI di terminal pada direktori root project pengguna. Gunakan tool ini untuk menjalankan test (misal: php -l, npm test, pytest), build, git command, instalasi dependensi, atau pengecekan sistem.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Perintah shell yang ingin dijalankan (contoh: "php -l path/to/file.php", "git status", "npm test")'
          }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Membaca isi berkas dari disk. Dapat membaca seluruh isi atau range baris tertentu untuk menganalisis kode atau mencari bug.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path relatif atau absolut ke berkas yang ingin dibaca'
          },
          startLine: {
            type: 'number',
            description: 'Nomor baris awal (1-indexed, opsional)'
          },
          endLine: {
            type: 'number',
            description: 'Nomor baris akhir (1-indexed, opsional)'
          }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Menulis atau memperbarui isi berkas pada disk. Gunakan tool ini untuk memperbaiki bug, menerapkan refactoring, atau membuat file baru.',
      parameters: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Path relatif atau absolut ke berkas yang ingin ditulis'
          },
          content: {
            type: 'string',
            description: 'Isi konten lengkap yang akan dituliskan ke berkas'
          }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description:
        'Memindai dan mendaftar berkas serta folder di dalam suatu direktori untuk mengeksplorasi struktur project.',
      parameters: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: 'Path relatif atau absolut ke direktori yang ingin diperiksa (default: root project)'
          }
        }
      }
    }
  }
]

export class AgentToolExecutor {
  private projectRoot: string

  constructor(projectRoot?: string) {
    if (projectRoot) {
      const normalized = resolve(projectRoot)
      this.projectRoot = existsSync(normalized) ? normalized : process.cwd()
    } else {
      this.projectRoot = process.cwd()
    }
  }

  public getProjectRoot(): string {
    return this.projectRoot
  }

  public setProjectRoot(newRoot: string): void {
    if (newRoot) {
      const normalized = resolve(newRoot)
      if (existsSync(normalized)) {
        this.projectRoot = normalized
      }
    }
  }

  private resolvePath(targetPath: string): string {
    if (isAbsolute(targetPath)) {
      return targetPath
    }
    return resolve(this.projectRoot, targetPath)
  }

  public async execute(
    toolCallId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      let output = ''

      switch (toolName) {
        case 'execute_command': {
          output = await this.executeCommand(args.command)
          break
        }
        case 'read_file': {
          output = await this.readFile(args.filePath, args.startLine, args.endLine)
          break
        }
        case 'write_file': {
          output = await this.writeFile(args.filePath, args.content)
          break
        }
        case 'list_dir': {
          output = await this.listDir(args.dirPath)
          break
        }
        default: {
          throw new Error(`Tool "${toolName}" tidak dikenal atau belum diimplementasikan.`)
        }
      }

      return {
        toolCallId,
        toolName,
        status: 'success',
        output,
        durationMs: Date.now() - startTime
      }
    } catch (executionError: any) {
      return {
        toolCallId,
        toolName,
        status: 'error',
        output: executionError?.message || 'Terjadi kesalahan saat mengeksekusi tool.',
        durationMs: Date.now() - startTime
      }
    }
  }

  private executeCommand(commandString: string): Promise<string> {
    return new Promise((resolvePrompt) => {
      if (!commandString || typeof commandString !== 'string') {
        resolvePrompt('Error: Command tidak boleh kosong.')
        return
      }

      let stdoutAccumulator = ''
      let stderrAccumulator = ''

      const child = spawn(commandString, {
        shell: true,
        cwd: this.projectRoot,
        timeout: 45000 // 45s safety timeout
      })

      child.stdout.on('data', (chunk) => {
        stdoutAccumulator += chunk.toString()
      })

      child.stderr.on('data', (chunk) => {
        stderrAccumulator += chunk.toString()
      })

      child.on('close', (code) => {
        const exitCode = code ?? 0
        let formattedResult = `[Direktori Kerja: ${this.projectRoot}]\n`
        formattedResult += `[Exit Code: ${exitCode}]\n`
        if (stdoutAccumulator) {
          formattedResult += `--- STDOUT ---\n${stdoutAccumulator.trim()}\n`
        }
        if (stderrAccumulator) {
          formattedResult += `--- STDERR ---\n${stderrAccumulator.trim()}\n`
        }
        if (!stdoutAccumulator && !stderrAccumulator) {
          formattedResult += `(Perintah selesai tanpa output teks)`
        }
        resolvePrompt(formattedResult)
      })

      child.on('error', (err) => {
        resolvePrompt(`[Gagal menjalankan proses: ${err.message}]`)
      })
    })
  }

  private async readFile(
    filePath: string,
    startLine?: number,
    endLine?: number
  ): Promise<string> {
    const fullPath = this.resolvePath(filePath)
    if (!existsSync(fullPath)) {
      throw new Error(`Berkas tidak ditemukan: ${filePath}`)
    }

    const rawContent = await readFile(fullPath, 'utf-8')

    if (startLine !== undefined || endLine !== undefined) {
      const lines = rawContent.split('\n')
      const start = Math.max(1, startLine || 1)
      const end = Math.min(lines.length, endLine || lines.length)
      const slicedLines = lines.slice(start - 1, end)

      return `[Membaca ${filePath} (baris ${start}-${end})]:\n` + slicedLines.join('\n')
    }

    return `[Isi Berkas ${filePath}]:\n${rawContent}`
  }

  private async writeFile(
    filePath: string,
    content: string
  ): Promise<string> {
    const fullPath = this.resolvePath(filePath)
    let previousContent = ''
    try {
      if (existsSync(fullPath)) {
        previousContent = await readFile(fullPath, 'utf-8')
      }
    } catch {
      // New file creation
    }

    const parentDir = dirname(fullPath)
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true })
    }

    await writeFile(fullPath, content, 'utf-8')

    const prevLines = previousContent ? previousContent.split('\n').length : 0
    const newLines = content ? content.split('\n').length : 0
    const additions = Math.max(1, newLines >= prevLines ? newLines - prevLines : 1)
    const deletions = Math.max(0, prevLines - newLines)

    return JSON.stringify({
      status: 'written',
      filePath,
      fullPath,
      additions,
      deletions,
      originalContent: previousContent,
      newContent: content,
      message: `Berhasil menulis dan menyimpan berkas: ${filePath} (${content.length} karakter)`
    })
  }

  private async listDir(dirPath?: string): Promise<string> {
    const targetDir = dirPath ? this.resolvePath(dirPath) : this.projectRoot
    if (!existsSync(targetDir)) {
      throw new Error(`Direktori tidak ditemukan: ${dirPath || targetDir}`)
    }

    const entries = await readdir(targetDir)
    const summary: string[] = []

    for (const entry of entries) {
      if (entry === '.git' || entry === 'node_modules') continue
      try {
        const itemStat = await stat(join(targetDir, entry))
        summary.push(itemStat.isDirectory() ? `📁 ${entry}/` : `📄 ${entry}`)
      } catch {
        summary.push(`❓ ${entry}`)
      }
    }

    return `[Daftar isi ${targetDir} (${summary.length} item)]:\n` + summary.join('\n')
  }
}
