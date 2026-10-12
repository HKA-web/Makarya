<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { useOpenCodeStore } from '@renderer/stores/openCodeStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { parseMarkdownBlocks, formatInlineMarkdown } from '@renderer/utils/markdownParser'
import OpenCodeModelModal from './OpenCodeModelModal.vue'
import OpenCodeSessionModal from './OpenCodeSessionModal.vue'
import openCodeLogo from '@renderer/assets/opencode-logo.png'
import iconImg from '@renderer/assets/icon.jpg'

const openCodeStore = useOpenCodeStore()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const inputText = ref('')
const inputAreaRef = ref<HTMLTextAreaElement | null>(null)
const messageContainer = ref<HTMLElement | null>(null)
const includeActiveFile = ref(false)
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

const taggedContexts = ref<TaggedContextItem[]>([])

const connectedProject = computed(() => {
  const rootPath = workspaceStore.getEffectiveProjectRoot()
  if (!rootPath) return null

  const match = workspaceStore.workspaceRoots.find(
    (r) => r.path.toLowerCase().replace(/\\/g, '/') === rootPath.toLowerCase().replace(/\\/g, '/')
  )
  if (match) return match

  const normalized = rootPath.replace(/\\/g, '/')
  const name = normalized.split('/').filter(Boolean).pop() || 'Project'
  return { path: rootPath, name }
})

// Interactive Question selection state
const selectedAnswers = ref<Record<string, string>>({})
const customAnswers = ref<Record<string, string>>({})
const selectedChoiceMap = ref<Record<string, string>>({})

// Collapsible tool outputs
const expandedTools = ref<Record<string, boolean>>({})

function onMakaryaTagToAgent(e: Event) {
  const customEvent = e as CustomEvent<TaggedContextItem>
  if (!customEvent.detail) return

  const item = customEvent.detail
  const tagId = `${item.path}-${item.lineRange || item.startLine || 'all'}`

  const existingIdx = taggedContexts.value.findIndex((t) => t.id === tagId)
  if (existingIdx === -1) {
    taggedContexts.value.push({
      ...item,
      id: tagId
    })
  }

  // Insert tag directly into the chat input (e.g. "tes 📄 ImplementationPlanCard.vue")
  const fileBadge = `📄 ${item.name}${item.lineRange ? ` ${item.lineRange}` : ''}`
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

function removeTaggedContext(id: string) {
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
        console.warn('Gagal menyimpan gambar:', err)
      }
    }
    if (base64) {
      attachedImages.value.push({
        name: file.name,
        relativePath: file.name,
        absolutePath: (file as any).path || file.name,
        previewUrl: base64
      })
    }
  }
  reader.readAsDataURL(file)
}

onMounted(() => {
  openCodeStore.loadAvailableModels()
  openCodeStore.loadSessions()
  window.addEventListener('makarya:tag-to-agent', onMakaryaTagToAgent)
})

onUnmounted(() => {
  window.removeEventListener('makarya:tag-to-agent', onMakaryaTagToAgent)
})

function isToolExpanded(tool: any): boolean {
  if (expandedTools.value[tool.id] !== undefined) {
    return expandedTools.value[tool.id]
  }
  // Default: open/expand saat running, lipat/tutup otomatis saat selesai
  return tool.status === 'running'
}

function toggleToolExpand(toolId: string, currentStatus?: string) {
  const current = isToolExpanded({ id: toolId, status: currentStatus })
  expandedTools.value[toolId] = !current
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
    openCodeStore.messages.length,
    openCodeStore.messages[openCodeStore.messages.length - 1]?.content,
    openCodeStore.messages[openCodeStore.messages.length - 1]?.thinking,
    openCodeStore.messages[openCodeStore.messages.length - 1]?.tools?.length,
    openCodeStore.messages[openCodeStore.messages.length - 1]?.pendingQuestion
  ],
  () => {
    scrollToBottom()
  },
  { deep: true }
)

export interface AttachedImageItem {
  name: string
  relativePath: string
  absolutePath: string
  previewUrl: string
}

const attachedImages = ref<AttachedImageItem[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
const isUploadingImage = ref<boolean>(false)

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
  if ((!text && attachedImages.value.length === 0 && taggedContexts.value.length === 0) || openCodeStore.isExecuting) return

  const displayPrompt = text || (taggedContexts.value.length > 0
    ? taggedContexts.value.map((t) => `📄 ${t.name}${t.lineRange ? ` ${t.lineRange}` : ''}`).join(' ')
    : 'Harap periksa dan analisis berkas/kode/gambar yang dilampirkan.')

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
  if (includeActiveFile.value && workspaceStore.activeTab?.filePath) {
    const activeTab = workspaceStore.activeTab
    fullPrompt = `[Konteks Berkas Aktif: ${activeTab.filePath}]\n\`\`\`${activeTab.language || ''}\n${activeTab.content || ''}\n\`\`\`\n\nInstruksi Pengguna:\n${fullPrompt}`
  }

  inputText.value = ''
  attachedImages.value = []
  taggedContexts.value = []
  adjustTextareaHeight()
  scrollToBottom()

  const projectRoot = connectedProject.value ? connectedProject.value.path : undefined

  await openCodeStore.sendPrompt(fullPrompt, projectRoot, displayPrompt)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSendMessage()
  }
}

function formatMessageTime(timestamp?: number | string): string {
  if (!timestamp) return ''
  return settingsStore.formatTimestamp(timestamp)
}

function handleEditPrompt(content: string) {
  inputText.value = content
  adjustTextareaHeight()
  nextTick(() => {
    inputAreaRef.value?.focus()
  })
}

async function handleResendPrompt(content: string) {
  if (openCodeStore.isExecuting) return
  const projectRoot = connectedProject.value ? connectedProject.value.path : undefined
  
  await openCodeStore.sendPrompt(content, projectRoot)
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
  if (openCodeStore.isExecuting) return
  const msgIdx = openCodeStore.messages.findIndex((m) => m.id === messageId)
  if (msgIdx < 0) return

  let userPrompt = ''
  for (let i = msgIdx - 1; i >= 0; i--) {
    if (openCodeStore.messages[i].role === 'user') {
      userPrompt = openCodeStore.messages[i].content
      break
    }
  }

  if (userPrompt) {
    const projectRoot = connectedProject.value ? connectedProject.value.path : undefined

    await openCodeStore.sendPrompt(userPrompt, projectRoot)
  }
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

async function copyThinkingText(text: string, id: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedIndex.value = `thinking-${id}`
    setTimeout(() => {
      if (copiedIndex.value === `thinking-${id}`) copiedIndex.value = null
    }, 2000)
  } catch (err) {
    console.warn('Gagal menyalin penalaran:', err)
  }
}

