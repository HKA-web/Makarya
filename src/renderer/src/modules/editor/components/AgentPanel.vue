<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useAgentStore } from '@renderer/stores/agentStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { parseMarkdownBlocks, formatInlineMarkdown } from '@renderer/utils/markdownParser'
import { extractImplementationPlan, type ParsedImplementationPlan } from '@renderer/utils/planParser'
import ImplementationPlanCard from './ImplementationPlanCard.vue'
import AgentModelModal from './AgentModelModal.vue'
import AgentSessionModal from './AgentSessionModal.vue'
import logoImg from '@renderer/assets/logo.png'
import iconImg from '@renderer/assets/icon.jpg'

const agentStore = useAgentStore()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const inputText = ref('')
const inputAreaRef = ref<HTMLTextAreaElement | null>(null)
const messageContainer = ref<HTMLElement | null>(null)
const includeActiveFile = ref(true)
const copiedIndex = ref<string | null>(null)
const isModelModalOpen = ref(false)
const isSessionModalOpen = ref(false)
const isDraggingOver = ref(false)

export interface TaggedContextItem {
  id: string
  path: string
  name: string
  startLine?: number
  endLine?: number
  lineRange?: string
  selectedSnippet?: string
  language?: string
  isDirectory?: boolean
}

export interface AttachedImageItem {
  name: string
  relativePath: string
  absolutePath: string
  previewUrl: string
}

const taggedContexts = ref<TaggedContextItem[]>([])
const attachedImages = ref<AttachedImageItem[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
const isUploadingImage = ref<boolean>(false)

const connectedProject = computed(() => {
  if (workspaceStore.activeRootPath) {
    const match = workspaceStore.workspaceRoots.find(
      (r) => r.path.toLowerCase().replace(/\\/g, '/') === workspaceStore.activeRootPath!.toLowerCase().replace(/\\/g, '/')
    )
    if (match) return match
    const name = workspaceStore.activeRootPath.split(/[\\/]/).filter(Boolean).pop() || 'Project'
    return { path: workspaceStore.activeRootPath, name }
  }
  return workspaceStore.workspaceRoots[0] || null
})

// Interactive Question selection state
const selectedAnswers = ref<Record<string, string>>({})
const customAnswers = ref<Record<string, string>>({})

// Collapsible tool outputs
const expandedTools = ref<Record<string, boolean>>({})

// Collapsible thinking process
const expandedThinking = ref<Record<string, boolean>>({})

onMounted(() => {
  agentStore.loadModels()
  agentStore.loadSessions()
  agentStore.initListeners()
  window.addEventListener('makarya:tag-to-agent', onMakaryaTagToAgent)
  window.addEventListener('makarya:focus-agent-chat', onFocusAgentChat)
})

onUnmounted(() => {
  window.removeEventListener('makarya:tag-to-agent', onMakaryaTagToAgent)
  window.removeEventListener('makarya:focus-agent-chat', onFocusAgentChat)
})

function onMakaryaTagToAgent(e: Event) {
  const customEvent = e as CustomEvent<any>
  const detail = customEvent.detail
  if (!detail || !detail.path) return

  let lineLabel = ''
  if (detail.lineRange) {
    lineLabel = detail.lineRange.startsWith('L') ? detail.lineRange : `L${detail.lineRange}`
  } else if (detail.startLine && detail.endLine && detail.startLine !== detail.endLine) {
    lineLabel = `L${detail.startLine}-L${detail.endLine}`
  } else if (detail.startLine) {
    lineLabel = `L${detail.startLine}`
  }

  const existingIdx = taggedContexts.value.findIndex(
    (t) => t.path.toLowerCase() === detail.path.toLowerCase() && (t.lineRange || '') === (lineLabel || '')
  )

  const newTag: TaggedContextItem = {
    id: `${detail.path}-${lineLabel || 'all'}-${Date.now()}`,
    path: detail.path,
    name: detail.name || detail.path.split(/[/\\]/).filter(Boolean).pop() || 'Untitled',
    startLine: detail.startLine,
    endLine: detail.endLine,
    lineRange: lineLabel,
    selectedSnippet: detail.selectedSnippet,
    language: detail.language,
    isDirectory: detail.isDirectory
  }

  if (existingIdx !== -1) {
    taggedContexts.value[existingIdx] = newTag
  } else {
    taggedContexts.value.push(newTag)
  }

  // Insert tag directly into the chat input (e.g. "tes 📄 ImplementationPlanCard.vue")
  const fileBadge = `📄 ${newTag.name}${newTag.lineRange ? ` ${newTag.lineRange}` : ''}`
  if (!inputText.value.includes(fileBadge)) {
    inputText.value = inputText.value.trim()
      ? `${inputText.value.trim()} ${fileBadge} `
      : `${fileBadge} `
  }

  adjustTextareaHeight()
  nextTick(() => {
    inputAreaRef.value?.focus()
  })
}

function onFocusAgentChat() {
  nextTick(() => {
    inputAreaRef.value?.focus()
  })
}

function removeTaggedContext(id: string): void {
  const idx = taggedContexts.value.findIndex((t) => t.id === id)
  if (idx !== -1) {
    const item = taggedContexts.value[idx]
    if (item) {
      const fileBadge = `📄 ${item.name}${item.lineRange ? ` ${item.lineRange}` : ''}`
      inputText.value = inputText.value.replace(fileBadge, '').replace(/\s+/g, ' ').trim()
    }
    taggedContexts.value.splice(idx, 1)
  }
}

async function handleChatContainerClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('[data-file-ref]') as HTMLElement | null
  if (target) {
    const fileRef = target.getAttribute('data-file-ref')
    if (fileRef) {
      const cleanFileName = fileRef.split(':')[0].replace(/^📄\s*/, '').trim()
      const targetLineMatch = fileRef.match(/:L?(\d+)/) || fileRef.match(/\s+L?(\d+)/)
      const targetLine = targetLineMatch ? parseInt(targetLineMatch[1], 10) : undefined

      // Find file in workspace
      let foundPath = ''
      if (cleanFileName.includes('/') || cleanFileName.includes('\\')) {
        foundPath = cleanFileName
      } else if (workspaceStore.workspaceRoots) {
        const match = workspaceStore.recentFiles.find((f) => f.name.toLowerCase() === cleanFileName.toLowerCase()) ||
          workspaceStore.tabList.find((t) => t.title.toLowerCase() === cleanFileName.toLowerCase())
        if (match && match.filePath) foundPath = match.filePath
        else if (match && (match as any).path) foundPath = (match as any).path
      }

      if (foundPath) {
        await workspaceStore.openFile(foundPath, cleanFileName, targetLine)
      }
    }
  }
}

let dragCounter = 0

