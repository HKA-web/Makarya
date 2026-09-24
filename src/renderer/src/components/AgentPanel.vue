<script setup lang="ts">
import { ref, watch, nextTick, onMounted, onUnmounted, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAgentStore, type AgentToolCallItem } from '../stores/agentStore'
import { useSettingsStore } from '../stores/settingsStore'
import { parseMarkdownBlocks, formatInlineMarkdown } from '../utils/markdownParser'
import { getNuxtFileIcon, detectMonacoLanguage } from '../utils/languageDetector'
import logoImg from '../assets/logo.png'
import iconImg from '../assets/icon.png'

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()
const settingsStore = useSettingsStore()
const toast = useToast()

const inputPrompt = ref('')
const messagesContainerRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

// Clipboard & Attached Images
const attachedImages = ref<string[]>([])
const previewImageUrl = ref<string | null>(null)

// Drag and Drop & Tagged Context Files
export interface AttachedFileItem {
  path: string
  name: string
  isDirectory?: boolean
  lineRange?: string
  startLine?: number
  endLine?: number
  selectedSnippet?: string
  language?: string
}
const attachedFiles = ref<AttachedFileItem[]>([])
const isDraggingOver = ref<boolean>(false)
let dragCounter = 0

// @ Mention File / Context State
interface MentionCandidate {
  name: string
  path: string
  isDirectory: boolean
  badge?: string
}
const showMentionMenu = ref<boolean>(false)
const mentionQuery = ref<string>('')
const selectedMentionIndex = ref<number>(0)
const projectFilesCache = ref<Array<{ name: string; path: string; isDirectory: boolean }>>([])

// Dynamic Resizable Width (drag from left border)
const panelWidth = ref<number>(340)
const isResizing = ref<boolean>(false)

function startResize(e: MouseEvent): void {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = panelWidth.value

  function onMouseMove(moveEvent: MouseEvent): void {
    const delta = startX - moveEvent.clientX
    const newWidth = Math.max(260, Math.min(650, startWidth + delta))
    panelWidth.value = newWidth
  }

  function onMouseUp(): void {
    isResizing.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Track open/collapsed state for thinking process and tool call outputs
const userToggledThoughts = ref<Record<string, boolean>>({})
const expandedTools = ref<Record<string, boolean>>({})

// Floating menus
const isModelMenuOpen = ref<boolean>(false)
const modelSearchQuery = ref<string>('')
const isAttachMenuOpen = ref<boolean>(false)
const showSlashMenu = ref<boolean>(false)
const isWorkspaceMenuOpen = ref<boolean>(false)
const isSettingsMenuOpen = ref<boolean>(false)
const sessionSearchQuery = ref<string>('')

const filteredSessions = computed(() => {
  const query = sessionSearchQuery.value.trim().toLowerCase()
  if (!query) return agentStore.sessionsList
  return agentStore.sessionsList.filter((s) => {
    return (
      s.title.toLowerCase().includes(query) ||
      (s.lastMessage && s.lastMessage.toLowerCase().includes(query)) ||
      s.model.toLowerCase().includes(query)
    )
  })
})

function formatSessionDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60)
    if (diffHours < 24 && now.getDate() === d.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}

function handleOpenSessionsModal(): void {
  agentStore.loadSessions()
  agentStore.isSessionsModalOpen = true
}

const connectedProject = computed(() => {
  // 1. If explicit connectedWorkspacePath is set
  const explicitPath = agentStore.connectedWorkspacePath
  if (explicitPath) {
    const norm = explicitPath.toLowerCase().replace(/\\/g, '/')
    const match = workspaceStore.workspaceRoots.find(
      (r) => r.path.toLowerCase().replace(/\\/g, '/') === norm
    )
    if (match) return match
    const name = explicitPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    return { path: explicitPath, name }
  }

  // 2. Automatic fallback: If any project root is opened in workspaceStore, automatically connect!
  const autoRoot = workspaceStore.activeRootPath
    ? workspaceStore.workspaceRoots.find(
        (r) => r.path.toLowerCase().replace(/\\/g, '/') === workspaceStore.activeRootPath!.toLowerCase().replace(/\\/g, '/')
      )
    : workspaceStore.workspaceRoots[0]

  if (autoRoot) {
    agentStore.setConnectedWorkspacePath(autoRoot.path)
    return autoRoot
  }

  return null
})

function disconnectTargetWorkspace(): void {
  agentStore.setConnectedWorkspacePath(null)
  toast.add({
    severity: 'info',
    summary: 'Folder Target Dilepas',
    detail: 'Folder target project telah dilepas.',
    life: 2000
  })
}

function toggleWorkspaceMenu(): void {
  isSettingsMenuOpen.value = !isSettingsMenuOpen.value
}

function selectTargetWorkspace(root: { path: string; name: string }): void {
  agentStore.setConnectedWorkspacePath(root.path)
  workspaceStore.activeRootPath = root.path
  isSettingsMenuOpen.value = false
  isWorkspaceMenuOpen.value = false
  toast.add({
    severity: 'success',
    summary: 'Ruang Kerja Terhubung',
    detail: `Agen sekarang siap bekerja di folder "${root.name}"`,
    life: 2500
  })
}

async function handleAddFolderForAgent(): Promise<void> {
  if (!window.makaryaAPI?.openFolderDialog) return
  try {
    const res = await window.makaryaAPI.openFolderDialog()
    if (!res.canceled && res.folderPath) {
      await workspaceStore.addWorkspaceRoot(res.folderPath, res.entries)
      agentStore.setConnectedWorkspacePath(res.folderPath)
      isSettingsMenuOpen.value = false
      isWorkspaceMenuOpen.value = false
      const folderName = res.folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || res.folderPath
      toast.add({
        severity: 'success',
        summary: 'Folder Ditambahkan & Terhubung',
        detail: `Folder "${folderName}" berhasil ditambahkan dan terkunci untuk agen.`,
        life: 3000
      })
    }
  } catch (err: any) {
    toast.add({
      severity: 'error',
      summary: 'Gagal Menambah Folder',
      detail: err?.message || 'Terjadi kesalahan saat membuka folder',
      life: 3000
    })
  }
}

const filteredModels = computed(() => {
  if (!modelSearchQuery.value.trim()) {
    return agentStore.availableModels
  }
  const q = modelSearchQuery.value.toLowerCase().trim()
  return agentStore.availableModels.filter((m) => m.toLowerCase().includes(q))
})

const slashActions = [
  { prefix: '/test', label: 'Test Sintaks File Aktif', icon: 'i-lucide-check-circle-2', prompt: 'Jalankan test sintaks pada file aktif ini dan periksa apakah ada error.' },
  { prefix: '/git', label: 'Cek Git Status', icon: 'i-lucide-git-branch', prompt: "Jalankan 'git status' di terminal dan rangkumkan perubahannya." },
  { prefix: '/review', label: 'Tinjau Perubahan (Review Changes)', icon: 'i-lucide-file-diff', prompt: 'Tinjau semua perubahan kode saat ini (git diff & git status) dan berikan ulasan ringkas.' },
  { prefix: '/debug', label: 'Audit Bug & Keamanan', icon: 'i-lucide-shield-alert', prompt: 'Analisis potensi bug dan kelemahan keamanan pada file yang sedang dibuka, lalu berikan saran perbaikan.' },
  { prefix: '/explain', label: 'Jelaskan Kode File Aktif', icon: 'i-lucide-book-open', prompt: 'Jelaskan cara kerja dan struktur file yang sedang saya buka ini secara terstruktur.' }
]

const filteredSlashActions = computed(() => {
  if (!inputPrompt.value.startsWith('/')) return []
  const query = inputPrompt.value.toLowerCase()
  return slashActions.filter((action) => action.prefix.startsWith(query) || action.label.toLowerCase().includes(query.slice(1)))
})

function adjustTextareaHeight(): void {
  nextTick(() => {
    const el = textareaRef.value
    if (!el) return

    // Kembalikan tinggi ke 'auto' terlebih dahulu agar scrollHeight dapat menyusut saat karakter dihapus
    el.style.height = 'auto'

    // Jika kosong atau hanya whitespace, biarkan rows="1" menentukan tingginya (kembali normal 1 baris)
    if (!inputPrompt.value || inputPrompt.value.trim() === '') {
      el.style.overflowY = 'hidden'
      return
    }

    const maxHeight = 160
    const scrollHeight = el.scrollHeight

    if (scrollHeight > maxHeight) {
      el.style.height = `${maxHeight}px`
      el.style.overflowY = 'auto'
    } else {
      el.style.height = `${scrollHeight}px`
      el.style.overflowY = 'hidden'
    }
  })
}

function handleApprovalGlobalKeydown(e: KeyboardEvent): void {
  if (!e.altKey) return

  // Find any tool in agentStore.messages currently waiting for approval
  let waitingTool: AgentToolCallItem | undefined
  for (let i = agentStore.messages.length - 1; i >= 0; i--) {
    const msg = agentStore.messages[i]
    if (msg.toolCalls) {
      const found = msg.toolCalls.find((t) => t.status === 'waiting_approval')
      if (found) {
        waitingTool = found
        break
      }
    }
  }

  if (!waitingTool) return

  // Alt + Enter -> Accept
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    agentStore.approveToolCall(waitingTool.id, true)
    return
  }

  // Shift + Alt + Backspace / Delete -> Reject
  if (e.shiftKey && (e.key === 'Backspace' || e.key === 'Delete')) {
    e.preventDefault()
    e.stopPropagation()
    agentStore.approveToolCall(waitingTool.id, false)
    return
  }
}

onMounted(async () => {
  adjustTextareaHeight()
  agentStore.initListeners()
  window.addEventListener('makarya:tag-to-agent', handleTagToAgentEvent)
  window.addEventListener('makarya:focus-agent-chat', handleFocusAgentChat)
  window.addEventListener('keydown', handleApprovalGlobalKeydown, true)
  await agentStore.loadModels()
})

onUnmounted(() => {
  window.removeEventListener('makarya:tag-to-agent', handleTagToAgentEvent)
  window.removeEventListener('makarya:focus-agent-chat', handleFocusAgentChat)
  window.removeEventListener('keydown', handleApprovalGlobalKeydown, true)
})

// Auto scroll to bottom when new messages, thoughts, or tokens stream in
watch(
  () => [agentStore.messages, agentStore.activeRequestId],
  async () => {
    await nextTick()
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  },
  { deep: true }
)

// Check for slash command and @ mention triggers, plus dynamic auto-resize
watch(inputPrompt, (newVal) => {
  adjustTextareaHeight()

  // Slash commands
  if (newVal.startsWith('/') && newVal.length < 15 && !newVal.includes(' ')) {
    showSlashMenu.value = true
  } else {
    showSlashMenu.value = false
  }

  // @ mention file
  const mentionMatch = newVal.match(/(?:^|\s)@([a-zA-Z0-9_.\-\/\\]*)$/)
  if (mentionMatch) {
    mentionQuery.value = mentionMatch[1]
    showMentionMenu.value = true
    selectedMentionIndex.value = 0
  } else {
    showMentionMenu.value = false
  }
})