function applyToEditor(code: string) {
  if (workspaceStore.activeTab && workspaceStore.activeTab.tabType === 'editor') {
    workspaceStore.updateTabContent(workspaceStore.activeTab.id, code)
  }
}

function selectOption(msgId: string, option: string) {
  selectedAnswers.value[msgId] = option
  customAnswers.value[msgId] = ''
}

async function submitAnswer(msgId: string) {
  const custom = customAnswers.value[msgId]?.trim()
  const chosen = custom || selectedAnswers.value[msgId]
  if (!chosen) return

  await openCodeStore.submitQuestionAnswer(msgId, chosen)
  scrollToBottom()
}

function getVisibleTools(tools?: any[]) {
  if (!tools) return []
  return tools.filter((t) => t.name !== 'ask_question')
}

function getToolSummaryArg(tool: any): string {
  if (!tool.args) return ''
  if (tool.args.filePath) return tool.args.filePath.split(/[\\/]/).pop() || tool.args.filePath
  if (tool.args.dirPath) return tool.args.dirPath.split(/[\\/]/).pop() || tool.args.dirPath
  if (tool.args.command) return tool.args.command.length > 30 ? tool.args.command.slice(0, 30) + '...' : tool.args.command
  if (tool.args.query) return `"${tool.args.query}"`
  return ''
}

export interface DetectedOption {
  key: string
  badge: string
  title: string
  description?: string
  fullText: string
  isConfirmation?: boolean
}

function extractInteractiveOptions(content: string): DetectedOption[] {
  if (!content) return []
  const lines = content.split(/\r?\n/)
  const options: DetectedOption[] = []
  let currentOpt: DetectedOption | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // 1. Match Numbered: "1. Title", "1) Title", "[1] Title", "(1) Title"
    const numMatch = line.match(/^(?:(\d+)[\.\)\-\:]|\[(\d+)\]|\((\d+)\))\s+(.+)$/)
    if (numMatch) {
      if (currentOpt) options.push(currentOpt)
      const numStr = numMatch[1] || numMatch[2] || numMatch[3]
      const rawText = numMatch[4].trim()

      let title = rawText
      let desc = ''
      const splitDash = rawText.split(/\s+[-–—:]\s+/)
      if (splitDash.length > 1) {
        title = splitDash[0].replace(/\*\*/g, '').trim()
        desc = splitDash.slice(1).join(' - ').replace(/\*\*/g, '').trim()
      } else {
        title = rawText.replace(/\*\*/g, '').trim()
      }

      currentOpt = {
        key: numStr,
        badge: numStr,
        title,
        description: desc,
        fullText: rawText
      }
      continue
    }

    // 2. Match Lettered: "A. Title", "A) Title", "[A] Title"
    const letterMatch = line.match(/^(?:([A-Za-z])[\.\)\-\:]|\[([A-Za-z])\])\s+(.+)$/)
    if (letterMatch) {
      if (currentOpt) options.push(currentOpt)
      const lStr = (letterMatch[1] || letterMatch[2]).toUpperCase()
      const rawText = letterMatch[3].trim()

      let title = rawText
      let desc = ''
      const splitDash = rawText.split(/\s+[-–—:]\s+/)
      if (splitDash.length > 1) {
        title = splitDash[0].replace(/\*\*/g, '').trim()
        desc = splitDash.slice(1).join(' - ').replace(/\*\*/g, '').trim()
      } else {
        title = rawText.replace(/\*\*/g, '').trim()
      }

      currentOpt = {
        key: lStr,
        badge: lStr,
        title,
        description: desc,
        fullText: rawText
      }
      continue
    }

    // 3. Match Bold Bullet items: "- **Option**: Description" or "* **Option** - Description"
    const bulletMatch = line.match(/^[\*\-]\s+\*\*([^\*]+)\*\*(?:\s*[:–—\-]\s*(.*))?$/)
    if (bulletMatch) {
      if (currentOpt) options.push(currentOpt)
      const title = bulletMatch[1].trim()
      const desc = bulletMatch[2] ? bulletMatch[2].trim() : ''
      const idx = options.length + 1

      currentOpt = {
        key: String(idx),
        badge: String(idx),
        title,
        description: desc,
        fullText: `${title}: ${desc}`.trim()
      }
      continue
    }

    // 4. Continue multi-line description for current option
    if (currentOpt && !line.match(/^[#>`*-]/) && !line.startsWith('```')) {
      if (!currentOpt.description) {
        currentOpt.description = line
      } else {
        currentOpt.description += ' ' + line
      }
    }
  }

  if (currentOpt) {
    options.push(currentOpt)
  }

  if (options.length >= 2) {
    return options
  }

  // 5. Binary Confirmation Prompts e.g. "Lanjutkan? (y/n)" or "Apakah Anda ingin melanjutkan?"
  const lower = content.toLowerCase()
  if (
    lower.includes('(y/n)') ||
    lower.includes('[y/n]') ||
    lower.includes('(yes/no)') ||
    lower.includes('[yes/no]') ||
    /apakah anda ingin|do you want to proceed|apakah perlu saya lanjutkan/i.test(content)
  ) {
    return [
      {
        key: 'y',
        badge: '✓',
        title: 'Ya, Lanjutkan',
        description: 'Setujui dan lanjutkan proses eksekusi ini',
        fullText: 'Ya, silakan lanjutkan.',
        isConfirmation: true
      },
      {
        key: 'n',
        badge: '✕',
        title: 'Tidak / Batalkan',
        description: 'Batalkan atau minta pendekatan alternatif',
        fullText: 'Tidak, batalkan tindakan ini.',
        isConfirmation: true
      }
    ]
  }

  return []
}

async function handleSelectDetectedOption(msgId: string, opt: DetectedOption) {
  if (openCodeStore.isExecuting) return
  selectedChoiceMap.value[msgId] = opt.key
  const textToSend = opt.isConfirmation ? opt.fullText : `${opt.badge}. ${opt.title}`
  inputText.value = textToSend
  await handleSendMessage()
}
</script>

