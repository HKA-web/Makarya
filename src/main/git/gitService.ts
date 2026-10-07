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
  public async commit(projectPath: string, message: string): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      const escaped = message.replace(/"/g, '\\"')
      const stdout = await this.runGit(projectPath, `commit -m "${escaped}"`)
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

    try {
      if (staged) {
        // Original is HEAD, new is staged index (:filePath)
        try {
          originalContent = await this.runGit(projectPath, `show HEAD:"${filePath}"`)
        } catch {
          originalContent = ''
        }
        try {
          newContent = await this.runGit(projectPath, `show :"${filePath}"`)
        } catch {
          newContent = ''
        }
      } else {
        // Original is staged index or HEAD, new is working tree file
        try {
          originalContent = await this.runGit(projectPath, `show :"${filePath}"`)
        } catch {
          try {
            originalContent = await this.runGit(projectPath, `show HEAD:"${filePath}"`)
          } catch {
            originalContent = ''
          }
        }

        const fullPath = join(projectPath, filePath)
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
   * Generate AI Commit Message from staged & unstaged diff
   */
  public async generateAiCommitMessage(projectPath: string, model?: string): Promise<string> {
    try {
      let diffOutput = ''
      try {
        diffOutput = await this.runGit(projectPath, 'diff --cached')
        if (!diffOutput) {
          diffOutput = await this.runGit(projectPath, 'diff')
        }
      } catch {}

      if (!diffOutput) {
        const stat = await this.runGit(projectPath, 'status --short')
        diffOutput = `Changed files:\n${stat}`
      }

      // Limit diff length for prompt
      const truncatedDiff = diffOutput.slice(0, 4000)

      const prompt = `Anda adalah asisten AI Git. Buatkan pesan commit ringkas, profesional, dan akurat mengikuti format Conventional Commits (contoh: 'feat: add user authentication' atau 'fix(editor): handle diff line scrolling' atau 'refactor: isolate claude store').

Berikut adalah git diff perubahan kode:
\`\`\`diff
${truncatedDiff}
\`\`\`

Instruksi:
1. Berikan HANYA 1 baris pesan commit (maksimal 72 karakter).
2. Jangan sertakan tanda kutip, jangan sertakan penjelasan tambahan, jangan gunakan markdown formatting. Cukup 1 baris judul commit.`

      // Execute AI generation via 9Router / direct LLM
      const config = this.aiAgentService.getConfiguration()
      const chosenModel = model || config.defaultModel || 'Antigravity'

      const response = await fetch(`${config.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 60
        })
      })

      if (response.ok) {
        const data = await response.json()
        const rawMsg = data.choices?.[0]?.message?.content || ''
        const cleanMsg = rawMsg.trim().replace(/^["'`]|["'`]$/g, '').replace(/^commit:\s*/i, '')
        return cleanMsg || 'chore: update project changes'
      }

      return 'chore: update project changes'
    } catch (err) {
      console.warn('[GitService] Error generating AI commit message:', err)
      return 'chore: update project files'
    }
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