// Scan workspace directory tree in background for quick @ mention suggestions
async function refreshProjectFilesCache(): Promise<void> {
  const root = connectedProject.value?.path || workspaceStore.getEffectiveProjectRoot()
  if (!root || !window.makaryaAPI?.readDirectory) return

  const results: Array<{ name: string; path: string; isDirectory: boolean }> = []
  const queue: string[] = [root]
  const maxFiles = 350

  while (queue.length > 0 && results.length < maxFiles) {
    const current = queue.shift()!
    try {
      const entries = await window.makaryaAPI.readDirectory(current)
      for (const entry of entries) {
        if (results.length >= maxFiles) break
        const lower = entry.name.toLowerCase()
        if (
          lower === 'node_modules' ||
          lower === '.git' ||
          lower === '.nuxt' ||
          lower === 'dist' ||
          lower === 'vendor' ||
          lower === '.output' ||
          lower === '.idea' ||
          lower === '.vscode'
        ) {
          continue
        }
        results.push({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.isDirectory
        })
        if (entry.isDirectory) {
          queue.push(entry.path)
        }
      }
    } catch {
      // ignore read error on subdirectories
    }
  }

  projectFilesCache.value = results
}

watch(
  () => [connectedProject.value?.path, workspaceStore.workspaceRoots.length],
  () => {
    refreshProjectFilesCache()
  },
  { immediate: true }
)

const mentionCandidates = computed<MentionCandidate[]>(() => {
  const list: MentionCandidate[] = []
  const seenPaths = new Set<string>()

  // 1. Current active file in editor (Highest priority)
  if (workspaceStore.activeTab && workspaceStore.activeTab.filePath) {
    const norm = workspaceStore.activeTab.filePath.toLowerCase().replace(/\\/g, '/')
    seenPaths.add(norm)
    list.push({
      name: workspaceStore.activeTab.title,
      path: workspaceStore.activeTab.filePath,
      isDirectory: false,
      badge: 'File Aktif'
    })
  }

  // 2. Currently open editor tabs
  for (const tab of workspaceStore.tabList) {
    if (tab.filePath && tab.tabType === 'editor') {
      const norm = tab.filePath.toLowerCase().replace(/\\/g, '/')
      if (!seenPaths.has(norm)) {
        seenPaths.add(norm)
        list.push({
          name: tab.title,
          path: tab.filePath,
          isDirectory: false,
          badge: 'Tab Terbuka'
        })
      }
    }
  }

  // 3. Files from cached scan
  for (const item of projectFilesCache.value) {
    const norm = item.path.toLowerCase().replace(/\\/g, '/')
    if (!seenPaths.has(norm)) {
      seenPaths.add(norm)
      list.push({
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory
      })
    }
  }

  // 4. Fallback from workspace roots entries
  if (list.length <= 2 && workspaceStore.workspaceRoots.length > 0) {
    for (const root of workspaceStore.workspaceRoots) {
      for (const entry of root.entries) {
        const norm = entry.path.toLowerCase().replace(/\\/g, '/')
        if (!seenPaths.has(norm)) {
          seenPaths.add(norm)
          list.push({
            name: entry.name,
            path: entry.path,
            isDirectory: entry.isDirectory
          })
        }
      }
    }
  }

  return list
})

const filteredMentionCandidates = computed(() => {
  const q = mentionQuery.value.toLowerCase().trim()
  if (!q) {
    return mentionCandidates.value.slice(0, 15)
  }
  return mentionCandidates.value
    .filter((item) => item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 1 : 0
      const bStarts = b.name.toLowerCase().startsWith(q) ? 1 : 0
      return bStarts - aStarts
    })
    .slice(0, 15)
})

function selectMentionItem(item: MentionCandidate): void {
  addAttachedFile({
    path: item.path,
    name: item.name,
    isDirectory: item.isDirectory
  })

  // Strip @query from input
  inputPrompt.value = inputPrompt.value.replace(/(?:^|\s)@([a-zA-Z0-9_.\-\/\\]*)$/, (match) => {
    return match.startsWith(' ') ? ' ' : ''
  })

  showMentionMenu.value = false
  selectedMentionIndex.value = 0

  toast.add({
    severity: 'info',
    summary: item.isDirectory ? 'Folder Dilampirkan' : 'Berkas Dilampirkan',
    detail: item.name,
    life: 2000
  })

  nextTick(() => {
    const el = textareaRef.value?.$el || textareaRef.value
    el?.focus?.()
  })
}

function triggerMentionInput(): void {
  refreshProjectFilesCache()
  if (!inputPrompt.value.endsWith('@')) {
    inputPrompt.value += (inputPrompt.value && !inputPrompt.value.endsWith(' ') ? ' ' : '') + '@'
  }
  showMentionMenu.value = true
  selectedMentionIndex.value = 0
  nextTick(() => {
    const el = textareaRef.value?.$el || textareaRef.value
    el?.focus?.()
  })
}

function selectSlashAction(action: typeof slashActions[0]): void {
  if (!connectedProject.value?.path) {
    toast.add({
      severity: 'warn',
      summary: 'Target Project Diperlukan',
      detail: 'Silakan pilih atau buka folder target project terlebih dahulu sebelum mengobrol dengan Agen.',
      life: 3500
    })
    isSettingsMenuOpen.value = true
    return
  }
  inputPrompt.value = ''
  adjustTextareaHeight()
  showSlashMenu.value = false
  handleSendMessage(action.prompt)
}

function toggleThought(messageId: string, currentlyExpanded: boolean): void {
  userToggledThoughts.value[messageId] = !currentlyExpanded
}

function isThoughtExpanded(messageId: string, isThinking?: boolean): boolean {
  if (userToggledThoughts.value[messageId] !== undefined) {
    return userToggledThoughts.value[messageId]
  }
  return !!isThinking
}

function toggleToolOutput(toolCallId: string): void {
  expandedTools.value[toolCallId] = !expandedTools.value[toolCallId]
}

function isToolExpanded(tool: AgentToolCallItem): boolean {
  if (expandedTools.value[tool.id] !== undefined) {
    return expandedTools.value[tool.id]
  }
  return tool.status === 'running' || tool.status === 'error'
}

function getToolIcon(toolName: string): { icon: string; color: string } {
  switch (toolName) {
    case 'execute_command':
      return { icon: 'i-lucide-terminal', color: 'text-cyan-400' }
    case 'read_file':
      return { icon: 'i-lucide-file-text', color: 'text-amber-400' }
    case 'write_file':
      return { icon: 'i-lucide-file-pen', color: 'text-emerald-400' }
    case 'list_dir':
      return { icon: 'i-lucide-folder-search', color: 'text-indigo-400' }
    default:
      return { icon: 'i-lucide-wrench', color: 'text-slate-400' }
  }
}

function getToolDisplayLabel(tool: AgentToolCallItem): string {
  if (tool.name === 'execute_command') {
    return `$ ${tool.args?.command || 'terminal'}`
  }
  if (tool.name === 'read_file') {
    return `Baca: ${tool.args?.filePath || 'berkas'}`
  }
  if (tool.name === 'write_file') {
    return `Tulis: ${tool.args?.filePath || 'berkas'}`
  }
  if (tool.name === 'list_dir') {
    return `Daftar: ${tool.args?.dirPath || 'root'}`
  }
  return tool.name
}

function handlePaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (blob) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (result && !attachedImages.value.includes(result)) {
            attachedImages.value.push(result)
            toast.add({
              severity: 'info',
              summary: 'Gambar Ditempel',
              detail: 'Gambar dari clipboard berhasil dilampirkan',
              life: 2000
            })
          }
        }
        reader.readAsDataURL(blob)
      }
    }
  }
}

function removeAttachedImage(index: number): void {
  attachedImages.value.splice(index, 1)
}

function openImageLightbox(url: string): void {
  previewImageUrl.value = url
}

function closeImageLightbox(): void {
  previewImageUrl.value = null
}

function triggerFileInput(): void {
  fileInputRef.value?.click()
}

function handleFileInputChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files) return

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (result && !attachedImages.value.includes(result)) {
          attachedImages.value.push(result)
        }
      }
      reader.readAsDataURL(file)
    }
  }
  target.value = ''
}

function formatRelativePath(fullPath: string): string {
  const root = workspaceStore.getEffectiveProjectRoot()
  if (root && fullPath.toLowerCase().startsWith(root.toLowerCase())) {
    const rel = fullPath.slice(root.length).replace(/^[\\/]/, '')
    return rel ? `.../${rel.replace(/\\/g, '/')}` : ''
  }
  const parts = fullPath.replace(/\\/g, '/').split('/')
  if (parts.length > 3) {
    return '.../' + parts.slice(-3).join('/')
  }
  return fullPath
}

function addAttachedFile(fileItem: AttachedFileItem): void {
  const exists = attachedFiles.value.some(
    (f) =>
      f.path.toLowerCase() === fileItem.path.toLowerCase() &&
      (f.lineRange || '') === (fileItem.lineRange || '')
  )
  if (!exists) {
    attachedFiles.value.push(fileItem)
  }
}

function handleTagToAgentEvent(e: Event): void {
  const customEvent = e as CustomEvent<AttachedFileItem>
  const detail = customEvent.detail
  if (!detail) return

  const existingIndex = attachedFiles.value.findIndex(
    (f) =>
      f.path.toLowerCase() === detail.path.toLowerCase() &&
      (f.lineRange || '') === (detail.lineRange || '')
  )

  if (existingIndex >= 0) {
    attachedFiles.value[existingIndex] = {
      ...attachedFiles.value[existingIndex],
      ...detail
    }
  } else {
    attachedFiles.value.push({
      path: detail.path,
      name: detail.name,
      isDirectory: detail.isDirectory,
      lineRange: detail.lineRange,
      startLine: detail.startLine,
      endLine: detail.endLine,
      selectedSnippet: detail.selectedSnippet,
      language: detail.language
    })
  }

  nextTick(() => {
    setTimeout(() => {
      textareaRef.value?.focus()
      adjustTextareaHeight()
    }, 60)
  })
}

function handleFocusAgentChat(): void {
  nextTick(() => {
    setTimeout(() => {
      textareaRef.value?.focus()
      adjustTextareaHeight()
    }, 60)
  })
}

async function navigateToCode(path?: string, name?: string, startLine?: number, endLine?: number): Promise<void> {
  if (!path) return
  const fileName = name || path.split(/[/\\]/).pop() || 'file'
  await workspaceStore.openFile(path, fileName)
  if (startLine) {
    nextTick(() => {
      setTimeout(() => {
        const editor = workspaceStore.getActiveEditorInstance()
        if (editor) {
          editor.revealLineInCenter(startLine)
          if (endLine && endLine > startLine) {
            editor.setSelection({
              startLineNumber: startLine,
              startColumn: 1,
              endLineNumber: endLine,
              endColumn: editor.getModel()?.getLineMaxColumn(endLine) || 1
            })
          } else {
            editor.setPosition({ lineNumber: startLine, column: 1 })
          }
          editor.focus()
        }
      }, 100)
    })
  }
}

function removeAttachedFile(index: number): void {
  attachedFiles.value.splice(index, 1)
}

function handleDragEnter(e: DragEvent): void {
  e.preventDefault()
  dragCounter++
  if (e.dataTransfer && e.dataTransfer.types.length > 0) {
    isDraggingOver.value = true
  }
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  isDraggingOver.value = true
}

function handleDragLeave(e: DragEvent): void {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDraggingOver.value = false
  }
}