<template>
  <aside
    @dragenter="handleDragEnter"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent="handleFileDrop"
    class="w-88 h-full flex flex-col bg-[#090b0e] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 text-slate-100 font-sans relative overflow-hidden shadow-sm transition-all"
  >
    <!-- Drag & Drop Overlay Indicator -->
    <div
      v-if="isDraggingOver"
      class="absolute inset-0 bg-[#061512]/90 backdrop-blur-xs border-2 border-dashed border-[#42b883] z-50 flex flex-col items-center justify-center p-6 text-center space-y-2 pointer-events-none animate-in fade-in duration-150"
    >
      <div class="w-12 h-12 rounded-2xl bg-[#42b883]/20 flex items-center justify-center text-[#42b883] shadow-lg">
        <UIcon name="i-lucide-file-code" class="size-6 animate-bounce text-[#42b883]" />
      </div>
      <p class="text-xs font-semibold text-emerald-300">Lepaskan Berkas / Gambar ke Sini</p>
      <p class="text-[10px] text-slate-400">Tambahkan berkas atau potongan kode langsung ke konteks Agent</p>
    </div>

    <!-- Header (Matte Black / Hitam Dof Theme) -->
    <div class="h-9 px-3 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold bg-[#0d0f14]/95 backdrop-blur-md flex-shrink-0">
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <a
          href="https://opencode.ai"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center group cursor-pointer"
          title="Buka Website Resmi OpenCode (opencode.ai)"
        >
          <img :src="openCodeLogo" alt="OpenCode" class="h-5 w-5 rounded object-contain group-hover:scale-110 transition-transform" />
        </a>
        <span :class="['inline-block size-1.5 rounded-full', openCodeStore.isExecuting ? 'bg-amber-400 animate-ping' : 'bg-zinc-400 animate-pulse']"></span>
        <img :src="iconImg" alt="Makarya" class="h-5 w-auto object-contain drop-shadow-[0_0_6px_rgba(255,255,255,0.2)]" title="Makarya IDE" />
      </div>

      <div class="flex items-center gap-1">
        <!-- Mode Switcher Badge (OpenCode: build / plan) -->
        <div class="flex items-center bg-black/50 rounded-md p-0.5 border border-white/5 text-[9px] mr-0.5">
          <button
            @click="openCodeStore.executionMode = 'agent'"
            :class="[
              'px-1.5 py-0.2 rounded transition-all cursor-pointer',
              openCodeStore.executionMode === 'agent' ? 'bg-white/15 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            ]"
            title="Mode Agent (OpenCode Build) - Agen otonom dengan eksekusi perkakas dan modifikasi berkas"
          >
            Agent
          </button>
          <button
            @click="openCodeStore.executionMode = 'chat'"
            :class="[
              'px-1.5 py-0.2 rounded transition-all cursor-pointer',
              openCodeStore.executionMode === 'chat' ? 'bg-white/15 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
            ]"
            title="Mode Chat (OpenCode Plan) - Perencanaan arsitektur, penalaran & diskusi tanpa modifikasi berkas"
          >
            Chat
          </button>
        </div>

        <!-- Gear Settings Button (Model & Config Switcher) -->
        <button
          @click="isModelModalOpen = !isModelModalOpen; isSessionModalOpen = false"
          :class="[
            'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer',
            isModelModalOpen
              ? 'bg-white/15 text-white ring-1 ring-white/30'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          ]"
          :title="`Pengaturan Model AI (Aktif: ${openCodeStore.currentModelItem.name || openCodeStore.currentModel})`"
        >
          <UIcon name="i-lucide-settings" class="size-3.5" />
        </button>

        <!-- Sessions / History Switcher Button -->
        <button
          @click="isSessionModalOpen = !isSessionModalOpen; isModelModalOpen = false"
          :class="[
            'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer group',
            isSessionModalOpen
              ? 'bg-white/15 text-white ring-1 ring-white/30'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          ]"
          title="Riwayat Sesi Obrolan"
        >
          <UIcon name="i-lucide-history" class="size-3.5 group-hover:rotate-[-20deg] transition-transform" />
        </button>

        <!-- New Chat Session Button -->
        <button
          @click="openCodeStore.createNewSession()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Mulai Sesi Obrolan Baru"
        >
          <UIcon name="i-lucide-square-pen" class="size-3.5" />
        </button>

        <!-- Clear Chat Button -->
        <button
          @click="openCodeStore.clearMessages()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Bersihkan Percakapan (Hapus Chat)"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>

        <!-- Close / Collapse Panel Button -->
        <button
          @click="workspaceStore.toggleOpenCodePanel()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Tutup Panel OpenCode"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading Session History State -->
    <div v-if="openCodeStore.isLoadingSessionHistory" class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 font-mono">
      <div class="w-10 h-10 rounded-xl bg-white/5 border border-white/15 flex items-center justify-center text-slate-200 animate-pulse shadow-lg">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-slate-200" />
      </div>
      <div class="space-y-1">
        <p class="text-xs font-semibold text-slate-200">Memuat Riwayat Sesi...</p>
        <p class="text-[10px] text-slate-400">Mengambil percakapan OpenCode Agent</p>
      </div>
    </div>

    <!-- Messages Container (Scrollable Area) -->
    <div v-else ref="messageContainer" @click="handleChatContainerClick" class="flex-1 overflow-y-auto p-3 text-[11px] relative flex flex-col custom-scrollbar">
      <!-- DEFAULT HERO STATE (Shown when messages.length === 0) -->
      <div
        v-if="openCodeStore.messages.length === 0"
        class="my-auto flex flex-col items-center justify-center py-6 px-2 text-center select-none w-full"
      >
        <!-- Glow Logo Card with Official Website Link -->
        <a
          href="https://opencode.ai"
          target="_blank"
          rel="noopener noreferrer"
          class="relative group mb-4 mx-auto flex items-center justify-center cursor-pointer block"
          title="Kunjungi Website Resmi OpenCode (opencode.ai)"
        >
          <div class="absolute -inset-1.5 bg-gradient-to-r from-white/10 via-zinc-400/10 to-white/10 rounded-3xl blur-md opacity-75 group-hover:opacity-100 group-hover:scale-105 transition duration-500"></div>
          <div class="relative w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-[#111317] border border-white/15 group-hover:border-white/30 shadow-xl shadow-black/40 flex items-center justify-center p-3.5 overflow-hidden transition-all">
            <img
              :src="openCodeLogo"
              alt="OpenCode"
              class="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform"
            />
            <!-- External link badge icon -->
            <div class="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/80 border border-white/20 flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
              <UIcon name="i-lucide-external-link" class="size-2.5" />
            </div>
          </div>
        </a>

        <!-- Title with Link Icon -->
        <div class="flex items-center justify-center gap-1.5 mb-1.5">
          <h2 class="text-base sm:text-lg font-bold tracking-tight text-white flex items-center justify-center gap-1.5 text-center">
            <span class="opencode-matte-text">{{ openCodeStore.executionMode === 'chat' ? 'OpenCode Chat' : 'OpenCode Agent' }}</span>
          </h2>
          <a
            href="https://opencode.ai"
            target="_blank"
            rel="noopener noreferrer"
            class="text-slate-400 hover:text-white transition-colors inline-flex items-center p-0.5 rounded hover:bg-white/5"
            title="Kunjungi opencode.ai"
          >
            <UIcon name="i-lucide-external-link" class="size-3 text-slate-400 hover:text-white" />
          </a>
        </div>

        <!-- Subtitle -->
        <p class="text-[11px] text-slate-400 text-center max-w-[270px] mx-auto leading-relaxed mb-4">
          {{
            openCodeStore.executionMode === 'chat'
              ? 'Mode Plan: Mode chat dan perencanaan arsitektur OpenCode. Mendukung analisis kode, perancangan solusi, dan tanya-jawab tanpa mengubah file secara langsung.'
              : 'Mode Build: Agen pemrograman otonom bertenaga model OpenCode. Mendukung eksekusi perkakas, modifikasi file, dan refactoring presisi tinggi.'
          }}
        </p>

        <!-- Target Project Connected Badge -->
        <div
          v-if="connectedProject"
          class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/15 text-[10px] text-slate-300 flex items-center gap-2 max-w-[95%] shadow-xs"
        >
          <span class="w-2 h-2 rounded-full bg-zinc-400 opencode-pulse-dot flex-shrink-0"></span>
          <span class="text-slate-400 font-medium flex-shrink-0">Project Aktif:</span>
          <span class="font-mono text-slate-200 truncate text-[10px]" :title="connectedProject.path">
            {{ connectedProject.name }}
          </span>
        </div>
        <div
          v-else
          class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-[10px] text-slate-400 flex items-center gap-2 max-w-[95%] shadow-xs"
        >
          <span class="w-2 h-2 rounded-full bg-amber-400/80 flex-shrink-0"></span>
          <span class="text-amber-400/80 font-medium flex-shrink-0">Project:</span>
          <span class="text-amber-200/80 truncate text-[10px]" title="Buka berkas atau folder di editor untuk menghubungkan project ke OpenCode">
            Belum ditentukan (Global)
          </span>
        </div>
      </div>

      <!-- Messages Stream List (When messages exist) -->
      <div v-else class="space-y-2.5">
        <div
          v-for="msg in openCodeStore.messages"
          :key="msg.id"
          :class="['flex flex-col space-y-1', msg.role === 'user' ? 'items-end' : 'items-start']"
        >
        <!-- Role & Time Header for User -->
        <div v-if="msg.role === 'user'" class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
          <span class="font-medium text-zinc-300">Anda</span>
          <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
            {{ formatMessageTime(msg.timestamp) }}
          </span>
        </div>

        <!-- Role & Time Header for Agent -->
        <div v-else class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
          <img :src="openCodeLogo" alt="OpenCode" class="size-2.5 rounded-xs object-contain" />
          <span class="font-medium text-slate-200">OpenCode Agent</span>
          <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
            {{ formatMessageTime(msg.timestamp) }}
          </span>
        </div>

        <!-- Message Bubble (Matte Black / Hitam Dof Accent) -->
        <div
          :class="[
            'p-2.5 rounded-xl max-w-[96%] leading-relaxed break-words shadow-sm transition-all w-full',
            msg.role === 'user'
              ? 'bg-[#1c2027] text-slate-100 rounded-tr-xs border border-white/[0.12] text-[11px]'
              : 'bg-[#111317] text-slate-200 rounded-tl-xs border border-white/[0.08] text-[11px]'
          ]"
        >
          <!-- 1. Modern Chat-Style Thinking Process Component -->
          <!-- State A: Thinking Content Present -->
          <div
            v-if="msg.thinking"
            class="mb-2.5 rounded-xl border transition-all duration-200 overflow-hidden shadow-xs"
            :class="[
              msg.isStreaming
                ? 'bg-[#0b0d11] border-white/[0.16] ring-1 ring-white/[0.06]'
                : 'bg-white/[0.02] border-white/[0.08] hover:border-white/[0.14]'
            ]"
          >
            <!-- Accordion Header Bar -->
            <button
              @click="openCodeStore.toggleThinking(msg.id)"
              class="w-full px-2.5 py-1.5 flex items-center justify-between text-[10.5px] bg-white/[0.02] hover:bg-white/[0.05] transition-all cursor-pointer select-none group"
            >
              <div class="flex items-center gap-2 min-w-0">
                <div
                  class="size-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="msg.isStreaming ? 'bg-white/10 text-white border border-white/10' : 'bg-white/5 text-zinc-400 group-hover:text-zinc-300'"
                >
                  <UIcon
                    :name="msg.isStreaming ? 'i-lucide-brain' : 'i-lucide-sparkles'"
                    class="size-3.5"
                    :class="{ 'animate-pulse text-zinc-100': msg.isStreaming }"
                  />
                </div>
                <div class="flex items-center gap-1.5 truncate">
                  <span
                    class="font-medium truncate transition-colors"
                    :class="msg.isStreaming ? 'text-zinc-100' : 'text-slate-300 group-hover:text-slate-100'"
                  >
                    {{ msg.isStreaming ? 'Sedang menalar...' : 'Proses Penalaran' }}
                  </span>
                  <span
                    v-if="msg.thinkingSeconds !== undefined"
                    class="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-white/5 text-zinc-400 border border-white/5 flex-shrink-0"
                  >
                    {{ msg.thinkingSeconds }}s
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-1.5 flex-shrink-0 text-zinc-400 group-hover:text-zinc-200">
                <button
                  v-if="msg.isThinkingExpanded"
                  @click.stop="copyThinkingText(msg.thinking, msg.id)"
                  class="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Salin hasil penalaran"
                >
                  <UIcon :name="copiedIndex === `thinking-${msg.id}` ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
                </button>
                <span class="text-[9px] hidden sm:inline-block opacity-75">
                  {{ msg.isThinkingExpanded ? 'Sembunyikan' : 'Lihat proses' }}
                </span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-3.5 transition-transform duration-200"
                  :class="{ 'rotate-180': msg.isThinkingExpanded }"
                />
              </div>
            </button>

            <!-- Expanded Body (Full Content Display) -->
            <div
              v-if="msg.isThinkingExpanded"
              class="p-2.5 border-t border-white/[0.06] bg-black/50 text-[10.5px] text-slate-300 leading-relaxed"
            >
              <div class="pl-2.5 border-l-2 border-zinc-400/50 font-sans whitespace-pre-wrap break-words text-slate-200 selection:bg-white/20">
                {{ msg.thinking }}
                <!-- Live thinking loading spinner -->
                <UIcon
                  v-if="msg.isStreaming"
                  name="i-lucide-loader-2"
                  class="inline-block size-3 text-zinc-400 animate-spin ml-1 align-middle"
                />
              </div>
            </div>
          </div>

          <!-- State B: Live Streaming but Thinking Token hasn't arrived yet and content is empty -->
          <div
            v-else-if="msg.isStreaming && !msg.content && (!msg.tools || msg.tools.length === 0)"
            class="mb-2.5 p-2 rounded-xl bg-[#0b0d11] border border-white/[0.16] ring-1 ring-white/[0.06] flex items-center justify-between shadow-xs animate-pulse"
          >
            <div class="flex items-center gap-2 min-w-0">
              <div class="size-5 rounded-md bg-white/10 text-zinc-200 border border-white/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-brain" class="size-3.5 animate-pulse text-zinc-200" />
              </div>
              <span class="text-[10.5px] font-medium text-zinc-200 truncate">
                Sedang menganalisis logika & kode...
              </span>
            </div>
            <div class="flex items-center gap-1 pr-1">
              <span class="size-1.5 rounded-full bg-zinc-400 animate-bounce" style="animation-delay: 0ms"></span>
              <span class="size-1.5 rounded-full bg-zinc-400 animate-bounce" style="animation-delay: 150ms"></span>
              <span class="size-1.5 rounded-full bg-zinc-400 animate-bounce" style="animation-delay: 300ms"></span>
            </div>
          </div>

          <!-- 2. Interactive Question Card (Positioned Above Tools for Natural Chronology) -->
          <div v-if="msg.pendingQuestion" class="mb-2 p-2.5 rounded-lg bg-[#111317] border-l-2 border-l-zinc-400 border border-white/10 shadow-sm">
            <div class="flex items-center gap-1 text-[9px] text-zinc-400 font-semibold uppercase tracking-wider mb-1">
              <UIcon name="i-lucide-help-circle" class="size-3" />
              <span>Pertanyaan Klarifikasi</span>
            </div>

            <div class="text-[11px] font-semibold text-slate-100 mb-2 leading-snug">
              {{ msg.pendingQuestion.question }}
            </div>

            <!-- Options List (Compact) -->
            <div class="space-y-1 mb-2">
              <button
                v-for="(opt, oIdx) in msg.pendingQuestion.options"
                :key="oIdx"
                @click="!msg.pendingQuestion.selectedOption && selectOption(msg.id, opt)"
                :disabled="Boolean(msg.pendingQuestion.selectedOption)"
                :class="[
                  'w-full text-left px-2 py-1.5 rounded-md border text-[10.5px] transition-all flex items-start gap-2 cursor-pointer',
                  (selectedAnswers[msg.id] === opt || msg.pendingQuestion.selectedOption === opt)
                    ? 'bg-white/15 border-white/40 text-white font-semibold shadow-xs ring-1 ring-white/20'
                    : 'bg-black/30 border-white/5 text-slate-300 hover:bg-white/5 hover:border-white/20'
                ]"
              >
                <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.2 flex-shrink-0"
                  :class="(selectedAnswers[msg.id] === opt || msg.pendingQuestion.selectedOption === opt) ? 'bg-white text-black' : 'bg-white/10 text-slate-400'">
                  {{ oIdx + 1 }}
                </span>
                <span class="flex-1 leading-tight">{{ opt }}</span>
              </button>
            </div>

            <!-- Custom Write-in Answer -->
            <div v-if="!msg.pendingQuestion.selectedOption" class="mb-2">
              <input
                v-model="customAnswers[msg.id]"
                @input="selectedAnswers[msg.id] = ''"
                type="text"
                placeholder="Atau ketik jawaban sendiri..."
                class="w-full px-2 py-1 text-[10px] bg-black/40 border border-white/10 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-zinc-400"
              />
            </div>

            <!-- Submit Button / Selected Badge -->
            <div v-if="!msg.pendingQuestion.selectedOption" class="flex items-center justify-end">
              <button
                @click="submitAnswer(msg.id)"
                :disabled="!selectedAnswers[msg.id] && !customAnswers[msg.id]?.trim()"
                class="px-2.5 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white font-semibold text-[10px] transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              >
                <UIcon name="i-lucide-check" class="size-3" />
                <span>Kirim</span>
              </button>
            </div>
            <div v-else class="text-[9.5px] text-zinc-300 font-medium flex items-center gap-1 pt-1 border-t border-white/10">
              <UIcon name="i-lucide-check-circle" class="size-3 text-zinc-300" />
              <span>Pilihan: <strong>{{ msg.pendingQuestion.selectedOption }}</strong></span>
            </div>
          </div>

          <!-- 3. Tool Calls Visual Cards (Compact Accordion Rows) -->
          <div v-if="getVisibleTools(msg.tools).length > 0" class="space-y-1 mb-2">
            <div
              v-for="tool in getVisibleTools(msg.tools)"
              :key="tool.id"
              class="rounded-lg bg-black/40 border border-white/10 overflow-hidden text-[10px]"
            >
              <!-- Slim Accordion Header -->
              <div
                @click="toggleToolExpand(tool.id, tool.status)"
                class="px-2 py-1 flex items-center justify-between text-zinc-300 font-mono cursor-pointer hover:bg-white/5 transition-colors"
              >
                <div class="flex items-center gap-1.5 truncate max-w-[200px]">
                  <UIcon
                    name="i-lucide-wrench"
                    class="size-3 text-zinc-400 flex-shrink-0"
                    :class="{ 'animate-spin': tool.status === 'running' }"
                  />
                  <span class="font-semibold text-zinc-200">{{ tool.name }}</span>
                  <span v-if="getToolSummaryArg(tool)" class="text-[9px] text-slate-400 truncate opacity-80">
                    {{ getToolSummaryArg(tool) }}
                  </span>
                </div>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <span :class="[
                    'px-1.5 py-0.2 rounded text-[8.5px] font-semibold',
                    tool.status === 'completed'
                      ? 'bg-white/10 text-zinc-300'
                      : tool.status === 'running'
                      ? 'bg-amber-500/20 text-amber-300 animate-pulse'
                      : 'bg-rose-500/20 text-rose-300'
                  ]">
                    {{ tool.status === 'running' ? 'Memproses...' : `${tool.durationMs || 1}ms` }}
                  </span>
                  <UIcon
                    :name="isToolExpanded(tool) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    class="size-3 text-slate-500"
                  />
                </div>
              </div>

              <!-- Output Body (Collapsible: Open while running, auto-collapsed when done) -->
              <div
                v-if="isToolExpanded(tool)"
                class="p-1.5 border-t border-white/10 bg-black/70 text-[9.5px] text-slate-300 font-mono whitespace-pre-wrap overflow-hidden"
              >
                <div v-if="tool.status === 'running'" class="flex items-center gap-1.5 text-amber-400/90 py-0.5 animate-pulse">
                  <UIcon name="i-lucide-loader-2" class="size-3 animate-spin text-amber-400" />
                  <span>Sedang mengeksekusi sub-proses...</span>
                </div>
                <div v-else-if="tool.output">
                  {{ tool.output }}
                </div>
                <div v-else class="text-slate-500 italic">
                  (Tidak ada output teks dari sub-proses)
                </div>
              </div>
            </div>
          </div>

          <!-- 4. Main Markdown Content (Compact Code & Text) -->
          <div v-if="msg.content" class="space-y-1.5">
            <template v-for="(block, bIdx) in parseMarkdownBlocks(msg.role === 'user' && msg.displayPrompt ? msg.displayPrompt : msg.content)" :key="bIdx">
              <!-- Text Block with Inline Markdown -->
              <div v-if="block.type === 'text'" v-html="formatInlineMarkdown(block.content)" class="leading-relaxed whitespace-pre-wrap break-words text-[11px]"></div>

              <!-- Code Fence Block (Compact) -->
              <div v-else-if="block.type === 'code'" class="my-1.5 rounded-lg bg-[#08090c] border border-white/10 overflow-hidden font-mono text-[10px]">
                <div class="h-6 px-2 bg-white/[0.03] border-b border-white/5 flex items-center justify-between text-slate-400">
                  <span class="text-[9px] uppercase font-semibold text-zinc-300">{{ block.language || 'code' }}</span>
                  <div class="flex items-center gap-1">
                    <button
                      @click="copyCode(block.content, `${msg.id}-${bIdx}`)"
                      class="px-1.5 py-0.2 rounded bg-white/5 hover:bg-white/10 text-[9px] text-slate-300 transition-all flex items-center gap-0.5 cursor-pointer"
                    >
                      <UIcon :name="copiedIndex === `${msg.id}-${bIdx}` ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5" />
                      <span>{{ copiedIndex === `${msg.id}-${bIdx}` ? 'Tersalin' : 'Salin' }}</span>
                    </button>
                    <button
                      @click="applyToEditor(block.content)"
                      class="px-1.5 py-0.2 rounded bg-white/10 hover:bg-white/20 text-slate-200 text-[9px] transition-all flex items-center gap-0.5 cursor-pointer"
                      title="Terapkan ke Editor"
                    >
                      <UIcon name="i-lucide-arrow-down-to-line" class="size-2.5" />
                      <span>Terapkan</span>
                    </button>
                  </div>
                </div>
                <pre class="p-2 overflow-x-auto custom-scrollbar text-slate-200 leading-normal font-mono"><code>{{ block.content }}</code></pre>
              </div>
            </template>
          </div>

          <!-- 4.1. Smart Interactive Choice Cards & Actions (CLI Style Choice Cards) -->
          <div
            v-if="msg.role === 'assistant' && !msg.isStreaming && extractInteractiveOptions(msg.content).length > 0 && !msg.pendingQuestion"
            class="mt-2.5 space-y-1.5 p-2 rounded-xl bg-[#0a0c0f]/95 border border-white/10 shadow-xl shadow-black/50 animate-in fade-in zoom-in-98 duration-150"
          >
            <div class="flex items-center justify-between px-1 pb-1 border-b border-white/[0.06] text-[9.5px]">
              <span class="text-zinc-300 font-semibold flex items-center gap-1">
                <UIcon name="i-lucide-layout-grid" class="size-3 text-zinc-300" />
                <span>Pilihan Opsi (Klik untuk Memilih):</span>
              </span>
              <span class="text-slate-400 font-mono text-[8.5px] bg-white/[0.04] px-1.5 py-0.2 rounded border border-white/5">
                CLI Interactive Choice
              </span>
            </div>

            <div class="grid grid-cols-1 gap-1.5 pt-1">
              <div
                v-for="opt in extractInteractiveOptions(msg.content)"
                :key="opt.key"
                :class="[
                  'p-2 rounded-lg border transition-all flex items-start justify-between gap-2',
                  selectedChoiceMap[msg.id] === opt.key
                    ? 'bg-white/15 border-white ring-1 ring-white/30'
                    : 'bg-[#111317] hover:bg-[#181b22] border-white/[0.08] hover:border-white/20'
                ]"
              >
                <!-- Left: Badge & Text -->
                <div class="flex items-start gap-2 min-w-0 flex-1">
                  <span
                    :class="[
                      'w-5 h-5 rounded-md font-bold text-[9.5px] flex items-center justify-center flex-shrink-0 mt-0.5 border transition-all',
                      opt.isConfirmation && opt.key === 'y'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : opt.isConfirmation && opt.key === 'n'
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : selectedChoiceMap[msg.id] === opt.key
                        ? 'bg-white text-black border-white'
                        : 'bg-white/[0.06] text-zinc-300 border-white/15'
                    ]"
                  >
                    {{ opt.badge }}
                  </span>

                  <div class="min-w-0 flex-1">
                    <div class="text-[11px] font-semibold text-slate-100 leading-tight">
                      {{ opt.title }}
                    </div>
                    <div v-if="opt.description" class="text-[9.5px] text-slate-400 leading-snug mt-0.5 whitespace-pre-line">
                      {{ opt.description }}
                    </div>
                  </div>
                </div>

                <!-- Right: Action Buttons -->
                <div class="flex items-center gap-1 flex-shrink-0 mt-0.5">
                  <button
                    @click="handleSelectDetectedOption(msg.id, opt)"
                    :disabled="openCodeStore.isExecuting"
                    :class="[
                      'px-2 py-1 rounded-md text-[9.5px] font-semibold transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40',
                      opt.isConfirmation && opt.key === 'y'
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                        : opt.isConfirmation && opt.key === 'n'
                        ? 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40'
                        : selectedChoiceMap[msg.id] === opt.key
                        ? 'bg-white text-black shadow-xs'
                        : 'bg-white/10 hover:bg-white text-zinc-300 hover:text-black border border-white/15'
                    ]"
                    :title="`Pilih ${opt.title} dan kirim ke CLI`"
                  >
                    <UIcon :name="selectedChoiceMap[msg.id] === opt.key ? 'i-lucide-check' : 'i-lucide-arrow-right'" class="size-3" />
                    <span>{{ selectedChoiceMap[msg.id] === opt.key ? 'Dipilih' : 'Pilih' }}</span>
                  </button>

                  <button
                    @click="handleEditPrompt(opt.isConfirmation ? opt.fullText : `${opt.badge}. ${opt.title}`)"
                    class="p-1 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-slate-200 border border-white/5 transition-colors cursor-pointer"
                    title="Edit pilihan ini di kolom prompt"
                  >
                    <UIcon name="i-lucide-pencil" class="size-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 5. Empty State Fallback -->
          <div v-else-if="!msg.isStreaming && !msg.thinking && (!msg.tools || msg.tools.length === 0) && !msg.pendingQuestion && msg.role === 'assistant'" class="text-[10px] text-slate-400 italic py-1">
            (Tidak ada respons dari model yang dipilih. Silakan coba pilih model lain dari daftar atau kirim ulang pesan).
          </div>

          <!-- 6. Streaming Indicator & Live Status Pill -->
          <div
            v-if="msg.isStreaming && (msg.content || (msg.tools && msg.tools.length > 0))"
            class="flex items-center gap-2 pt-1.5 text-[10px] text-zinc-400"
          >
            <div class="flex items-center gap-1">
              <span class="size-1.5 rounded-full bg-zinc-400 animate-bounce" style="animation-delay: 0ms"></span>
              <span class="size-1.5 rounded-full bg-zinc-400 animate-bounce" style="animation-delay: 150ms"></span>
              <span class="size-1.5 rounded-full bg-zinc-400 animate-bounce" style="animation-delay: 300ms"></span>
            </div>
            <span class="text-zinc-300 font-medium tracking-tight">
              {{ msg.activeStatusText || 'Mengetik respons...' }}
            </span>
          </div>

          <!-- 7. Pending Approval Card (Compact) -->
          <div v-if="msg.pendingApproval" class="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div class="text-[10px] font-semibold text-amber-300 flex items-center gap-1 mb-1">
              <UIcon name="i-lucide-shield-alert" class="size-3 text-amber-400" />
              Izin Diperlukan
            </div>
            <p class="text-[9.5px] text-slate-300 mb-1.5 leading-snug">
              {{ msg.pendingApproval.description }}
            </p>
            <div class="flex items-center gap-2 pt-0.5">
              <button
                @click="openCodeStore.approveAction(msg.id, true)"
                class="px-3.5 py-1 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white font-semibold text-[9.5px] shadow-xs cursor-pointer transition-all active:scale-95"
              >
                Setujui
              </button>
              <button
                @click="openCodeStore.approveAction(msg.id, false)"
                class="px-3.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-slate-300 text-[9.5px] cursor-pointer transition-all active:scale-95"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>

        <!-- Actions Toolbar Under User Prompt (Resend, Edit, Salin) -->
        <div
          v-if="msg.role === 'user'"
          class="flex items-center justify-end w-full text-[9px] text-slate-400 px-1 pt-0.5"
        >
          <div class="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
            <button
              @click="handleResendPrompt(msg.content)"
              :disabled="openCodeStore.isExecuting"
              class="px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95 disabled:opacity-40"
              title="Kirim ulang prompt (Resend)"
            >
              <UIcon name="i-lucide-rotate-cw" class="size-2.5" />
              <span class="text-[8.5px]">Resend</span>
            </button>
            <button
              @click="handleEditPrompt(msg.displayPrompt || msg.content)"
              class="px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
              title="Edit prompt di kolom input"
            >
              <UIcon name="i-lucide-pencil" class="size-2.5" />
              <span class="text-[8.5px]">Edit</span>
            </button>
            <button
              @click="copyMessageContent(msg.displayPrompt || msg.content, msg.id)"
              class="px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
              title="Salin prompt"
            >
              <UIcon :name="copiedIndex === msg.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5" :class="copiedIndex === msg.id ? 'text-zinc-300' : ''" />
              <span class="text-[8.5px]">{{ copiedIndex === msg.id ? 'Tersalin' : 'Salin' }}</span>
            </button>
          </div>
        </div>

        <!-- Actions Toolbar Under Agent Response (Salin, Ulangi) -->
        <div
          v-if="msg.role === 'assistant' && msg.content && !msg.isStreaming"
          class="flex items-center justify-between w-full text-[9px] text-slate-400 px-1 pt-0.5"
        >
          <div class="flex items-center gap-1.5">
            <!-- Salin Response Button -->
            <button
              @click="copyMessageContent(msg.content, msg.id)"
              class="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              title="Salin isi seluruh respon agen"
            >
              <UIcon :name="copiedIndex === msg.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5" :class="copiedIndex === msg.id ? 'text-zinc-300' : ''" />
              <span class="text-[8.5px] font-medium">{{ copiedIndex === msg.id ? 'Tersalin' : 'Salin' }}</span>
            </button>

            <!-- Ulangi / Regenerate Response Button -->
            <button
              @click="handleRegenerateResponse(msg.id)"
              :disabled="openCodeStore.isExecuting"
              class="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-white/20 transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
              title="Buat ulang respon ini (Regenerate)"
            >
              <UIcon name="i-lucide-rotate-cw" class="size-2.5" />
              <span class="text-[8.5px] font-medium">Ulangi</span>
            </button>
          </div>

          <div class="flex items-center gap-1.5 text-[8.5px] text-slate-400 font-mono">
            <span class="px-1.5 py-0.2 rounded bg-white/[0.03] border border-white/[0.05] text-slate-400">
              {{ openCodeStore.currentModel }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

    <!-- Active File Context Strip (Compact) -->
    <div v-if="workspaceStore.activeTab?.filePath" class="px-2.5 py-1 bg-black/40 border-t border-white/[0.06] flex items-center justify-between text-[9px] text-slate-400">
      <div class="flex items-center gap-1 truncate max-w-[180px]">
        <UIcon name="i-lucide-paperclip" class="size-2.5 text-zinc-400" />
        <span class="truncate text-slate-300 font-mono">{{ workspaceStore.activeTab.title }}</span>
      </div>
      <label class="flex items-center gap-1 cursor-pointer select-none text-[8.5px] text-zinc-300 font-medium hover:text-white">
        <input type="checkbox" v-model="includeActiveFile" class="rounded accent-zinc-400 size-2.5" />
        <span>Konteks File</span>
      </label>
    </div>

    <!-- Input Box (Pill Design matching Matte Black Theme) -->
    <div class="p-2.5 bg-[#090b0e] border-t border-white/[0.06] flex-shrink-0 relative z-20">
      <div class="bg-[#111317]/95 border border-white/[0.08] hover:border-white/[0.15] focus-within:border-white/30 focus-within:ring-1 focus-within:ring-white/15 rounded-2xl p-2.5 shadow-xl transition-all duration-200 space-y-1.5">
        <!-- Hidden Image Input File Picker -->
        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="handleImageInputChange"
        />

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

        <!-- Textarea (Antigravity Style with Auto-Adjust Height) -->
        <div class="relative w-full">
          <textarea
            ref="inputAreaRef"
            v-model="inputText"
            @input="adjustTextareaHeight"
            @keydown="handleKeyDown"
            placeholder="Ask anything, tag code (Ctrl+L), paste (Ctrl+V), @, /"
            rows="1"
            class="w-full bg-transparent border-none text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none p-0 leading-relaxed font-sans min-h-[22px] max-h-[160px] custom-scrollbar overflow-y-hidden"
          ></textarea>
        </div>

        <!-- Bottom Controls Row inside the Pill -->
        <div class="flex items-center justify-between pt-0.5">
          <!-- Left: Settings, @ Mention Context, Upload Image -->
          <div class="flex items-center gap-1.5">
            <!-- Settings / Model Button -->
            <button
              @click="isModelModalOpen = !isModelModalOpen; isSessionModalOpen = false"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer border text-[11px] flex-shrink-0"
              :class="isModelModalOpen
                ? 'bg-white/15 border-white/30 text-white shadow-xs'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'"
              :title="`Pengaturan Model AI (Aktif: ${openCodeStore.currentModelItem.name || openCodeStore.currentModel})`"
            >
              <UIcon name="i-lucide-settings" class="size-3 font-semibold" />
            </button>

            <!-- @ Mention / File Context Toggle Button -->
            <button
              @click="includeActiveFile = !includeActiveFile"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-[11px] flex-shrink-0 cursor-pointer"
              :class="includeActiveFile && workspaceStore.activeTab?.filePath
                ? 'bg-white/15 border-white/30 text-white shadow-xs'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'"
              :title="includeActiveFile && workspaceStore.activeTab?.filePath ? `Konteks Aktif: ${workspaceStore.activeTab.title}` : 'Sertakan Konteks Berkas (@)'"
            >
              <UIcon name="i-lucide-at-sign" class="size-3 font-semibold" />
            </button>

            <!-- Upload Image to .makarya Folder Button -->
            <button
              @click="triggerImageUpload"
              :disabled="!connectedProject || isUploadingImage"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-[11px] flex-shrink-0"
              :class="[
                !connectedProject
                  ? 'opacity-40 cursor-not-allowed bg-white/[0.02] border-white/[0.05] text-slate-500'
                  : attachedImages.length > 0
                  ? 'bg-white/15 border-white/30 text-white shadow-xs cursor-pointer'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-white/30 text-slate-400 hover:text-white cursor-pointer'
              ]"
              :title="!connectedProject ? 'Buka folder project terlebih dahulu untuk upload gambar' : 'Unggah Gambar ke Folder .makarya'"
            >
              <UIcon :name="isUploadingImage ? 'i-lucide-loader-2' : 'i-lucide-image'" class="size-3" :class="{ 'animate-spin': isUploadingImage }" />
            </button>
          </div>

          <!-- Right: Mic & Circular Send/Stop Button -->
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <!-- Voice Input Icon -->
            <button
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-white/30 hover:text-white cursor-pointer flex-shrink-0"
              title="Input Suara"
            >
              <UIcon name="i-lucide-mic" class="size-3" />
            </button>

            <!-- Circular Send / Abort Button -->
            <button
              v-if="openCodeStore.isExecuting"
              @click="openCodeStore.abortCurrent"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              title="Hentikan Jawaban (Stop)"
            >
              <UIcon name="i-lucide-square" class="size-3" />
            </button>
            <button
              v-else
              @click="handleSendMessage"
              :disabled="!inputText.trim() && attachedImages.length === 0"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="(inputText.trim() || attachedImages.length > 0)
                ? 'bg-zinc-200 text-zinc-950 hover:bg-white shadow-md shadow-white/5 cursor-pointer font-bold'
                : 'bg-white/[0.05] text-slate-400 border border-white/[0.08] hover:bg-white/[0.08]'"
              title="Kirim (Enter)"
            >
              <UIcon name="i-lucide-arrow-right" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Switcher Modal -->
    <OpenCodeModelModal
      :is-open="isModelModalOpen"
      @close="isModelModalOpen = false"
    />

    <!-- Sessions Switcher & Manager Modal -->
    <OpenCodeSessionModal
      :is-open="isSessionModalOpen"
      @close="isSessionModalOpen = false"
    />
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
  background: rgba(255, 255, 255, 0.18);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.32);
}

@keyframes opencode-shimmer-anim {
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

@keyframes opencode-glow-pulse-anim {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.25);
    background-color: #a1a1aa;
  }
  50% {
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.6), 0 0 16px rgba(255, 255, 255, 0.2);
    background-color: #f4f4f5;
  }
}

.opencode-matte-text {
  background: linear-gradient(90deg, #ffffff, #a1a1aa, #f4f4f5, #a1a1aa, #ffffff);
  background-size: 250% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: opencode-shimmer-anim 4s ease infinite;
}

.opencode-pulse-dot {
  animation: opencode-glow-pulse-anim 2.5s ease-in-out infinite;
}
</style>
