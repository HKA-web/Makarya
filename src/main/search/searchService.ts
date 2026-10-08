import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join, relative, basename, resolve } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'

export interface SearchMatch {
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

export interface FileSearchResult {
  filePath: string
  fileName: string
  relativePath: string
  rootPath: string
  matches: SearchMatch[]
}

export interface FindInFilesOptions {
  query: string
  rootPaths?: string[]
  isRegex?: boolean
  isCaseSensitive?: boolean
  matchWholeWord?: boolean
  includePattern?: string
  excludePattern?: string
  maxResults?: number
  offset?: number
}

export interface FindInFilesResult {
  results: FileSearchResult[]
  totalMatches: number
  totalFiles: number
  hasMore: boolean
  offset: number
  limit: number
  truncated: boolean
}

/**
 * Resolve native ripgrep binary without triggering CommonJS/ESM module conflicts
 */
export function getRipgrepBinaryPath(): string | null {
  const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const platformPkg = `@vscode/ripgrep-${process.platform}-${process.arch}`

  const candidatePaths = [
    join(process.cwd(), 'node_modules', '@vscode', `ripgrep-${process.platform}-${process.arch}`, 'bin', binaryName),
    join(process.cwd(), 'node_modules', platformPkg, 'bin', binaryName),
    join(__dirname, '..', '..', 'node_modules', '@vscode', `ripgrep-${process.platform}-${process.arch}`, 'bin', binaryName),
    join(__dirname, '..', '..', 'node_modules', platformPkg, 'bin', binaryName),
    join((process as any).resourcesPath || '', 'app.asar.unpacked', 'node_modules', '@vscode', `ripgrep-${process.platform}-${process.arch}`, 'bin', binaryName)
  ]

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  try {
    return require.resolve(`${platformPkg}/bin/${binaryName}`)
  } catch {
    return null
  }
}

const DEFAULT_EXCLUDE_GLOBS = [
  '!**/node_modules/**',
  '!**/.git/**',
  '!**/.svn/**',
  '!**/.hg/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/out/**',
  '!**/.output/**',
  '!**/.nuxt/**',
  '!**/.next/**',
  '!**/vendor/**',
  '!**/coverage/**',
  '!**/.cache/**',
  '!**/cache/**',
  '!**/.idea/**',
  '!**/.vscode/**',
  '!**/tmp/**',
  '!**/temp/**',
  '!**/uploads/**',
  '!**/upload/**',
  '!**/storage/logs/**',
  '!**/storage/framework/**'
]

const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.output',
  '.nuxt',
  '.next',
  'vendor',
  'coverage',
  '.cache',
  'cache',
  '.idea',
  '.vscode',
  'tmp',
  'temp',
  'uploads',
  'upload'
])

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.svg',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mp3',
  '.wav',
  '.flac',
  '.zip',
  '.tar',
  '.gz',
  '.7z',
  '.rar',
  '.pdf',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.node',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.class',
  '.jar',
  '.pyc',
  '.iso'
])

export class SearchService {
  /**
   * Search for text matches across workspace files.
   * Uses native Ripgrep (Rust) for ultra-fast < 50ms searches, with Node.js fallback.
   */
  public async findInFiles(options: FindInFilesOptions): Promise<FindInFilesResult> {
    const {
      query,
      rootPaths = [],
      isRegex = false,
      isCaseSensitive = false,
      matchWholeWord = false,
      includePattern,
      excludePattern,
      maxResults = 100,
      offset = 0
    } = options

    if (!query || !query.trim() || rootPaths.length === 0) {
      return {
        results: [],
        totalMatches: 0,
        totalFiles: 0,
        hasMore: false,
        offset,
        limit: maxResults,
        truncated: false
      }
    }

    // Try high-speed Ripgrep first if binary exists
    const rgBin = getRipgrepBinaryPath()
    if (rgBin && existsSync(rgBin)) {
      try {
        return await this.searchWithRipgrep(options, rgBin)
      } catch (rgError) {
        console.warn('[SearchService] Ripgrep search failed, falling back to node search:', rgError)
      }
    }

    // Fallback: Node.js recursive crawl
    return this.searchWithNode(options)
  }

