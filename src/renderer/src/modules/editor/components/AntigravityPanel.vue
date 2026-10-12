<script setup lang="ts">
import { ref, onMounted, nextTick, watch, computed } from 'vue'
import { useAntigravityStore } from '@renderer/stores/antigravityStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { parseMarkdownBlocks, formatInlineMarkdown } from '@renderer/utils/markdownParser'
import AntigravityModelModal from './AntigravityModelModal.vue'
import AntigravitySessionModal from './AntigravitySessionModal.vue'
import antigravityLogo from '@renderer/assets/antigravity-logo.svg'
import iconImg from '@renderer/assets/icon.jpg'

const antigravityStore = useAntigravityStore()
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
  antigravityStore.loadAvailableModels()
  antigravityStore.loadSessions()
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

watch(
  () => antigravityStore.messages.length,
  () => {
    scrollToBottom()
  }
)

watch(
  () => {
    const lastMsg = antigravityStore.messages[antigravityStore.messages.length - 1]
    return lastMsg ? lastMsg.content.length : 0
  },
  () => {
    scrollToBottom()
  }
)

function adjustTextareaHeight() {
  const el = inputAreaRef.value
  if (!el) return
  el.style.height = 'auto'
  const maxHeight = 160
  el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
}

function formatMessageTime(timestamp?: number | string): string {
  if (!timestamp) return ''
  return settingsStore.formatTimestamp(timestamp)
}

const activeFileContext = computed(() => {
  const tab = workspaceStore.activeTab
  if (!tab || !includeActiveFile.value) return null
  return {
    filePath: tab.filePath,
    fileName: tab.fileName,
    content: tab.content,
    language: tab.language
  }
})

function copyThinkingText(thinkingText: string, messageId: string) {
  if (!thinkingText) return
  navigator.clipboard.writeText(thinkingText)
  copiedIndex.value = `thinking-${messageId}`
  setTimeout(() => {
    if (copiedIndex.value === `thinking-${messageId}`) {
      copiedIndex.value = null
    }
  }, 2000)
}

function copyCode(code: string, blockIndex: number) {
  navigator.clipboard.writeText(code)
  copiedIndex.value = `code-${blockIndex}`
  setTimeout(() => {
    if (copiedIndex.value === `code-${blockIndex}`) {
      copiedIndex.value = null
    }
  }, 2000)
}

async function handleSendMessage() {
  if (!inputText.value.trim() || antigravityStore.isExecuting) return

  const promptContent = inputText.value.trim()
  inputText.value = ''
  adjustTextareaHeight()

  let fullPrompt = promptContent
  const displayPrompt = promptContent

  if (includeActiveFile.value && activeFileContext.value) {
    fullPrompt = `[Konteks Berkas Aktif: ${activeFileContext.value.filePath}]\n\`\`\`${activeFileContext.value.language}\n${activeFileContext.value.content}\n\`\`\`\n\nInstruksi Pengguna:\n${promptContent}`
  }

  const projectRoot = connectedProject.value?.path || (workspaceStore.activeTab?.filePath
    ? workspaceStore.findProjectRoot(workspaceStore.activeTab.filePath)
    : undefined)

  await antigravityStore.sendPrompt(fullPrompt, projectRoot, displayPrompt)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSendMessage()
  }
}

function handleStop() {
  antigravityStore.abortCurrent()
}

function selectSingleOption(toolCallId: string, option: string) {
  selectedAnswers.value[toolCallId] = option
}

function isOptionSelected(toolCallId: string, option: string): boolean {
  return selectedAnswers.value[toolCallId] === option
}

async function submitSelectedAnswer(messageId: string, toolCallId: string) {
  const custom = customAnswers.value[toolCallId]?.trim()
  const selected = selectedAnswers.value[toolCallId]
  const finalAnswer = custom || selected

  if (!finalAnswer) return
  await antigravityStore.submitQuestionAnswer(messageId, finalAnswer)
}

