<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useAgentStore } from '@renderer/stores/agentStore'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()

const searchKeyword = ref('')
const debouncedKeyword = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Pagination State (100 files per page)
const PAGE_SIZE = 100
const currentPage = ref(1)

watch(searchKeyword, (val) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  // Instant update for empty keyword or prefix command modes (>, :, @)
  if (!val || val.startsWith('>') || val.startsWith(':') || val.startsWith('@')) {
    debouncedKeyword.value = val
    currentPage.value = 1
    return
  }
  // Debounce regular file fuzzy search by 80ms for lightweight, lag-free typing
  debounceTimer = setTimeout(() => {
    debouncedKeyword.value = val
    currentPage.value = 1
    debounceTimer = null
  }, 80)
})

onUnmounted(() => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
})

function flushDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
    debouncedKeyword.value = searchKeyword.value
  }
}

const selectedIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)
const isLoadingFiles = ref(false)

interface IndexedFile {
  name: string
  path: string
  relativePath: string
  folderPath: string
  rootPath: string
  rootName?: string
}

interface CommandItem {
  id: string
  title: string
  category: string
  icon: string
  shortcut?: string
  action: () => void
}

interface SymbolItem {
  name: string
  kind: string
  line: number
  icon: string
}

const allProjectFiles = ref<IndexedFile[]>([])

// Commands available in > mode
const commandList: CommandItem[] = [
  {
    id: 'cmd-quick-open',
    title: 'Cari Berkas pada Project...',
    category: 'Navigasi',
    icon: 'i-lucide-file-search',
    shortcut: 'Ctrl+E',
    action: () => {
      searchKeyword.value = ''
    }
  },
  {
    id: 'cmd-global-search',
    title: 'Pencarian Kode Global (Find in Files)...',
    category: 'Navigasi',
    icon: 'i-lucide-search',
    shortcut: 'Ctrl+Shift+F',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.openGlobalSearch()
    }
  },
  {
    id: 'cmd-window-switcher',
    title: 'Task View & Multi-Window Hub...',
    category: 'Tampilan',
    icon: 'i-lucide-layout-grid',
    shortcut: 'Ctrl+Shift+N',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.toggleWindowSwitcher()
    }
  },
  {
    id: 'cmd-open-folder',
    title: 'Buka Folder Project...',
    category: 'Berkas',
    icon: 'i-lucide-folder-open',
    shortcut: 'Ctrl+O',
    action: async () => {
      workspaceStore.closeQuickOpen()
      if (window.makaryaAPI) {
        const dialogResult = await window.makaryaAPI.openFolderDialog()
        if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
          await workspaceStore.setSingleWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
          agentStore.setConnectedWorkspacePath(dialogResult.folderPath)
        }
      }
    }
  },
  {
    id: 'cmd-add-workspace',
    title: 'Tambah Folder Project...',
    category: 'Berkas',
    icon: 'i-lucide-folder-plus',
    shortcut: 'Ctrl+Shift+A',
    action: async () => {
      workspaceStore.closeQuickOpen()
      if (window.makaryaAPI) {
        const dialogResult = await window.makaryaAPI.openFolderDialog()
        if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
          await workspaceStore.addWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
          agentStore.setConnectedWorkspacePath(dialogResult.folderPath)
        }
      }
    }
  },
  {
    id: 'cmd-save-file',
    title: 'Simpan File Aktif',
    category: 'Berkas',
    icon: 'i-lucide-save',
    shortcut: 'Ctrl+S',
    action: async () => {
      workspaceStore.closeQuickOpen()
      await workspaceStore.saveActiveFile()
    }
  },
  {
    id: 'cmd-close-file',
    title: 'Tutup File Aktif',
    category: 'Tab',
    icon: 'i-lucide-x',
    shortcut: 'Ctrl+W',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.closeTab(workspaceStore.activeTabId)
    }
  },
  {
    id: 'cmd-toggle-sidebar',
    title: 'Toggle File Explorer Sidebar',
    category: 'Tampilan',
    icon: 'i-lucide-panel-left',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.toggleSidebar()
    }
  },
  {
    id: 'cmd-toggle-bottom-panel',
    title: 'Toggle Terminal Panel Bawah',
    category: 'Tampilan',
    icon: 'i-lucide-terminal',
    shortcut: 'Ctrl+`',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.toggleBottomPanel()
    }
  },
  {
    id: 'cmd-toggle-copilot',
    title: 'Toggle Panel AI Copilot',
    category: 'AI Assistant',
    icon: 'i-lucide-sparkles',
    shortcut: 'Ctrl+B',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.toggleCopilotPanel()
    }
  },
  {
    id: 'cmd-tag-to-agent',
    title: 'Tag Baris Terpilih ke Chat Agent',
    category: 'AI Assistant',
    icon: 'i-lucide-code-xml',
    shortcut: 'Ctrl+L',
    action: () => {
      workspaceStore.closeQuickOpen()
      if (!workspaceStore.isCopilotPanelOpen) {
        workspaceStore.isCopilotPanelOpen = true
      }
      const editor = workspaceStore.getActiveEditorInstance()
      const activeTab = workspaceStore.activeTab
      if (editor) {
        const selection = editor.getSelection()
        const model = editor.getModel()
        if (model) {
          let snippet = ''
          let startLine = 1
          let endLine = 1
          let lineRange = ''
          if (selection && !selection.isEmpty()) {
            snippet = model.getValueInRange(selection)
            startLine = selection.startLineNumber
            endLine = selection.endLineNumber
            lineRange = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
          } else {
            const pos = editor.getPosition()
            if (pos) {
              startLine = pos.lineNumber
              endLine = pos.lineNumber
              snippet = model.getLineContent(pos.lineNumber)
              lineRange = `L${startLine}`
            }
          }
          const filePath = activeTab?.filePath || ''
          const fileName = activeTab?.title || (filePath ? filePath.split(/[/\\]/).pop() || 'Untitled' : 'Untitled')
          const language = activeTab?.language || 'plaintext'
          window.dispatchEvent(
            new CustomEvent('makarya:tag-to-agent', {
              detail: {
                path: filePath,
                name: fileName,
                startLine,
                endLine,
                lineRange,
                selectedSnippet: snippet,
                language
              }
            })
          )
          return
        }
      }
      if (activeTab && activeTab.filePath) {
        window.dispatchEvent(
          new CustomEvent('makarya:tag-to-agent', {
            detail: {
              path: activeTab.filePath,
              name: activeTab.title,
              language: activeTab.language
            }
          })
        )
      } else {
        window.dispatchEvent(new CustomEvent('makarya:focus-agent-chat'))
      }
    }
  },
  {
    id: 'cmd-agent-history',
    title: 'Buka Riwayat Obrolan AI...',
    category: 'AI Assistant',
    icon: 'i-lucide-history',
    action: () => {
      workspaceStore.closeQuickOpen()
      if (!workspaceStore.isCopilotPanelOpen) {
        workspaceStore.toggleCopilotPanel()
      }
      agentStore.loadSessions()
      agentStore.isSessionsModalOpen = true
    }
  },
  {
    id: 'cmd-refresh-explorer',
    title: 'Refresh Pohon Berkas Explorer',
    category: 'Berkas',
    icon: 'i-lucide-refresh-cw',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.refreshFileTree()
    }
  },
  {
    id: 'cmd-about-makarya',
    title: 'Tentang Makarya IDE (About)',
    category: 'Bantuan',
    icon: 'i-lucide-info',
    action: () => {
      workspaceStore.closeQuickOpen()
      workspaceStore.openAboutModal()
    }
  }
]