  /**
   * Native Ripgrep search implementation (VS Code / Antigravity grade speed)
   */
  private async searchWithRipgrep(options: FindInFilesOptions, rgBin: string): Promise<FindInFilesResult> {
    const {
      query,
      rootPaths = [],
      isRegex = false,
      isCaseSensitive = false,
      matchWholeWord = false,
      includePattern,
      excludePattern,
      maxResults = 100,
      offset = 0
    } = options

    const existingRoots = rootPaths.filter((r) => existsSync(r))
    if (existingRoots.length === 0) {
      return {
        results: [],
        totalMatches: 0,
        totalFiles: 0,
        hasMore: false,
        offset,
        limit: maxResults,
        truncated: false
      }
    }

    const args: string[] = ['--json', '--no-messages', '--max-filesize', '5M']

    if (isCaseSensitive) {
      args.push('-s')
    } else {
      args.push('-i')
    }

    if (matchWholeWord) {
      args.push('-w')
    }

    if (!isRegex) {
      args.push('-F')
    }

    // Exclude heavy/cache folders
    for (const glob of DEFAULT_EXCLUDE_GLOBS) {
      args.push('-g', glob)
    }

    // Custom include filters
    if (includePattern) {
      const incPatterns = includePattern.split(',').map((p) => p.trim()).filter(Boolean)
      for (const p of incPatterns) {
        args.push('-g', p)
      }
    }

    // Custom exclude filters
    if (excludePattern) {
      const excPatterns = excludePattern.split(',').map((p) => p.trim()).filter(Boolean)
      for (const p of excPatterns) {
        args.push('-g', `!${p}`)
      }
    }

    args.push('-e', query)
    args.push(...existingRoots)

    return new Promise((resolveResult) => {
      let child: ChildProcess | null = null
      let isResolved = false
      let scanned = 0
      let collected = 0
      let hasMore = false

      const results: FileSearchResult[] = []
      const fileMap = new Map<string, FileSearchResult>()

      const finish = (): void => {
        if (isResolved) return
        isResolved = true
        if (child && !child.killed) {
          try {
            child.kill()
          } catch {
            // ignore
          }
        }
        resolveResult({
          results,
          totalMatches: collected,
          totalFiles: results.length,
          hasMore,
          offset,
          limit: maxResults,
          truncated: hasMore
        })
      }

      try {
        child = spawn(rgBin, args, { windowsHide: true })

        if (!child.stdout) {
          finish()
          return
        }

        const rl = createInterface({
          input: child.stdout,
          crlfDelay: Infinity
        })

        rl.on('line', (line) => {
          if (isResolved || !line) return

          try {
            const record = JSON.parse(line)
            if (record.type === 'match' && record.data) {
              const data = record.data
              const rawPath = data.path?.text
              if (!rawPath) return

              const filePath = resolve(rawPath)
              const lineNum = data.line_number || 1
              const lineText = (data.lines?.text || '').replace(/\r?\n$/, '')
              const submatches = data.submatches || [{ match: { text: query }, start: 0, end: query.length }]

              // Identify matched workspace root
              const matchedRoot =
                existingRoots.find((r) => filePath.toLowerCase().startsWith(resolve(r).toLowerCase())) ||
                existingRoots[0] ||
                ''
              const relPath = relative(matchedRoot, filePath).replace(/\\/g, '/')

              for (const sm of submatches) {
                if (scanned < offset) {
                  scanned++
                } else if (collected < maxResults) {
                  let fileItem = fileMap.get(filePath)
                  if (!fileItem) {
                    fileItem = {
                      filePath,
                      fileName: basename(filePath),
                      relativePath: relPath,
                      rootPath: matchedRoot,
                      matches: []
                    }
                    fileMap.set(filePath, fileItem)
                    results.push(fileItem)
                  }

                  fileItem.matches.push({
                    lineNumber: lineNum,
                    lineContent: lineText,
                    matchStart: sm.start ?? 0,
                    matchEnd: sm.end ?? lineText.length
                  })

                  collected++
                  scanned++
                } else {
                  hasMore = true
                  finish()
                  return
                }
              }
            }
          } catch {
            // ignore malformed lines
          }
        })

        child.on('close', () => {
          finish()
        })

        child.on('error', (err) => {
          console.warn('[SearchService] Ripgrep spawn error:', err)
          finish()
        })
      } catch (err) {
        console.warn('[SearchService] Error starting ripgrep:', err)
        finish()
      }
    })
  }

