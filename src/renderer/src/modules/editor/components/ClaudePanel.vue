<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { useClaudeStore } from '@renderer/stores/claudeStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { parseMarkdownBlocks, formatInlineMarkdown } from '@renderer/utils/markdownParser'
import ClaudeModelModal from './ClaudeModelModal.vue'
import ClaudeSessionModal from './ClaudeSessionModal.vue'
import claudeLogo from '@renderer/assets/claude-logo.svg'
import iconImg from '@renderer/assets/icon.jpg'

const claudeStore = useClaudeStore()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const inputText = ref('')
const inputAreaRef = ref<HTMLTextAreaElement | null>(null)
const messageContainer = ref<HTMLElement | null>(null)
const includeActiveFile = ref(false)
const copiedIndex = ref<string | null>(null)
const isModelModalOpen = ref(false)
const isSessionModalOpen = ref(false)

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

onMounted(() => {
  claudeStore.loadAvailableModels()
  claudeStore.loadSessions()
})

function isToolExpanded(tool: any): boolean {
  if (expandedTools.value[tool.id] !== undefined) {
    return expandedTools.value[tool.id]
  }
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
    claudeStore.messages.length,
    claudeStore.messages[claudeStore.messages.length - 1]?.content,
    claudeStore.messages[claudeStore.messages.length - 1]?.thinking,
    claudeStore.messages[claudeStore.messages.length - 1]?.tools?.length,
    claudeStore.messages[claudeStore.messages.length - 1]?.pendingQuestion
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
  if ((!text && attachedImages.value.length === 0 && (!includeActiveFile.value || !workspaceStore.activeTab?.filePath)) || claudeStore.isExecuting) return

  let displayPrompt = text || 'Harap periksa dan analisis berkas/gambar yang dilampirkan.'
  if (includeActiveFile.value && workspaceStore.activeTab?.title) {
    const fileBadge = `📄 ${workspaceStore.activeTab.title}`
    displayPrompt = text ? `${fileBadge} ${text}` : fileBadge
  }

  let fullPrompt = text || 'Harap periksa dan analisis gambar yang dilampirkan.'

  // 1. Sertakan perintah & path gambar yang diunggah ke .makarya
  if (attachedImages.value.length > 0) {
    const imageInstructions = attachedImages.value
      .map(
        (img) =>
          `[Lampiran Gambar Proyek: ${img.relativePath} (Path: ${img.absolutePath})]\nPerintah Analisis Gambar: Harap baca, analisis, dan periksa berkas gambar yang tersimpan di path "${img.relativePath}" untuk menyelesaikan instruksi ini.`
      )
      .join('\n\n')
    fullPrompt = `${imageInstructions}\n\n${fullPrompt}`
  }

  // 2. Sertakan Konteks File Aktif jika dicentang
  if (includeActiveFile.value && workspaceStore.activeTab?.filePath) {
    const activeTab = workspaceStore.activeTab
    fullPrompt = `[Konteks Berkas Aktif: ${activeTab.filePath}]\n\`\`\`${activeTab.language || ''}\n${activeTab.content || ''}\n\`\`\`\n\nInstruksi Pengguna:\n${fullPrompt}`
  }

  inputText.value = ''
  attachedImages.value = []
  adjustTextareaHeight()
  scrollToBottom()

  const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
    ? workspaceStore.activeTab.filePath.substring(0, Math.max(workspaceStore.activeTab.filePath.lastIndexOf('\\'), workspaceStore.activeTab.filePath.lastIndexOf('/')))
    : (workspaceStore.activeRootPath || (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)))

  await claudeStore.sendPrompt(fullPrompt, projectRoot, displayPrompt)
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
  if (claudeStore.isExecuting) return
  const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
    ? workspaceStore.activeTab.filePath.substring(0, Math.max(workspaceStore.activeTab.filePath.lastIndexOf('\\'), workspaceStore.activeTab.filePath.lastIndexOf('/')))
    : (workspaceStore.activeRootPath || (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)))
  
  await claudeStore.sendPrompt(content, projectRoot)
}

export interface DetectedOption {
  key: string
  badge: string
  title: string
  description?: string
  fullText: string
  isConfirmation?: boolean
}