function getToolDisplayLabel(tool: any): string {
  if (tool.name === 'write_to_file' || tool.name === 'Edit') return 'Tulis Berkas'
  if (tool.name === 'replace_file_content' || tool.name === 'multi_replace_file_content') return 'Ubah Berkas'
  if (tool.name === 'view_file' || tool.name === 'Read') return 'Baca Berkas'
  if (tool.name === 'run_command' || tool.name === 'Bash') return 'Terminal Command'
  if (tool.name === 'list_dir' || tool.name === 'LS') return 'Daftar Direktori'
  if (tool.name === 'grep_search' || tool.name === 'Grep') return 'Pencarian Kode'
  return tool.name || 'Tool Execution'
}

function getToolTargetPreview(tool: any): string {
  if (!tool.args) return ''
  if (tool.args.TargetFile) return tool.args.TargetFile.split(/[\\/]/).pop() || tool.args.TargetFile
  if (tool.args.AbsolutePath) return tool.args.AbsolutePath.split(/[\\/]/).pop() || tool.args.AbsolutePath
  if (tool.args.CommandLine) return tool.args.CommandLine.length > 35 ? tool.args.CommandLine.slice(0, 35) + '...' : tool.args.CommandLine
  if (tool.args.Query) return `"${tool.args.Query}"`
  return ''
}
</script>