  /**
   * Node.js fallback search
   */
  private async searchWithNode(options: FindInFilesOptions): Promise<FindInFilesResult> {
    const {
      query,
      rootPaths = [],
      isRegex = false,
      isCaseSensitive = false,
      matchWholeWord = false,
      includePattern,
      excludePattern,
      maxResults = 100,
      offset = 0
    } = options

    let searchRegex: RegExp
    try {
      let pattern = query
      if (!isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }

      if (matchWholeWord) {
        pattern = `\\b${pattern}\\b`
      }

      const flags = isCaseSensitive ? 'g' : 'gi'
      searchRegex = new RegExp(pattern, flags)
    } catch {
      return {
        results: [],
        totalMatches: 0,
        totalFiles: 0,
        hasMore: false,
        offset,
        limit: maxResults,
        truncated: false
      }
    }

    const includeRegex = includePattern ? this.globToRegex(includePattern) : null
    const excludeRegex = excludePattern ? this.globToRegex(excludePattern) : null

    const results: FileSearchResult[] = []
    let totalMatchesScanned = 0
    let totalMatchesCollected = 0
    let hasMore = false

    for (const rootPath of rootPaths) {
      if (hasMore) break

      try {
        await this.searchDirectory(
          rootPath,
          rootPath,
          searchRegex,
          includeRegex,
          excludeRegex,
          results,
          () => ({
            scanned: totalMatchesScanned,
            collected: totalMatchesCollected,
            hasMore
          }),
          (scanned, collected, more) => {
            totalMatchesScanned = scanned
            totalMatchesCollected = collected
            hasMore = more
          },
          offset,
          maxResults
        )
      } catch (err) {
        console.warn(`[SearchService] Error searching root ${rootPath}:`, err)
      }
    }

    return {
      results,
      totalMatches: totalMatchesCollected,
      totalFiles: results.length,
      hasMore,
      offset,
      limit: maxResults,
      truncated: hasMore
    }
  }

  private async searchDirectory(
    currentDir: string,
    rootPath: string,
    searchRegex: RegExp,
    includeRegex: RegExp | null,
    excludeRegex: RegExp | null,
    results: FileSearchResult[],
    getStatus: () => { scanned: number; collected: number; hasMore: boolean },
    setStatus: (scanned: number, collected: number, hasMore: boolean) => void,
    offset: number,
    maxResults: number
  ): Promise<void> {
    if (getStatus().hasMore) return

    let entries: string[] = []
    try {
      entries = await readdir(currentDir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (getStatus().hasMore) return

      if (DEFAULT_EXCLUDED_DIRS.has(entry) || entry.startsWith('.')) {
        continue
      }

      const fullPath = join(currentDir, entry)
      let fileStats
      try {
        fileStats = await stat(fullPath)
      } catch {
        continue
      }

      if (fileStats.isDirectory()) {
        await this.searchDirectory(
          fullPath,
          rootPath,
          searchRegex,
          includeRegex,
          excludeRegex,
          results,
          getStatus,
          setStatus,
          offset,
          maxResults
        )
      } else if (fileStats.isFile()) {
        if (fileStats.size > 4 * 1024 * 1024) continue

        const ext = entry.slice(entry.lastIndexOf('.')).toLowerCase()
        if (BINARY_EXTENSIONS.has(ext)) continue

        const relPath = relative(rootPath, fullPath).replace(/\\/g, '/')

        if (includeRegex && !includeRegex.test(relPath) && !includeRegex.test(entry)) {
          continue
        }

        if (excludeRegex && (excludeRegex.test(relPath) || excludeRegex.test(entry))) {
          continue
        }

        try {
          const content = await readFile(fullPath, 'utf-8')
          if (content.includes('\0')) continue

          const lines = content.split(/\r?\n/)
          const fileMatches: SearchMatch[] = []

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            searchRegex.lastIndex = 0

            let match: RegExpExecArray | null
            while ((match = searchRegex.exec(line)) !== null) {
              const currentStatus = getStatus()

              if (currentStatus.scanned < offset) {
                setStatus(currentStatus.scanned + 1, currentStatus.collected, false)
              } else if (currentStatus.collected < maxResults) {
                fileMatches.push({
                  lineNumber: i + 1,
                  lineContent: line.trimEnd(),
                  matchStart: match.index,
                  matchEnd: match.index + match[0].length
                })
                setStatus(currentStatus.scanned + 1, currentStatus.collected + 1, false)
              } else {
                setStatus(currentStatus.scanned + 1, currentStatus.collected, true)
                break
              }

              if (match[0].length === 0) {
                searchRegex.lastIndex++
              }
            }

            if (getStatus().hasMore) break
          }

          if (fileMatches.length > 0) {
            results.push({
              filePath: fullPath,
              fileName: basename(fullPath),
              relativePath: relPath,
              rootPath,
              matches: fileMatches
            })
          }
        } catch {
          // File read error
        }
      }
    }
  }

  private globToRegex(glob: string): RegExp {
    const parts = glob.split(',').map((p) => p.trim()).filter(Boolean)
    const regexParts = parts.map((part) => {
      const escaped = part
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
      return `(?:${escaped})`
    })

    return new RegExp(`^${regexParts.join('|')}$`, 'i')
  }
}

export const searchService = new SearchService()