function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  dragCounter++
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  isDraggingOver.value = true
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
  isDraggingOver.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  dragCounter--
  if (dragCounter <= 0) {
    dragCounter = 0
    isDraggingOver.value = false
  }
}

async function handleFileDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation()
  dragCounter = 0
  isDraggingOver.value = false

  if (!e.dataTransfer) return

  // 1. Check if dropped from Makarya internal FileTree / Tabs
  const makaryaFileEntry = e.dataTransfer.getData('makarya/file-entry') || e.dataTransfer.getData('application/json')
  if (makaryaFileEntry) {
    try {
      const parsed = JSON.parse(makaryaFileEntry)
      if (parsed && parsed.path) {
        addFileOrFolderTag(parsed.path, parsed.name, parsed.isDirectory)
        return
      }
    } catch {
      // Fallback
    }
  }

  // 2. Check if dropped native OS files (from File Explorer / Desktop)
  const files = e.dataTransfer.files
  if (files && files.length > 0) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith('image/')) {
        await processDroppedImage(file)
      } else {
        const filePath = (file as any).path || file.name
        addFileOrFolderTag(filePath, file.name, false)
      }
    }
    return
  }

  // 3. Fallback to URI list or text/plain
  const uriList = e.dataTransfer.getData('text/uri-list')
  const textData = uriList || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text')
  if (textData && textData.trim()) {
    const lines = textData.trim().split(/[\r\n]+/)
    for (const line of lines) {
      const trimmed = line.replace(/^file:\/\/\/?/, '').replace(/%20/g, ' ').trim()
      if (trimmed) {
        const name = trimmed.split(/[/\\]/).filter(Boolean).pop() || trimmed
        addFileOrFolderTag(trimmed, name, false)
      }
    }
  }
}

function addFileOrFolderTag(path: string, name?: string, isDirectory?: boolean) {
  const fileName = name || path.split(/[/\\]/).filter(Boolean).pop() || path
  const existingIdx = taggedContexts.value.findIndex((t) => t.path.toLowerCase() === path.toLowerCase())
  if (existingIdx === -1) {
    taggedContexts.value.push({
      id: `${path}-${Date.now()}`,
      path,
      name: fileName,
      isDirectory
    })
  }

  // Insert tag directly into inputText (e.g. "📄 filename.vue")
  const fileBadge = `📄 ${fileName}`
  if (!inputText.value.includes(fileBadge)) {
    inputText.value = inputText.value.trim()
      ? `${inputText.value.trim()} ${fileBadge} `
      : `${fileBadge} `
  }

  adjustTextareaHeight()
  nextTick(() => {
    inputAreaRef.value?.focus()
  })
}

async function processDroppedImage(file: File) {
  const projectRoot = connectedProject.value?.path
  const reader = new FileReader()
  reader.onload = async (ev) => {
    const base64 = ev.target?.result as string
    if (base64 && window.makaryaAPI?.saveImageToProject && projectRoot) {
      try {
        const res = await window.makaryaAPI.saveImageToProject(projectRoot, file.name, base64)
        if (res.success && res.relativePath && res.absolutePath) {
          attachedImages.value.push({
            name: res.fileName || file.name,
            relativePath: res.relativePath,
            absolutePath: res.absolutePath,
            previewUrl: base64
          })
          return
        }
      } catch (err) {
        console.warn('Gagal menyimpan gambar drop:', err)
      }
    }
    if (base64) {
      attachedImages.value.push({
        name: file.name,
        relativePath: file.name,
        absolutePath: file.name,
        previewUrl: base64
      })
    }
  }
  reader.readAsDataURL(file)
}

async function handlePaste(e: ClipboardEvent) {
  const clipboardData = e.clipboardData
  if (!clipboardData) return

  const items = clipboardData.items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (blob) {
        const timestamp = Date.now()
        const ext = blob.type.split('/')[1] || 'png'
        const imageName = `pasted-image-${timestamp}.${ext}`
        const imageFile = new File([blob], imageName, { type: blob.type })
        await processDroppedImage(imageFile)
      }
      return
    }
  }
}

function isToolExpanded(tool: any): boolean {
  if (expandedTools.value[tool.id] !== undefined) {
    return expandedTools.value[tool.id]
  }
  return tool.status === 'running' || tool.status === 'waiting_approval'
}

function toggleToolExpand(toolId: string, currentStatus?: string) {
  const current = isToolExpanded({ id: toolId, status: currentStatus })
  expandedTools.value[toolId] = !current
}

function selectOption(msgId: string, option: string) {
  selectedAnswers.value[msgId] = option
  customAnswers.value[msgId] = ''
}

async function submitAnswer(msgId: string) {
  const custom = customAnswers.value[msgId]?.trim()
  const chosen = custom || selectedAnswers.value[msgId]
  if (!chosen) return

  await agentStore.submitQuestionAnswer(msgId, chosen)
  scrollToBottom()
}

function getVisibleTools(tools?: any[]) {
  if (!tools) return []
  return tools.filter((t) => t.name !== 'ask_question')
}

function isThinkingExpanded(msg: any): boolean {
  if (expandedThinking.value[msg.id] !== undefined) {
    return expandedThinking.value[msg.id]
  }
  return Boolean(msg.isThinking || msg.isStreaming)
}

function toggleThinkingExpand(msgId: string, msg: any): void {
  const current = isThinkingExpanded(msg)
  expandedThinking.value[msgId] = !current
}

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
}

function adjustTextareaHeight(): void {
  nextTick(() => {
    const el = inputAreaRef.value
    if (!el) return

    el.style.height = 'auto'

    if (!inputText.value || inputText.value.trim() === '') {
      el.style.height = '22px'
      el.style.overflowY = 'hidden'
      return
    }

    const maxHeight = 160
    const scrollHeight = el.scrollHeight

    if (scrollHeight > maxHeight) {
      el.style.height = `${maxHeight}px`
      el.style.overflowY = 'auto'
    } else {
      el.style.height = `${Math.max(22, scrollHeight)}px`
      el.style.overflowY = 'hidden'
    }
  })
}

watch(inputText, () => {
  adjustTextareaHeight()
})

watch(
  () => [
    agentStore.messages.length,
    agentStore.messages[agentStore.messages.length - 1]?.content,
    agentStore.messages[agentStore.messages.length - 1]?.thoughts,
    agentStore.messages[agentStore.messages.length - 1]?.toolCalls?.length
  ],
  () => {
    scrollToBottom()
  },
  { deep: true }
)

function triggerImageUpload(): void {
  if (!connectedProject.value) return
  imageInputRef.value?.click()
}