async function handleDrop(e: DragEvent): Promise<void> {
  e.preventDefault()
  dragCounter = 0
  isDraggingOver.value = false

  if (!e.dataTransfer) return

  // 1. Cek format custom dari File Explorer (FileTreeNode.vue)
  const makaryaRaw = e.dataTransfer.getData('makarya/file-entry')
  if (makaryaRaw) {
    try {
      const entry = JSON.parse(makaryaRaw)
      if (entry && entry.path) {
        addAttachedFile({
          path: entry.path,
          name: entry.name || entry.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || entry.path,
          isDirectory: !!entry.isDirectory
        })
        toast.add({
          severity: 'info',
          summary: entry.isDirectory ? 'Folder Dilampirkan' : 'Berkas Dilampirkan',
          detail: entry.name || entry.path,
          life: 2000
        })
        return
      }
    } catch {
      // lanjut ke fallback
    }
  }

  // 2. Cek text/plain (path file teks)
  const plainText = e.dataTransfer.getData('text/plain')

  // 3. Cek native files dari OS Explorer atau browser
  const dtFiles = e.dataTransfer.files
  if (dtFiles && dtFiles.length > 0) {
    for (let i = 0; i < dtFiles.length; i++) {
      const f = dtFiles[i]
      if (f.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (readEv) => {
          const result = readEv.target?.result as string
          if (result && !attachedImages.value.includes(result)) {
            attachedImages.value.push(result)
          }
        }
        reader.readAsDataURL(f)
        continue
      }

      // Berkas atau folder biasa
      const nativePath = (f as any).path || plainText || f.name
      const fileName = f.name || nativePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'berkas'
      addAttachedFile({
        path: nativePath,
        name: fileName,
        isDirectory: false
      })
    }
    toast.add({
      severity: 'info',
      summary: 'Berkas Dilampirkan',
      detail: `${dtFiles.length} berkas berhasil ditambahkan`,
      life: 2000
    })
    return
  }

  // 4. Fallback jika ada teks berupa path
  if (plainText && (plainText.includes('/') || plainText.includes('\\'))) {
    const fileName = plainText.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || plainText
    addAttachedFile({
      path: plainText.trim(),
      name: fileName,
      isDirectory: false
    })
    toast.add({
      severity: 'info',
      summary: 'Berkas Dilampirkan',
      detail: fileName,
      life: 2000
    })
  }
}

async function handleSendMessage(customPrompt?: string): Promise<void> {
  if (!connectedProject.value?.path) {
    toast.add({
      severity: 'warn',
      summary: 'Target Project Diperlukan',
      detail: 'Silakan pilih atau buka folder target project terlebih dahulu sebelum mengobrol dengan Agen.',
      life: 3500
    })
    isSettingsMenuOpen.value = true
    return
  }

  if (!agentStore.selectedModel) {
    toast.add({
      severity: 'error',
      summary: 'Model AI Belum Terdeteksi',
      detail: 'Tidak ada model AI yang dipilih atau 9router belum aktif. Silakan hubungkan 9router Anda.',
      life: 3500
    })
    isSettingsMenuOpen.value = true
    return
  }

  const promptText = (customPrompt || inputPrompt.value).trim()
  const imagesToSend = customPrompt ? [] : [...attachedImages.value]
  const filesToSend = customPrompt ? [] : [...attachedFiles.value]

  if ((!promptText && imagesToSend.length === 0 && filesToSend.length === 0) || agentStore.isGenerating) return

  inputPrompt.value = ''
  adjustTextareaHeight()
  attachedImages.value = []
  attachedFiles.value = []
  showSlashMenu.value = false
  isModelMenuOpen.value = false
  isAttachMenuOpen.value = false
  isSettingsMenuOpen.value = false

  const activeTab = workspaceStore.activeTab
  const activeFileContext =
    activeTab && activeTab.filePath
      ? {
          filePath: activeTab.filePath,
          fileName: activeTab.title,
          content: activeTab.content,
          language: activeTab.language
        }
      : undefined

  const effectiveProjectRoot = connectedProject.value?.path || workspaceStore.getEffectiveProjectRoot()

  // Baca isi berkas yang dilampirkan via IPC
  let attachedContexts: Array<{
    filePath: string
    fileName: string
    content?: string
    language?: string
    lineRange?: string
    startLine?: number
    endLine?: number
    selectedSnippet?: string
  }> | undefined = undefined

  if (filesToSend.length > 0) {
    attachedContexts = await Promise.all(
      filesToSend.map(async (f) => {
        let content = ''
        if (f.selectedSnippet) {
          content = f.selectedSnippet
        } else if (!f.isDirectory && window.makaryaAPI?.readFile) {
          try {
            content = await window.makaryaAPI.readFile(f.path)
          } catch (err) {
            console.warn(`Gagal membaca berkas lampiran ${f.path}:`, err)
            content = `(Gagal membaca berkas: ${err})`
          }
        } else if (f.isDirectory) {
          content = `(Folder direktori: ${f.path})`
        }
        return {
          filePath: f.path,
          fileName: f.name,
          content,
          language: f.language || detectMonacoLanguage(f.name),
          lineRange: f.lineRange,
          startLine: f.startLine,
          endLine: f.endLine,
          selectedSnippet: f.selectedSnippet
        }
      })
    )
  }

  await agentStore.sendMessage(
    promptText,
    activeFileContext,
    effectiveProjectRoot,
    imagesToSend.length > 0 ? imagesToSend : undefined,
    attachedContexts
  )
}

function handleKeydown(event: KeyboardEvent): void {
  // 1. Mention Menu Keyboard Navigation
  if (showMentionMenu.value && filteredMentionCandidates.value.length > 0) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedMentionIndex.value = (selectedMentionIndex.value + 1) % filteredMentionCandidates.value.length
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedMentionIndex.value =
        (selectedMentionIndex.value - 1 + filteredMentionCandidates.value.length) %
        filteredMentionCandidates.value.length
      return
    }
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      const item = filteredMentionCandidates.value[selectedMentionIndex.value] || filteredMentionCandidates.value[0]
      if (item) {
        selectMentionItem(item)
      }
      return
    }
    if (event.key === 'Escape') {
      showMentionMenu.value = false
      return
    }
  }

  // 2. Slash Menu Keyboard Navigation
  if (showSlashMenu.value && filteredSlashActions.value.length > 0) {
    if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault()
      selectSlashAction(filteredSlashActions.value[0])
      return
    }
    if (event.key === 'Escape') {
      showSlashMenu.value = false
      return
    }
  }

  // 3. Send Message
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    if (!connectedProject.value?.path) {
      toast.add({
        severity: 'warn',
        summary: 'Target Project Diperlukan',
        detail: 'Silakan pilih atau buka folder target project terlebih dahulu sebelum mengobrol dengan Agen.',
        life: 3500
      })
      isSettingsMenuOpen.value = true
      return
    }
    handleSendMessage()
  }
}

function handleReviewChanges(): void {
  handleSendMessage('Tinjau semua perubahan kode saat ini (jalankan git status dan git diff) dan berikan ulasan ringkas.')
}

async function handleCopyText(text: string, label: string = 'Teks'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.trim())
    toast.add({
      severity: 'info',
      summary: 'Berhasil Disalin',
      detail: `${label} berhasil disalin ke clipboard`,
      life: 2000
    })
  } catch (copyError) {
    console.error('Failed to copy text:', copyError)
  }
}

function handleApplyToActiveEditor(codeSnippet: string): void {
  const activeTab = workspaceStore.activeTab
  if (!activeTab || activeTab.tabType === 'welcome') {
    toast.add({
      severity: 'warn',
      summary: 'Tidak Ada File Aktif',
      detail: 'Buka file di editor terlebih dahulu untuk menerapkan kode',
      life: 2500
    })
    return
  }

  workspaceStore.updateTabContent(activeTab.id, codeSnippet.trim())
  toast.add({
    severity: 'success',
    summary: 'Kode Diterapkan',
    detail: `Kode berhasil diterapkan ke file "${activeTab.title}"`,
    life: 2500
  })
}

function toggleModelMenu(): void {
  isModelMenuOpen.value = !isModelMenuOpen.value
  if (isModelMenuOpen.value) {
    isWorkspaceMenuOpen.value = false
  }
  if (!isModelMenuOpen.value) {
    modelSearchQuery.value = ''
  }
}

function selectModel(modelName: string): void {
  agentStore.setSelectedModel(modelName)
  settingsStore.ai.defaultModel = modelName
  isModelMenuOpen.value = false
  isSettingsMenuOpen.value = false
  modelSearchQuery.value = ''
}

function triggerVoiceNotice(): void {
  toast.add({
    severity: 'info',
    summary: 'Voice Input',
    detail: 'Fitur input suara akan segera hadir di pembaruan berikutnya.',
    life: 2000
  })
}

// Expandable state for message modifiedFiles cards
const expandedMessageFiles = ref<Record<string, boolean>>({})

function toggleMessageFilesExpanded(messageId: string): void {
  expandedMessageFiles.value = {
    ...expandedMessageFiles.value,
    [messageId]: !expandedMessageFiles.value[messageId]
  }
}

async function handleReviewMessageFiles(
  files?: Array<{
    filePath: string
    fileName: string
    additions: number
    deletions: number
    originalContent?: string
    newContent?: string
  }>
): Promise<void> {
  if (!files || files.length === 0) return

  // 1. Ensure all files from this message are present in sessionModifiedFiles so bottom drawer appears
  for (const f of files) {
    const norm = f.filePath.replace(/\\/g, '/').toLowerCase()
    const existing = agentStore.sessionModifiedFiles.find((s) => s.filePath.replace(/\\/g, '/').toLowerCase() === norm)
    if (!existing) {
      agentStore.sessionModifiedFiles.push({
        filePath: f.filePath,
        fileName: f.fileName,
        additions: f.additions,
        deletions: f.deletions,
        originalContent: f.originalContent,
        newContent: f.newContent
      })
    }
    // 2. Set pending diff in workspaceStore so Monaco editor renders the diff
    if (f.originalContent !== undefined && f.newContent !== undefined) {
      workspaceStore.setPendingDiff(f.filePath, f.originalContent, f.newContent)
    }
  }

  // 3. Open and focus the first file
  const first = files[0]
  if (first) {
    await workspaceStore.openFile(first.filePath, first.fileName)
  }
}

async function openFileWithDiff(file: {
  filePath: string
  fileName: string
  additions: number
  deletions: number
  originalContent?: string
  newContent?: string
}): Promise<void> {
  const norm = file.filePath.replace(/\\/g, '/').toLowerCase()
  const existing = agentStore.sessionModifiedFiles.find((s) => s.filePath.replace(/\\/g, '/').toLowerCase() === norm)
  if (!existing) {
    agentStore.sessionModifiedFiles.push({
      filePath: file.filePath,
      fileName: file.fileName,
      additions: file.additions,
      deletions: file.deletions,
      originalContent: file.originalContent,
      newContent: file.newContent
    })
  }

  if (file.originalContent !== undefined && file.newContent !== undefined) {
    workspaceStore.setPendingDiff(file.filePath, file.originalContent, file.newContent)
  }

  await workspaceStore.openFile(file.filePath, file.fileName)
}
</script>