// Current mode determined by prefix
const searchMode = computed<'files' | 'commands' | 'goto-line' | 'symbols'>(() => {
  const raw = searchKeyword.value
  if (raw.startsWith('>')) return 'commands'
  if (raw.startsWith(':')) return 'goto-line'
  if (raw.startsWith('@')) return 'symbols'
  return 'files'
})

// Extract target line from query like "filename.vue:42" or ":42"
const targetLineNumber = computed<number | undefined>(() => {
  const raw = searchKeyword.value.trim()
  if (raw.startsWith(':')) {
    const num = parseInt(raw.slice(1).trim(), 10)
    return isNaN(num) ? undefined : num
  }
  const match = raw.match(/:(\d+)$/)
  if (match) {
    const num = parseInt(match[1], 10)
    return isNaN(num) ? undefined : num
  }
  return undefined
})

// Clean query string for file search
const cleanFileQuery = computed(() => {
  let q = debouncedKeyword.value.trim().toLowerCase()
  if (q.startsWith('>')) return ''
  if (q.startsWith(':')) return ''
  if (q.startsWith('@')) return ''
  // Strip trailing :line
  q = q.replace(/:\d+$/, '')
  return q.trim()
})

// Ambil seluruh daftar file dari semua project yang dibuka (bertenaga Ripgrep native)
async function refreshWorkspaceFiles(): Promise<void> {
  const rootPaths = workspaceStore.workspaceRoots.map((r) => r.path)
  if (rootPaths.length === 0 && workspaceStore.activeRootPath) {
    rootPaths.push(workspaceStore.activeRootPath)
  }

  if (rootPaths.length === 0 || !window.makaryaAPI?.searchWorkspaceFiles) {
    allProjectFiles.value = []
    return
  }

  isLoadingFiles.value = true
  try {
    const files = await window.makaryaAPI.searchWorkspaceFiles(rootPaths)
    allProjectFiles.value = (files || []).map((f) => {
      const rel = f.relativePath.replace(/\\/g, '/')
      const lastSlash = rel.lastIndexOf('/')
      const folderPath = lastSlash > 0 ? rel.slice(0, lastSlash).replace(/\//g, '\\') : ''
      
      let rootName = ''
      if (f.rootPath) {
        const matchingRoot = workspaceStore.workspaceRoots.find(
          (r) => r.path.replace(/\\/g, '/').toLowerCase() === f.rootPath.replace(/\\/g, '/').toLowerCase()
        )
        rootName = matchingRoot?.name || f.rootPath.split(/[\\/]/).filter(Boolean).pop() || ''
      }

      return {
        name: f.name,
        path: f.path,
        relativePath: rel,
        folderPath,
        rootPath: f.rootPath,
        rootName
      }
    })
  } catch (err) {
    console.warn('Gagal mengindeks berkas workspace:', err)
  } finally {
    isLoadingFiles.value = false
  }
}

// Extract symbols in active file if in @ mode
const activeSymbols = computed<SymbolItem[]>(() => {
  if (searchMode.value !== 'symbols') return []
  const content = workspaceStore.activeTab.content || ''
  const query = debouncedKeyword.value.slice(1).trim().toLowerCase()
  const lines = content.split('\n')
  const symbols: SymbolItem[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Function/Method detection in JS/TS/PHP/Vue
    const fnMatch = line.match(/(?:function|def|fn|async function)\s+([a-zA-Z0-9_$]+)/i)
    const constFnMatch = line.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/i)
    const classMatch = line.match(/(?:class|interface|type|struct)\s+([a-zA-Z0-9_$]+)/i)
    const methodMatch = line.match(/public\s+(?:function\s+)?([a-zA-Z0-9_$]+)/i)

    if (fnMatch) {
      symbols.push({ name: fnMatch[1], kind: 'function', line: i + 1, icon: 'i-lucide-code-2' })
    } else if (constFnMatch) {
      symbols.push({ name: constFnMatch[1], kind: 'arrow-fn', line: i + 1, icon: 'i-lucide-braces' })
    } else if (classMatch) {
      symbols.push({ name: classMatch[1], kind: 'class', line: i + 1, icon: 'i-lucide-box' })
    } else if (methodMatch) {
      symbols.push({ name: methodMatch[1], kind: 'method', line: i + 1, icon: 'i-lucide-curly-braces' })
    }
  }

  if (!query) return symbols.slice(0, 40)
  return symbols.filter((s) => s.name.toLowerCase().includes(query)).slice(0, 40)
})