async function handleImageInputChange(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0 || !connectedProject.value) return

  const projectRoot = connectedProject.value.path
  isUploadingImage.value = true

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.type.startsWith('image/')) {
      await new Promise<void>((resolve) => {
        const reader = new FileReader()
        reader.onload = async (e) => {
          const base64 = e.target?.result as string
          if (base64 && window.makaryaAPI?.saveImageToProject) {
            try {
              const res = await window.makaryaAPI.saveImageToProject(projectRoot, file.name, base64)
              if (res.success && res.relativePath && res.absolutePath) {
                attachedImages.value.push({
                  name: res.fileName || file.name,
                  relativePath: res.relativePath,
                  absolutePath: res.absolutePath,
                  previewUrl: base64
                })
              }
            } catch (err) {
              console.warn('Gagal mengunggah gambar ke .makarya:', err)
            }
          } else if (base64) {
            attachedImages.value.push({
              name: file.name,
              relativePath: file.name,
              absolutePath: file.name,
              previewUrl: base64
            })
          }
          resolve()
        }
        reader.readAsDataURL(file)
      })
    }
  }

  target.value = ''
  isUploadingImage.value = false
}

function removeAttachedImage(index: number): void {
  attachedImages.value.splice(index, 1)
}

async function handleSendMessage() {
  const text = inputText.value.trim()
  if ((!text && attachedImages.value.length === 0 && taggedContexts.value.length === 0) || agentStore.isGenerating) return

  let fullPrompt = text || 'Harap periksa dan analisis berkas/kode/gambar yang dilampirkan.'

  // 1. Sertakan Tagged Code Snippets & Files (dari Ctrl+L atau Drag & Drop)
  if (taggedContexts.value.length > 0) {
    const taggedInstructions = taggedContexts.value
      .map((tag) => {
        if (tag.selectedSnippet) {
          return `[Potongan Kode Dilampirkan (Ctrl+L): ${tag.path} (${tag.lineRange || `Line ${tag.startLine}`})]\n\`\`\`${tag.language || ''}\n${tag.selectedSnippet}\n\`\`\``
        }
        return `[Berkas Dilampirkan: ${tag.path}]`
      })
      .join('\n\n')
    fullPrompt = `${taggedInstructions}\n\n${fullPrompt}`
  }

  // 2. Sertakan perintah & path gambar yang diunggah ke .makarya
  if (attachedImages.value.length > 0) {
    const imageInstructions = attachedImages.value
      .map(
        (img) =>
          `[Lampiran Gambar Proyek: ${img.relativePath} (Path: ${img.absolutePath})]\nPerintah Analisis Gambar: Harap baca, analisis, dan periksa berkas gambar yang tersimpan di path "${img.relativePath}" untuk menyelesaikan instruksi ini.`
      )
      .join('\n\n')
    fullPrompt = `${imageInstructions}\n\n${fullPrompt}`
  }

  // 3. Sertakan Konteks File Aktif jika dicentang
  let activeFileContext: any = undefined
  if (includeActiveFile.value && workspaceStore.activeTab?.filePath) {
    const activeTab = workspaceStore.activeTab
    activeFileContext = {
      filePath: activeTab.filePath,
      fileName: activeTab.title,
      content: activeTab.content,
      language: activeTab.language
    }
    fullPrompt = `[Konteks File Aktif: ${activeTab.filePath}]\n\`\`\`${activeTab.language || ''}\n${activeTab.content || ''}\n\`\`\`\n\n${fullPrompt}`
  }

  const displayPrompt = text || (taggedContexts.value.length > 0
    ? taggedContexts.value.map((t) => `📄 ${t.name}${t.lineRange ? ` ${t.lineRange}` : ''}`).join(' ')
    : 'Harap periksa dan analisis berkas/kode/gambar yang dilampirkan.')

  const attachedFileContexts = taggedContexts.value.map((t) => ({
    filePath: t.path,
    fileName: t.name,
    content: t.selectedSnippet,
    language: t.language,
    lineRange: t.lineRange,
    startLine: t.startLine,
    endLine: t.endLine,
    selectedSnippet: t.selectedSnippet
  }))

  const rawImages = attachedImages.value.map((img) => img.previewUrl)

  inputText.value = ''
  taggedContexts.value = []
  attachedImages.value = []
  adjustTextareaHeight()
  scrollToBottom()

  const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
    ? workspaceStore.activeTab.filePath.substring(0, Math.max(workspaceStore.activeTab.filePath.lastIndexOf('\\'), workspaceStore.activeTab.filePath.lastIndexOf('/')))
    : (workspaceStore.activeRootPath || (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)))

  await agentStore.sendMessage(
    fullPrompt,
    activeFileContext,
    projectRoot,
    rawImages.length > 0 ? rawImages : undefined,
    attachedFileContexts.length > 0 ? attachedFileContexts : undefined,
    displayPrompt
  )
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSendMessage()
  }
}

function formatMessageTime(timestamp?: number | string): string {
  if (!timestamp) return ''
  if (typeof timestamp === 'number') {
    return settingsStore.formatTimestamp(timestamp) || new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (typeof timestamp === 'string') {
    // If it's already a formatted time like "23.50", "23:50", "00.28"
    if (/^\d{1,2}[:.]\d{2}/.test(timestamp)) {
      return timestamp
    }
    // If it's a numeric string timestamp
    if (/^\d{10,}$/.test(timestamp)) {
      const num = Number(timestamp)
      return settingsStore.formatTimestamp(num) || new Date(num).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    const formatted = settingsStore.formatTimestamp(timestamp)
    if (formatted) return formatted
    const d = new Date(timestamp)
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return timestamp
  }
  return ''
}

function handleEditPrompt(content: string) {
  inputText.value = content
  adjustTextareaHeight()
  nextTick(() => {
    inputAreaRef.value?.focus()
  })
}

async function handleResendPrompt(content: string) {
  if (agentStore.isGenerating) return
  const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
    ? workspaceStore.activeTab.filePath.substring(0, Math.max(workspaceStore.activeTab.filePath.lastIndexOf('\\'), workspaceStore.activeTab.filePath.lastIndexOf('/')))
    : (workspaceStore.activeRootPath || (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)))

  const activeTab = workspaceStore.activeTab
  const activeFileContext =
    includeActiveFile.value && activeTab && activeTab.filePath
      ? {
        filePath: activeTab.filePath,
        fileName: activeTab.title,
        content: activeTab.content,
        language: activeTab.language
      }
      : undefined

  await agentStore.sendMessage(content, activeFileContext, projectRoot)
}

async function copyMessageContent(content: string, msgId: string) {
  try {
    await navigator.clipboard.writeText(content)
    copiedIndex.value = msgId
    setTimeout(() => {
      if (copiedIndex.value === msgId) copiedIndex.value = null
    }, 2000)
  } catch (err) {
    console.warn('Gagal menyalin pesan:', err)
  }
}

async function handleRegenerateResponse(messageId: string) {
  if (agentStore.isGenerating) return
  const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
    ? workspaceStore.activeTab.filePath.substring(0, Math.max(workspaceStore.activeTab.filePath.lastIndexOf('\\'), workspaceStore.activeTab.filePath.lastIndexOf('/')))
    : (workspaceStore.activeRootPath || (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)))

  const activeTab = workspaceStore.activeTab
  const activeFileContext =
    includeActiveFile.value && activeTab && activeTab.filePath
      ? {
        filePath: activeTab.filePath,
        fileName: activeTab.title,
        content: activeTab.content,
        language: activeTab.language
      }
      : undefined

  await agentStore.revertAndResendMessage(messageId, activeFileContext, projectRoot)
}