const selectedChoiceMap = ref<Record<string, string>>({})

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
  if (claudeStore.isExecuting) return
  selectedChoiceMap.value[msgId] = opt.key
  const textToSend = opt.isConfirmation ? opt.fullText : `${opt.badge}. ${opt.title}`
  inputText.value = textToSend
  await handleSendMessage()
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
  if (claudeStore.isExecuting) return
  const msgIdx = claudeStore.messages.findIndex((m) => m.id === messageId)
  if (msgIdx < 0) return

  let userPrompt = ''
  for (let i = msgIdx - 1; i >= 0; i--) {
    if (claudeStore.messages[i].role === 'user') {
      userPrompt = claudeStore.messages[i].content
      break
    }
  }

  if (userPrompt) {
    const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
      ? workspaceStore.activeTab.filePath.substring(0, Math.max(workspaceStore.activeTab.filePath.lastIndexOf('\\'), workspaceStore.activeTab.filePath.lastIndexOf('/')))
      : (workspaceStore.activeRootPath || (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : undefined)))

    await claudeStore.sendPrompt(userPrompt, projectRoot)
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

  await claudeStore.submitQuestionAnswer(msgId, chosen)
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
</script>

<template>
  <aside class="w-88 h-full flex flex-col bg-[#0c0a08] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 text-slate-100 font-sans relative overflow-hidden shadow-sm transition-all">
    <!-- Header (Claude Warm Amber/Terracotta Accent) -->
    <div class="h-9 px-3 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold bg-[#120d0a]/95 backdrop-blur-md flex-shrink-0">
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <a
          href="https://claude.ai"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center group cursor-pointer"
          title="Buka Website Resmi Claude (claude.ai)"
        >
          <img :src="claudeLogo" alt="Claude" class="h-5 w-5 rounded object-contain group-hover:scale-110 transition-transform" />
        </a>
        <span :class="['inline-block size-1.5 rounded-full', claudeStore.isExecuting ? 'bg-amber-400 animate-ping' : 'bg-[#ea580c] animate-pulse']"></span>
        <img :src="iconImg" alt="Makarya" class="h-5 w-auto object-contain drop-shadow-[0_0_6px_rgba(234,88,12,0.5)]" title="Makarya IDE" />
      </div>

      <div class="flex items-center gap-1">
        <!-- Mode Switcher Badge -->
        <div class="flex items-center bg-black/50 rounded-md p-0.5 border border-white/5 text-[9px] mr-0.5">
          <button
            @click="claudeStore.executionMode = 'agent'"
            :class="[
              'px-1.5 py-0.2 rounded transition-all cursor-pointer',
              claudeStore.executionMode === 'agent' ? 'bg-[#ea580c]/25 text-[#f97316] font-semibold' : 'text-slate-400 hover:text-slate-200'
            ]"
            title="Claude Agent Mode (Autonomous Tools & Actions)"
          >
            Agent
          </button>
          <button
            @click="claudeStore.executionMode = 'chat'"
            :class="[
              'px-1.5 py-0.2 rounded transition-all cursor-pointer',
              claudeStore.executionMode === 'chat' ? 'bg-[#ea580c]/25 text-[#f97316] font-semibold' : 'text-slate-400 hover:text-slate-200'
            ]"
            title="Claude Chat Mode (Deep Reasoning / Q&A)"
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
              ? 'bg-[#ea580c]/20 text-[#f97316] ring-1 ring-[#ea580c]/40'
              : 'text-slate-400 hover:text-[#f97316] hover:bg-white/[0.06]'
          ]"
          :title="`Pengaturan Model Claude (Aktif: ${claudeStore.currentModelItem.name || claudeStore.currentModel})`"
        >
          <UIcon name="i-lucide-settings" class="size-3.5" />
        </button>

        <!-- Sessions / History Switcher Button -->
        <button
          @click="isSessionModalOpen = !isSessionModalOpen; isModelModalOpen = false"
          :class="[
            'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer group',
            isSessionModalOpen
              ? 'bg-[#ea580c]/20 text-[#f97316] ring-1 ring-[#ea580c]/40'
              : 'text-slate-400 hover:text-[#f97316] hover:bg-white/[0.06]'
          ]"
          title="Riwayat Sesi Obrolan Claude"
        >
          <UIcon name="i-lucide-history" class="size-3.5 group-hover:rotate-[-20deg] transition-transform" />
        </button>

        <!-- New Chat Session Button -->
        <button
          @click="claudeStore.createNewSession()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#f97316] hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Mulai Sesi Claude Baru"
        >
          <UIcon name="i-lucide-square-pen" class="size-3.5" />
        </button>

        <!-- Clear Chat Button -->
        <button
          @click="claudeStore.clearMessages()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Bersihkan Percakapan Claude"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>

        <!-- Close / Collapse Panel Button -->
        <button
          @click="workspaceStore.toggleClaudePanel()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Tutup Panel Claude"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading Session History State -->
    <div v-if="claudeStore.isLoadingSessionHistory" class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 font-mono">
      <div class="w-10 h-10 rounded-xl bg-[#ea580c]/10 border border-[#ea580c]/30 flex items-center justify-center text-[#f97316] animate-pulse shadow-lg">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-[#f97316]" />
      </div>
      <div class="space-y-1">
        <p class="text-xs font-semibold text-slate-200">Memuat Riwayat Sesi Claude...</p>
        <p class="text-[10px] text-slate-400">Mengambil percakapan Claude Engine</p>
      </div>
    </div>

    <!-- Messages Container (Scrollable Area) -->
    <div v-else ref="messageContainer" class="flex-1 overflow-y-auto p-3 text-[11px] relative flex flex-col custom-scrollbar">
      <!-- DEFAULT HERO STATE (Shown when messages.length === 0) -->
      <div
        v-if="claudeStore.messages.length === 0"
        class="my-auto flex flex-col items-center justify-center py-6 px-2 text-center select-none w-full"
      >
        <!-- Glow Logo Card with Official Website Link -->
        <a
          href="https://claude.ai"
          target="_blank"
          rel="noopener noreferrer"
          class="relative group mb-4 mx-auto flex items-center justify-center cursor-pointer block"
          title="Kunjungi Website Resmi Claude (claude.ai)"
        >
          <div class="absolute -inset-1.5 bg-gradient-to-r from-[#ea580c]/40 via-[#f97316]/30 to-[#d97706]/40 rounded-3xl blur-md opacity-75 group-hover:opacity-100 group-hover:scale-105 transition duration-500"></div>
          <div class="relative w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-[#140e0a] border border-[#ea580c]/40 group-hover:border-[#f97316]/70 shadow-xl shadow-[#ea580c]/20 flex items-center justify-center p-3.5 overflow-hidden transition-all">
            <img
              :src="claudeLogo"
              alt="Claude"
              class="w-full h-full object-contain filter drop-shadow-[0_0_12px_rgba(234,88,12,0.7)] group-hover:scale-110 transition-transform"
            />
            <!-- External link badge icon -->
            <div class="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-black/80 border border-[#ea580c]/40 flex items-center justify-center text-[#f97316] opacity-0 group-hover:opacity-100 transition-opacity">
              <UIcon name="i-lucide-external-link" class="size-2.5" />
            </div>
          </div>
        </a>

        <!-- Title with Link Icon -->
        <div class="flex items-center justify-center gap-1.5 mb-1.5">
          <h2 class="text-base sm:text-lg font-bold tracking-tight text-white flex items-center justify-center gap-1.5 text-center">
            <span class="claude-gradient-text">{{ claudeStore.executionMode === 'chat' ? 'Claude Chat' : 'Claude Code Agent' }}</span>
          </h2>
          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            class="text-slate-400 hover:text-[#f97316] transition-colors inline-flex items-center p-0.5 rounded hover:bg-white/5"
            title="Kunjungi claude.ai"
          >
            <UIcon name="i-lucide-external-link" class="size-3 text-[#f97316]/70 hover:text-[#f97316]" />
          </a>
        </div>

        <!-- Subtitle -->
        <p class="text-[11px] text-slate-400 text-center max-w-[270px] mx-auto leading-relaxed mb-4">
          {{
            claudeStore.executionMode === 'chat'
              ? 'Mode Diskusi & Tanya-Jawab Claude (Plan). Menganalisis kode dan penalaran sistem tanpa eksekusi langsung.'
              : 'Agen pemrograman otonom bertenaga model Claude (Anthropic). Mendukung penalaran mendalam, arsitektur sistem, dan refactoring presisi tinggi.'
          }}
        </p>

        <!-- Target Project Connected Badge -->
        <div
          v-if="connectedProject"
          class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-[#ea580c]/30 text-[10px] text-slate-300 flex items-center gap-2 max-w-[95%] shadow-xs"
        >
          <span class="w-2 h-2 rounded-full bg-[#ea580c] claude-pulse-dot flex-shrink-0"></span>
          <span class="text-slate-400 font-medium flex-shrink-0">Target:</span>
          <span class="font-mono text-[#f97316] truncate text-[10px]" :title="connectedProject.path">
            {{ connectedProject.name }}
          </span>
        </div>
      </div>

      <!-- Messages Stream List (When messages exist) -->
      <div v-else class="space-y-2.5">
        <div
          v-for="msg in claudeStore.messages"
          :key="msg.id"
          :class="['flex flex-col space-y-1', msg.role === 'user' ? 'items-end' : 'items-start']"
        >
          <!-- Role & Time Header for User -->
          <div v-if="msg.role === 'user'" class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
            <span class="font-medium text-orange-300">Anda</span>
            <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Role & Time Header for Claude -->
          <div v-else class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
            <img :src="claudeLogo" alt="Claude" class="size-2.5 rounded-xs object-contain" />
            <span class="font-medium text-[#f97316]">Claude Code</span>
            <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Message Bubble (Claude Warm Terracotta Accent) -->
          <div
            :class="[
              'p-2.5 rounded-xl max-w-[96%] leading-relaxed break-words shadow-sm transition-all w-full',
              msg.role === 'user'
                ? 'bg-gradient-to-br from-[#9a3412] to-[#7c2d12] text-white rounded-tr-xs border border-orange-500/30 text-[11px] shadow-sm'
                : 'bg-[#120c08]/95 text-slate-200 rounded-tl-xs border border-[#ea580c]/15 text-[11px]'
            ]"
          >
            <!-- 1. Modern Chat-Style Thinking Process Component -->
            <!-- State A: Thinking Content Present -->
            <div
              v-if="msg.thinking"
              class="mb-2.5 rounded-xl border transition-all duration-200 overflow-hidden shadow-xs"
              :class="[
                msg.isStreaming
                  ? 'bg-[#1b110a] border-[#ea580c]/35 ring-1 ring-[#ea580c]/20 shadow-sm shadow-[#ea580c]/10'
                  : 'bg-[#170f09] border-[#ea580c]/20 hover:border-[#ea580c]/35'
              ]"
            >
              <!-- Accordion Header Bar -->
              <button
                @click="claudeStore.toggleThinking(msg.id)"
                class="w-full px-2.5 py-1.5 flex items-center justify-between text-[10.5px] bg-[#22140a]/80 hover:bg-[#2b190d] transition-all cursor-pointer select-none group"
                :class="{ 'border-b border-[#ea580c]/15': msg.isThinkingExpanded }"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="size-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                    :class="msg.isStreaming ? 'bg-[#ea580c]/25 text-[#f97316] ring-1 ring-[#ea580c]/30' : 'bg-[#ea580c]/15 text-[#fb923c] group-hover:bg-[#ea580c]/25'"
                  >
                    <UIcon
                      :name="msg.isStreaming ? 'i-lucide-brain' : 'i-lucide-sparkles'"
                      class="size-3.5 text-[#fb923c]"
                      :class="{ 'animate-pulse text-[#f97316]': msg.isStreaming }"
                    />
                  </div>
                  <div class="flex items-center gap-1.5 truncate">
                    <span
                      class="font-medium truncate transition-colors text-orange-200/90 group-hover:text-orange-100"
                    >
                      {{ msg.isStreaming ? 'Claude sedang menalar...' : 'Penalaran Claude' }}
                    </span>
                    <span
                      v-if="msg.thinkingSeconds !== undefined"
                      class="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-[#ea580c]/15 text-[#fdba74] border border-[#ea580c]/25 flex-shrink-0 font-medium"
                    >
                      {{ msg.thinkingSeconds }}s
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0 text-orange-300/70 group-hover:text-orange-200">
                  <button
                    v-if="msg.isThinkingExpanded"
                    @click.stop="copyThinkingText(msg.thinking, msg.id)"
                    class="p-1 rounded hover:bg-[#ea580c]/20 text-orange-300/80 hover:text-orange-100 transition-colors cursor-pointer"
                    title="Salin hasil penalaran"
                  >
                    <UIcon :name="copiedIndex === `thinking-${msg.id}` ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
                  </button>
                  <span class="text-[9px] hidden sm:inline-block opacity-80 text-orange-300/80">
                    {{ msg.isThinkingExpanded ? 'Sembunyikan' : 'Lihat proses' }}
                  </span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-3.5 text-orange-300/80 transition-transform duration-200"
                    :class="{ 'rotate-180': msg.isThinkingExpanded }"
                  />
                </div>
              </button>

              <!-- Expanded Body (Full Content Display) -->
              <div
                v-if="msg.isThinkingExpanded"
                class="p-2.5 border-t border-[#ea580c]/15 bg-[#100905]/95 text-[10.5px] text-orange-100/90 leading-relaxed font-mono"
              >
                <div class="pl-2.5 border-l-2 border-[#ea580c]/50 whitespace-pre-wrap break-words text-orange-100/90 selection:bg-orange-500/30">
                  {{ msg.thinking }}
                  <!-- Live thinking loading spinner -->
                  <UIcon
                    v-if="msg.isStreaming"
                    name="i-lucide-loader-2"
                    class="inline-block size-3 text-orange-400 animate-spin ml-1 align-middle"
                  />
                </div>
              </div>
            </div>

            <!-- State B: Live Streaming but Thinking Token hasn't arrived yet and content is empty -->
            <div
              v-else-if="msg.isStreaming && !msg.content && (!msg.tools || msg.tools.length === 0)"
              class="mb-2.5 p-2 rounded-xl bg-[#1a0f08]/80 border border-orange-500/20 ring-1 ring-orange-500/10 flex items-center justify-between shadow-xs animate-pulse"
            >
              <div class="flex items-center gap-2 min-w-0">
                <div class="size-5 rounded-md bg-orange-500/20 text-orange-400 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-brain" class="size-3.5 animate-pulse text-orange-400" />
                </div>
                <span class="text-[10.5px] font-medium text-orange-200 truncate">
                  Claude sedang menganalisis logika & kode...
                </span>
              </div>
              <div class="flex items-center gap-1 pr-1">
                <span class="size-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay: 0ms"></span>
                <span class="size-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay: 150ms"></span>
                <span class="size-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay: 300ms"></span>
              </div>
            </div>

            <!-- 2. Interactive Question Card -->
            <div v-if="msg.pendingQuestion" class="mb-2 p-2.5 rounded-lg bg-[#1a0f08] border-l-2 border-l-orange-500 border border-orange-500/25 shadow-sm">
              <div class="flex items-center gap-1 text-[9px] text-orange-400 font-semibold uppercase tracking-wider mb-1">
                <UIcon name="i-lucide-help-circle" class="size-3" />
                <span>Pertanyaan Klarifikasi Claude</span>
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
                      ? 'bg-orange-600/30 border-orange-400 text-orange-100 font-semibold shadow-xs ring-1 ring-orange-400/40'
                      : 'bg-black/30 border-white/5 text-slate-300 hover:bg-orange-950/30 hover:border-orange-500/30'
                  ]"
                >
                  <span class="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-0.2 flex-shrink-0"
                    :class="(selectedAnswers[msg.id] === opt || msg.pendingQuestion.selectedOption === opt) ? 'bg-orange-500 text-white' : 'bg-white/10 text-slate-400'">
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
                  class="w-full px-2 py-1 text-[10px] bg-black/40 border border-white/10 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-400"
                />
              </div>

              <!-- Submit Button / Selected Badge -->
              <div v-if="!msg.pendingQuestion.selectedOption" class="flex items-center justify-end">
                <button
                  @click="submitAnswer(msg.id)"
                  :disabled="!selectedAnswers[msg.id] && !customAnswers[msg.id]?.trim()"
                  class="px-2.5 py-1 rounded-md bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold text-[10px] transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <UIcon name="i-lucide-check" class="size-3" />
                  <span>Kirim</span>
                </button>
              </div>
              <div v-else class="text-[9.5px] text-orange-400 font-medium flex items-center gap-1 pt-1 border-t border-white/10">
                <UIcon name="i-lucide-check-circle" class="size-3 text-orange-400" />
                <span>Pilihan: <strong>{{ msg.pendingQuestion.selectedOption }}</strong></span>
              </div>
            </div>

            <!-- 3. Tool Calls Visual Cards -->
            <div v-if="getVisibleTools(msg.tools).length > 0" class="space-y-1 mb-2">
              <div
                v-for="tool in getVisibleTools(msg.tools)"
                :key="tool.id"
                class="rounded-lg bg-black/40 border border-[#ea580c]/20 overflow-hidden text-[10px]"
              >
                <!-- Slim Accordion Header -->
                <div
                  @click="toggleToolExpand(tool.id, tool.status)"
                  class="px-2 py-1 flex items-center justify-between text-orange-300 font-mono cursor-pointer hover:bg-orange-500/5 transition-colors"
                >
                  <div class="flex items-center gap-1.5 truncate max-w-[200px]">
                    <UIcon
                      name="i-lucide-wrench"
                      class="size-3 text-[#f97316] flex-shrink-0"
                      :class="{ 'animate-spin': tool.status === 'running' }"
                    />
                    <span class="font-semibold text-orange-300">{{ tool.name }}</span>
                    <span v-if="getToolSummaryArg(tool)" class="text-[9px] text-slate-400 truncate opacity-80">
                      {{ getToolSummaryArg(tool) }}
                    </span>
                  </div>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <span :class="[
                      'px-1.5 py-0.2 rounded text-[8.5px] font-semibold',
                      tool.status === 'completed'
                        ? 'bg-orange-500/15 text-orange-300'
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

                <!-- Output Body -->
                <div
                  v-if="isToolExpanded(tool)"
                  class="p-1.5 border-t border-[#ea580c]/15 bg-black/70 text-[9.5px] text-slate-300 font-mono whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar"
                >
                  <div v-if="tool.status === 'running'" class="flex items-center gap-1.5 text-amber-400/90 py-0.5 animate-pulse">
                    <UIcon name="i-lucide-loader-2" class="size-3 animate-spin text-amber-400" />
                    <span>Sedang mengeksekusi sub-proses Claude...</span>
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

            <!-- 4. Main Markdown Content -->
            <div v-if="msg.role === 'user' && msg.displayPrompt" class="leading-relaxed whitespace-pre-wrap break-words text-[11px]">
              {{ msg.displayPrompt }}
            </div>
            <div v-else-if="msg.content" class="space-y-1.5">
              <template v-for="(block, bIdx) in parseMarkdownBlocks(msg.content)" :key="bIdx">
                <!-- Text Block -->
                <div v-if="block.type === 'text'" v-html="formatInlineMarkdown(block.content)" class="leading-relaxed whitespace-pre-wrap break-words text-[11px]"></div>

                <!-- Code Fence Block -->
                <div v-else-if="block.type === 'code'" class="my-1.5 rounded-lg bg-[#0c0806] border border-white/10 overflow-hidden font-mono text-[10px]">
                  <div class="h-6 px-2 bg-white/[0.03] border-b border-white/5 flex items-center justify-between text-slate-400">
                    <span class="text-[9px] uppercase font-semibold text-[#f97316]">{{ block.language || 'code' }}</span>
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
                        class="px-1.5 py-0.2 rounded bg-orange-600/30 hover:bg-orange-600/50 text-orange-200 text-[9px] transition-all flex items-center gap-0.5 cursor-pointer"
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
              class="mt-2.5 space-y-1.5 p-2 rounded-xl bg-[#160d08]/95 border border-[#ea580c]/25 shadow-xl shadow-black/50 animate-in fade-in zoom-in-98 duration-150"
            >
              <div class="flex items-center justify-between px-1 pb-1 border-b border-orange-500/15 text-[9.5px]">
                <span class="text-orange-300 font-semibold flex items-center gap-1">
                  <UIcon name="i-lucide-layout-grid" class="size-3 text-[#f97316]" />
                  <span>Pilihan Opsi CLI Claude (Klik untuk Memilih):</span>
                </span>
                <span class="text-orange-400/80 font-mono text-[8.5px] bg-[#ea580c]/10 px-1.5 py-0.2 rounded border border-[#ea580c]/20">
                  Claude Interactive Choice
                </span>
              </div>

              <div class="grid grid-cols-1 gap-1.5 pt-1">
                <div
                  v-for="opt in extractInteractiveOptions(msg.content)"
                  :key="opt.key"
                  :class="[
                    'p-2 rounded-lg border transition-all flex items-start justify-between gap-2',
                    selectedChoiceMap[msg.id] === opt.key
                      ? 'bg-orange-950/60 border-orange-500 ring-1 ring-orange-500/30'
                      : 'bg-[#1e130c]/90 hover:bg-[#281910] border-orange-500/15 hover:border-orange-500/30'
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
                          ? 'bg-[#ea580c] text-white border-orange-400'
                          : 'bg-[#ea580c]/15 text-orange-200 border-[#ea580c]/30'
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
                      :disabled="claudeStore.isExecuting"
                      :class="[
                        'px-2 py-1 rounded-md text-[9.5px] font-semibold transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40',
                        opt.isConfirmation && opt.key === 'y'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                          : opt.isConfirmation && opt.key === 'n'
                          ? 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40'
                          : selectedChoiceMap[msg.id] === opt.key
                          ? 'bg-[#ea580c] text-white shadow-xs'
                          : 'bg-[#ea580c]/20 hover:bg-[#ea580c] text-orange-200 hover:text-white border border-[#ea580c]/30'
                      ]"
                      :title="`Pilih ${opt.title} dan kirim ke Claude CLI`"
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
              (Tidak ada respons dari model Claude yang dipilih. Silakan coba pilih model lain dari daftar atau kirim ulang pesan).
            </div>

            <!-- 6. Streaming Indicator & Live Status Pill -->
            <div
              v-if="msg.isStreaming && (msg.content || (msg.tools && msg.tools.length > 0))"
              class="flex items-center gap-2 pt-1.5 text-[10px] text-orange-300/80"
            >
              <div class="flex items-center gap-1">
                <span class="size-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay: 0ms"></span>
                <span class="size-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay: 150ms"></span>
                <span class="size-1.5 rounded-full bg-orange-400 animate-bounce" style="animation-delay: 300ms"></span>
              </div>
              <span class="text-orange-200 font-medium tracking-tight">
                {{ msg.activeStatusText || 'Mengetik respons...' }}
              </span>
            </div>

            <!-- 7. Pending Approval Card -->
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
                  @click="claudeStore.approveAction(msg.id, true)"
                  class="px-3.5 py-1 rounded-full bg-orange-600 hover:bg-orange-500 text-white font-semibold text-[9.5px] shadow-xs cursor-pointer transition-all active:scale-95"
                >
                  Setujui
                </button>
                <button
                  @click="claudeStore.approveAction(msg.id, false)"
                  class="px-3.5 py-1 rounded-full bg-white/10 hover:bg-white/15 text-slate-300 text-[9.5px] cursor-pointer transition-all active:scale-95"
                >
                  Tolak
                </button>
              </div>
            </div>
          </div>

          <!-- Actions Toolbar Under User Prompt -->
          <div
            v-if="msg.role === 'user'"
            class="flex items-center justify-end w-full text-[9px] text-slate-400 px-1 pt-0.5"
          >
            <div class="flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
              <button
                @click="handleResendPrompt(msg.content)"
                :disabled="claudeStore.isExecuting"
                class="px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-orange-300 border border-white/[0.06] hover:border-[#ea580c]/30 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95 disabled:opacity-40"
                title="Kirim ulang prompt (Resend)"
              >
                <UIcon name="i-lucide-rotate-cw" class="size-2.5" />
                <span class="text-[8.5px]">Resend</span>
              </button>
              <button
                @click="handleEditPrompt(msg.content)"
                class="px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-amber-300 border border-white/[0.06] hover:border-[#ea580c]/30 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
                title="Edit prompt di kolom input"
              >
                <UIcon name="i-lucide-pencil" class="size-2.5" />
                <span class="text-[8.5px]">Edit</span>
              </button>
              <button
                @click="copyMessageContent(msg.content, msg.id)"
                class="px-1.5 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] hover:border-[#ea580c]/30 transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
                title="Salin prompt"
              >
                <UIcon :name="copiedIndex === msg.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5" :class="copiedIndex === msg.id ? 'text-orange-400' : ''" />
                <span class="text-[8.5px]">{{ copiedIndex === msg.id ? 'Tersalin' : 'Salin' }}</span>
              </button>
            </div>
          </div>

          <!-- Actions Toolbar Under Claude Response -->
          <div
            v-if="msg.role === 'assistant' && msg.content && !msg.isStreaming"
            class="flex items-center justify-between w-full text-[9px] text-slate-400 px-1 pt-0.5"
          >
            <div class="flex items-center gap-1.5">
              <button
                @click="copyMessageContent(msg.content, msg.id)"
                class="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-[#f97316] border border-white/[0.06] hover:border-[#ea580c]/30 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                title="Salin isi seluruh respon Claude"
              >
                <UIcon :name="copiedIndex === msg.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5" :class="copiedIndex === msg.id ? 'text-orange-400' : ''" />
                <span class="text-[8.5px] font-medium">{{ copiedIndex === msg.id ? 'Tersalin' : 'Salin' }}</span>
              </button>

              <button
                @click="handleRegenerateResponse(msg.id)"
                :disabled="claudeStore.isExecuting"
                class="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-orange-300 border border-white/[0.06] hover:border-[#ea580c]/30 transition-all cursor-pointer flex items-center gap-1 active:scale-95 disabled:opacity-40"
                title="Buat ulang respon Claude ini (Regenerate)"
              >
                <UIcon name="i-lucide-rotate-cw" class="size-2.5" />
                <span class="text-[8.5px] font-medium">Ulangi</span>
              </button>
            </div>

            <div class="flex items-center gap-1.5 text-[8.5px] text-slate-400 font-mono">
              <span class="px-1.5 py-0.2 rounded bg-white/[0.03] border border-white/[0.05] text-slate-400">
                {{ claudeStore.currentModel }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Active File Context Strip -->
    <div v-if="workspaceStore.activeTab?.filePath" class="px-2.5 py-1 bg-black/40 border-t border-white/[0.06] flex items-center justify-between text-[9px] text-slate-400">
      <div class="flex items-center gap-1 truncate max-w-[180px]">
        <UIcon name="i-lucide-paperclip" class="size-2.5 text-[#f97316]" />
        <span class="truncate text-slate-300 font-mono">{{ workspaceStore.activeTab.title }}</span>
      </div>
      <label class="flex items-center gap-1 cursor-pointer select-none text-[8.5px] text-[#f97316] font-medium hover:text-orange-300">
        <input type="checkbox" v-model="includeActiveFile" class="rounded accent-[#ea580c] size-2.5" />
        <span>Konteks File</span>
      </label>
    </div>

    <!-- Input Box -->
    <div class="p-2.5 bg-[#0c0a08] border-t border-white/[0.06] flex-shrink-0 relative z-20">
      <div class="bg-[#140e0a]/90 border border-white/[0.08] hover:border-white/[0.14] focus-within:border-[#ea580c]/50 focus-within:ring-1 focus-within:ring-[#ea580c]/25 rounded-2xl p-2.5 shadow-xl transition-all duration-200 space-y-1.5">
        <!-- Hidden Image Input File Picker -->
        <input
          ref="imageInputRef"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="handleImageInputChange"
        />

        <!-- Attached Images Preview Strip -->
        <div v-if="attachedImages.length > 0" class="flex flex-wrap gap-1.5 pb-1 border-b border-white/[0.06]">
          <div
            v-for="(img, idx) in attachedImages"
            :key="idx"
            class="relative group rounded-lg overflow-hidden border border-[#ea580c]/30 bg-[#1e130c] flex items-center gap-1.5 pr-2 pl-1 py-0.5 shadow-sm text-[9.5px] max-w-full"
          >
            <img :src="img.previewUrl" :alt="img.name" class="w-5 h-5 rounded object-cover flex-shrink-0" />
            <span class="font-mono text-orange-300 truncate max-w-[140px]" :title="img.relativePath">
              {{ img.name }}
            </span>
            <button
              @click.stop="removeAttachedImage(idx)"
              class="w-3.5 h-3.5 bg-black/60 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-[8px] transition-colors cursor-pointer flex-shrink-0"
              title="Hapus gambar"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </button>
          </div>
        </div>

        <!-- Textarea -->
        <div class="relative w-full">
          <textarea
            ref="inputAreaRef"
            v-model="inputText"
            @input="adjustTextareaHeight"
            @keydown="handleKeyDown"
            placeholder="Ask Claude anything, tag code (Ctrl+L), paste (Ctrl+V), @, /"
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
                ? 'bg-[#ea580c]/20 border-[#ea580c]/50 text-[#f97316] shadow-xs'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'"
              :title="`Pengaturan Model Claude (Aktif: ${claudeStore.currentModelItem.name || claudeStore.currentModel})`"
            >
              <UIcon name="i-lucide-settings" class="size-3 font-semibold" />
            </button>

            <!-- @ Mention / File Context Toggle Button -->
            <button
              @click="includeActiveFile = !includeActiveFile"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-[11px] flex-shrink-0 cursor-pointer"
              :class="includeActiveFile && workspaceStore.activeTab?.filePath
                ? 'bg-[#ea580c]/20 border-[#ea580c]/50 text-[#f97316] shadow-xs'
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
                  ? 'bg-[#ea580c]/20 border-[#ea580c]/50 text-[#f97316] shadow-xs cursor-pointer'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-[#ea580c]/40 text-slate-400 hover:text-[#f97316] cursor-pointer'
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
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all border text-slate-400 bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] hover:border-[#ea580c]/40 hover:text-[#f97316] cursor-pointer flex-shrink-0"
              title="Input Suara"
            >
              <UIcon name="i-lucide-mic" class="size-3" />
            </button>

            <!-- Circular Send / Abort Button -->
            <button
              v-if="claudeStore.isExecuting"
              @click="claudeStore.abortCurrent"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center bg-rose-500 hover:bg-rose-600 text-white shadow-md active:scale-95 transition-all cursor-pointer"
              title="Hentikan Jawaban Claude (Stop)"
            >
              <UIcon name="i-lucide-square" class="size-3" />
            </button>
            <button
              v-else
              @click="handleSendMessage"
              :disabled="!inputText.trim() && attachedImages.length === 0"
              class="w-6 h-6 min-w-[24px] rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              :class="(inputText.trim() || attachedImages.length > 0)
                ? 'bg-gradient-to-r from-[#ea580c] to-[#d97706] text-white hover:from-[#f97316] hover:to-[#ea580c] shadow-md shadow-[#ea580c]/30 cursor-pointer font-bold'
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
    <ClaudeModelModal
      :is-open="isModelModalOpen"
      @close="isModelModalOpen = false"
    />

    <!-- Sessions Switcher & Manager Modal -->
    <ClaudeSessionModal
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
  background: rgba(234, 88, 12, 0.25);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(234, 88, 12, 0.45);
}

@keyframes claude-shimmer-anim {
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

@keyframes claude-glow-pulse-anim {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(234, 88, 12, 0.4);
    background-color: #ea580c;
  }
  50% {
    box-shadow: 0 0 8px rgba(249, 115, 22, 0.9), 0 0 16px rgba(249, 115, 22, 0.4);
    background-color: #f97316;
  }
}

.claude-gradient-text {
  background: linear-gradient(90deg, #ea580c, #f97316, #fbbf24, #f97316, #ea580c);
  background-size: 250% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: claude-shimmer-anim 4s ease infinite;
}

.claude-pulse-dot {
  animation: claude-glow-pulse-anim 2.5s ease-in-out infinite;
}
</style>
