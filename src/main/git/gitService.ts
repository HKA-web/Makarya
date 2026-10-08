import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { VercelAiAgentService } from '../agent/vercelAiService'

const execAsync = promisify(exec)

export interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' | 'copied' | 'typechange'
  statusCode: string
  oldPath?: string
  isStaged: boolean
}

export interface GitRepoStatus {
  isGitRepo: boolean
  branch: string
  ahead: number
  behind: number
  staged: GitFileStatus[]
  unstaged: GitFileStatus[]
  untracked: GitFileStatus[]
  totalChanges: number
}

export class GitService {
  private aiAgentService: VercelAiAgentService

  constructor(aiAgentService: VercelAiAgentService) {
    this.aiAgentService = aiAgentService
  }

  /**
   * Run git command inside the target directory
   */
  private async runGit(projectPath: string, args: string): Promise<string> {
    if (!projectPath || !existsSync(projectPath)) {
      throw new Error(`Directory tidak valid: ${projectPath}`)
    }
    const { stdout } = await execAsync(`git ${args}`, {
      cwd: projectPath,
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, LANG: 'en_US.UTF-8' }
    })
    return (stdout || '').trim()
  }

  /**
   * Get full Git Status (branch, ahead/behind, staged, unstaged, untracked)
   */
  public async getStatus(projectPath: string): Promise<GitRepoStatus> {
    try {
      // 1. Verify git repository
      const isInsideWorkTree = await this.runGit(projectPath, 'rev-parse --is-inside-work-tree')
      if (isInsideWorkTree !== 'true') {
        return {
          isGitRepo: false,
          branch: '',
          ahead: 0,
          behind: 0,
          staged: [],
          unstaged: [],
          untracked: [],
          totalChanges: 0
        }
      }

      // 2. Get active branch & ahead/behind status
      let branch = 'HEAD'
      let ahead = 0
      let behind = 0

      try {
        const branchOutput = await this.runGit(projectPath, 'status -sb --porcelain=v1')
        const firstLine = branchOutput.split('\n')[0] || ''
        if (firstLine.startsWith('## ')) {
          const header = firstLine.slice(3).trim()
          const branchMatch = header.match(/^([^\s.]+)/)
          if (branchMatch) {
            branch = branchMatch[1]
          }

          const aheadMatch = header.match(/ahead (\d+)/)
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10)

          const behindMatch = header.match(/behind (\d+)/)
          if (behindMatch) behind = parseInt(behindMatch[1], 10)
        }
      } catch {
        try {
          branch = await this.runGit(projectPath, 'branch --show-current')
        } catch {}
      }

      // 3. Get porcelain status
      const porcelain = await this.runGit(projectPath, 'status --porcelain=v1 -uall')
      const staged: GitFileStatus[] = []
      const unstaged: GitFileStatus[] = []
      const untracked: GitFileStatus[] = []

      if (porcelain) {
        const lines = porcelain.split(/\r?\n/)
        for (const line of lines) {
          if (!line || line.length < 3) continue

          const x = line[0] // Index (staged)
          const y = line[1] // Work tree (unstaged)
          const rawPath = line.slice(3).trim().replace(/^"(.*)"$/, '$1')

          let filePath = rawPath
          let oldPath: string | undefined = undefined

          if (rawPath.includes(' -> ')) {
            const parts = rawPath.split(' -> ')
            oldPath = parts[0].trim()
            filePath = parts[1].trim()
          }

          // Untracked (??)
          if (x === '?' && y === '?') {
            untracked.push({
              path: filePath,
              status: 'untracked',
              statusCode: '??',
              isStaged: false
            })
            continue
          }

          // Staged changes (X is not space or ?)
          if (x !== ' ' && x !== '?') {
            let sType: GitFileStatus['status'] = 'modified'
            if (x === 'A') sType = 'added'
            else if (x === 'D') sType = 'deleted'
            else if (x === 'R') sType = 'renamed'
            else if (x === 'C') sType = 'copied'
            else if (x === 'T') sType = 'typechange'

            staged.push({
              path: filePath,
              status: sType,
              statusCode: x,
              oldPath,
              isStaged: true
            })
          }

          // Unstaged changes (Y is not space or ?)
          if (y !== ' ' && y !== '?') {
            let uType: GitFileStatus['status'] = 'modified'
            if (y === 'A') uType = 'added'
            else if (y === 'D') uType = 'deleted'
            else if (y === 'R') uType = 'renamed'
            else if (y === 'T') uType = 'typechange'

            unstaged.push({
              path: filePath,
              status: uType,
              statusCode: y,
              oldPath,
              isStaged: false
            })
          }
        }
      }

      return {
        isGitRepo: true,
        branch: branch || 'main',
        ahead,
        behind,
        staged,
        unstaged,
        untracked,
        totalChanges: staged.length + unstaged.length + untracked.length
      }
    } catch (err) {
      return {
        isGitRepo: false,
        branch: '',
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        totalChanges: 0
      }
    }
  }

  /**
   * Stage a file
   */
  public async stageFile(projectPath: string, filePath: string): Promise<boolean> {
    await this.runGit(projectPath, `add -- "${filePath}"`)
    return true
  }

  /**
   * Stage all files
   */
  public async stageAll(projectPath: string): Promise<boolean> {
    await this.runGit(projectPath, 'add -A')
    return true
  }

  /**
   * Unstage a file
   */
  public async unstageFile(projectPath: string, filePath: string): Promise<boolean> {
    try {
      await this.runGit(projectPath, `restore --staged -- "${filePath}"`)
    } catch {
      await this.runGit(projectPath, `reset HEAD -- "${filePath}"`)
    }
    return true
  }

  /**
   * Unstage all files
   */
  public async unstageAll(projectPath: string): Promise<boolean> {
    try {
      await this.runGit(projectPath, 'restore --staged .')
    } catch {
      await this.runGit(projectPath, 'reset HEAD')
    }
    return true
  }

  /**
   * Discard changes for a single file
   */
  public async discardFile(projectPath: string, filePath: string, isUntracked = false): Promise<boolean> {
    if (isUntracked) {
      const fullPath = join(projectPath, filePath)
      if (existsSync(fullPath)) {
        unlinkSync(fullPath)
      }
      return true
    }

    try {
      await this.runGit(projectPath, `restore -- "${filePath}"`)
    } catch {
      await this.runGit(projectPath, `checkout -- "${filePath}"`)
    }
    return true
  }

  /**
   * Discard all unstaged changes and clean untracked files
   */
  public async discardAll(projectPath: string): Promise<boolean> {
    try {
      await this.runGit(projectPath, 'restore .')
      await this.runGit(projectPath, 'clean -fd')
    } catch {
      await this.runGit(projectPath, 'checkout -- .')
      await this.runGit(projectPath, 'clean -fd')
    }
    return true
  }

  /**
   * Commit staged files with message
   */
  /**
   * Commit staged files with message (supporting multi-line and bullet points)
   */
  public async commit(projectPath: string, message: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const lines = message.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      if (lines.length === 0) {
        return { success: false, error: 'Pesan commit kosong' }
      }

      const mArgs = lines.map((l) => `-m "${l.replace(/"/g, '\\"')}"`).join(' ')
      const stdout = await this.runGit(projectPath, `commit ${mArgs}`)
      const hashMatch = stdout.match(/\[([^\]]+)\s+([a-f0-9]+)\]/)
      return {
        success: true,
        hash: hashMatch ? hashMatch[2] : undefined
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Gagal melakukan commit'
      }
    }
  }

  /**
   * Get original content (from git index/HEAD) and modified content for a file diff
   */
  public async getFileDiff(
    projectPath: string,
    filePath: string,
    staged = false
  ): Promise<{ originalContent: string; newContent: string }> {
    let originalContent = ''
    let newContent = ''
    const gitFilePath = filePath.replace(/\\/g, '/')
    const fullPath = join(projectPath, filePath)

    try {
      if (staged) {
        // Original is HEAD, new is staged index (:filePath)
        try {
          originalContent = await this.runGit(projectPath, `show HEAD:"${gitFilePath}"`)
        } catch {
          originalContent = ''
        }
        try {
          newContent = await this.runGit(projectPath, `show :"${gitFilePath}"`)
        } catch {
          newContent = ''
        }
      } else {
        // Original is staged index or HEAD, new is working tree file
        try {
          originalContent = await this.runGit(projectPath, `show :"${gitFilePath}"`)
        } catch {
          try {
            originalContent = await this.runGit(projectPath, `show HEAD:"${gitFilePath}"`)
          } catch {
            originalContent = ''
          }
        }

        if (existsSync(fullPath)) {
          const fs = await import('fs/promises')
          newContent = await fs.readFile(fullPath, 'utf-8')
        }
      }
    } catch (err) {
      console.warn('[GitService] Error getting file diff:', err)
    }

    return { originalContent, newContent }
  }

  /**
   * Generate AI Commit Message with essential diff distillation and detailed bullet points
   */
  /**
   * Generate AI Commit Message with essential diff distillation and detailed bullet points
   */
  public async generateAiCommitMessage(
    projectPath: string,
    model?: string,
    customConfig?: { baseUrl?: string; apiKey?: string }
  ): Promise<string> {
    try {
      let statOutput = ''
      let diffOutput = ''

      // 1. Get Staged Diff & Stats
      try {
        statOutput = await this.runGit(projectPath, 'diff --cached --stat')
        diffOutput = await this.runGit(projectPath, 'diff --cached')
      } catch {}

      // 2. If no staged changes, fall back to unstaged changes
      if (!diffOutput || diffOutput.trim().length === 0) {
        try {
          statOutput = await this.runGit(projectPath, 'diff --stat')
          diffOutput = await this.runGit(projectPath, 'diff')
        } catch {}
      }

      // 3. If still empty, check short status
      if (!diffOutput || diffOutput.trim().length === 0) {
        const stat = await this.runGit(projectPath, 'status --short')
        if (!stat || stat.trim().length === 0) {
          return 'chore: update project files'
        }
        diffOutput = `Changed files:\n${stat}`
      }

      // 4. Extract ONLY essential changes across all files (prevents 1 big file from crowding out others)
      const essentialDiff = this.extractEssentialDiff(diffOutput, 6000)
      const statHeader = statOutput ? `Summary of changed files:\n${statOutput.trim()}\n\n` : ''

      const prompt = `You are an expert Git commit message generator. Analyze the following summary and essential code changes to generate a clean, creative, and highly descriptive Conventional Commit message with detailed bullet points.

${statHeader}Essential Code Changes:
\`\`\`diff
${essentialDiff}
\`\`\`

Strict Format & Guidelines:
1. Line 1: Standard Conventional Commit subject: <type>(<scope>): <concise descriptive summary in lowercase>
   (Types: feat, fix, refactor, style, docs, chore, perf, test)
2. Line 2: Empty line.
3. Line 3+: Exactly 2 to 4 clear, specific bullet points starting with "- " explaining the exact improvements, bug fixes, path normalizations, or logic updates in Indonesian (or English if codebase is purely in English).
4. Do NOT output markdown code blocks (\`\`\`) or quotes. Output ONLY the raw commit message with bullet points.

Example Output:
feat(payroll): improve ai commit message generator dan normalisasi path

- Normalisasi separator path Windows ke slash standar buat git show
- Tambah ekstraksi diff esensial biar ga boros token LLM
- Implementasi fallback heuristik kalau request AI timeout atau gagal`

      // Execute AI generation via active config / 9Router / direct LLM
      const mainConfig = this.aiAgentService.getConfiguration()
      const baseUrl = (customConfig?.baseUrl || mainConfig.baseUrl || 'http://127.0.0.1:20128/v1').replace(/\/+$/, '')
      const apiKey = customConfig?.apiKey || mainConfig.apiKey || 'sk-antigravity'
      const chosenModel = model || mainConfig.defaultModel || 'Antigravity'

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 12000)

        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: chosenModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 220
          })
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          const data = await response.json()
          const rawMsg = data.choices?.[0]?.message?.content || ''
          const cleanMsg = rawMsg
            .trim()
            .replace(/^```(?:markdown|git)?\n?|```$/gi, '')
            .trim()
          if (cleanMsg && cleanMsg.length > 10) return cleanMsg
        }
      } catch (fetchErr) {
        console.warn('[GitService] LLM commit generation fetch error, using smart semantic fallback:', fetchErr)
      }

      // Smart semantic fallback based on deep file inspection
      return this.generateSmartFallbackCommit(statOutput || diffOutput)
    } catch (err) {
      console.warn('[GitService] Error generating AI commit message:', err)
      return 'chore: update project files'
    }
  }

  /**
   * Distill essential diff chunks across multiple files
   */
  private extractEssentialDiff(rawDiff: string, maxChars = 5000): string {
    if (rawDiff.length <= maxChars) return rawDiff

    const lines = rawDiff.split('\n')
    const result: string[] = []
    let currentFile = ''
    let linesInCurrentHunk = 0
    let currentLength = 0

    for (const line of lines) {
      // New file diff header
      if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ')) {
        currentFile = line
        linesInCurrentHunk = 0
        result.push(line)
        currentLength += line.length + 1
        continue
      }

      // Skip huge binary or lock files
      if (
        currentFile.includes('package-lock.json') ||
        currentFile.includes('yarn.lock') ||
        currentFile.includes('composer.lock') ||
        currentFile.includes('.min.')
      ) {
        continue
      }

      // Hunk header (contains function name / line range)
      if (line.startsWith('@@')) {
        linesInCurrentHunk = 0
        result.push(line)
        currentLength += line.length + 1
        continue
      }

      // Keep only first 8 lines of each diff hunk to leave room for other files
      if (line.startsWith('+') || line.startsWith('-')) {
        if (linesInCurrentHunk < 8) {
          result.push(line)
          currentLength += line.length + 1
          linesInCurrentHunk++
        }
      }

      if (currentLength >= maxChars) {
        result.push('... [diff truncated for brevity]')
        break
      }
    }

    return result.join('\n')
  }

  /**
   * Smart semantic heuristic commit message generator with diverse action verbs
   */
  private generateSmartFallbackCommit(summary: string): string {
    const rawLines = summary.split('\n').map((l) => l.trim()).filter(Boolean)
    if (rawLines.length === 0) return 'chore: update project changes'

    // Extract file paths from git stat (format: "path/to/file.ext | 10 +-") or status ("M path/to/file.ext")
    const filePaths: string[] = []
    for (const line of rawLines) {
      const statMatch = line.match(/^([^|]+?)\s*\|/)
      if (statMatch) {
        filePaths.push(statMatch[1].trim())
        continue
      }
      const statusMatch = line.match(/^[MADRCU?!]+\s+(.+)$/)
      if (statusMatch) {
        filePaths.push(statusMatch[1].trim())
      }
    }

    if (filePaths.length === 0) {
      return 'chore: update project files'
    }

    // Filter out irrelevant build/lock files
    const relevantFiles = filePaths.filter(
      (p) => !p.includes('package-lock.json') && !p.includes('dist/') && !p.includes('node_modules/')
    )
    const targetFiles = relevantFiles.length > 0 ? relevantFiles : filePaths

    // 1. Detect Scope
    let scope = ''
    const moduleMatch = targetFiles[0].match(/(?:modules|features|components|controllers|models|views|libraries)\/([^/]+)/i)
    if (moduleMatch) {
      scope = moduleMatch[1].toLowerCase()
    } else {
      const dirParts = targetFiles[0].split(/[/\\]/)
      if (dirParts.length > 1) {
        scope = dirParts[dirParts.length - 2].toLowerCase()
      }
    }

    // Clean up scope if too generic
    if (['src', 'app', 'application', 'modules', 'dist', 'out'].includes(scope)) {
      scope = ''
    }

    // 2. Detect Action & Type
    const isMigration = targetFiles.some((f) => f.includes('migration') || f.endsWith('.sql'))
    const isViewOrUi = targetFiles.some((f) => f.endsWith('.vue') || f.endsWith('.css') || f.includes('/views/'))
    const isModelOrDb = targetFiles.some((f) => f.includes('/models/') || f.endsWith('.sql'))
    const isController = targetFiles.some((f) => f.includes('/controllers/') || f.includes('/controller/'))
    const isLibrary = targetFiles.some((f) => f.includes('/libraries/') || f.includes('/lib/'))

    const fileBaseNames = targetFiles
      .slice(0, 2)
      .map((f) => f.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || '')
      .filter(Boolean)

    const fileDesc = fileBaseNames.join(' and ')

    // Action verbs for varied and natural bullet points
    const verbs = [
      'Optimalkan penanganan dan eksekusi logika pada',
      'Perbarui validasi parameter dan integrasi di',
      'Perbaiki alur pemrosesan data pada',
      'Refactor struktur fungsi dan efisiensi modul'
    ]

    const bullets: string[] = []
    targetFiles.slice(0, 4).forEach((file, idx) => {
      const bName = file.split(/[/\\]/).pop() || file
      const verb = verbs[idx % verbs.length]

      if (file.includes('migration') || file.endsWith('.sql')) {
        bullets.push(`- Update skrip migrasi dan struktur tabel pada ${bName}`)
      } else if (file.endsWith('.vue') || file.endsWith('.css')) {
        bullets.push(`- Sempurnakan tampilan antarmuka dan komponen ${bName}`)
      } else if (file.includes('/controllers/') || file.includes('/controller/')) {
        bullets.push(`- ${verb} controller ${bName}`)
      } else if (file.includes('/models/') || file.includes('/model/')) {
        bullets.push(`- Sesuaikan kueri database dan model data ${bName}`)
      } else if (file.includes('/libraries/') || file.includes('/lib/')) {
        bullets.push(`- Refactor helper utility dan modul pustaka ${bName}`)
      } else {
        bullets.push(`- Perbarui implementasi kode pada ${bName}`)
      }
    })

    let title = ''
    if (isMigration) {
      title = scope ? `chore(${scope}): update database migration scripts` : `chore(db): update database migration scripts`
    } else if (isViewOrUi) {
      title = scope ? `fix(${scope}): update ${fileDesc || 'ui layout'}` : `fix(ui): update ${fileDesc || 'components'}`
    } else if (isController) {
      title = scope ? `feat(${scope}): update ${fileDesc || 'controller logic'}` : `feat: update ${fileDesc || 'controller'}`
    } else if (isModelOrDb) {
      title = scope ? `feat(${scope}): update ${fileDesc || 'data model'}` : `feat(model): update ${fileDesc || 'data queries'}`
    } else if (isLibrary) {
      title = scope ? `refactor(${scope}): update ${fileDesc || 'library helpers'}` : `refactor: update ${fileDesc || 'library'}`
    } else {
      title = scope ? `chore(${scope}): update ${fileDesc || 'files'}` : `chore: update ${fileDesc || 'project files'}`
    }

    return bullets.length > 0 ? `${title}\n\n${bullets.join('\n')}` : title
  }

  /**
   * Git Push
   */
  public async push(projectPath: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const out = await this.runGit(projectPath, 'push')
      return { success: true, message: out || 'Push berhasil' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal push ke remote repository' }
    }
  }

  /**
   * Git Pull
   */
  public async pull(projectPath: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const out = await this.runGit(projectPath, 'pull')
      return { success: true, message: out || 'Pull berhasil' }
    } catch (err: any) {
      return { success: false, error: err.message || 'Gagal pull dari remote repository' }
    }
  }
}