async function copyCode(code: string, blockKey: string) {
  try {
    await navigator.clipboard.writeText(code)
    copiedIndex.value = blockKey
    setTimeout(() => {
      if (copiedIndex.value === blockKey) copiedIndex.value = null
    }, 2000)
  } catch (err) {
    console.warn('Gagal menyalin kode:', err)
  }
}

function applyToEditor(code: string) {
  if (workspaceStore.activeTab && workspaceStore.activeTab.tabType === 'editor') {
    workspaceStore.updateTabContent(workspaceStore.activeTab.id, code)
  }
}

function getToolSummaryArg(tool: any): string {
  if (!tool.args) return ''
  if (tool.args.filePath) return tool.args.filePath.split(/[\\/]/).pop() || tool.args.filePath
  if (tool.args.dirPath) return tool.args.dirPath.split(/[\\/]/).pop() || tool.args.dirPath
  if (tool.args.command) return tool.args.command.length > 30 ? tool.args.command.slice(0, 30) + '...' : tool.args.command
  if (tool.args.query) return `"${tool.args.query}"`
  return ''
}

function getToolIcon(toolName: string): string {
  switch (toolName) {
    case 'execute_command':
    case 'bash':
    case 'terminal':
      return 'i-lucide-terminal'
    case 'read_file':
    case 'view_file':
      return 'i-lucide-file-text'
    case 'write_file':
    case 'edit_file':
    case 'replace_file_content':
      return 'i-lucide-file-pen'
    case 'list_dir':
      return 'i-lucide-folder-search'
    case 'grep_search':
      return 'i-lucide-search'
    default:
      return 'i-lucide-wrench'
  }
}

function getMessageImplementationPlan(message: any): ParsedImplementationPlan | null {
  if (!message || !message.content) return null
  return extractImplementationPlan(message.content, message.toolCalls, message.modifiedFiles)
}

function handleExecutePlanFromCard(plan: ParsedImplementationPlan): void {
  const tasksSummary = plan.tasks.map((t) => `- [${t.completed ? 'x' : ' '}] ${t.title}`).join('\n')
  const prompt = `Silakan lanjutkan dan eksekusi Rencana Implementasi "${plan.title}" secara bertahap menggunakan tool terkait.\n\nDaftar Tahapan Kerja:\n${tasksSummary}\n\nJalankan pembuatan/modifikasi file dan pengujian sintaks/verifikasi sesuai rencana.`
  inputText.value = prompt
  handleSendMessage()
}

function handleRequestPlanRevision(plan: ParsedImplementationPlan): void {
  inputText.value = `Mengenai Rencana Implementasi "${plan.title}", tolong revisi dan sesuaikan beberapa hal berikut: `
  adjustTextareaHeight()
  nextTick(() => {
    inputAreaRef.value?.focus()
  })
}
</script>

