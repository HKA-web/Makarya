<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useAgentStore } from '@renderer/stores/agentStore'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()

const searchKeyword = ref('')
const debouncedKeyword = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchKeyword, (val) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  // Instant update for empty keyword or prefix command modes (>, :, @)
  if (!val || val.startsWith('>') || val.startsWith(':') || val.startsWith('@')) {
    debouncedKeyword.value = val
    return
  }
  // Debounce regular file fuzzy search by 100ms for lightweight, lag-free typing
  debounceTimer = setTimeout(() => {
    debouncedKeyword.value = val
    debounceTimer = null
  }, 100)
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
    title: 'Tentang Makarya App (About)',
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

// Ambil seluruh daftar file dari semua project yang dibuka
async function refreshWorkspaceFiles(): Promise<void> {
  const rootPaths = workspaceStore.workspaceRoots.map((r) => r.path)
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

// Advanced Antigravity-Style Fuzzy Scoring
function calculateFuzzyScore(file: IndexedFile, query: string): number {
  const fileName = file.name.toLowerCase()
  const relPath = file.relativePath.toLowerCase()
  const fullSearch = (file.rootName ? file.rootName.toLowerCase() + '/' : '') + relPath

  // Exact file name match
  if (fileName === query) return 2000

  // File name starts with query
  if (fileName.startsWith(query)) return 1500

  // File name includes exact query
  const fnIdx = fileName.indexOf(query)
  if (fnIdx !== -1) {
    return 1000 - fnIdx * 10
  }

  // Relative path includes query (e.g. "payroll/detail")
  const pathIdx = fullSearch.indexOf(query)
  if (pathIdx !== -1) {
    return 800 - pathIdx * 5
  }

  // Subsequence match across path (e.g. "wbm" -> "WelcomeModule.vue")
  let qIdx = 0
  let score = 0
  let consecutive = 0
  let prevMatchedIdx = -10

  for (let i = 0; i < fullSearch.length && qIdx < query.length; i++) {
    const char = fullSearch[i]
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

      // Word boundary bonuses: after slash, dot, underscore, hyphen
      if (i === 0 || fullSearch[i - 1] === '/' || fullSearch[i - 1] === '\\' || fullSearch[i - 1] === '.' || fullSearch[i - 1] === '_' || fullSearch[i - 1] === '-') {
        score += 40
      }

      // Bonus if matched inside the filename itself
      if (i >= fullSearch.length - fileName.length) {
        score += 30
      }

      prevMatchedIdx = i
    }
  }

  if (qIdx === query.length) {
    return score
  }

  return 0
}

// Logika cerdas fuzzy search & recent files
const filteredFiles = computed<IndexedFile[]>(() => {
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

    // 3. Jika belum ada recent/tab, tampilkan beberapa berkas pertama dari workspace
    if (resultList.length === 0) {
      return allProjectFiles.value.slice(0, 40)
    }

    return resultList.slice(0, 40)
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

  return matches.slice(0, 60).map((m) => m.file)
})

// Unified items count for navigation
const currentItemsCount = computed(() => {
  if (searchMode.value === 'commands') return filteredCommands.value.length
  if (searchMode.value === 'symbols') return activeSymbols.value.length
  if (searchMode.value === 'goto-line') return targetLineNumber.value ? 1 : 0
  return filteredFiles.value.length
})

watch([filteredFiles, filteredCommands, activeSymbols, searchMode], () => {
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
      selectedIndex.value = 0
      await refreshWorkspaceFiles()
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }
)

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

  // Files mode
  const items = filteredFiles.value
  if (items.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < items.length) {
    const selected = items[selectedIndex.value]
    workspaceStore.closeQuickOpen()
    workspaceStore.openFile(selected.path, selected.name, targetLineNumber.value)
  }
}

function handleFileClick(file: IndexedFile): void {
  workspaceStore.closeQuickOpen()
  workspaceStore.openFile(file.path, file.name, targetLineNumber.value)
}

function handlePaletteKeydown(event: KeyboardEvent): void {
  const isModifier = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  // Antigravity Quick Open cycling: Ctrl+E / Ctrl+P moves selection to next item
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
    if (count > 0) {
      selectedIndex.value = Math.min(count - 1, selectedIndex.value + 6)
      scrollToSelected()
    }
  } else if (event.key === 'PageUp') {
    event.preventDefault()
    if (count > 0) {
      selectedIndex.value = Math.max(0, selectedIndex.value - 6)
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
      qIdx++
      segments.push({ text: char, match: true })
    } else {
      segments.push({ text: char, match: false })
    }
  }

  return segments
}
</script>