<template>
  <div
    :style="{ width: `${panelWidth}px` }"
    class="h-full flex flex-col bg-[#090d14] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 text-slate-100 font-sans relative overflow-hidden shadow-sm transition-all"
    :class="{ 'ring-2 ring-[#42b883] border-[#42b883]/60': isDraggingOver }"
    @dragenter.prevent="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave.prevent="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <!-- Drag & Drop Visual Overlay (Antigravity Nuxt Style) -->
    <div
      v-if="isDraggingOver"
      class="absolute inset-0 z-50 bg-[#090d14]/90 backdrop-blur-sm border-2 border-dashed border-[#42b883] rounded-2xl flex flex-col items-center justify-center p-6 text-center pointer-events-none animate-fade-in"
    >
      <div class="w-14 h-14 rounded-2xl bg-[#42b883]/20 border border-[#42b883]/50 flex items-center justify-center mb-3 shadow-lg shadow-[#42b883]/25 animate-bounce">
        <UIcon name="i-lucide-arrow-down-to-line" class="size-7 text-[#42b883]" />
      </div>
      <h3 class="text-sm font-bold text-white mb-1">Lepaskan Berkas di Sini</h3>
      <p class="text-[11px] text-slate-300 max-w-[220px] leading-relaxed">
        Tarik berkas dari File Explorer atau Windows Explorer untuk dilampirkan ke obrolan agen
      </p>
    </div>

    <!-- Left Resize Drag Handle -->
    <div
      @mousedown.prevent="startResize"
      class="absolute top-0 bottom-0 -left-1 w-2 cursor-col-resize z-40 hover:bg-[#42b883]/60 transition-colors"
      :class="{ 'bg-[#42b883]/70': isResizing }"
      title="Tarik untuk mengubah lebar panel AI"
    ></div>

    <!-- Chat Sessions History Modal / Drawer Overlay -->
    <div
      v-if="agentStore.isSessionsModalOpen"
      class="absolute inset-0 bg-[#070b13]/92 backdrop-blur-md z-50 flex flex-col p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] flex-shrink-0">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-lg bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883]">
            <UIcon name="i-lucide-history" class="size-3.5" />
          </div>
          <div>
            <div class="text-xs font-semibold text-white leading-tight">Riwayat Sesi Obrolan</div>
            <div class="text-[10px] text-slate-400">Pilih sesi untuk melanjutkan obrolan</div>
          </div>
        </div>
        <button
          @click="agentStore.isSessionsModalOpen = false"
          class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Tutup riwayat"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>

      <!-- Action: Mulai Sesi Baru -->
      <button
        @click="agentStore.createNewSession()"
        class="w-full py-2 px-3 rounded-xl bg-[#42b883] hover:bg-[#34d399] text-[#090d14] font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#42b883]/25 active:scale-98 transition-all cursor-pointer flex-shrink-0"
      >
        <UIcon name="i-lucide-plus-circle" class="size-4 text-[#090d14]" />
        <span>Mulai Obrolan Baru</span>
      </button>

      <!-- Search Input -->
      <div class="relative flex-shrink-0">
        <UIcon name="i-lucide-search" class="size-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          v-model="sessionSearchQuery"
          type="text"
          placeholder="Cari sesi obrolan..."
          class="w-full bg-[#080d16] border border-white/[0.08] focus:border-[#42b883]/50 focus:ring-1 focus:ring-[#42b883]/20 rounded-xl pl-7 pr-7 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none transition-all"
        />
        <button
          v-if="sessionSearchQuery"
          @click="sessionSearchQuery = ''"
          class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
        >
          <UIcon name="i-lucide-x" class="size-3" />
        </button>
      </div>

      <!-- Scrollable Sessions List (Master) -->
      <div class="flex-1 overflow-y-auto space-y-2 pr-1 custom-scroll">
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          @click="agentStore.switchSession(session.id)"
          class="p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 group relative"
          :class="session.id === agentStore.currentSessionId
            ? 'bg-[#42b883]/15 border-[#42b883]/45 shadow-sm shadow-[#42b883]/10'
            : 'bg-[#0f1624]/60 hover:bg-[#131d2e] border-white/[0.06] hover:border-white/[0.12]'"
        >
          <!-- Title & Active Badge & Delete Button -->
          <div class="flex items-center justify-between gap-1.5">
            <div class="flex items-center gap-1.5 min-w-0 pr-1">
              <span
                v-if="session.id === agentStore.currentSessionId"
                class="w-1.5 h-1.5 rounded-full bg-[#42b883] vue-pulse-dot flex-shrink-0"
              ></span>
              <span class="text-xs font-semibold text-slate-100 truncate group-hover:text-[#42b883] transition-colors">
                {{ session.title }}
              </span>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              <span
                v-if="session.id === agentStore.currentSessionId"
                class="text-[9px] px-1.5 py-0.5 rounded-full bg-[#42b883]/20 text-[#42b883] font-semibold"
              >
                Aktif
              </span>
              <button
                @click.stop="agentStore.deleteSession(session.id)"
                class="w-5 h-5 rounded-md flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                title="Hapus sesi ini"
              >
                <UIcon name="i-lucide-trash-2" class="size-3" />
              </button>
            </div>
          </div>

          <!-- Last Message Preview -->
          <p v-if="session.lastMessage" class="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
            {{ session.lastMessage }}
          </p>

          <!-- Footer Metadata: Message count, Model, Time -->
          <div class="flex items-center justify-between text-[9px] text-slate-500 pt-0.5 border-t border-white/[0.04]">
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-message-square" class="size-2.5 text-slate-400" />
              <span>{{ session.messageCount }} pesan</span>
              <span>•</span>
              <span class="text-slate-400 font-mono">{{ session.model }}</span>
            </span>
            <span class="font-mono text-slate-400">
              {{ formatSessionDate(session.updatedAt) }}
            </span>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredSessions.length === 0" class="py-10 text-center flex flex-col items-center justify-center text-slate-500 space-y-2">
          <UIcon name="i-lucide-history" class="size-8 text-slate-600" />
          <p class="text-xs font-medium text-slate-400">
            {{ sessionSearchQuery ? 'Sesi obrolan tidak ditemukan' : 'Belum ada riwayat sesi obrolan' }}
          </p>
          <p class="text-[10px] text-slate-500 max-w-[200px]">
            Sesi obrolan akan otomatis tersimpan di SQLite saat Anda mulai mengirim pesan.
          </p>
        </div>
      </div>
    </div>

    <!-- Compact Copilot & Autonomous Agent Header -->
    <div class="h-9 px-3 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold bg-[#0b101b]/95 backdrop-blur-md">
      <div class="flex items-center gap-2">
        <img :src="iconImg" alt="Makarya" class="h-5 w-auto object-contain" />
        <span class="vue-gradient-text font-bold tracking-wide text-xs">
          Makarya AI Agent
        </span>
      </div>

      <div class="flex items-center gap-1.5">
        <!-- History Sessions Modal Trigger Button -->
        <button
          @click="handleOpenSessionsModal"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-white/[0.06] transition-colors cursor-pointer group"
          title="Riwayat Sesi Obrolan"
        >
          <UIcon name="i-lucide-history" class="size-3.5 group-hover:rotate-[-20deg] transition-transform" />
        </button>

        <!-- New Chat Session Button -->
        <button
          @click="agentStore.createNewSession()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Mulai Sesi Obrolan Baru"
        >
          <UIcon name="i-lucide-square-pen" class="size-3.5" />
        </button>

        <!-- Clear Chat Button -->
        <button
          @click="agentStore.clearHistory"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Bersihkan Riwayat Percakapan"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>

        <!-- Close / Collapse Panel Button -->
        <button
          @click="workspaceStore.toggleCopilotPanel"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Tutup Panel AI (Ctrl+B)"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Chat Messages Scroll Area (Compact) -->
    <div ref="messagesContainerRef" class="flex-1 overflow-y-auto p-3 text-[11px] relative">
      <!-- DEFAULT HERO STATE (Gambar 2 Style, shown when messages.length === 0) -->
      <div
        v-if="agentStore.messages.length === 0"
        class="min-h-full flex flex-col items-center justify-center py-6 px-2 text-center select-none"
      >
        <!-- Glow Logo Card (Gambar 2) -->
        <div class="relative group mb-4">
          <div class="absolute -inset-1.5 bg-gradient-to-r from-[#42b883]/30 via-[#34d399]/20 to-[#42b883]/30 rounded-3xl blur-md opacity-75 group-hover:opacity-100 transition duration-500"></div>
          <div class="relative w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-[#0c121d] border border-[#42b883]/35 shadow-xl shadow-[#42b883]/15 flex items-center justify-center p-3.5">
            <img :src="iconImg" alt="Makarya" class="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(66,184,131,0.6)]" />
          </div>
        </div>

        <!-- Title -->
        <h2 class="text-base sm:text-lg font-bold tracking-tight text-white mb-1.5 flex items-center justify-center gap-1.5">
          <span class="vue-gradient-text">Makarya AI Agent</span>
        </h2>

        <!-- Subtitle -->
        <p class="text-[11px] text-slate-400 text-center max-w-[270px] leading-relaxed mb-4">
          Asisten coding cerdas terintegrasi. Sambungkan agen ke folder project kerja agar pemindaian berkas dan aksi agen terkunci cepat di dalam folder tersebut.
        </p>

        <!-- Target Project Connected Badge (Tampil hanya saat target sudah terhubung) -->
        <div
          v-if="connectedProject"
          class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-[#42b883]/30 text-[10px] text-slate-300 flex items-center gap-2 max-w-[95%] shadow-xs"
        >
          <span class="w-2 h-2 rounded-full bg-[#42b883] vue-pulse-dot flex-shrink-0"></span>
          <span class="text-slate-400 font-medium flex-shrink-0">Target:</span>
          <span class="font-mono text-[#42b883] truncate text-[10px]" :title="connectedProject.path">
            {{ connectedProject.name }}
          </span>
        </div>

        <!-- Quick Action Suggestion Chips -->
        <div class="mt-6 w-full max-w-[290px]">
          <p class="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1.5 tracking-wide mb-2">
            <UIcon name="i-lucide-sparkles" class="size-3 text-[#42b883]" />
            <span>Aksi Cepat:</span>
          </p>
          <div class="flex flex-wrap items-center justify-center gap-1.5">
            <button
              @click="handleSendMessage('Jalankan syntax test pada file aktif ini.')"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/[0.03] hover:bg-[#42b883]/10 border border-white/[0.08] hover:border-[#42b883]/50 text-slate-300 hover:text-white transition-all shadow-xs cursor-pointer group"
            >
              <UIcon name="i-lucide-check-circle-2" class="size-3 text-[#42b883] group-hover:scale-110 transition-transform" />
              <span>Test Sintaks</span>
            </button>
            <button
              @click="handleSendMessage('Jalankan git status di terminal.')"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/[0.03] hover:bg-[#42b883]/10 border border-white/[0.08] hover:border-[#42b883]/50 text-slate-300 hover:text-white transition-all shadow-xs cursor-pointer group"
            >
              <UIcon name="i-lucide-git-branch" class="size-3 text-[#42b883] group-hover:scale-110 transition-transform" />
              <span>Git Status</span>
            </button>
            <button
              @click="handleReviewChanges"
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-white/[0.03] hover:bg-[#42b883]/10 border border-white/[0.08] hover:border-[#42b883]/50 text-slate-300 hover:text-white transition-all shadow-xs cursor-pointer group"
            >
              <UIcon name="i-lucide-file-diff" class="size-3 text-[#42b883] group-hover:scale-110 transition-transform" />
              <span>Review Changes</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Messages Stream List (When messages exist) -->
      <div v-else class="space-y-3">

      <!-- Messages Stream List -->
      <div
        v-for="message in agentStore.messages"
        :key="message.id"
        class="flex flex-col space-y-1.5"
        :class="message.role === 'user' ? 'items-end' : 'items-start'"
      >
        <!-- Role badge & timestamp -->
        <div class="flex items-center gap-1.5 text-[10px] text-slate-500 px-1">
          <span v-if="message.role === 'user'" class="font-semibold text-[#42b883] flex items-center gap-1">
            <UIcon name="i-lucide-user" class="size-3 text-[#42b883]" />
            Anda
          </span>
          <span v-else class="font-semibold text-[#42b883] flex items-center gap-1.5">
            <img :src="iconImg" alt="Makarya" class="h-4.5 w-auto object-contain" />
            Makarya Agent
          </span>
          <span>•</span>
          <span>{{ message.timestamp }}</span>
        </div>

        <!-- User Message Bubble (Nuxt UI Chat Bubble - Distinct Green Style) -->
        <div
          v-if="message.role === 'user'"
          class="max-w-[92%] bg-gradient-to-br from-[#185338] via-[#144730] to-[#0f3826] hover:from-[#1b5e40] hover:to-[#12432d] border border-[#42b883]/45 text-emerald-50 px-3.5 py-2 rounded-2xl rounded-tr-xs shadow-md shadow-[#42b883]/10 select-text font-normal space-y-1.5 text-[11px] transition-all"
        >
          <!-- Attached Files / Tagged Code Badge List in User Bubble -->
          <div v-if="message.attachedFiles && message.attachedFiles.length > 0" class="flex flex-wrap gap-1.5 pb-1">
            <button
              v-for="(af, afIdx) in message.attachedFiles"
              :key="afIdx"
              type="button"
              @click="navigateToCode(af.path, af.name, af.startLine, af.endLine)"
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/40 hover:bg-black/60 border border-[#42b883]/30 hover:border-[#42b883]/60 text-emerald-200 text-[10px] font-mono shadow-xs transition-colors cursor-pointer text-left"
              :title="af.path + (af.lineRange ? ` (${af.lineRange})\nKlik untuk lompat ke baris ini di editor` : '\nKlik untuk buka di editor')"
            >
              <UIcon
                :name="af.lineRange ? 'i-lucide-code-xml' : getNuxtFileIcon(af.name).icon"
                class="size-3 text-[#42b883] flex-shrink-0"
              />
              <span class="truncate max-w-[150px]">{{ af.name }}</span>
              <span
                v-if="af.lineRange"
                class="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold"
              >
                {{ af.lineRange }}
              </span>
            </button>
          </div>

          <!-- Attached Images Grid -->
          <div v-if="message.images && message.images.length > 0" class="flex flex-wrap gap-1.5 pt-0.5">
            <img
              v-for="(img, imgIdx) in message.images"
              :key="imgIdx"
              :src="img"
              alt="User Attachment"
              class="max-h-36 max-w-full rounded-lg border border-[#42b883]/30 object-contain cursor-pointer hover:opacity-90 transition-opacity bg-black/40"
              @click="openImageLightbox(img)"
            />
          </div>
          <div v-if="message.content" class="whitespace-pre-wrap leading-relaxed text-white font-medium">
            {{ message.content }}
          </div>
        </div>

        <!-- Assistant Container (Nuxt UI AI Assistant) -->
        <div
          v-else
          class="w-full space-y-1.5 select-text"
        >
          <!-- 1. Thinking Dropdown Header & Content (ChatReasoning) -->
          <div
            v-if="message.thoughts || message.isThinking || message.thinkingDurationSeconds"
            class="space-y-0.5"
          >
            <button
              @click="toggleThought(message.id, isThoughtExpanded(message.id, message.isThinking))"
              class="flex items-center gap-1.5 text-[10px] transition-colors cursor-pointer select-none font-medium py-0.5"
              :class="message.isThinking ? 'vue-shimmer-text font-semibold' : 'text-slate-400 hover:text-[#42b883]'"
            >
              <UIcon v-if="message.isThinking" name="i-lucide-loader-2" class="size-3 text-[#42b883] animate-spin" />
              <UIcon v-else name="i-lucide-sparkles" class="size-3 text-[#42b883]" />
              <span v-if="message.isThinking">Thinking for {{ message.thinkingDurationSeconds || 1 }}s...</span>
              <span v-else>Thought for {{ message.thinkingDurationSeconds || 1 }}s</span>
              <UIcon
                :name="isThoughtExpanded(message.id, message.isThinking) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 text-slate-400 ml-0.5"
              />
            </button>

            <!-- Collapsible Thinking Text Box -->
            <div
              v-show="isThoughtExpanded(message.id, message.isThinking)"
              class="pl-2.5 border-l-2 border-[#42b883]/60 bg-[#0e1626]/80 rounded-r-lg py-1.5 pr-2.5 text-slate-400 text-[10px] leading-relaxed select-text space-y-0.5 my-1 shadow-inner border-y border-r border-white/[0.04]"
            >
              <p class="whitespace-pre-wrap font-sans text-slate-300/90">
                {{ message.thoughts || 'Current analysis and execution plan is being formulated...' }}
              </p>
            </div>
          </div>

          <!-- 2. "Working..." indicator with Vue Green Glow (ChatShimmer) -->
          <div
            v-if="message.isStreaming && message.activeAction"
            class="flex items-center gap-1.5 text-[10px] font-medium py-0.5 px-0.5"
          >
            <span class="inline-block w-2 h-2 rounded-full vue-pulse-dot"></span>
            <span class="vue-shimmer-text font-semibold tracking-wide">
              {{ message.activeAction }}
            </span>
          </div>

          <!-- 3. Tool Execution Cards (Nuxt UI ChatTool) -->
          <div
            v-if="message.toolCalls && message.toolCalls.length > 0"
            class="space-y-1 my-1"
          >
            <div
              v-for="tool in message.toolCalls"
              :key="tool.id"
              class="rounded-xl border border-white/[0.08] bg-[#0c111c] overflow-hidden text-[10px] shadow-sm"
            >
              <!-- Tool Card Header -->
              <div
                @click="toggleToolOutput(tool.id)"
                class="px-2.5 py-1.5 bg-[#0e1626]/90 flex items-center justify-between cursor-pointer hover:bg-[#131d2e] transition-colors select-none"
              >
                <div class="flex items-center gap-1.5 truncate pr-2">
                  <UIcon :name="getToolIcon(tool.name).icon" :class="[getToolIcon(tool.name).color, 'size-3.5 flex-shrink-0']" />
                  <span class="font-mono text-slate-200 truncate font-medium">
                    {{ getToolDisplayLabel(tool) }}
                  </span>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <!-- Status Pill Badge in Pill Style -->
                  <span
                    v-if="tool.status === 'waiting_approval'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/35 shadow-xs animate-pulse"
                  >
                    <UIcon name="i-lucide-shield-alert" class="size-2.5 text-amber-400" />
                    <span>Minta Izin</span>
                  </span>
                  <span
                    v-else-if="tool.status === 'running'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 shadow-xs"
                  >
                    <UIcon name="i-lucide-loader-2" class="size-2.5 animate-spin text-cyan-400" />
                    <span>Menjalankan</span>
                  </span>
                  <span
                    v-else-if="tool.status === 'success'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-[#42b883]/10 text-[#42b883] border border-[#42b883]/25 shadow-xs"
                  >
                    <UIcon name="i-lucide-check-circle-2" class="size-2.5 text-[#42b883]" />
                    <span>Berhasil</span>
                    <span v-if="tool.durationMs" class="text-slate-400 text-[8px] ml-0.5">({{ tool.durationMs }}ms)</span>
                  </span>
                  <span
                    v-else-if="tool.status === 'error'"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/25 shadow-xs"
                  >
                    <UIcon name="i-lucide-x-circle" class="size-2.5 text-rose-400" />
                    <span>Gagal</span>
                  </span>

                  <!-- Collapse Icon -->
                  <UIcon
                    :name="isToolExpanded(tool) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-3 text-slate-400 ml-0.5"
                  />
                </div>
              </div>

              <!-- Approval Action Box (Ketika Auto Execution = Ask Before Execution) -->
              <div
                v-if="tool.status === 'waiting_approval'"
                class="p-2.5 bg-[#0a0f19] border-t border-amber-500/25 space-y-2 select-none animate-in fade-in duration-150"
              >
                <!-- Top Header & Command Block -->
                <div class="flex items-start gap-2">
                  <div class="w-5 h-5 rounded-md bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 mt-0.5">
                    <UIcon name="i-lucide-shield-alert" class="size-3" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-1.5">
                      <span class="font-semibold text-amber-300 text-[10px]">Konfirmasi Eksekusi Terminal</span>
                      <span class="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono flex-shrink-0">Ask Before</span>
                    </div>
                    <div
                      class="mt-1 px-2 py-1 rounded-md bg-[#070b12] border border-white/[0.08] font-mono text-[10px] text-emerald-300 font-medium truncate flex items-center gap-1.5 shadow-inner"
                      :title="tool.args?.command"
                    >
                      <span class="text-slate-500 select-none flex-shrink-0">$</span>
                      <span class="truncate">{{ tool.args?.command || getToolDisplayLabel(tool) }}</span>
                    </div>
                  </div>
                </div>

                <!-- Action Buttons: Antigravity Capsule Style (Matching Gambar 2) -->
                <div class="flex items-center gap-1.5 p-1 rounded-full bg-[#080d16] border border-white/[0.08] shadow-inner">
                  <!-- Accept Button -->
                  <button
                    type="button"
                    @click.stop="agentStore.approveToolCall(tool.id, true)"
                    class="flex-1 py-1.5 px-3 rounded-full bg-[#34c784] hover:bg-[#2eb376] text-slate-950 font-semibold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer hover:brightness-105 active:scale-95"
                    title="Accept & Jalankan Perintah (Alt+Enter)"
                  >
                    <span class="tracking-tight">Accept</span>
                    <span class="px-1.5 py-0.5 rounded-full bg-black/20 text-slate-950 font-mono text-[9px] font-bold leading-none select-none">Alt+↵</span>
                  </button>

                  <!-- Reject Button -->
                  <button
                    type="button"
                    @click.stop="agentStore.approveToolCall(tool.id, false)"
                    class="flex-1 py-1.5 px-3 rounded-full bg-[#24131d] hover:bg-[#321725] border border-[#78283d] text-[#f7a8b8] hover:text-white font-semibold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    title="Reject / Batalkan Perintah (Shift+Alt+Backspace)"
                  >
                    <span class="tracking-tight">Reject</span>
                    <span class="px-1.5 py-0.5 rounded-full bg-white/10 text-[#f7a8b8] font-mono text-[9px] font-medium leading-none select-none">Shift+Alt+⌫</span>
                  </button>
                </div>
              </div>

              <!-- Tool Output Accordion Body -->
              <div
                v-show="isToolExpanded(tool)"
                class="border-t border-[#35495e]/40 bg-[#090d14] p-2 space-y-1"
              >
                <div class="flex items-center justify-between text-[9px] text-slate-500 pb-0.5">
                  <span>Output Terminal / Berkas:</span>
                  <button
                    v-if="tool.output"
                    @click.stop="handleCopyText(tool.output, 'Output tool')"
                    class="hover:text-[#42b883] flex items-center gap-1 text-[8px] transition-colors cursor-pointer"
                  >
                    <UIcon name="i-lucide-copy" class="size-2.5" /> Salin Output
                  </button>
                </div>
                <pre
                  class="font-mono text-[9px] text-slate-300 overflow-x-auto p-2 bg-[#0c111a] rounded-md border border-white/[0.06] leading-relaxed whitespace-pre-wrap max-h-36 overflow-y-auto"
                ><code>{{ tool.output || '(Sedang mengeksekusi...)' }}</code></pre>
              </div>
            </div>
          </div>

          <!-- 4. Final Markdown Content & Code Blocks (Nuxt UI ChatMessage) -->
          <div
            v-if="message.content"
            class="bg-[#0e1626]/85 hover:bg-[#0e1626] border border-white/[0.06] text-slate-200 px-3.5 py-2.5 rounded-2xl rounded-tl-xs shadow-md space-y-1.5 mt-0.5 select-text transition-colors"
          >
            <div
              v-for="(block, blockIndex) in parseMarkdownBlocks(message.content)"
              :key="blockIndex"
              class="space-y-1"
            >
              <!-- Text Segment -->
              <div
                v-if="block.type === 'text'"
                class="leading-relaxed prose-invert text-[11px] text-slate-200 break-words"
                v-html="formatInlineMarkdown(block.content)"
              ></div>

              <!-- Code Block with Interactive Action Buttons -->
              <div
                v-else-if="block.type === 'code'"
                class="rounded-xl overflow-hidden border border-white/[0.08] bg-[#070b12] my-2 shadow-inner"
              >
                <!-- Code Block Header -->
                <div class="px-3 py-1.5 bg-[#0e1626] border-b border-white/[0.06] flex items-center justify-between text-[10px] text-slate-400">
                  <span class="font-mono text-[9px] text-[#42b883] font-semibold uppercase tracking-wider">
                    {{ block.language || 'code' }}
                  </span>
                  <div class="flex items-center gap-1.5">
                    <!-- Copy Code Button (Pill Style) -->
                    <button
                      @click="handleCopyText(block.content, 'Kode')"
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#42b883]/40 text-slate-300 hover:text-white transition-all cursor-pointer group"
                      title="Salin Kode ke Clipboard"
                    >
                      <UIcon name="i-lucide-copy" class="size-2.5 text-slate-400 group-hover:text-[#42b883] transition-colors" />
                      <span>Salin</span>
                    </button>

                    <!-- Apply to Active Editor Button (Pill Style) -->
                    <button
                      @click="handleApplyToActiveEditor(block.content)"
                      class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-xs shadow-[#42b883]/30 transition-all cursor-pointer active:scale-95"
                      title="Terapkan Langsung ke File Aktif di Editor"
                    >
                      <UIcon name="i-lucide-arrow-down-to-dot" class="size-2.5" />
                      <span>Terapkan</span>
                    </button>
                  </div>
                </div>

                <!-- Code Content -->
                <pre class="p-2.5 text-[10px] font-mono text-slate-200 overflow-x-auto leading-relaxed select-text whitespace-pre"><code>{{ block.content.trim() }}</code></pre>
              </div>
            </div>
          </div>

          <!-- 5. Files Changed Review Card (Nuxt UI Card) -->
          <div
            v-if="message.modifiedFiles && message.modifiedFiles.length > 0"
            class="rounded-xl bg-[#0e1626]/95 border border-white/[0.08] shadow-md my-1 select-none overflow-hidden"
          >
            <!-- Card Bar -->
            <div
              class="p-2.5 flex items-center justify-between cursor-pointer hover:bg-[#131d2e]/80 transition-colors"
              @click="toggleMessageFilesExpanded(message.id)"
              title="Klik untuk melihat daftar berkas yang diubah"
            >
              <div class="flex items-center gap-1.5 text-[10px]">
                <UIcon name="i-lucide-file-diff" class="size-3.5 text-[#42b883]" />
                <span class="font-semibold text-slate-200">
                  {{ message.modifiedFiles.length }} file{{ message.modifiedFiles.length > 1 ? 's' : '' }} changed
                </span>
                <span class="font-mono text-[9px] text-[#42b883] font-bold">
                  +{{ message.modifiedFiles.reduce((acc, f) => acc + f.additions, 0) }}
                </span>
                <span class="font-mono text-[9px] text-rose-400 font-bold">
                  -{{ message.modifiedFiles.reduce((acc, f) => acc + f.deletions, 0) }}
                </span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-3 text-slate-500 transition-transform duration-200 ml-0.5"
                  :class="{ 'rotate-90': expandedMessageFiles[message.id] }"
                />
              </div>
              <button
                @click.stop="handleReviewMessageFiles(message.modifiedFiles)"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-xs shadow-[#42b883]/30 transition-all cursor-pointer active:scale-95"
                title="Buka dan tinjau perubahan diff di Monaco Editor"
              >
                <UIcon name="i-lucide-eye" class="size-3" />
                <span>Review</span>
              </button>
            </div>

            <!-- Expandable File List in Message -->
            <div
              v-if="expandedMessageFiles[message.id]"
              class="border-t border-white/[0.06] divide-y divide-white/[0.04] bg-[#090d14]/70 text-[10px]"
            >
              <div
                v-for="file in message.modifiedFiles"
                :key="file.filePath"
                @click="openFileWithDiff(file)"
                class="px-3 py-2 flex items-center justify-between hover:bg-[#131d2e] cursor-pointer group transition-colors"
                title="Klik untuk membuka berkas dengan tampilan diff"
              >
                <div class="flex items-center gap-1.5 min-w-0 pr-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] flex-shrink-0"></span>
                  <span class="font-semibold text-slate-200 group-hover:text-[#42b883] truncate transition-colors">
                    {{ file.fileName }}
                  </span>
                  <span class="font-mono text-[9px] text-slate-500 truncate">
                    {{ formatRelativePath(file.filePath) }}
                  </span>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span class="font-mono text-[9px]">
                    <span class="text-[#42b883] font-semibold">+{{ file.additions }}</span>
                    <span class="text-rose-400 ml-0.5 font-semibold">-{{ file.deletions }}</span>
                  </span>
                  <button
                    @click.stop="openFileWithDiff(file)"
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#42b883]/40 text-slate-300 hover:text-white transition-all cursor-pointer"
                  >
                    <UIcon name="i-lucide-arrow-up-right" class="size-2.5 text-[#42b883]" />
                    <span>Buka</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Closing div for messages list v-else -->
      </div>
    </div>

    <!-- MODERN INPUT BAR (Nuxt UI ChatPrompt Floating Pill) -->
    <div class="p-3 pb-3.5 bg-[#090d14]/95 border-t border-white/[0.06] space-y-2 relative z-30">
      <!-- Files With Changes Drawer (Compact) -->
      <div
        v-if="agentStore.sessionModifiedFiles.length > 0"
        class="rounded-xl border border-white/[0.08] bg-[#0c111c]/95 shadow-2xl backdrop-blur-md overflow-hidden mb-2 select-none"
      >
        <!-- List of modified files -->
        <div class="divide-y divide-white/[0.04] max-h-36 overflow-y-auto">
          <div
            v-for="file in agentStore.sessionModifiedFiles"
            :key="file.filePath"
            @click="workspaceStore.openFile(file.filePath, file.fileName)"
            class="px-3 py-1.5 flex items-center justify-between hover:bg-[#131d2e] cursor-pointer transition-colors group text-[10px]"
          >
            <div class="flex items-center gap-1.5 min-w-0 pr-1.5">
              <!-- Bullet indicator -->
              <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] flex-shrink-0"></span>

              <!-- +X -Y diff badge -->
              <span class="font-mono text-[9px] font-semibold flex items-center gap-0.5 flex-shrink-0">
                <span class="text-[#42b883]">+{{ file.additions }}</span>
                <span class="text-rose-400">-{{ file.deletions }}</span>
              </span>

              <!-- File Name -->
              <span class="text-[11px] font-semibold text-slate-100 truncate group-hover:text-[#42b883] transition-colors">
                {{ file.fileName }}
              </span>

              <!-- Relative Path suffix -->
              <span class="text-[9px] text-slate-500 truncate font-mono">
                {{ formatRelativePath(file.filePath) }}
              </span>
            </div>

            <!-- Action buttons per file: Accept, Reject, Dismiss (Pill Style) -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <button
                @click.stop="agentStore.acceptFileChanges(file.filePath)"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-xs shadow-[#42b883]/30 transition-all cursor-pointer active:scale-95"
                title="Accept seluruh perubahan file ini"
              >
                <UIcon name="i-lucide-check" class="size-2.5" />
                <span>Accept</span>
              </button>
              <button
                @click.stop="agentStore.rejectFileChanges(file.filePath)"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 transition-all cursor-pointer"
                title="Reject perubahan file ini"
              >
                <UIcon name="i-lucide-x" class="size-2.5 text-rose-400" />
                <span>Reject</span>
              </button>
              <button
                @click.stop="agentStore.removeModifiedFile(file.filePath)"
                class="w-4 h-4 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                title="Tutup berkas dari daftar"
              >
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </div>
          </div>
        </div>

        <!-- Bottom Action Row: N Files With Changes, Reject all, Accept all (Pill Style) -->
        <div class="px-3 py-2 bg-[#090d14]/90 border-t border-white/[0.06] flex items-center justify-between text-[10px]">
          <div class="flex items-center gap-1.5 text-slate-400 font-medium">
            <UIcon name="i-lucide-file-diff" class="size-3 text-[#42b883]" />
            <span>{{ agentStore.sessionModifiedFiles.length }} File{{ agentStore.sessionModifiedFiles.length > 1 ? 's' : '' }} Changed</span>
          </div>

          <div class="flex items-center gap-2">
            <!-- Reject all -->
            <button
              @click="agentStore.rejectAllChanges"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 hover:text-rose-200 transition-all cursor-pointer active:scale-95"
            >
              <UIcon name="i-lucide-x-circle" class="size-3 text-rose-400" />
              <span>Reject all</span>
            </button>

            <!-- Accept all button -->
            <button
              @click="agentStore.acceptAllChanges"
              class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-md shadow-[#42b883]/30 transition-all cursor-pointer active:scale-95"
            >
              <UIcon name="i-lucide-check-check" class="size-3" />
              <span>Accept all</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Slash Commands Suggestions Dropdown -->
      <div
        v-if="showSlashMenu && filteredSlashActions.length > 0"
        class="absolute bottom-16 left-2 right-2 bg-[#0c111a] border border-[#35495e]/70 rounded-xl shadow-2xl p-1.5 z-40 space-y-0.5"
      >
        <div class="px-2 py-1 text-[9px] text-[#42b883] font-semibold uppercase tracking-wider">
          Aksi Cepat Slash (Tekan Tab atau Klik)
        </div>
        <button
          v-for="action in filteredSlashActions"
          :key="action.prefix"
          @click="selectSlashAction(action)"
          class="w-full px-2.5 py-1.5 rounded-lg hover:bg-[#42b883]/15 text-left flex items-center justify-between text-[11px] text-slate-200 hover:text-white transition-colors group"
        >
          <div class="flex items-center gap-2">
            <UIcon :name="action.icon" class="size-3.5 text-[#42b883]" />
            <span class="font-mono font-semibold text-[#42b883]">{{ action.prefix }}</span>
            <span class="text-slate-400 group-hover:text-slate-200 text-[10px]">{{ action.label }}</span>
          </div>
          <span class="text-[9px] text-slate-500 font-mono">↵</span>
        </button>
      </div>

      <!-- Mention @ Context & Files Dropdown Popup (Antigravity Style) -->
      <div
        v-if="showMentionMenu && filteredMentionCandidates.length > 0"
        class="absolute bottom-16 left-2 right-2 bg-[#0c111c]/95 border border-white/[0.1] backdrop-blur-xl rounded-2xl shadow-2xl p-2 z-40 space-y-1 select-none max-h-64 flex flex-col animate-in fade-in zoom-in-95 duration-100"
      >
        <!-- Header -->
        <div class="px-2 py-1 flex items-center justify-between text-[10px] text-slate-400 font-semibold border-b border-white/[0.06] pb-1.5 mb-0.5">
          <span class="text-[#42b883] flex items-center gap-1.5 font-bold">
            <UIcon name="i-lucide-at-sign" class="size-3.5" />
            Lampirkan Berkas / Konteks (@)
          </span>
          <span class="text-[9px] text-slate-500 font-mono">
            Gunakan ↑ ↓ lalu Tab / ↵
          </span>
        </div>

        <!-- Candidates List -->
        <div class="overflow-y-auto space-y-0.5 custom-scroll pr-0.5 flex-1 max-h-48">
          <button
            v-for="(item, idx) in filteredMentionCandidates"
            :key="item.path + idx"
            @click="selectMentionItem(item)"
            @mouseenter="selectedMentionIndex = idx"
            class="w-full px-2.5 py-1.5 rounded-xl text-left flex items-center justify-between text-[11px] transition-all cursor-pointer group border"
            :class="selectedMentionIndex === idx
              ? 'bg-[#42b883]/15 text-[#42b883] border-[#42b883]/30 font-semibold'
              : 'text-slate-300 hover:bg-white/[0.04] border-transparent'"
          >
            <div class="flex items-center gap-2 min-w-0 pr-2">
              <UIcon
                :name="item.isDirectory ? 'i-lucide-folder' : getNuxtFileIcon(item.name).icon"
                class="size-3.5 flex-shrink-0"
                :class="item.isDirectory ? 'text-amber-400' : getNuxtFileIcon(item.name).colorClass"
              />
              <span class="truncate font-medium text-xs">{{ item.name }}</span>
              <span class="text-[9px] text-slate-500 font-mono truncate" :title="item.path">
                {{ formatRelativePath(item.path) }}
              </span>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span
                v-if="item.badge"
                class="px-1.5 py-0.5 rounded-full text-[8px] font-semibold uppercase tracking-wider"
                :class="item.badge === 'File Aktif'
                  ? 'bg-[#42b883]/20 text-[#42b883] border border-[#42b883]/30'
                  : 'bg-white/[0.06] text-slate-400 border border-white/[0.08]'"
              >
                {{ item.badge }}
              </span>
              <span class="text-[9px] text-slate-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">↵</span>
            </div>
          </button>
        </div>
      </div>

      <!-- Unified AI Settings Popover (Ruang Kerja, Model AI, & Konteks) -->
      <div
        v-if="isSettingsMenuOpen"
        class="absolute bottom-16 left-2 right-2 max-h-[520px] flex flex-col bg-[#0c121d]/98 border border-white/[0.12] rounded-2xl shadow-2xl backdrop-blur-2xl z-40 p-3 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none overflow-hidden"
      >
        <!-- Header -->
        <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] flex-shrink-0">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded-lg bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883]">
              <UIcon name="i-lucide-settings" class="size-3.5" />
            </div>
            <div>
              <div class="text-xs font-semibold text-white leading-tight">Pengaturan Agen AI</div>
              <div class="text-[10px] text-slate-400">Pilih ruang kerja & model kecerdasan buatan</div>
            </div>
          </div>
          <button
            @click="isSettingsMenuOpen = false"
            class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Tutup pengaturan"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>

        <!-- Scrollable Settings Body -->
        <div class="overflow-y-auto space-y-3.5 pr-1 custom-scroll flex-1">
          <!-- Section 1: Ruang Kerja (Workspace) -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-300">
              <span class="flex items-center gap-1.5 text-[#42b883]">
                <UIcon name="i-lucide-folder-git-2" class="size-3.5" />
                Ruang Kerja (Project Path)
              </span>
              <div class="flex items-center gap-2">
                <button
                  v-if="connectedProject"
                  @click.stop="disconnectTargetWorkspace"
                  class="text-[9px] px-1.5 py-0.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Lepaskan penetapan folder target project saat ini"
                >
                  Lepas Target
                </button>
                <span class="text-[10px] text-slate-400 font-mono">
                  {{ workspaceStore.workspaceRoots.length }} folder
                </span>
              </div>
            </div>

            <!-- Workspace List -->
            <div class="space-y-1 max-h-28 overflow-y-auto custom-scroll pr-0.5">
              <button
                v-for="root in workspaceStore.workspaceRoots"
                :key="root.id"
                @click="selectTargetWorkspace(root)"
                class="w-full p-1.5 rounded-xl text-left text-[11px] transition-all flex items-center justify-between group cursor-pointer border"
                :class="connectedProject?.path === root.path
                  ? 'bg-[#42b883]/15 text-[#42b883] font-semibold border-[#42b883]/40'
                  : 'text-slate-300 hover:bg-white/[0.04] border-white/[0.06] hover:border-white/[0.1]'"
              >
                <div class="flex items-center gap-1.5 min-w-0 pr-1">
                  <UIcon
                    name="i-lucide-folder"
                    class="size-3.5 flex-shrink-0"
                    :class="connectedProject?.path === root.path ? 'text-[#42b883]' : 'text-slate-400 group-hover:text-white'"
                  />
                  <div class="min-w-0 flex flex-col">
                    <span class="truncate font-medium text-xs">{{ root.name }}</span>
                    <span class="text-[9px] text-slate-500 font-mono truncate" :title="root.path">{{ root.path }}</span>
                  </div>
                </div>
                <UIcon
                  v-if="connectedProject?.path === root.path"
                  name="i-lucide-check-circle-2"
                  class="size-3.5 text-[#42b883] flex-shrink-0"
                />
              </button>

              <div v-if="workspaceStore.workspaceRoots.length === 0" class="py-2 text-center text-slate-500 text-[10px]">
                Belum ada folder project yang dibuka di editor.
              </div>
            </div>

            <button
              @click="handleAddFolderForAgent"
              class="w-full py-1.5 px-2 rounded-xl bg-white/[0.03] hover:bg-[#42b883]/10 border border-white/[0.06] hover:border-[#42b883]/30 text-slate-300 hover:text-[#42b883] text-[10px] font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <UIcon name="i-lucide-folder-plus" class="size-3 text-[#42b883]" />
              <span>Tambah Folder Project Lain...</span>
            </button>
          </div>

          <!-- Section 2: Model AI -->
          <div class="space-y-1.5 pt-2 border-t border-white/[0.06]">
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-300">
              <span class="flex items-center gap-1.5 text-[#42b883]">
                <UIcon name="i-lucide-cpu" class="size-3.5" />
                Model AI (9router)
              </span>
              <div class="flex items-center gap-1.5">
                <button
                  @click="agentStore.loadModels"
                  :disabled="agentStore.isModelsLoading"
                  class="w-4 h-4 rounded flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh model dari 9router"
                >
                  <UIcon name="i-lucide-refresh-cw" class="size-2.5" :class="{ 'animate-spin': agentStore.isModelsLoading }" />
                </button>
                <span v-if="agentStore.selectedModel || settingsStore.ai.defaultModel" class="text-[9px] px-1.5 py-0.5 rounded bg-[#42b883]/15 text-[#42b883] font-mono font-medium truncate max-w-[120px]" :title="agentStore.selectedModel || settingsStore.ai.defaultModel">
                  {{ agentStore.selectedModel || settingsStore.ai.defaultModel }}
                </span>
                <span v-else class="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 font-mono font-medium">
                  Kosong
                </span>
              </div>
            </div>

            <!-- Search Input -->
            <div class="relative">
              <UIcon name="i-lucide-search" class="size-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="modelSearchQuery"
                type="text"
                placeholder="Cari model AI..."
                class="w-full bg-[#080d16] border border-white/[0.08] focus:border-[#42b883]/50 focus:ring-1 focus:ring-[#42b883]/20 rounded-lg pl-6 pr-6 py-1 text-[10px] text-slate-200 placeholder:text-slate-500 outline-none transition-all"
              />
              <button
                v-if="modelSearchQuery"
                @click="modelSearchQuery = ''"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <UIcon name="i-lucide-x" class="size-2.5" />
              </button>
            </div>

            <!-- Models List -->
            <div class="max-h-28 overflow-y-auto space-y-0.5 custom-scroll pr-0.5">
              <button
                v-for="m in filteredModels"
                :key="m"
                @click="selectModel(m)"
                class="w-full px-2 py-1.5 rounded-lg text-left text-[11px] transition-all flex items-center justify-between group cursor-pointer"
                :class="(agentStore.selectedModel || settingsStore.ai.defaultModel) === m
                  ? 'bg-[#42b883]/15 text-[#42b883] font-semibold border border-[#42b883]/30'
                  : 'text-slate-300 hover:bg-white/[0.04] border border-transparent'"
              >
                <span class="truncate pr-1">{{ m }}</span>
                <UIcon v-if="(agentStore.selectedModel || settingsStore.ai.defaultModel) === m" name="i-lucide-check-circle-2" class="size-3 text-[#42b883] flex-shrink-0" />
              </button>

              <div v-if="filteredModels.length === 0" class="py-2.5 text-center text-slate-500 text-[10px] space-y-1">
                <p>{{ agentStore.availableModels.length === 0 ? 'Belum ada model dari 9router' : 'Model tidak cocok dengan pencarian' }}</p>
                <button
                  v-if="agentStore.availableModels.length === 0"
                  @click="agentStore.loadModels"
                  class="text-[9px] text-[#42b883] hover:underline cursor-pointer"
                >
                  Coba hubungkan & cari model lagi
                </button>
              </div>
            </div>
          </div>

          <!-- Section 3: Permissions (Auto Execution & Review Policy - Sesuai Gambar 2 Antigravity) -->
          <div class="space-y-2 pt-2 border-t border-white/[0.06]">
            <div class="flex items-center justify-between text-[11px] font-medium text-slate-300">
              <span class="flex items-center gap-1.5 text-[#42b883]">
                <UIcon name="i-lucide-shield-check" class="size-3.5" />
                Permissions
              </span>
            </div>

            <div class="space-y-2 text-[11px]">
              <!-- Auto Execution Row (Persis seperti Gambar 2 Antigravity) -->
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-1.5 text-slate-300 select-none">
                  <span class="font-normal text-[11px] text-slate-200">Auto Execution</span>
                  <span
                    class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/10 cursor-help transition-colors"
                    title="Controls whether commands and tools can run automatically or require user approval before execution."
                  >
                    ⓘ
                  </span>
                </div>

                <div class="relative min-w-[140px]">
                  <select
                    v-model="settingsStore.ai.autoExecution"
                    class="w-full bg-[#131d2e] hover:bg-[#182438] border border-white/[0.1] hover:border-white/[0.2] text-slate-200 text-[11px] rounded-lg px-2.5 py-1 pr-6 appearance-none focus:outline-none focus:border-[#42b883]/60 cursor-pointer transition-colors"
                  >
                    <option value="always_proceed">Always Proceed</option>
                    <option value="ask_before">Ask Before Execution</option>
                    <option value="never">Never Execute</option>
                  </select>
                  <UIcon name="i-lucide-chevron-down" class="size-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <!-- Review Policy Row (Persis seperti Gambar 2 Antigravity) -->
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-1.5 text-slate-300 select-none">
                  <span class="font-normal text-[11px] text-slate-200">Review Policy</span>
                  <span
                    class="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/10 cursor-help transition-colors"
                    title="Controls how code modifications and file edits are reviewed and applied."
                  >
                    ⓘ
                  </span>
                </div>

                <div class="relative min-w-[140px]">
                  <select
                    v-model="settingsStore.ai.reviewPolicy"
                    class="w-full bg-[#131d2e] hover:bg-[#182438] border border-white/[0.1] hover:border-white/[0.2] text-slate-200 text-[11px] rounded-lg px-2.5 py-1 pr-6 appearance-none focus:outline-none focus:border-[#42b883]/60 cursor-pointer transition-colors"
                  >
                    <option value="request_review">Request Review</option>
                    <option value="auto_apply">Auto Apply</option>
                    <option value="always_ask">Always Ask</option>
                  </select>
                  <UIcon name="i-lucide-chevron-down" class="size-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: Active Context Toggle -->
          <div class="pt-2 border-t border-white/[0.06]">
            <label class="flex items-center gap-2 cursor-pointer group select-none">
              <input
                type="checkbox"
                v-model="agentStore.includeActiveFileContext"
                class="rounded border-white/20 bg-slate-800 text-[#42b883] focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <div class="flex flex-col">
                <span class="text-[11px] text-slate-200 group-hover:text-white font-medium">Sertakan File Aktif Editor</span>
                <span class="text-[9px] text-slate-400">Kirim isi berkas yang sedang dibuka sebagai konteks otomatis</span>
              </div>
            </label>
          </div>
        </div>
      </div>

      <!-- Barrier Card: Tampil ketika target project belum ditetapkan (Tombol Dihapus Sesuai Permintaan) -->
      <div
        v-if="!connectedProject"
        class="mb-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 backdrop-blur-md shadow-lg flex items-start gap-2.5 transition-all duration-300 select-none"
      >
        <div class="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0 text-amber-400 mt-0.5">
          <UIcon name="i-lucide-folder-lock" class="size-4" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <h4 class="text-[11px] font-semibold text-amber-300 flex items-center gap-1.5">
              Target Project Belum Ditetapkan
            </h4>
            <span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-medium">Barier Aktif</span>
          </div>
          <p class="text-[10px] text-amber-200/80 leading-snug mt-0.5">
            Chat dengan Agen dikunci sampai Anda menetapkan folder target project kerja AI.
          </p>
        </div>
      </div>

      <!-- 3. Main Floating Input Pill (Nuxt UI ChatPrompt) -->
      <div
        class="bg-[#0c121d]/90 border border-white/[0.08] hover:border-white/[0.14] focus-within:border-[#42b883]/50 focus-within:ring-1 focus-within:ring-[#42b883]/25 rounded-2xl p-2.5 shadow-xl transition-all duration-200 space-y-1.5"
        @paste="handlePaste"
      >
        <!-- Attached Files & Tagged Code Strip inside input pill -->
        <div v-if="attachedFiles.length > 0" class="flex flex-wrap gap-1.5 pb-1 pt-0.5">
          <div
            v-for="(f, fIdx) in attachedFiles"
            :key="f.path + (f.lineRange || '') + fIdx"
            class="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#131d2e] border border-white/[0.1] hover:border-[#42b883]/40 text-slate-200 text-[10px] shadow-sm max-w-full transition-colors"
            :title="f.selectedSnippet ? `${f.path} (${f.lineRange})\n\n${f.selectedSnippet.slice(0, 300)}` : f.path"
          >
            <UIcon
              :name="f.isDirectory ? 'i-lucide-folder' : (f.lineRange ? 'i-lucide-code-xml' : getNuxtFileIcon(f.name).icon)"
              class="size-3.5 flex-shrink-0"
              :class="f.isDirectory ? 'text-amber-400' : (f.lineRange ? 'text-emerald-400' : getNuxtFileIcon(f.name).colorClass)"
            />
            <span class="truncate max-w-[130px] font-medium">{{ f.name }}</span>
            <span
              v-if="f.lineRange"
              class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-medium flex-shrink-0"
            >
              {{ f.lineRange }}
            </span>
            <button
              type="button"
              @click.stop="removeAttachedFile(fIdx)"
              class="w-3.5 h-3.5 rounded-full hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-400 transition-colors cursor-pointer"
              title="Hapus lampiran"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </button>
          </div>
        </div>

        <!-- Attached Images Strip inside input pill -->
        <div v-if="attachedImages.length > 0" class="flex flex-wrap gap-1.5 pb-0.5 pt-0.5">
          <div
            v-for="(img, idx) in attachedImages"
            :key="idx"
            class="relative group rounded-lg overflow-hidden border border-white/[0.1] bg-[#131c2a] w-11 h-11 flex-shrink-0 cursor-pointer shadow-md"
            @click="openImageLightbox(img)"
          >
            <img :src="img" alt="Pasted attachment" class="w-full h-full object-cover" />
            <button
              @click.stop="removeAttachedImage(idx)"
              class="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-black/80 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-[7px] transition-colors"
              title="Hapus gambar"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </button>
          </div>
        </div>

        <!-- Input Textarea (Compact 1-row default dengan auto-shrink cerdas) -->
        <textarea
          ref="textareaRef"
          v-model="inputPrompt"
          rows="1"
          :placeholder="!connectedProject ? '🔒 Tetapkan folder target project terlebih dahulu...' : 'Ask anything, tag code (Ctrl+L), paste (Ctrl+V), @, /'"
          class="w-full bg-transparent border-none text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none p-0 leading-relaxed font-sans min-h-[22px] max-h-[160px]"
          :class="{ 'opacity-40 cursor-not-allowed select-none': !connectedProject }"
          @input="adjustTextareaHeight"
          @keydown="handleKeydown"
          :disabled="!connectedProject || agentStore.isGenerating"
        ></textarea>

        <!-- Bottom Controls Row inside the Pill -->
        <div class="flex items-center justify-between pt-0.5">
          <!-- Left: Gear Settings, @ Mention, & Attach Image -->
          <div class="flex items-center gap-1.5">
            <!-- Gear Settings Button (Model & Workspace Selector) -->
            <button
              @click="isSettingsMenuOpen = !isSettingsMenuOpen"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer border text-[11px] flex-shrink-0"
              :class="[
                isSettingsMenuOpen
                  ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883] shadow-xs'
                  : !connectedProject
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 animate-pulse'
                    : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'
              ]"
              :title="!connectedProject ? 'Tetapkan Folder Target Project di Sini' : 'Pengaturan Model & Ruang Kerja AI'"
            >
              <UIcon name="i-lucide-settings" class="size-3 font-semibold" />
            </button>

            <!-- @ Mention Context Button -->
            <button
              @click="connectedProject ? triggerMentionInput() : (isSettingsMenuOpen = true)"
              :disabled="!connectedProject"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-[11px] flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="showMentionMenu
                ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883] shadow-xs'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer'"
              title="Lampirkan Berkas atau Konteks (@)"
            >
              <UIcon name="i-lucide-at-sign" class="size-3 font-semibold" />
            </button>

            <!-- Attach Image Button -->
            <button
              @click="connectedProject ? triggerFileInput() : (isSettingsMenuOpen = true)"
              :disabled="!connectedProject"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-slate-400 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="connectedProject
                ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-[#42b883]/40 hover:text-[#42b883] cursor-pointer'
                : 'bg-white/[0.02] border-white/[0.05]'"
              title="Lampirkan Gambar (Atau Paste Ctrl+V dari Clipboard)"
            >
              <UIcon name="i-lucide-image" class="size-3" />
            </button>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="handleFileInputChange"
            />
          </div>

          <!-- Right: Mic & Circular Action Button (Always Preserved, never cut off) -->
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <!-- Voice Input Icon -->
            <button
              @click="connectedProject ? triggerVoiceNotice() : (isSettingsMenuOpen = true)"
              :disabled="!connectedProject"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-slate-400 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="connectedProject
                ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-[#42b883]/40 hover:text-[#42b883] cursor-pointer'
                : 'bg-white/[0.02] border-white/[0.05]'"
              title="Input Suara"
            >
              <UIcon name="i-lucide-mic" class="size-3" />
            </button>

            <!-- Circular Send / Abort Button (Compact) -->
            <button
              v-if="agentStore.isGenerating"
              @click="agentStore.abortGeneration"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              title="Hentikan Jawaban"
            >
              <UIcon name="i-lucide-square" class="size-3" />
            </button>
            <button
              v-else
              @click="() => handleSendMessage()"
              :disabled="!connectedProject || (!inputPrompt.trim() && attachedImages.length === 0 && attachedFiles.length === 0)"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="connectedProject && (inputPrompt.trim() || attachedImages.length > 0 || attachedFiles.length > 0)
                ? 'bg-[#42b883] text-[#090d14] hover:bg-[#34d399] shadow-md shadow-[#42b883]/30 cursor-pointer font-bold'
                : 'bg-white/[0.05] text-slate-400 border border-white/[0.08] hover:bg-white/[0.08]'"
              :title="!connectedProject ? 'Tetapkan folder target project terlebih dahulu' : 'Kirim (Enter)'"
            >
              <UIcon :name="!connectedProject ? 'i-lucide-lock' : 'i-lucide-arrow-right'" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Image Preview Lightbox Modal -->
    <div
      v-if="previewImageUrl"
      class="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm cursor-zoom-out select-none"
      @click="closeImageLightbox"
    >
      <div class="relative max-w-4xl max-h-[90vh] flex flex-col items-center" @click.stop>
        <img
          :src="previewImageUrl"
          alt="Full Preview"
          class="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain border border-[#35495e]/60 bg-[#090d14]"
        />
        <button
          @click="closeImageLightbox"
          class="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#0c111a]/90 text-slate-300 hover:text-white hover:bg-[#131c2a] flex items-center justify-center transition-colors border border-[#35495e]/60 text-sm shadow-lg cursor-pointer"
          title="Tutup Preview"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes vue-shimmer-anim {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

@keyframes vue-glow-pulse-anim {
  0%, 100% {
    box-shadow: 0 0 8px rgba(66, 184, 131, 0.9), 0 0 16px rgba(66, 184, 131, 0.4);
    background-color: #42b883;
  }
  50% {
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.9), 0 0 16px rgba(52, 211, 153, 0.4);
    background-color: #34d399;
  }
}

.vue-gradient-text {
  background: linear-gradient(90deg, #42b883, #34d399, #60a5fa, #34d399, #42b883);
  background-size: 250% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: vue-shimmer-anim 4s ease infinite;
}

.vue-pulse-dot {
  animation: vue-glow-pulse-anim 2.5s ease-in-out infinite;
}

:deep(.p-textarea) {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  background: transparent !important;
  padding: 0 !important;
}

:deep(.p-textarea:focus),
:deep(.p-textarea:enabled:focus) {
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
}
</style>