// Filtered commands if in > mode
const filteredCommands = computed<CommandItem[]>(() => {
  if (searchMode.value !== 'commands') return []
  const query = debouncedKeyword.value.slice(1).trim().toLowerCase()
  if (!query) return commandList
  return commandList.filter(
    (c) => c.title.toLowerCase().includes(query) || c.category.toLowerCase().includes(query)
  )
})

// Acronym scoring for CamelCase & snake_case (e.g. "kc" -> "KantinController")
function scoreAcronym(text: string, query: string): number {
  const parts = text.split(/[-_.\s]+|(?=[A-Z])/)
  const initials = parts.map((p) => p[0]?.toLowerCase()).filter(Boolean).join('')
  if (initials.includes(query)) {
    return 300 - initials.indexOf(query) * 20
  }
  return 0
}

// Subsequence matching within a single string
function scoreSubsequence(text: string, query: string): number {
  let qIdx = 0
  let score = 0
  let consecutive = 0
  let prevMatchedIdx = -10

  for (let i = 0; i < text.length && qIdx < query.length; i++) {
    const char = text[i]
    if (char === query[qIdx]) {
      qIdx++
      score += 20

      // Consecutive bonus
      if (i === prevMatchedIdx + 1) {
        consecutive++
        score += consecutive * 15
      } else {
        consecutive = 0
      }

      // Word boundary bonus (after ., -, _, /, \)
      if (i === 0 || text[i - 1] === '/' || text[i - 1] === '\\' || text[i - 1] === '.' || text[i - 1] === '_' || text[i - 1] === '-') {
        score += 35
      }

      prevMatchedIdx = i
    }
  }

  if (qIdx === query.length) {
    return score
  }

  return 0
}

// Strict File Name Matching with Smart Fallback for Path Queries
function calculateFuzzyScore(file: IndexedFile, query: string): number {
  if (!query) return 0
  const fileName = file.name.toLowerCase()
  const hasSlash = query.includes('/') || query.includes('\\')

  // 1. If query contains a path separator (e.g. "controllers/kantin" or "auth/login"):
  // Search across the relative folder path
  if (hasSlash) {
    const normQuery = query.replace(/\\/g, '/')
    const relPath = file.relativePath.toLowerCase().replace(/\\/g, '/')
    const fullSearch = (file.rootName ? file.rootName.toLowerCase() + '/' : '') + relPath

    if (fullSearch.includes(normQuery)) {
      return 2500 - fullSearch.indexOf(normQuery) * 5
    }
    return scoreSubsequence(fullSearch, normQuery)
  }

  // 2. Default: Search strictly on FILE NAME (VS Code / Sublime standard)
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')

  // Exact file name match (with or without extension)
  if (fileName === query || nameWithoutExt === query) {
    return 3000
  }

  // File name starts with query
  if (fileName.startsWith(query) || nameWithoutExt.startsWith(query)) {
    return 2500 - (fileName.length - query.length) * 2
  }

  // Query is a direct substring of file name
  const subIdx = fileName.indexOf(query)
  if (subIdx !== -1) {
    return 2000 - subIdx * 10 - (fileName.length - query.length) * 2
  }

  // Acronym / word boundaries in filename (e.g. "kc" -> "KantinController")
  const acronymScore = scoreAcronym(fileName, query)
  if (acronymScore > 0) {
    return 1500 + acronymScore
  }

  // Subsequence match in filename only (e.g. "ktn" -> "kantin.php")
  const subseqScore = scoreSubsequence(fileName, query)
  if (subseqScore > 0) {
    return 1000 + subseqScore
  }

  return 0
}