<template>
  <aside class="w-88 h-full flex flex-col bg-[#070d19] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 text-slate-100 font-sans relative overflow-hidden shadow-sm transition-all">
    <!-- Header (Google Antigravity Blue Accent) -->
    <div class="h-9 px-3 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold bg-[#0c1527]/95 backdrop-blur-md flex-shrink-0">
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <div class="w-5 h-5 rounded-md bg-[#2563eb]/20 border border-[#2563eb]/40 flex items-center justify-center p-0.5">
          <img :src="antigravityLogo" alt="Antigravity" class="size-3.5 object-contain" />
        </div>
        <span :class="['inline-block size-1.5 rounded-full', antigravityStore.isExecuting ? 'bg-sky-400 animate-ping' : 'bg-[#2563eb] animate-pulse']"></span>
        <span class="font-bold bg-gradient-to-r from-[#60a5fa] to-[#38bdf8] bg-clip-text text-transparent">Antigravity</span>
        <span class="text-[9px] px-1 py-0.2 rounded bg-[#2563eb]/20 text-[#93c5fd] border border-[#2563eb]/30 font-mono">agy</span>
      </div>

      <div class="flex items-center gap-1">
        <!-- Mode Switcher Badge -->
        <div class="flex items-center bg-black/50 rounded-md p-0.5 border border-white/5 text-[9px] mr-0.5">
          <button
            @click="antigravityStore.executionMode = 'agent'"
            :class="[
              'px-1.5 py-0.2 rounded transition-all cursor-pointer',
              antigravityStore.executionMode === 'agent' ? 'bg-[#2563eb]/30 text-[#93c5fd] font-semibold' : 'text-slate-400 hover:text-slate-200'
            ]"
            title="Antigravity Agent Mode (Autonomous Tools & Actions)"
          >
            Agent
          </button>
          <button
            @click="antigravityStore.executionMode = 'chat'"
            :class="[
              'px-1.5 py-0.2 rounded transition-all cursor-pointer',
              antigravityStore.executionMode === 'chat' ? 'bg-[#2563eb]/30 text-[#93c5fd] font-semibold' : 'text-slate-400 hover:text-slate-200'
            ]"
            title="Antigravity Plan Mode (Deep Reasoning / Read-only)"
          >
            Plan
          </button>
        </div>

        <!-- Gear Settings Button (Model Switcher) -->
        <button
          @click="isModelModalOpen = !isModelModalOpen; isSessionModalOpen = false"
          :class="[
            'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer',
            isModelModalOpen
              ? 'bg-[#2563eb]/20 text-[#60a5fa] ring-1 ring-[#2563eb]/40'
              : 'text-slate-400 hover:text-[#60a5fa] hover:bg-white/[0.06]'
          ]"
          :title="`Pengaturan Model Antigravity (Aktif: ${antigravityStore.currentModelItem.name || antigravityStore.currentModel})`"
        >
          <UIcon name="i-lucide-settings" class="size-3.5" />
        </button>

        <!-- Sessions / History Switcher Button -->
        <button
          @click="isSessionModalOpen = !isSessionModalOpen; isModelModalOpen = false"
          :class="[
            'w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer group',
            isSessionModalOpen
              ? 'bg-[#2563eb]/20 text-[#60a5fa] ring-1 ring-[#2563eb]/40'
              : 'text-slate-400 hover:text-[#60a5fa] hover:bg-white/[0.06]'
          ]"
          title="Riwayat Sesi Antigravity CLI"
        >
          <UIcon name="i-lucide-history" class="size-3.5 group-hover:rotate-[-20deg] transition-transform" />
        </button>

        <!-- New Chat Session Button -->
        <button
          @click="antigravityStore.createNewSession()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#60a5fa] hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Mulai Sesi Antigravity Baru"
        >
          <UIcon name="i-lucide-square-pen" class="size-3.5" />
        </button>

        <!-- Clear Chat Button -->
        <button
          @click="antigravityStore.clearMessages()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Bersihkan Percakapan"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>

        <!-- Close / Collapse Panel Button -->
        <button
          @click="workspaceStore.toggleAntigravityPanel()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Tutup Panel Antigravity"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Loading Session History State -->
    <div v-if="antigravityStore.isLoadingSessionHistory" class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 font-mono">
      <div class="w-10 h-10 rounded-xl bg-[#2563eb]/10 border border-[#2563eb]/30 flex items-center justify-center text-[#60a5fa] animate-pulse shadow-lg">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-[#60a5fa]" />
      </div>
      <div class="space-y-1">
        <p class="text-xs font-semibold text-slate-200">Memuat Riwayat Sesi Antigravity...</p>
        <p class="text-[10px] text-slate-400">Mengambil transcript percakapan agy CLI</p>
      </div>
    </div>

    <!-- Messages Container -->
    <div v-else ref="messageContainer" class="flex-1 overflow-y-auto p-3 text-[11px] relative flex flex-col custom-scrollbar">
      <!-- DEFAULT HERO STATE -->
      <div
        v-if="antigravityStore.messages.length === 0"
        class="my-auto flex flex-col items-center justify-center py-6 px-2 text-center select-none w-full"
      >
        <!-- Glow Logo Card -->
        <div class="relative group mb-4 mx-auto flex items-center justify-center">
          <div class="absolute -inset-1.5 bg-gradient-to-r from-[#2563eb]/50 via-[#0284c7]/40 to-[#38bdf8]/40 rounded-3xl blur-md opacity-75 group-hover:opacity-100 transition duration-500"></div>
          <div class="relative w-20 h-20 sm:w-22 sm:h-22 rounded-2xl bg-[#0c172d] border border-[#2563eb]/40 group-hover:border-[#60a5fa]/70 shadow-xl shadow-[#2563eb]/20 flex items-center justify-center p-3.5 overflow-hidden transition-all">
            <img :src="antigravityLogo" alt="Antigravity Logo" class="w-12 h-12 object-contain" />
          </div>
        </div>

        <div class="flex items-center justify-center gap-1.5 mb-1.5">
          <h2 class="text-base sm:text-lg font-bold tracking-tight text-white flex items-center justify-center gap-1.5 text-center">
            <span class="bg-gradient-to-r from-[#93c5fd] via-[#60a5fa] to-[#38bdf8] bg-clip-text text-transparent">
              {{ antigravityStore.executionMode === 'chat' ? 'Antigravity Plan Mode' : 'Antigravity Agent (AGY CLI)' }}
            </span>
          </h2>
        </div>

        <p class="text-[11px] text-slate-400 text-center max-w-[270px] mx-auto leading-relaxed mb-4">
          {{
            antigravityStore.executionMode === 'chat'
              ? 'Mode Rencana & Analisis Antigravity CLI. Menganalisis kode dan arsitektur tanpa eksekusi langsung.'
              : 'Agen rekayasa perangkat lunak otonom bertenaga Antigravity CLI (agy). Eksekusi tool langsung dengan kecepatan tinggi.'
          }}
        </p>

        <div
          v-if="connectedProject"
          class="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-[#2563eb]/30 text-[10px] text-slate-300 flex items-center gap-2 max-w-[95%] shadow-xs"
        >
          <span class="w-2 h-2 rounded-full bg-[#2563eb] animate-pulse flex-shrink-0"></span>
          <span class="text-slate-400 font-medium flex-shrink-0">Workspace:</span>
          <span class="font-mono text-[#93c5fd] truncate text-[10px]" :title="connectedProject.path">
            {{ connectedProject.name }}
          </span>
        </div>
      </div>

      <!-- Messages Stream List -->
      <div v-else class="space-y-2.5">
        <div
          v-for="msg in antigravityStore.messages"
          :key="msg.id"
          :class="['flex flex-col space-y-1', msg.role === 'user' ? 'items-end' : 'items-start']"
        >
          <!-- User Header -->
          <div v-if="msg.role === 'user'" class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
            <span class="font-medium text-sky-300">Anda</span>
            <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Assistant Header -->
          <div v-else class="flex items-center gap-1.5 text-[9px] text-slate-400 px-1 mb-0.5">
            <div class="size-3.5 rounded-xs bg-[#2563eb]/30 flex items-center justify-center p-0.5">
              <img :src="antigravityLogo" alt="Antigravity" class="size-2.5 object-contain" />
            </div>
            <span class="font-medium text-[#93c5fd]">Antigravity (agy)</span>
            <span v-if="msg.timestamp" class="text-[9px] text-slate-400 font-mono">
              {{ formatMessageTime(msg.timestamp) }}
            </span>
          </div>

          <!-- Message Bubble -->
          <div
            :class="[
              'p-2.5 rounded-xl max-w-[96%] leading-relaxed break-words shadow-sm transition-all w-full',
              msg.role === 'user'
                ? 'bg-gradient-to-br from-[#1d4ed8] to-[#0284c7] text-white rounded-tr-xs border border-blue-400/30 text-[11px]'
                : 'bg-[#0b1325]/95 text-slate-200 rounded-tl-xs border border-[#2563eb]/15 text-[11px]'
            ]"
          >
            <!-- Thinking Accordion -->
            <div
              v-if="msg.thinking"
              class="mb-2.5 rounded-xl border transition-all duration-200 overflow-hidden shadow-xs"
              :class="[
                msg.isStreaming
                  ? 'bg-[#0f1b33] border-[#2563eb]/35 ring-1 ring-[#2563eb]/20'
                  : 'bg-[#0b1426] border-[#2563eb]/20 hover:border-[#2563eb]/35'
              ]"
            >
              <button
                @click="antigravityStore.toggleThinking(msg.id)"
                class="w-full px-2.5 py-1.5 flex items-center justify-between text-[10.5px] bg-[#132240]/80 hover:bg-[#182b52] transition-all cursor-pointer select-none group"
                :class="{ 'border-b border-[#2563eb]/15': msg.isThinkingExpanded }"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="size-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors"
                    :class="msg.isStreaming ? 'bg-[#2563eb]/25 text-[#93c5fd] ring-1 ring-[#2563eb]/30' : 'bg-[#2563eb]/15 text-[#60a5fa]'"
                  >
                    <UIcon
                      :name="msg.isStreaming ? 'i-lucide-brain' : 'i-lucide-sparkles'"
                      class="size-3.5 text-[#93c5fd]"
                      :class="{ 'animate-pulse text-[#60a5fa]': msg.isStreaming }"
                    />
                  </div>
                  <div class="flex items-center gap-1.5 truncate">
                    <span class="font-medium truncate transition-colors text-blue-200/90 group-hover:text-blue-100">
                      {{ msg.isStreaming ? 'Antigravity sedang menalar...' : 'Penalaran Antigravity' }}
                    </span>
                    <span
                      v-if="msg.thinkingSeconds !== undefined"
                      class="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-[#2563eb]/15 text-[#93c5fd] border border-[#2563eb]/25 flex-shrink-0 font-medium"
                    >
                      {{ msg.thinkingSeconds }}s
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-1.5 flex-shrink-0 text-blue-300/70 group-hover:text-blue-200">
                  <button
                    v-if="msg.isThinkingExpanded"
                    @click.stop="copyThinkingText(msg.thinking, msg.id)"
                    class="p-1 rounded hover:bg-[#2563eb]/20 text-blue-300/80 hover:text-blue-100 transition-colors cursor-pointer"
                    title="Salin hasil penalaran"
                  >
                    <UIcon :name="copiedIndex === `thinking-${msg.id}` ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
                  </button>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-3 transition-transform duration-200"
                    :class="{ 'rotate-180': msg.isThinkingExpanded }"
                  />
                </div>
              </button>

              <div
                v-if="msg.isThinkingExpanded"
                class="p-2.5 bg-[#070e1c]/90 text-[10px] text-blue-200/80 leading-relaxed font-mono whitespace-pre-wrap max-h-56 overflow-y-auto custom-scrollbar select-text border-t border-[#2563eb]/10"
              >
                {{ msg.thinking }}
              </div>
            </div>

            <!-- Tool Calls -->
            <div v-if="msg.tools && msg.tools.length > 0" class="mb-2 space-y-1.5">
              <div
                v-for="tool in msg.tools"
                :key="tool.id"
                class="rounded-xl border border-white/[0.08] bg-[#0f1b33]/80 overflow-hidden text-[10.5px]"
              >
                <button
                  @click="toggleToolExpand(tool.id, tool.status)"
                  class="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-white/[0.04] transition-colors cursor-pointer select-none"
                >
                  <div class="flex items-center gap-2 min-w-0 pr-2">
                    <UIcon
                      :name="tool.status === 'running' ? 'i-lucide-loader-2' : tool.status === 'failed' ? 'i-lucide-alert-circle' : 'i-lucide-check-circle-2'"
                      :class="[
                        'size-3.5 flex-shrink-0',
                        tool.status === 'running' ? 'animate-spin text-blue-400' : tool.status === 'failed' ? 'text-rose-400' : 'text-emerald-400'
                      ]"
                    />
                    <span class="font-medium text-slate-200 truncate">{{ getToolDisplayLabel(tool) }}</span>
                    <span v-if="getToolTargetPreview(tool)" class="font-mono text-[9px] text-slate-400 truncate max-w-[140px]">
                      {{ getToolTargetPreview(tool) }}
                    </span>
                  </div>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-3 text-slate-500 transition-transform duration-200 flex-shrink-0"
                    :class="{ 'rotate-180': isToolExpanded(tool) }"
                  />
                </button>

                <div
                  v-if="isToolExpanded(tool)"
                  class="p-2 border-t border-white/[0.06] bg-[#070e1c] font-mono text-[9.5px] text-slate-300 max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap select-text"
                >
                  {{ tool.output || 'Menjalankan...' }}
                </div>
              </div>
            </div>

            <!-- Markdown Content -->
            <div class="space-y-1.5">
              <template v-for="(block, bIdx) in parseMarkdownBlocks(msg.content)" :key="bIdx">
                <!-- Code Block -->
                <div v-if="block.type === 'code'" class="my-1.5 rounded-xl border border-white/[0.1] bg-[#081021] overflow-hidden">
                  <div class="h-6 px-2.5 bg-white/[0.04] border-b border-white/[0.06] flex items-center justify-between text-[9px] text-slate-400 font-mono">
                    <span>{{ block.lang || 'code' }}</span>
                    <button
                      @click="copyCode(block.content, bIdx)"
                      class="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
                    >
                      <UIcon :name="copiedIndex === `code-${bIdx}` ? 'i-lucide-check' : 'i-lucide-copy'" class="size-2.5" />
                      <span>{{ copiedIndex === `code-${bIdx}` ? 'Tersalin' : 'Salin' }}</span>
                    </button>
                  </div>
                  <pre class="p-2.5 text-[10px] font-mono text-blue-100 overflow-x-auto custom-scrollbar select-text leading-relaxed"><code>{{ block.content }}</code></pre>
                </div>

                <!-- Text Paragraph -->
                <p
                  v-else
                  class="whitespace-pre-wrap leading-relaxed select-text"
                  v-html="formatInlineMarkdown(block.content)"
                ></p>
              </template>
            </div>

            <!-- Active Status Indicator -->
            <div
              v-if="msg.isStreaming && msg.activeStatusText"
              class="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center gap-1.5 text-[9.5px] text-[#93c5fd] animate-pulse"
            >
              <UIcon name="i-lucide-sparkles" class="size-3 text-[#60a5fa]" />
              <span>{{ msg.activeStatusText }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Input Footer Bar -->
    <div class="p-2.5 border-t border-white/[0.06] bg-[#0a1224]/95 backdrop-blur-md flex-shrink-0 space-y-2">
      <!-- Context File Toggle & Status -->
      <div class="flex items-center justify-between text-[9.5px] px-1 text-slate-400">
        <label class="flex items-center gap-1.5 cursor-pointer hover:text-slate-200 transition-colors">
          <input
            v-model="includeActiveFile"
            type="checkbox"
            class="rounded border-white/20 bg-white/5 text-[#2563eb] focus:ring-0 cursor-pointer"
          />
          <span class="truncate max-w-[200px]" :title="activeFileContext?.filePath">
            {{ activeFileContext ? `Sertakan ${activeFileContext.fileName}` : 'Sertakan berkas aktif' }}
          </span>
        </label>

        <span class="font-mono text-[9px] text-[#93c5fd] flex items-center gap-1">
          <span class="size-1.5 rounded-full bg-[#2563eb]"></span>
          <span>{{ antigravityStore.currentModelItem.name }}</span>
        </span>
      </div>

      <!-- Textarea Box -->
      <div class="relative rounded-xl border border-white/[0.1] bg-[#0d172e] focus-within:border-[#2563eb]/60 focus-within:ring-1 focus-within:ring-[#2563eb]/30 transition-all p-1.5 flex flex-col gap-1.5">
        <textarea
          ref="inputAreaRef"
          v-model="inputText"
          rows="1"
          placeholder="Tanya Antigravity CLI (agy) atau beri instruksi kode..."
          @keydown="handleKeyDown"
          @input="adjustTextareaHeight"
          class="w-full bg-transparent border-0 text-slate-100 placeholder:text-slate-500 text-[11px] outline-none resize-none px-1.5 py-1 custom-scrollbar leading-relaxed"
        ></textarea>

        <div class="flex items-center justify-between pt-1 border-t border-white/[0.04]">
          <span class="text-[9px] text-slate-500 pl-1">
            Tekan <kbd class="px-1 py-0.2 rounded bg-white/10 font-mono text-[8px] text-slate-300">Enter</kbd> untuk kirim
          </span>

          <div class="flex items-center gap-1.5">
            <button
              v-if="antigravityStore.isExecuting"
              @click="handleStop"
              class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-semibold text-[10px] flex items-center gap-1 transition-colors cursor-pointer border border-rose-500/30"
            >
              <UIcon name="i-lucide-square" class="size-3" />
              <span>Hentikan</span>
            </button>

            <button
              v-else
              @click="handleSendMessage"
              :disabled="!inputText.trim()"
              class="px-3 py-1 rounded-lg bg-gradient-to-r from-[#2563eb] to-[#0284c7] hover:from-[#3b82f6] hover:to-[#2563eb] disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-[10px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
            >
              <span>Kirim</span>
              <UIcon name="i-lucide-arrow-up" class="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <AntigravityModelModal
      :is-open="isModelModalOpen"
      @close="isModelModalOpen = false"
    />

    <AntigravitySessionModal
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
  background: rgba(37, 99, 235, 0.25);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(37, 99, 235, 0.45);
}
</style>