<template>
  <aside
    @dragenter="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent="handleFileDrop"
    class="w-88 h-full flex flex-col bg-[#090d14] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 text-slate-100 font-sans relative overflow-hidden shadow-sm transition-all">
    <!-- Drag & Drop Overlay Indicator -->
    <div v-if="isDraggingOver"
      class="absolute inset-0 z-50 bg-[#0b131e]/95 backdrop-blur-xs border-2 border-dashed border-[#42b883] rounded-2xl flex flex-col items-center justify-center gap-2 pointer-events-none transition-all">
      <div class="w-12 h-12 rounded-2xl bg-[#42b883]/20 border border-[#42b883]/50 flex items-center justify-center text-[#42b883] animate-bounce shadow-lg shadow-emerald-500/20">
        <UIcon name="i-lucide-arrow-down-to-line" class="size-6" />
      </div>
      <span class="text-xs font-semibold text-emerald-300">Lepaskan file / gambar ke Chat Agen</span>
      <span class="text-[10px] text-slate-400">Lampirkan file explorer atau gambar ke Makarya Agent</span>
    </div>

    <!-- Header (Makarya Emerald / Mint Accent) -->
    <div
      class="h-9 px-3 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold bg-[#0b101b]/95 backdrop-blur-md flex-shrink-0">
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <img :src="iconImg" alt="Makarya"
          class="h-5 w-auto rounded object-contain drop-shadow-[0_0_6px_rgba(66,184,131,0.5)] cursor-pointer hover:scale-110 transition-transform"
          title="Makarya AI Agent" />
        <span
          :class="['inline-block size-1.5 rounded-full', agentStore.isGenerating ? 'bg-emerald-400 animate-ping' : 'bg-[#42b883] animate-pulse']"></span>
        <span class="text-xs font-bold text-slate-100 flex items-center gap-1">
          <span class="agent-gradient-text">Makarya Agent</span>
        </span>
      </div>

      <div class="flex items-center gap-1">
        <!-- Mode Switcher Badge (Agent vs Chat) -->
        <div class="flex items-center bg-black/50 rounded-full p-0.5 border border-white/5 text-[9px] mr-0.5">
          <button @click="agentStore.executionMode = 'agent'" :class="[
            'px-2 py-0.5 rounded-full transition-all cursor-pointer',
            agentStore.executionMode === 'agent' ? 'bg-[#42b883]/25 text-[#42b883] font-semibold' : 'text-slate-400 hover:text-slate-200'
          ]" title="Makarya Agent Mode (Autonomous Tools & Actions)">
            Agent
          </button>
          <button @click="agentStore.executionMode = 'chat'" :class="[
            'px-2 py-0.5 rounded-full transition-all cursor-pointer',
            agentStore.executionMode === 'chat' ? 'bg-[#42b883]/25 text-[#42b883] font-semibold' : 'text-slate-400 hover:text-slate-200'
          ]" title="Makarya Chat Mode (Deep Reasoning / Q&A)">
            Chat
          </button>
        </div>

        <!-- Sessions / History Switcher Button -->
        <button @click="isSessionModalOpen = !isSessionModalOpen; isModelModalOpen = false" :class="[
          'w-6 h-6 rounded-full flex items-center justify-center transition-colors cursor-pointer group',
          isSessionModalOpen
            ? 'bg-[#42b883]/20 text-[#42b883] ring-1 ring-[#42b883]/40'
            : 'text-slate-400 hover:text-[#42b883] hover:bg-white/[0.06]'
        ]" title="Riwayat Sesi Obrolan Agen">
          <UIcon name="i-lucide-history" class="size-3.5 group-hover:rotate-[-20deg] transition-transform" />
        </button>

        <!-- New Chat Session Button -->
        <button @click="agentStore.createNewSession()"
          class="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Mulai Sesi Agen Baru">
          <UIcon name="i-lucide-square-pen" class="size-3.5" />
        </button>

        <!-- Clear Chat Button -->
        <button @click="agentStore.clearHistory()"
          class="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Bersihkan Percakapan Agen">
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>

        <!-- Close / Collapse Panel Button -->
        <button @click="workspaceStore.toggleCopilotPanel()"
          class="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Tutup Panel Agen">
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Messages Container (Scrollable Area) -->
    <div ref="messageContainer" @click="handleChatContainerClick" class="flex-1 overflow-y-auto p-3 text-[11px] relative flex flex-col custom-scrollbar">
      <!-- DEFAULT HERO STATE (Shown when messages.length === 0) -->
      <div v-if="agentStore.messages.length === 0"
        class="my-auto flex flex-col items-center justify-center py-6 px-2 text-center select-none w-full">
        <!-- Glow Logo Card -->
        <div class="relative group mb-4 mx-auto flex items-center justify-center cursor-pointer block">
          <div
            class="absolute -inset-1.5 bg-gradient-to-r from-[#059669]/40 via-[#10b981]/30 to-[#34d399]/40 rounded-3xl blur-md opacity-75 group-hover:opacity-100 group-hover:scale-105 transition duration-500">
          </div>
          <div
            class="relative w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-[#091518] border border-[#42b883]/40 group-hover:border-[#42b883]/70 shadow-xl shadow-[#42b883]/20 flex items-center justify-center p-3.5 overflow-hidden transition-all">
            <img :src="logoImg" alt="Makarya Agent"
              class="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(66,184,131,0.7)] group-hover:scale-110 transition-transform" />
          </div>
        </div>

        <!-- Title -->
        <div class="flex items-center justify-center gap-1.5 mb-1.5">
          <h2
            class="text-base sm:text-lg font-bold tracking-tight text-white flex items-center justify-center gap-1.5 text-center">
            <span class="agent-gradient-text">Makarya AI Agent</span>
          </h2>
        </div>

        <!-- Subtitle -->
        <p class="text-[11px] text-slate-400 text-center max-w-[270px] mx-auto leading-relaxed mb-4">
          Agen pemrograman otonom terintegrasi. Mendukung eksekusi terminal, manipulasi berkas presisi, analisis kode,
          dan penalaran cerdas.
        </p>

        <!-- Target Project Connected Badge -->
        <div v-if="connectedProject"
          class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-[#42b883]/30 text-[10px] text-slate-300 flex items-center gap-2 max-w-[95%] shadow-xs">
          <span class="w-2 h-2 rounded-full bg-[#42b883] agent-pulse-dot flex-shrink-0"></span>
          <span class="text-slate-400 font-medium flex-shrink-0">Target:</span>
          <span class="font-mono text-[#42b883] truncate text-[10px]" :title="connectedProject.path">
            {{ connectedProject.name }}
          </span>
        </div>
      </div>

      <!-- Messages Stream List (When messages exist) -->
      <div v-else class="space-y-2.5">
        <div v-for="msg in agentStore.messages" :key="msg.id"
          :class="['flex flex-col space-y-1', msg.role === 'user' ? 'items-end' : 'items-start']">
          <!-- Role & Time Header for User -->
          <div v-if="msg.role === 'user'" class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
            <span class="font-medium text-emerald-300">Anda</span>
            <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Role & Time Header for Assistant -->
          <div v-else class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
            <img :src="iconImg" alt="Makarya" class="size-2.5 rounded-xs object-contain" />
            <span class="font-medium text-[#42b883]">Makarya Agent</span>
            <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Message Bubble (Emerald Gradient for User, Dark Card for Assistant) -->
          <div :class="[
            'p-2.5 rounded-xl max-w-[96%] leading-relaxed break-words shadow-sm transition-all w-full',
            msg.role === 'user'
              ? 'bg-gradient-to-br from-[#059669] to-[#047857] text-white rounded-tr-xs border border-emerald-400/30 text-[11px]'
              : 'bg-[#0b131e]/90 text-slate-200 rounded-tl-xs border border-white/[0.08] text-[11px]'
          ]">
            <!-- 1. Live Thinking Process Box -->
            <div v-if="msg.thoughts"
              class="mb-2 rounded-lg bg-black/40 border border-[#42b883]/20 overflow-hidden shadow-xs">
              <button @click="toggleThinkingExpand(msg.id, msg)"
                class="w-full px-2 py-1 flex items-center justify-between text-[10px] text-emerald-300 font-semibold bg-[#42b883]/10 hover:bg-[#42b883]/15 transition-all cursor-pointer">
                <span class="flex items-center gap-1">
                  <UIcon name="i-lucide-sparkles" class="size-3 text-[#42b883]"
                    :class="{ 'animate-spin': msg.isStreaming || msg.isThinking }" />
                  Penalaran AI (Thinking)
                  <span v-if="msg.thinkingDurationSeconds !== undefined"
                    class="text-[9px] font-mono text-emerald-400/70 font-normal">
                    ({{ msg.thinkingDurationSeconds }}s)
                  </span>
                </span>
                <UIcon :name="isThinkingExpanded(msg) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                  class="size-3 text-emerald-400" />
              </button>
              <div v-if="isThinkingExpanded(msg)"
                class="p-2 text-[10px] font-mono text-emerald-100/90 whitespace-pre-wrap bg-[#061214]/95 border-t border-[#42b883]/15 leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
                {{ msg.thoughts }}
                <span v-if="msg.isStreaming"
                  class="inline-block w-1 h-3 bg-[#42b883] animate-pulse ml-0.5 align-middle"></span>
              </div>
            </div>

            <!-- 2. Implementation Plan Card (if any) -->
            <div v-if="getMessageImplementationPlan(msg)" class="mb-2">
              <ImplementationPlanCard :plan="getMessageImplementationPlan(msg)!"
                @execute-plan="handleExecutePlanFromCard" @request-revision="handleRequestPlanRevision" />
            </div>

            <!-- 2b. Interactive Question Card -->
            <div v-if="msg.pendingQuestion"
              class="mb-2 p-2.5 rounded-lg bg-[#061214] border-l-2 border-l-emerald-500 border border-emerald-500/25 shadow-sm">
              <div
                class="flex items-center gap-1 text-[9px] text-emerald-400 font-semibold uppercase tracking-wider mb-1">
                <UIcon name="i-lucide-help-circle" class="size-3" />
                <span>Pertanyaan Klarifikasi Agen</span>
              </div>

              <div class="text-[11px] font-semibold text-slate-100 mb-2 leading-snug">
                {{ msg.pendingQuestion.question }}
              </div>

              <!-- Options List (Compact) -->
              <div class="space-y-1 mb-2">
                <button v-for="(opt, oIdx) in msg.pendingQuestion.options" :key="oIdx"
                  @click="!msg.pendingQuestion.selectedOption && selectOption(msg.id, opt)"
                  :disabled="Boolean(msg.pendingQuestion.selectedOption)" :class="[
                    'w-full text-left px-2 py-1.5 rounded-md border text-[10.5px] transition-all flex items-start gap-2 cursor-pointer',
                    (selectedAnswers[msg.id] === opt || msg.pendingQuestion.selectedOption === opt)
                      ? 'bg-emerald-600/30 border-emerald-400 text-emerald-100 font-semibold shadow-xs ring-1 ring-emerald-400/40'
                      : 'bg-black/30 border-white/5 text-slate-300 hover:bg-emerald-950/30 hover:border-emerald-500/30'
                  ]">
                  <span
                    class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.2 flex-shrink-0"
                    :class="(selectedAnswers[msg.id] === opt || msg.pendingQuestion.selectedOption === opt) ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400'">
                    {{ oIdx + 1 }}
                  </span>
                  <span class="flex-1 leading-tight">{{ opt }}</span>
                </button>
              </div>

              <!-- Custom Write-in Answer -->
              <div v-if="!msg.pendingQuestion.selectedOption" class="mb-2">
                <input v-model="customAnswers[msg.id]" @input="selectedAnswers[msg.id] = ''" type="text"
                  placeholder="Atau ketik jawaban sendiri..."
                  class="w-full px-2 py-1 text-[10px] bg-black/40 border border-white/10 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400" />
              </div>

              <!-- Submit Button / Selected Badge -->
              <div v-if="!msg.pendingQuestion.selectedOption" class="flex items-center justify-end">
                <button @click="submitAnswer(msg.id)"
                  :disabled="!selectedAnswers[msg.id] && !customAnswers[msg.id]?.trim()"
                  class="px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold text-[10px] transition-all cursor-pointer flex items-center gap-1 active:scale-95">
                  <UIcon name="i-lucide-check" class="size-3" />
                  <span>Kirim</span>
                </button>
              </div>
              <div v-else
                class="text-[9.5px] text-emerald-400 font-medium flex items-center gap-1 pt-1 border-t border-white/10">
                <UIcon name="i-lucide-check-circle" class="size-3 text-emerald-400" />
                <span>Pilihan: <strong>{{ msg.pendingQuestion.selectedOption }}</strong></span>
              </div>
            </div>

            <!-- 3. Tool Calls Visual Cards -->
            <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="space-y-1 mb-2">
              <div v-for="tool in msg.toolCalls" :key="tool.id"
                class="rounded-lg bg-black/40 border border-[#42b883]/20 overflow-hidden text-[10px]">
                <!-- Accordion Header -->
                <div @click="toggleToolExpand(tool.id, tool.status)"
                  class="px-2 py-1 flex items-center justify-between text-emerald-300 font-mono cursor-pointer hover:bg-emerald-500/5 transition-colors">
                  <div class="flex items-center gap-1.5 truncate max-w-[200px]">
                    <UIcon :name="getToolIcon(tool.name)" class="size-3 text-[#42b883] flex-shrink-0"
                      :class="{ 'animate-spin': tool.status === 'running' }" />
                    <span class="font-semibold text-emerald-300">{{ tool.name }}</span>
                    <span v-if="getToolSummaryArg(tool)" class="text-[9px] text-slate-400 truncate opacity-80">
                      {{ getToolSummaryArg(tool) }}
                    </span>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <span :class="[
                      'px-2 py-0.5 rounded-full text-[8.5px] font-semibold',
                      tool.status === 'success' || (tool.status as string) === 'completed'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : tool.status === 'running'
                          ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                          : tool.status === 'waiting_approval'
                            ? 'bg-indigo-500/20 text-indigo-300'
                            : 'bg-rose-500/20 text-rose-300'
                    ]">
                      {{ tool.status === 'running' ? 'Memproses...' : tool.status === 'waiting_approval' ? 'Izin...' :
                        `${tool.durationMs || 1}ms` }}
                    </span>
                    <UIcon :name="isToolExpanded(tool) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                      class="size-3 text-slate-500" />
                  </div>
                </div>

                <!-- Output Body -->
                <div v-if="isToolExpanded(tool)"
                  class="p-1.5 border-t border-[#42b883]/15 bg-black/70 text-[9.5px] text-slate-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                  <div v-if="tool.status === 'running'"
                    class="flex items-center gap-1.5 text-amber-400/90 py-0.5 animate-pulse">
                    <UIcon name="i-lucide-loader-2" class="size-3 animate-spin text-amber-400" />
                    <span>Sedang mengeksekusi aksi agen...</span>
                  </div>
                  <div v-else-if="tool.output">
                    {{ tool.output }}
                  </div>
                  <div v-else class="text-slate-500 italic">
                    (Tidak ada output teks dari aksi)
                  </div>
                </div>
              </div>
            </div>

            <!-- 4. Main Markdown Content -->
            <div v-if="msg.content" class="space-y-1.5">
              <template v-for="(block, bIdx) in parseMarkdownBlocks(msg.content)" :key="bIdx">
                <!-- Text Block -->
                <div v-if="block.type === 'text'" v-html="formatInlineMarkdown(block.content)"
                  class="leading-relaxed whitespace-pre-wrap break-words text-[11px]"></div>

                <!-- Code Fence Block -->
                <div v-else-if="block.type === 'code'"
                  class="my-1.5 rounded-lg bg-[#060c14] border border-white/10 overflow-hidden font-mono text-[10px]">
                  <div
                    class="h-6 px-2 bg-white/[0.03] border-b border-white/5 flex items-center justify-between text-slate-400">
                    <span class="text-[9px] uppercase font-semibold text-[#42b883]">{{ block.language || 'code'
                      }}</span>
                    <div class="flex items-center gap-1">
                      <button @click="copyCode(block.content, `${msg.id}-${bIdx}`)"
                        class="px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all flex items-center gap-0.5 cursor-pointer active:scale-95">
                        <UIcon :name="copiedIndex === `${msg.id}-${bIdx}` ? 'i-lucide-check' : 'i-lucide-copy'"
                          class="size-2.5" />
                        <span>{{ copiedIndex === `${msg.id}-${bIdx}` ? 'Tersalin' : 'Salin' }}</span>
                      </button>
                      <button @click="applyToEditor(block.content)"
                        class="px-2 py-0.5 rounded-full bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[9px] transition-all flex items-center gap-0.5 cursor-pointer active:scale-95"
                        title="Terapkan ke Editor">
                        <UIcon name="i-lucide-arrow-down-to-line" class="size-2.5" />
                        <span>Terapkan</span>
                      </button>
                    </div>
                  </div>
                  <pre
                    class="p-2 overflow-x-auto custom-scrollbar text-slate-200 leading-normal font-mono"><code>{{ block.content }}</code></pre>
                </div>
              </template>
            </div>

            <!-- 5. Empty State Fallback -->
            <div
              v-else-if="!msg.isStreaming && !msg.thoughts && (!msg.toolCalls || msg.toolCalls.length === 0) && msg.role === 'assistant'"
              class="text-[10px] text-slate-400 italic py-1">
              (Tidak ada respons dari model yang dipilih. Silakan coba pilih model lain atau kirim ulang pesan).
            </div>

            <!-- 6. Streaming Indicator & Live Status Pill -->
            <div v-if="msg.isStreaming" class="flex items-center gap-1.5 pt-1 text-[9.5px] text-[#42b883] font-mono">
              <span class="inline-block size-1.5 rounded-full bg-[#42b883] animate-ping"></span>
              <span class="text-emerald-300 font-medium">{{ msg.activeAction || 'Mengetik respons...' }}</span>
            </div>

            <!-- 7. Pending Approval Card for Tool Calls -->
            <div v-if="msg.toolCalls?.some((t) => t.status === 'waiting_approval')"
              class="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div class="text-[10px] font-semibold text-amber-300 flex items-center gap-1 mb-1">
                <UIcon name="i-lucide-shield-alert" class="size-3 text-amber-400" />
                Izin Diperlukan untuk Eksekusi Perintah
              </div>
              <div v-for="wTool in msg.toolCalls.filter((t) => t.status === 'waiting_approval')" :key="wTool.id"
                class="space-y-1.5 my-1">
                <p class="text-[9.5px] text-slate-300 leading-snug font-mono">
                  {{ wTool.name }}: {{ JSON.stringify(wTool.args) }}
                </p>
                <div class="flex items-center gap-2 pt-1">
                  <button @click="agentStore.approveToolCall(wTool.id, true)"
                    class="px-3.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[9.5px] shadow-xs cursor-pointer transition-all active:scale-95">
                    Setujui
                  </button>
                  <button @click="agentStore.approveToolCall(wTool.id, false)"
                    class="px-3.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-slate-300 text-[9.5px] cursor-pointer transition-all active:scale-95">
                    Tolak
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions Toolbar Under User Prompt -->
          <div v-if="msg.role === 'user'"
            class="flex items-center justify-end w-full text-[9px] text-slate-400 px-1 pt-0.5">
            <div class="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
              <button @click="handleResendPrompt(msg.content)" :disabled="agentStore.isGenerating"
                class="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-emerald-300 border border-white/[0.06] hover:border-[#42b883]/30 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95 disabled:opacity-40"
                title="Kirim ulang prompt (Resend)">
                <UIcon name="i-lucide-rotate-cw" class="size-2.5" />
                <span class="text-[8.5px]">Resend</span>
              </button>
              <button @click="handleEditPrompt(msg.content)"
                class="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-emerald-300 border border-white/[0.06] hover:border-[#42b883]/30 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
                title="Edit prompt di kolom input">
                <UIcon name="i-lucide-pencil" class="size-2.5" />
                <span class="text-[8.5px]">Edit</span>
              </button>
              <button @click="copyMessageContent(msg.content, msg.id)"
                class="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-[#42b883]/30 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
                title="Salin prompt">
                <UIcon :name="copiedIndex === msg.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5"
                  :class="copiedIndex === msg.id ? 'text-[#42b883]' : ''" />
                <span class="text-[8.5px]">{{ copiedIndex === msg.id ? 'Tersalin' : 'Salin' }}</span>
              </button>
            </div>
          </div>

          <!-- Actions Toolbar Under Assistant Response -->
          <div v-if="msg.role === 'assistant' && msg.content && !msg.isStreaming"
            class="flex items-center justify-between w-full text-[9px] text-slate-400 px-1 pt-0.5">
            <div class="flex items-center gap-1.5">
              <button @click="copyMessageContent(msg.content, msg.id)"
                class="px-2.5 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-[#42b883] border border-white/[0.06] hover:border-[#42b883]/30 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                title="Salin isi seluruh respon Agen">
                <UIcon :name="copiedIndex === msg.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5"
                  :class="copiedIndex === msg.id ? 'text-[#42b883]' : ''" />
                <span class="text-[8.5px] font-medium">{{ copiedIndex === msg.id ? 'Tersalin' : 'Salin' }}</span>
              </button>

              <button @click="handleRegenerateResponse(msg.id)" :disabled="agentStore.isGenerating"
                class="px-2.5 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-emerald-300 border border-white/[0.06] hover:border-[#42b883]/30 transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
                title="Buat ulang respon ini (Regenerate)">
                <UIcon name="i-lucide-rotate-cw" class="size-2.5" />
                <span class="text-[8.5px] font-medium">Ulangi</span>
              </button>
            </div>

            <div class="flex items-center gap-1.5 text-[8.5px] text-slate-400 font-mono">
              <span class="px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.05] text-slate-400">
                {{ agentStore.selectedModel || 'Default Model' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active File Context Strip -->
    <div v-if="workspaceStore.activeTab?.filePath"
      class="px-2.5 py-1 bg-black/40 border-t border-white/[0.06] flex items-center justify-between text-[9px] text-slate-400">
      <div class="flex items-center gap-1 truncate max-w-[180px]">
        <UIcon name="i-lucide-paperclip" class="size-2.5 text-[#42b883]" />
        <span class="truncate text-slate-300 font-mono">{{ workspaceStore.activeTab.title }}</span>
      </div>
      <label
        class="flex items-center gap-1 cursor-pointer select-none text-[8.5px] text-[#42b883] font-medium hover:text-emerald-300">
        <input type="checkbox" v-model="includeActiveFile" class="rounded accent-[#42b883] size-2.5 cursor-pointer" />
        <span>Konteks File</span>
      </label>
    </div>

    <!-- Input Box -->
    <div class="p-2.5 bg-[#090d14] border-t border-white/[0.06] flex-shrink-0 relative z-20">
      <div
        class="bg-[#0b131e]/90 border border-white/[0.08] hover:border-white/[0.14] focus-within:border-[#42b883]/50 focus-within:ring-1 focus-within:ring-[#42b883]/25 rounded-2xl p-2.5 shadow-xl transition-all duration-200 space-y-2">
        <!-- Hidden Image Input File Picker -->
        <input ref="imageInputRef" type="file" accept="image/*" multiple class="hidden"
          @change="handleImageInputChange" />

        <!-- Attached Images Preview Strip (Only if images are attached) -->
        <div v-if="attachedImages.length > 0" class="flex flex-wrap items-center gap-1.5 pb-1.5 border-b border-white/[0.06] max-h-24 overflow-y-auto custom-scrollbar">
          <div
            v-for="(img, idx) in attachedImages"
            :key="idx"
            class="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md bg-[#0a1815] hover:bg-[#0d221e] border border-[#42b883]/35 hover:border-[#42b883]/60 text-emerald-300 text-[10px] font-mono shadow-xs transition-colors select-none max-w-[180px]"
          >
            <img :src="img.previewUrl" :alt="img.name" class="w-4 h-4 rounded object-cover flex-shrink-0 bg-black/40 border border-white/10" />
            <span class="truncate flex-1 min-w-0 text-[10px]" :title="img.relativePath">
              {{ img.name }}
            </span>
            <button
              @click.stop="removeAttachedImage(idx)"
              class="w-3.5 h-3.5 rounded hover:bg-rose-500/20 hover:text-rose-400 text-emerald-400/60 flex items-center justify-center transition-colors flex-shrink-0 cursor-pointer ml-0.5"
              title="Hapus gambar"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </button>
          </div>
        </div>

        <!-- Textarea -->
        <div class="relative w-full">
          <textarea ref="inputAreaRef" v-model="inputText" @input="adjustTextareaHeight" @keydown="handleKeyDown" @paste="handlePaste"
            placeholder="Ask Makarya Agent anything, tag code (Ctrl+L), paste (Ctrl+V), @, /" rows="1"
            class="w-full bg-transparent border-none text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none p-0 leading-relaxed font-sans min-h-[22px] max-h-[160px] custom-scrollbar overflow-y-hidden"></textarea>
        </div>

        <!-- Bottom Controls Row inside the Pill -->
        <div class="flex items-center justify-between pt-0.5">
          <!-- Left: Settings, @ Mention Context, Upload Image -->
          <div class="flex items-center gap-1.5">
            <!-- Settings / Model Button -->
            <button @click="isModelModalOpen = !isModelModalOpen; isSessionModalOpen = false"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer border text-[11px] flex-shrink-0"
              :class="isModelModalOpen
                ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883] shadow-xs'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'"
              :title="`Pengaturan Model AI (Aktif: ${agentStore.selectedModel || 'Default'})`">
              <UIcon name="i-lucide-settings" class="size-3 font-semibold" />
            </button>

            <!-- @ Mention / File Context Toggle Button -->
            <button @click="includeActiveFile = !includeActiveFile"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-[11px] flex-shrink-0 cursor-pointer"
              :class="includeActiveFile && workspaceStore.activeTab?.filePath
                ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883] shadow-xs ring-1 ring-[#42b883]/30'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'"
              :title="includeActiveFile && workspaceStore.activeTab?.filePath ? `Konteks Aktif: ${workspaceStore.activeTab.title}` : 'Sertakan Konteks Berkas (@)'">
              <UIcon name="i-lucide-at-sign" class="size-3 font-semibold" />
            </button>

            <!-- Upload Image to .makarya Folder Button -->
            <button @click="triggerImageUpload" :disabled="!connectedProject || isUploadingImage"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-[11px] flex-shrink-0"
              :class="[
                !connectedProject
                  ? 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/[0.05] text-slate-500'
                  : attachedImages.length > 0
                    ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883] shadow-xs cursor-pointer'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-[#42b883]/40 text-slate-400 hover:text-[#42b883] cursor-pointer'
              ]"
              :title="!connectedProject ? 'Buka folder project terlebih dahulu untuk upload gambar' : 'Unggah Gambar ke Folder .makarya'">
              <UIcon :name="isUploadingImage ? 'i-lucide-loader-2' : 'i-lucide-image'" class="size-3"
                :class="{ 'animate-spin': isUploadingImage }" />
            </button>
          </div>

          <!-- Right: Mic & Circular Send/Stop Button -->
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <!-- Voice Input Icon -->
            <button
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-[#42b883]/40 hover:text-[#42b883] cursor-pointer flex-shrink-0"
              title="Input Suara">
              <UIcon name="i-lucide-mic" class="size-3" />
            </button>

            <!-- Circular Send / Abort Button -->
            <button v-if="agentStore.isGenerating" @click="agentStore.abortGeneration"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              title="Hentikan Jawaban Agen (Stop)">
              <UIcon name="i-lucide-square" class="size-3" />
            </button>
            <button v-else @click="handleSendMessage" :disabled="!inputText.trim() && attachedImages.length === 0 && taggedContexts.length === 0"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="(inputText.trim() || attachedImages.length > 0 || taggedContexts.length > 0)
                ? 'bg-gradient-to-r from-[#059669] to-[#42b883] text-white hover:from-[#10b981] hover:to-[#34d399] shadow-md shadow-emerald-600/30 cursor-pointer font-bold'
                : 'bg-white/[0.05] text-slate-400 border border-white/[0.08] hover:bg-white/[0.08]'"
              title="Kirim (Enter)">
              <UIcon name="i-lucide-arrow-right" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Switcher Modal (Only Combo Models) -->
    <AgentModelModal :is-open="isModelModalOpen" @close="isModelModalOpen = false" />

    <!-- Sessions Switcher & Manager Modal -->
    <AgentSessionModal :is-open="isSessionModalOpen" @close="isSessionModalOpen = false" />
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 3.5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(66, 184, 131, 0.25);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.45);
}

@keyframes agent-shimmer-anim {
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

@keyframes agent-glow-pulse-anim {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(66, 184, 131, 0.4);
    background-color: #059669;
  }

  50% {
    box-shadow: 0 0 8px rgba(52, 211, 153, 0.9), 0 0 16px rgba(52, 211, 153, 0.4);
    background-color: #42b883;
  }
}

.agent-gradient-text {
  background: linear-gradient(90deg, #059669, #10b981, #34d399, #10b981, #059669);
  background-size: 250% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: agent-shimmer-anim 4s ease infinite;
}

.agent-pulse-dot {
  animation: agent-glow-pulse-anim 2.5s ease-in-out infinite;
}
</style>