// Logika cerdas fuzzy search & recent files (Seluruh hasil yang cocok)
const allMatchedFiles = computed<IndexedFile[]>(() => {
  if (searchMode.value !== 'files') return []
  const query = cleanFileQuery.value

  // Jika keyword kosong: Tampilkan berkas yang sedang terbuka di tab dan riwayat berkas terbaru
  if (!query) {
    const resultList: IndexedFile[] = []
    const seenPaths = new Set<string>()

    // 1. Tambahkan tab-tab yang sedang terbuka saat ini
    for (const tab of workspaceStore.tabList) {
      if (tab.filePath && !seenPaths.has(tab.filePath)) {
        seenPaths.add(tab.filePath)
        const cached = allProjectFiles.value.find((f) => f.path === tab.filePath)
        let rootName = cached?.rootName || ''
        let folderPath = cached?.folderPath || ''
        let rel = cached?.relativePath || tab.title
        let rootPath = cached?.rootPath || ''

        if (!cached) {
          const matchingRoot = workspaceStore.workspaceRoots.find((r) => {
            const normRoot = r.path.replace(/\\/g, '/').toLowerCase()
            const normFile = (tab.filePath || '').replace(/\\/g, '/').toLowerCase()
            return normFile.startsWith(normRoot + '/') || normFile === normRoot
          })
          if (matchingRoot) {
            rootName = matchingRoot.name
            rootPath = matchingRoot.path
            const normRoot = matchingRoot.path.replace(/\\/g, '/')
            const fileNorm = (tab.filePath || '').replace(/\\/g, '/')
            rel = fileNorm.slice(normRoot.length).replace(/^\//, '')
            const lastSlash = rel.lastIndexOf('/')
            folderPath = lastSlash > 0 ? rel.slice(0, lastSlash).replace(/\//g, '\\') : ''
          }
        }

        resultList.push({
          name: tab.title,
          path: tab.filePath,
          relativePath: rel,
          folderPath,
          rootPath,
          rootName
        })
      }
    }

    // 2. Tambahkan riwayat file yang pernah dibuka sebelumnya
    for (const recent of workspaceStore.recentFiles) {
      if (recent.path && !seenPaths.has(recent.path)) {
        seenPaths.add(recent.path)
        const cached = allProjectFiles.value.find((f) => f.path === recent.path)
        let rootName = cached?.rootName || ''
        let folderPath = cached?.folderPath || ''
        let rel = cached?.relativePath || recent.name
        let rootPath = cached?.rootPath || ''

        if (!cached) {
          const matchingRoot = workspaceStore.workspaceRoots.find((r) => {
            const normRoot = r.path.replace(/\\/g, '/').toLowerCase()
            const normFile = (recent.path || '').replace(/\\/g, '/').toLowerCase()
            return normFile.startsWith(normRoot + '/') || normFile === normRoot
          })
          if (matchingRoot) {
            rootName = matchingRoot.name
            rootPath = matchingRoot.path
            const normRoot = matchingRoot.path.replace(/\\/g, '/')
            const fileNorm = (recent.path || '').replace(/\\/g, '/')
            rel = fileNorm.slice(normRoot.length).replace(/^\//, '')
            const lastSlash = rel.lastIndexOf('/')
            folderPath = lastSlash > 0 ? rel.slice(0, lastSlash).replace(/\//g, '\\') : ''
          }
        }

        resultList.push({
          name: recent.name,
          path: recent.path,
          relativePath: rel,
          folderPath,
          rootPath,
          rootName
        })
      }
    }

    // 3. Jika belum ada recent/tab, tampilkan semua berkas dari workspace
    if (resultList.length === 0) {
      return allProjectFiles.value
    }

    return resultList
  }

  // Jika ada query: Filter dengan algoritma fuzzy scoring bertingkat
  const matches: Array<{ file: IndexedFile; score: number }> = []

  for (const file of allProjectFiles.value) {
    const score = calculateFuzzyScore(file, query)
    if (score > 0) {
      matches.push({ file, score })
    }
  }

  // Urutkan berdasarkan score tertinggi, lalu abjad
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.file.name.localeCompare(b.file.name)
  })

  return matches.map((m) => m.file)
})

// Total files match count
const totalMatchedCount = computed(() => allMatchedFiles.value.length)

// Total pages based on PAGE_SIZE
const totalPages = computed(() => Math.max(1, Math.ceil(totalMatchedCount.value / PAGE_SIZE)))

// Paged files for active page (100 items per view)
const pagedFilteredFiles = computed<IndexedFile[]>(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return allMatchedFiles.value.slice(start, start + PAGE_SIZE)
})

// Unified items count for current active view navigation
const currentItemsCount = computed(() => {
  if (searchMode.value === 'commands') return filteredCommands.value.length
  if (searchMode.value === 'symbols') return activeSymbols.value.length
  if (searchMode.value === 'goto-line') return targetLineNumber.value ? 1 : 0
  return pagedFilteredFiles.value.length
})

watch([allMatchedFiles, filteredCommands, activeSymbols, searchMode], () => {
  selectedIndex.value = 0
})

watch(
  () => workspaceStore.isQuickOpenVisible,
  async (visible) => {
    if (visible) {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      searchKeyword.value = ''
      debouncedKeyword.value = ''
      currentPage.value = 1
      selectedIndex.value = 0
      await refreshWorkspaceFiles()
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }
)

function prevPage(): void {
  if (currentPage.value > 1) {
    currentPage.value--
    selectedIndex.value = 0
    if (listContainerRef.value) listContainerRef.value.scrollTop = 0
  }
}

function nextPage(): void {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    selectedIndex.value = 0
    if (listContainerRef.value) listContainerRef.value.scrollTop = 0
  }
}

function executeSelection(): void {
  flushDebounce()

  if (searchMode.value === 'commands') {
    const cmds = filteredCommands.value
    if (cmds.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < cmds.length) {
      cmds[selectedIndex.value].action()
    }
    return
  }

  if (searchMode.value === 'symbols') {
    const syms = activeSymbols.value
    if (syms.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < syms.length) {
      const sym = syms[selectedIndex.value]
      workspaceStore.closeQuickOpen()
      const editor = workspaceStore.getActiveEditorInstance()
      if (editor) {
        editor.revealLineInCenter(sym.line)
        editor.setPosition({ lineNumber: sym.line, column: 1 })
        editor.focus()
      }
    }
    return
  }

  if (searchMode.value === 'goto-line') {
    const line = targetLineNumber.value
    if (line && line > 0) {
      workspaceStore.closeQuickOpen()
      const editor = workspaceStore.getActiveEditorInstance()
      if (editor) {
        editor.revealLineInCenter(line)
        editor.setPosition({ lineNumber: line, column: 1 })
        editor.focus()
      }
    }
    return
  }

  // File open mode
  const files = pagedFilteredFiles.value
  if (files.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < files.length) {
    const chosen = files[selectedIndex.value]
    workspaceStore.closeQuickOpen()
    const targetLine = targetLineNumber.value
    workspaceStore.openFile(chosen.path, chosen.name, targetLine)
  }
}

function handlePaletteKeydown(event: KeyboardEvent): void {
  const isModifier = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  if (event.altKey && event.key === 'ArrowLeft') {
    event.preventDefault()
    prevPage()
    return
  }

  if (event.altKey && event.key === 'ArrowRight') {
    event.preventDefault()
    nextPage()
    return
  }

  // Ctrl+E or Ctrl+P cycle down
  if (isModifier && (key === 'e' || key === 'p')) {
    event.preventDefault()
    event.stopPropagation()
    const count = currentItemsCount.value
    if (count > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % count
      scrollToSelected()
    }
    return
  }

  const count = currentItemsCount.value

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (count > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % count
      scrollToSelected()
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (count > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + count) % count
      scrollToSelected()
    }
  } else if (event.key === 'PageDown') {
    event.preventDefault()
    if (searchMode.value === 'files' && currentPage.value < totalPages.value) {
      nextPage()
    } else if (count > 0) {
      selectedIndex.value = Math.min(count - 1, selectedIndex.value + 8)
      scrollToSelected()
    }
  } else if (event.key === 'PageUp') {
    event.preventDefault()
    if (searchMode.value === 'files' && currentPage.value > 1) {
      prevPage()
    } else if (count > 0) {
      selectedIndex.value = Math.max(0, selectedIndex.value - 8)
      scrollToSelected()
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    executeSelection()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    workspaceStore.closeQuickOpen()
  }
}

function scrollToSelected(): void {
  nextTick(() => {
    const el = document.getElementById(`quick-item-${selectedIndex.value}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// Highlight matching characters helper
function getHighlightedSegments(text: string, query: string): Array<{ text: string; match: boolean }> {
  if (!query || !text) return [{ text, match: false }]
  const q = query.toLowerCase()
  const lower = text.toLowerCase()

  // Check substring match first for clean rendering
  const subIdx = lower.indexOf(q)
  if (subIdx !== -1) {
    const before = text.slice(0, subIdx)
    const match = text.slice(subIdx, subIdx + q.length)
    const after = text.slice(subIdx + q.length)
    const result: Array<{ text: string; match: boolean }> = []
    if (before) result.push({ text: before, match: false })
    result.push({ text: match, match: true })
    if (after) result.push({ text: after, match: false })
    return result
  }

  // Fuzzy sequential character matching
  const segments: Array<{ text: string; match: boolean }> = []
  let qIdx = 0

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (qIdx < q.length && char.toLowerCase() === q[qIdx]) {
      segments.push({ text: char, match: true })
      qIdx++
    } else {
      if (segments.length > 0 && !segments[segments.length - 1].match) {
        segments[segments.length - 1].text += char
      } else {
        segments.push({ text: char, match: false })
      }
    }
  }

  return segments
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-98"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-98"
    >
      <div
        v-if="workspaceStore.isQuickOpenVisible"
        class="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/65 backdrop-blur-xs px-4"
        @click.self="workspaceStore.closeQuickOpen"
      >
        <!-- Single Card Container without double-borders/outer padding -->
        <div
          class="w-full max-w-2xl rounded-2xl bg-[#090e17]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[82vh] ring-1 ring-white/[0.08]"
        >
          <!-- Top Glow Accent Line (Emerald Vue/Antigravity Green) -->
          <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883] to-transparent shadow-[0_0_12px_#42b883]"></div>

          <!-- Search Input Box Header -->
          <div class="p-3 border-b border-white/[0.08] bg-[#0c121d]/90 flex items-center gap-2.5">
            <!-- Dynamic Prefix Icon -->
            <div class="size-7 rounded-xl bg-[#42b883]/10 border border-[#42b883]/20 flex items-center justify-center flex-shrink-0">
              <UIcon
                v-if="searchMode === 'commands'"
                name="i-lucide-terminal"
                class="size-4 text-indigo-400"
              />
              <UIcon
                v-else-if="searchMode === 'goto-line'"
                name="i-lucide-arrow-down-to-line"
                class="size-4 text-amber-400"
              />
              <UIcon
                v-else-if="searchMode === 'symbols'"
                name="i-lucide-at-sign"
                class="size-4 text-cyan-400"
              />
              <UIcon
                v-else
                name="i-lucide-search"
                class="size-4 text-[#42b883]"
              />
            </div>

            <!-- Main Input -->
            <div class="flex-1 relative flex items-center">
              <input
                ref="searchInputRef"
                v-model="searchKeyword"
                type="text"
                :placeholder="
                  searchMode === 'commands'
                    ? 'Ketik perintah untuk dieksekusi...'
                    : searchMode === 'goto-line'
                    ? 'Ketik nomor baris (contoh: :45)...'
                    : searchMode === 'symbols'
                    ? 'Ketik nama fungsi / simbol dalam berkas aktif...'
                    : 'Cari berkas project... (ketik > untuk perintah, :baris, @simbol)'
                "
                class="w-full bg-white/[0.04] text-white text-xs font-mono placeholder:text-slate-500 pl-3 pr-8 py-2 rounded-xl border border-white/[0.08] focus:border-[#42b883]/50 focus:bg-white/[0.06] focus:outline-none transition-all shadow-inner"
                @keydown="handlePaletteKeydown"
              />
              <button
                v-if="searchKeyword"
                @click="searchKeyword = ''"
                class="absolute right-2 text-slate-500 hover:text-white transition-colors cursor-pointer p-0.5 rounded-full hover:bg-white/10"
                title="Bersihkan input"
              >
                <UIcon name="i-lucide-x" class="size-3.5" />
              </button>
            </div>

            <!-- Mode Badges -->
            <div class="flex items-center gap-1.5 flex-shrink-0 select-none">
              <span
                v-if="searchMode === 'files'"
                class="text-[10px] text-[#42b883] bg-[#42b883]/15 border border-[#42b883]/30 px-2 py-1 rounded-xl font-mono font-medium"
              >
                Ctrl+E
              </span>
              <span
                v-else-if="searchMode === 'commands'"
                class="text-[10px] text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 px-2 py-1 rounded-xl font-mono font-medium"
              >
                Perintah (&gt;)
              </span>
              <span
                v-else-if="searchMode === 'goto-line'"
                class="text-[10px] text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded-xl font-mono font-medium"
              >
                Baris (:)
              </span>
              <span
                v-else-if="searchMode === 'symbols'"
                class="text-[10px] text-cyan-400 bg-cyan-500/15 border border-cyan-500/30 px-2 py-1 rounded-xl font-mono font-medium"
              >
                Simbol (@)
              </span>

              <!-- Close Modal Button -->
              <button
                @click="workspaceStore.closeQuickOpen"
                class="size-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer border border-transparent"
                title="Tutup (Esc)"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </div>
          </div>

          <!-- Context Stats & Pagination Bar -->
          <div class="px-4 py-1.5 bg-[#0a0f19] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400 select-none">
            <!-- Left: Match and File counts with Range info -->
            <div class="flex items-center gap-2 font-mono">
              <span v-if="isLoadingFiles" class="flex items-center gap-1.5 text-[#42b883]">
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
                <span>Mengindeks berkas workspace...</span>
              </span>
              <template v-else>
                <span v-if="searchMode === 'commands'" class="text-slate-300">
                  {{ filteredCommands.length }} perintah tersedia
                </span>
                <span v-else-if="searchMode === 'symbols'" class="text-slate-300">
                  {{ activeSymbols.length }} simbol di berkas aktif
                </span>
                <span v-else-if="totalMatchedCount > 0" class="flex items-center gap-1.5">
                  <span class="text-[#42b883] font-bold">
                    {{ (currentPage - 1) * PAGE_SIZE + 1 }} - {{ Math.min(currentPage * PAGE_SIZE, totalMatchedCount) }}
                  </span>
                  <span>di</span>
                  <span class="text-white font-bold">{{ totalMatchedCount }}</span>
                  <span>berkas</span>
                  <span v-if="totalPages > 1" class="text-slate-500 font-normal">(Hal. {{ currentPage }}/{{ totalPages }})</span>
                </span>
                <span v-else class="text-slate-500">
                  Tidak ada berkas yang cocok
                </span>
              </template>
            </div>

            <!-- Right: Pagination Buttons when in files mode -->
            <div v-if="searchMode === 'files' && totalMatchedCount > 0" class="flex items-center gap-2 font-mono">
              <!-- Pagination: Sebelumnya (Prev) -->
              <button
                @click="prevPage"
                :disabled="currentPage <= 1 || isLoadingFiles"
                class="px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1 transition-all"
                :class="
                  currentPage > 1 && !isLoadingFiles
                    ? 'bg-white/[0.05] hover:bg-[#42b883]/20 text-slate-200 hover:text-[#42b883] border border-white/[0.08] hover:border-[#42b883]/30 cursor-pointer shadow-xs active:scale-95'
                    : 'bg-white/[0.01] text-slate-600 border border-white/[0.03] cursor-not-allowed opacity-50'
                "
                title="Halaman Sebelumnya (Alt+Left)"
              >
                <UIcon name="i-lucide-chevron-left" class="size-3" />
                <span>Sebelumnya</span>
              </button>

              <!-- Pagination: Selanjutnya (Next 100) -->
              <button
                @click="nextPage"
                :disabled="currentPage >= totalPages || isLoadingFiles"
                class="px-2.5 py-0.5 rounded-lg text-[11px] flex items-center gap-1 transition-all font-medium"
                :class="
                  currentPage < totalPages && !isLoadingFiles
                    ? 'bg-[#42b883]/15 hover:bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 cursor-pointer shadow-xs active:scale-95'
                    : 'bg-white/[0.01] text-slate-600 border border-white/[0.03] cursor-not-allowed opacity-50'
                "
                title="Cari 100 Berkas Berikutnya (Alt+Right)"
              >
                <span>Selanjutnya</span>
                <UIcon name="i-lucide-chevron-right" class="size-3" />
              </button>
            </div>
          </div>

          <!-- Results List Container -->
          <div
            ref="listContainerRef"
            class="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scroll select-none min-h-[160px] max-h-[58vh]"
          >
            <!-- 1. MODE: COMMANDS (>) -->
            <template v-if="searchMode === 'commands'">
              <div
                v-for="(cmd, idx) in filteredCommands"
                :id="`quick-item-${idx}`"
                :key="cmd.id"
                @click="cmd.action"
                @mouseenter="selectedIndex = idx"
                class="group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none border"
                :class="selectedIndex === idx
                  ? 'bg-gradient-to-r from-indigo-500/20 via-indigo-500/10 to-transparent border-indigo-500/40 text-white shadow-sm pl-2.5 translate-x-0.5'
                  : 'border-transparent text-slate-300 hover:bg-white/[0.04]'"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                  <div class="w-6.5 h-6.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                    <UIcon :name="cmd.icon" class="size-3.5" />
                  </div>
                  <div class="flex items-center gap-2 truncate">
                    <span class="font-medium text-slate-200 group-hover:text-white truncate">
                      {{ cmd.title }}
                    </span>
                    <span class="text-[10px] text-slate-500 bg-white/[0.04] px-1.5 py-0.2 rounded border border-white/[0.06] font-sans">
                      {{ cmd.category }}
                    </span>
                  </div>
                </div>

                <span
                  v-if="cmd.shortcut"
                  class="text-[10px] font-mono text-slate-400 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md"
                >
                  {{ cmd.shortcut }}
                </span>
              </div>
            </template>

            <!-- 2. MODE: GOTO LINE (:) -->
            <template v-else-if="searchMode === 'goto-line'">
              <div
                v-if="targetLineNumber"
                :id="`quick-item-0`"
                @click="executeSelection"
                class="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none border bg-amber-500/15 border-amber-500/40 text-white shadow-sm"
              >
                <div class="flex items-center gap-2.5">
                  <div class="w-6.5 h-6.5 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 flex-shrink-0">
                    <UIcon name="i-lucide-arrow-down-to-line" class="size-3.5" />
                  </div>
                  <span class="font-medium text-amber-200">
                    Lompat ke baris <strong>{{ targetLineNumber }}</strong> pada {{ workspaceStore.activeTab.title || 'berkas aktif' }}
                  </span>
                </div>
                <UIcon name="i-lucide-corner-down-left" class="size-3.5 text-amber-300" />
              </div>
              <div v-else class="px-4 py-8 text-center text-xs text-slate-500">
                Ketik nomor baris tujuan (misal: <code class="text-amber-400">:45</code>) lalu tekan Enter
              </div>
            </template>

            <!-- 3. MODE: SYMBOLS (@) -->
            <template v-else-if="searchMode === 'symbols'">
              <div
                v-for="(sym, idx) in activeSymbols"
                :id="`quick-item-${idx}`"
                :key="`${sym.name}-${sym.line}`"
                @click="executeSelection"
                @mouseenter="selectedIndex = idx"
                class="group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none border"
                :class="selectedIndex === idx
                  ? 'bg-gradient-to-r from-cyan-500/20 via-cyan-500/10 to-transparent border-cyan-500/40 text-white shadow-sm pl-2.5 translate-x-0.5'
                  : 'border-transparent text-slate-300 hover:bg-white/[0.04]'"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <div class="w-6.5 h-6.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0">
                    <UIcon :name="sym.icon" class="size-3.5" />
                  </div>
                  <span class="font-mono text-xs font-semibold text-slate-200 group-hover:text-white truncate">
                    {{ sym.name }}
                  </span>
                  <span class="text-[10px] text-cyan-400/80 uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-500/10 border border-cyan-500/20">
                    {{ sym.kind }}
                  </span>
                </div>
                <span class="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                  L{{ sym.line }}
                </span>
              </div>
            </template>

            <!-- 4. MODE: FILES SEARCH (Default) -->
            <template v-else>
              <div
                v-if="!isLoadingFiles && allMatchedFiles.length === 0"
                class="py-12 flex flex-col items-center justify-center text-center space-y-2"
              >
                <UIcon name="i-lucide-file-question" class="size-8 text-slate-600" />
                <div class="text-xs font-medium text-slate-400">Tidak ada berkas yang cocok dengan pencarian</div>
              </div>

              <div
                v-for="(file, index) in pagedFilteredFiles"
                :id="`quick-item-${index}`"
                :key="file.path"
                @click="executeSelection"
                @mouseenter="selectedIndex = index"
                class="group flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none border"
                :class="selectedIndex === index
                  ? 'bg-gradient-to-r from-[#42b883]/20 via-[#42b883]/10 to-transparent border-[#42b883]/40 text-white shadow-sm pl-2.5 translate-x-0.5'
                  : 'border-transparent text-slate-300 hover:bg-white/[0.04]'"
              >
                <div class="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                  <!-- File Icon (Dynamic Nuxt Icon) -->
                  <i :class="getNuxtFileIcon(file.name)" class="text-sm flex-shrink-0"></i>

                  <!-- Highlighted File Name and Breadcrumb -->
                  <div class="flex items-baseline gap-2 truncate min-w-0 flex-1">
                    <span class="font-mono text-xs font-semibold text-slate-200 group-hover:text-white truncate flex-shrink-0">
                      <template v-for="(seg, sIdx) in getHighlightedSegments(file.name, cleanFileQuery)" :key="sIdx">
                        <span
                          v-if="seg.match"
                          class="text-[#42b883] font-bold underline decoration-[#42b883]/50"
                        >{{ seg.text }}</span>
                        <span v-else>{{ seg.text }}</span>
                      </template>
                    </span>

                    <!-- Project Root & Folder Path Dimmed Breadcrumb -->
                    <div
                      v-if="file.rootName || file.folderPath"
                      class="text-[11px] text-slate-400 truncate font-mono select-none flex items-center gap-1.5 flex-shrink min-w-0"
                    >
                      <span v-if="file.rootName" class="text-slate-300 font-medium truncate">{{ file.rootName }}</span>
                      <span v-if="file.rootName && file.folderPath" class="text-slate-600 flex-shrink-0">•</span>
                      <span v-if="file.folderPath" class="text-slate-500 truncate">{{ file.folderPath }}</span>
                    </div>
                  </div>
                </div>

                <!-- Badges on right: Aktif / Terbuka / Line indicator -->
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    v-if="targetLineNumber"
                    class="text-[9px] px-1.5 py-0.5 rounded-md font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  >
                    :{{ targetLineNumber }}
                  </span>
                  <span
                    v-if="workspaceStore.activeTab.filePath === file.path"
                    class="text-[9px] px-1.5 py-0.5 rounded-md font-mono font-medium bg-[#42b883]/15 text-[#42b883] border border-[#42b883]/30 flex items-center gap-1"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] animate-pulse"></span>
                    <span>Aktif</span>
                  </span>
                  <span
                    v-else-if="workspaceStore.tabList.some((t) => t.filePath === file.path)"
                    class="text-[9px] px-1.5 py-0.5 rounded-md font-mono text-slate-400 bg-white/[0.04] border border-white/[0.08]"
                  >
                    Terbuka
                  </span>
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    :class="{ '!opacity-100 text-[#42b883]': selectedIndex === index }"
                  />
                </div>
              </div>
            </template>
          </div>

          <!-- Palette Footer & Shortcut Hints -->
          <div class="px-4 py-2 bg-[#090d15] border-t border-white/[0.06] flex items-center justify-between text-[10.5px] text-slate-500 select-none">
            <div class="flex items-center gap-3">
              <span class="flex items-center gap-1">
                <kbd class="px-1 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↑</kbd>
                <kbd class="px-1 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↓</kbd>
                <span>Navigasi</span>
              </span>
              <span class="flex items-center gap-1">
                <kbd class="px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↵</kbd>
                <span>Buka</span>
              </span>
              <span class="flex items-center gap-1">
                <kbd class="px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">Esc</kbd>
                <span>Tutup</span>
              </span>
            </div>

            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
              <span class="hover:text-slate-300 cursor-pointer" @click="searchKeyword = '>'">&gt; Perintah</span>
              <span>•</span>
              <span class="hover:text-slate-300 cursor-pointer" @click="searchKeyword = ':'">: Baris</span>
              <span>•</span>
              <span class="hover:text-slate-300 cursor-pointer" @click="searchKeyword = '@'">@ Simbol</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 5px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.4);
}
</style>