<template>
  <Dialog
    v-model:visible="workspaceStore.isQuickOpenVisible"
    modal
    :closable="false"
    :dismissableMask="true"
    :style="{ width: '640px', maxWidth: '94vw', marginTop: '4vh' }"
    :position="'top'"
    :pt="{
      root: {
        class: 'relative bg-[#0b101b]/95 backdrop-blur-2xl border border-white/[0.12] text-slate-100 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] p-0 overflow-hidden ring-1 ring-white/[0.08] transition-all duration-200'
      },
      mask: {
        class: 'bg-black/65 backdrop-blur-xs transition-all duration-200'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Glow Accent Line (Emerald Vue/Antigravity Green) -->
    <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883] to-transparent shadow-[0_0_12px_#42b883]"></div>

    <!-- Search Input Box -->
    <div class="px-4 py-3.5 border-b border-white/[0.08] flex items-center gap-3 bg-white/[0.02]">
      <!-- Dynamic Prefix Icon -->
      <div class="flex items-center justify-center flex-shrink-0">
        <UIcon
          v-if="searchMode === 'commands'"
          name="i-lucide-terminal"
          class="size-5 text-indigo-400 animate-pulse"
        />
        <UIcon
          v-else-if="searchMode === 'goto-line'"
          name="i-lucide-arrow-down-to-line"
          class="size-5 text-amber-400 animate-pulse"
        />
        <UIcon
          v-else-if="searchMode === 'symbols'"
          name="i-lucide-at-sign"
          class="size-5 text-cyan-400 animate-pulse"
        />
        <UIcon
          v-else
          name="i-lucide-search"
          class="size-5 text-[#42b883] animate-pulse"
        />
      </div>

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
        class="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none font-sans tracking-wide"
        @keydown="handlePaletteKeydown"
      />

      <!-- Clear keyword button -->
      <button
        v-if="searchKeyword"
        @click="searchKeyword = ''"
        class="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
        title="Bersihkan input"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>

      <!-- Badge shortcut info -->
      <div class="flex items-center gap-1.5 flex-shrink-0 select-none">
        <span
          v-if="searchMode === 'files'"
          class="text-[10px] text-[#42b883] bg-[#42b883]/15 border border-[#42b883]/30 px-2 py-0.5 rounded-md font-mono font-medium"
        >
          Ctrl+E
        </span>
        <span
          v-else-if="searchMode === 'commands'"
          class="text-[10px] text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded-md font-mono font-medium"
        >
          Perintah (>)
        </span>
        <span
          v-else-if="searchMode === 'goto-line'"
          class="text-[10px] text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md font-mono font-medium"
        >
          Baris (:)
        </span>
        <span class="text-[10px] text-slate-500 font-mono">
          ESC
        </span>
      </div>
    </div>

    <!-- Context Header Sub-bar -->
    <div class="px-4 py-1.5 bg-white/[0.01] border-b border-white/[0.04] flex items-center justify-between text-[11px] text-slate-400 select-none">
      <div class="flex items-center gap-1.5 font-medium">
        <template v-if="searchMode === 'commands'">
          <UIcon name="i-lucide-command" class="size-3.5 text-indigo-400" />
          <span>Daftar Perintah & Aksi</span>
        </template>
        <template v-else-if="searchMode === 'goto-line'">
          <UIcon name="i-lucide-list-ordered" class="size-3.5 text-amber-400" />
          <span>Lompat ke Baris di Berkas Aktif</span>
        </template>
        <template v-else-if="searchMode === 'symbols'">
          <UIcon name="i-lucide-braces" class="size-3.5 text-cyan-400" />
          <span>Simbol & Fungsi ({{ workspaceStore.activeTab.title }})</span>
        </template>
        <template v-else>
          <UIcon :name="cleanFileQuery ? 'i-lucide-list-filter' : 'i-lucide-history'" class="size-3.5 text-[#42b883]" />
          <span>{{ cleanFileQuery ? 'Hasil Pencarian Berkas' : 'Berkas Terbuka & Riwayat Terakhir' }}</span>
        </template>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="isLoadingFiles" class="flex items-center gap-1 text-[#42b883]">
          <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
          <span>Mengindeks berkas...</span>
        </span>
        <span v-else class="text-[10px] text-slate-500 font-mono">
          <template v-if="searchMode === 'commands'">{{ filteredCommands.length }} perintah</template>
          <template v-else-if="searchMode === 'symbols'">{{ activeSymbols.length }} simbol</template>
          <template v-else>{{ filteredFiles.length }} dari {{ allProjectFiles.length }} berkas</template>
        </span>
      </div>
    </div>

    <!-- Results List Container -->
    <div class="max-h-[380px] overflow-y-auto p-2 space-y-0.5 custom-scroll">
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
          class="flex items-center gap-3 px-3 py-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 cursor-pointer select-none"
        >
          <UIcon name="i-lucide-arrow-right-circle" class="size-5 text-amber-400 flex-shrink-0 animate-pulse" />
          <div>
            <div class="font-semibold text-white text-xs">
              Lompat ke Baris <span class="text-amber-300 font-mono font-bold">{{ targetLineNumber }}</span>
            </div>
            <div class="text-[11px] text-slate-400 font-sans">
              Tekan Enter untuk membuka baris {{ targetLineNumber }} pada {{ workspaceStore.activeTab.title }}
            </div>
          </div>
        </div>
        <div v-else class="py-6 text-center text-slate-500 text-xs">
          Ketik nomor baris yang ingin dituju (contoh: <code class="text-amber-400">:42</code>)
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
            ? 'bg-cyan-500/15 border-cyan-500/30 text-white pl-2.5'
            : 'border-transparent text-slate-300 hover:bg-white/[0.04]'"
        >
          <div class="flex items-center gap-2.5 truncate">
            <UIcon :name="sym.icon" class="size-4 text-cyan-400 flex-shrink-0" />
            <span class="font-medium text-slate-200 group-hover:text-white truncate font-mono">
              {{ sym.name }}
            </span>
            <span class="text-[10px] text-slate-500 bg-white/[0.04] px-1.5 py-0.2 rounded font-mono">
              {{ sym.kind }}
            </span>
          </div>
          <span class="text-[10px] text-slate-500 font-mono">Baris {{ sym.line }}</span>
        </div>
        <div v-if="activeSymbols.length === 0" class="py-6 text-center text-slate-500 text-xs">
          Tidak ditemukan simbol fungsi dalam berkas ini.
        </div>
      </template>

      <!-- 4. MODE: FILES (DEFAULT FUZZY SEARCH) -->
      <template v-else>
        <!-- Empty State: No workspace folder opened -->
        <div
          v-if="workspaceStore.workspaceRoots.length === 0"
          class="py-8 px-4 text-center text-slate-400 space-y-2 select-none"
        >
          <UIcon name="i-lucide-folder-open" class="size-8 mx-auto text-slate-600 mb-1" />
          <p class="text-xs font-medium text-slate-300">Belum ada folder project yang dibuka</p>
          <p class="text-[11px] text-slate-500">Buka folder project terlebih dahulu untuk mencari berkas.</p>
        </div>

        <!-- Empty State: No search results found -->
        <div
          v-else-if="filteredFiles.length === 0"
          class="py-8 px-4 text-center text-slate-400 space-y-1.5 select-none"
        >
          <UIcon name="i-lucide-file-x" class="size-8 mx-auto text-slate-600 mb-1" />
          <p class="text-xs font-medium text-slate-300">Tidak ada berkas yang cocok</p>
          <p class="text-[11px] text-slate-500">
            Coba kata kunci lain atau periksa ejaan berkas yang Anda cari.
          </p>
        </div>

        <!-- List Items (Antigravity Style: File Name highlighted + Dimmed Folder Breadcrumb) -->
        <div
          v-for="(file, index) in filteredFiles"
          :id="`quick-item-${index}`"
          :key="file.path"
          @click="handleFileClick(file)"
          @mouseenter="selectedIndex = index"
          class="group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none"
          :class="selectedIndex === index
            ? 'bg-white/[0.08] text-white shadow-sm border-l-2 border-[#42b883] pl-2.5'
            : 'text-slate-300 hover:bg-white/[0.04] border-l-2 border-transparent'"
        >
          <div class="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
            <!-- File Icon based on extension -->
            <UIcon
              :name="getNuxtFileIcon(file.name, false).icon"
              class="size-4.5 flex-shrink-0"
              :class="getNuxtFileIcon(file.name, false).colorClass"
            />

            <!-- File Name with Matched Character Highlight & Clean Folder Path -->
            <div class="flex items-baseline gap-2 min-w-0 truncate">
              <!-- Primary File Name -->
              <span
                class="font-medium truncate tracking-tight text-[12.5px]"
                :class="selectedIndex === index ? 'text-white font-semibold' : 'text-slate-100'"
              >
                <template v-for="(seg, sIdx) in getHighlightedSegments(file.name, cleanFileQuery)" :key="sIdx">
                  <span
                    v-if="seg.match"
                    class="text-[#42b883] font-bold underline decoration-[#42b883]/50"
                  >{{ seg.text }}</span>
                  <span v-else>{{ seg.text }}</span>
                </template>
              </span>

              <!-- Project Root & Folder Path Dimmed Breadcrumb (Gambar 2 Style: Root • Subfolder) -->
              <div
                v-if="file.rootName || file.folderPath"
                class="text-[11px] text-slate-400 truncate font-mono select-none flex items-center gap-1.5 flex-shrink min-w-0"
              >
                <span v-if="file.rootName" class="text-slate-300 font-medium truncate">{{ file.rootName }}</span>
                <span v-if="file.rootName && file.folderPath" class="text-slate-600 flex-shrink-0">•</span>
                <span v-if="file.folderPath" class="text-slate-400 truncate">{{ file.folderPath }}</span>
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
    <div class="px-4 py-2 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400 select-none">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">↑</kbd>
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">↓</kbd>
          <span class="text-slate-500 ml-0.5">Navigasi</span>
        </span>
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">↵</kbd>
          <span class="text-slate-500 ml-0.5">Buka</span>
        </span>
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">esc</kbd>
          <span class="text-slate-500 ml-0.5">Tutup</span>
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
  </Dialog>
</template>
