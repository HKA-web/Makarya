<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useGitStore, type GitFileItem } from '@renderer/stores/gitStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'
import GitDiffModal from './GitDiffModal.vue'

const gitStore = useGitStore()
const workspaceStore = useWorkspaceStore()

const isStagedExpanded = ref(true)
const isUnstagedExpanded = ref(true)

onMounted(() => {
  gitStore.refreshStatus()
})

// Auto refresh git status when active root or active tab changes (e.g. file saved)
watch(
  () => [workspaceStore.activeRootPath, workspaceStore.tabList.map((t) => t.isDirty)],
  () => {
    gitStore.refreshStatus()
  },
  { deep: true }
)

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

function getFileDir(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  parts.pop()
  return parts.join('/')
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'added':
      return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
    case 'modified':
      return 'text-amber-400 bg-amber-500/15 border-amber-500/30'
    case 'deleted':
      return 'text-rose-400 bg-rose-500/15 border-rose-500/30'
    case 'untracked':
      return 'text-sky-400 bg-sky-500/15 border-sky-500/30'
    case 'renamed':
      return 'text-purple-400 bg-purple-500/15 border-purple-500/30'
    default:
      return 'text-slate-400 bg-slate-500/15 border-slate-500/30'
  }
}

function getStatusLetter(status: string): string {
  switch (status) {
    case 'added':
      return 'A'
    case 'modified':
      return 'M'
    case 'deleted':
      return 'D'
    case 'untracked':
      return 'U'
    case 'renamed':
      return 'R'
    default:
      return 'M'
  }
}

function getProjectRoot(): string {
  return (
    workspaceStore.activeRootPath ||
    (workspaceStore.workspaceRoots.length > 0 ? workspaceStore.workspaceRoots[0].path : '')
  )
}

function getProjectName(): string {
  const rootPath = getProjectRoot()
  if (rootPath) {
    const matchingRoot = workspaceStore.workspaceRoots.find((r) => {
      const normRoot = r.path.replace(/\\/g, '/').toLowerCase()
      const normProject = rootPath.replace(/\\/g, '/').toLowerCase()
      return normRoot === normProject
    })
    if (matchingRoot) return matchingRoot.name
    return rootPath.split(/[/\\]/).filter(Boolean).pop() || ''
  }
  return ''
}

function getFullFilePath(relativePath: string): string {
  const rootPath = getProjectRoot()
  if (rootPath) {
    const normRoot = rootPath.replace(/[/\\]+$/, '')
    const cleanRel = relativePath.replace(/^[/\\]+/, '')
    return `${normRoot}\\${cleanRel}`.replace(/\//g, '\\')
  }
  return relativePath
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'modified':
      return 'Modified'
    case 'added':
      return 'Added (Staged)'
    case 'deleted':
      return 'Deleted'
    case 'untracked':
      return 'Untracked'
    case 'renamed':
      return 'Renamed'
    default:
      return status.toUpperCase()
  }
}

const hoverTooltip = ref<{ file: GitFileItem; right: number; top: number } | null>(null)
let fileHoverTimer: ReturnType<typeof setTimeout> | null = null

function handleFileMouseEnter(file: GitFileItem, event: MouseEvent): void {
  if (fileHoverTimer) clearTimeout(fileHoverTimer)
  const target = event.currentTarget as HTMLElement
  if (!target) return

  fileHoverTimer = setTimeout(() => {
    const panelEl = target.closest('aside') || target
    const panelRect = panelEl.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()

    // Align right edge of tooltip precisely 10px to the left of the Source Control panel
    const right = Math.max(12, window.innerWidth - panelRect.left + 10)
    const top = Math.max(10, Math.min(targetRect.top - 4, window.innerHeight - 90))
    hoverTooltip.value = { file, right, top }
  }, 180)
}

function handleFileMouseLeave(): void {
  if (fileHoverTimer) {
    clearTimeout(fileHoverTimer)
    fileHoverTimer = null
  }
  hoverTooltip.value = null
}

const actionTooltip = ref<{ text: string; shortcut?: string; right: number; top: number } | null>(null)
let actionHoverTimer: ReturnType<typeof setTimeout> | null = null

function showActionTooltip(text: string, event: MouseEvent, shortcut?: string): void {
  if (actionHoverTimer) clearTimeout(actionHoverTimer)
  const target = event.currentTarget as HTMLElement
  if (!target) return

  actionHoverTimer = setTimeout(() => {
    const rect = target.getBoundingClientRect()
    const top = rect.top < 100 ? rect.bottom + 6 : Math.max(10, rect.top - 28)
    const right = Math.max(12, window.innerWidth - rect.right + 4)
    actionTooltip.value = { text, shortcut, right, top }
  }, 120)
}

function hideActionTooltip(): void {
  if (actionHoverTimer) {
    clearTimeout(actionHoverTimer)
    actionHoverTimer = null
  }
  actionTooltip.value = null
}

function handleCommitKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    gitStore.commit()
  } else if ((e.altKey && (e.key === 'g' || e.key === 'G')) || ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G'))) {
    e.preventDefault()
    if (!gitStore.isGeneratingMessage) {
      gitStore.generateCommitMessage()
    }
  }
}
</script>

<template>
  <aside class="w-84 h-full flex flex-col bg-[#090d14] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 text-slate-100 font-sans relative overflow-hidden shadow-sm transition-all">
    <!-- Header with Git Branch and Sync Controls -->
    <div class="h-9 px-3 border-b border-white/[0.06] flex items-center justify-between text-[11px] font-semibold bg-[#0b101b]/95 backdrop-blur-md flex-shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <UIcon name="i-lucide-git-branch" class="size-3.5 text-emerald-400 flex-shrink-0" />
        <span class="text-xs font-bold text-white uppercase tracking-wider truncate">Source Control</span>
      </div>

      <div class="flex items-center gap-1.5 flex-shrink-0">
        <!-- Branch Badge Pill -->
        <span
          v-if="gitStore.isGitRepo"
          @mouseenter="showActionTooltip(`Branch: ${gitStore.branch}`, $event)"
          @mouseleave="hideActionTooltip"
          class="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-400 font-mono truncate max-w-[100px] cursor-default"
        >
          {{ gitStore.branch }}
        </span>

        <!-- Refresh Button -->
        <button
          @click="gitStore.refreshStatus()"
          :disabled="gitStore.isLoadingStatus"
          @mouseenter="showActionTooltip('Refresh Status Git', $event)"
          @mouseleave="hideActionTooltip"
          class="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
        >
          <UIcon name="i-lucide-rotate-cw" class="size-3.5" :class="{ 'animate-spin': gitStore.isLoadingStatus }" />
        </button>

        <!-- Push Button (Green when commits are ready to push) -->
        <button
          @click="gitStore.push()"
          :disabled="gitStore.isPushing"
          @mouseenter="showActionTooltip(gitStore.ahead > 0 ? `Git Push (${gitStore.ahead} commit siap di-push)` : 'Git Push (Upload ke Remote)', $event)"
          @mouseleave="hideActionTooltip"
          class="h-6 px-2.5 rounded-full flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-40"
          :class="gitStore.ahead > 0
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 ring-1 ring-emerald-500/20 shadow-xs'
            : 'text-slate-400 hover:text-emerald-400 hover:bg-white/10'"
        >
          <UIcon name="i-lucide-arrow-up" class="size-3.5" :class="{ 'animate-bounce': gitStore.isPushing }" />
          <span v-if="gitStore.ahead > 0" class="text-[9px] font-mono font-bold leading-none">{{ gitStore.ahead }}</span>
        </button>

        <!-- Pull Button (Red when behind / new commits on remote) -->
        <button
          @click="gitStore.pull()"
          :disabled="gitStore.isPulling"
          @mouseenter="showActionTooltip(gitStore.behind > 0 ? `Git Pull (${gitStore.behind} commit baru di remote)` : 'Git Pull (Download dari Remote)', $event)"
          @mouseleave="hideActionTooltip"
          class="h-6 px-2.5 rounded-full flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-40"
          :class="gitStore.behind > 0
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 ring-1 ring-rose-500/20 animate-pulse shadow-xs'
            : 'text-slate-400 hover:text-sky-400 hover:bg-white/10'"
        >
          <UIcon name="i-lucide-arrow-down" class="size-3.5" :class="{ 'animate-bounce': gitStore.isPulling }" />
          <span v-if="gitStore.behind > 0" class="text-[9px] font-mono font-bold leading-none">{{ gitStore.behind }}</span>
        </button>

        <!-- Close / Collapse Panel Button -->
        <button
          @click="workspaceStore.toggleSourceControlPanel()"
          @mouseenter="showActionTooltip('Tutup Panel Source Control', $event)"
          @mouseleave="hideActionTooltip"
          class="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Non-Git Repository Warning State -->
    <div v-if="!gitStore.isGitRepo" class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
      <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg">
        <UIcon name="i-lucide-git-branch" class="size-5" />
      </div>
      <div class="space-y-1">
        <p class="text-xs font-semibold text-slate-200">Bukan Git Repository</p>
        <p class="text-[10px] text-slate-400 leading-relaxed">
          Folder project yang aktif saat ini belum diinisialisasi sebagai Git repository.
        </p>
      </div>
    </div>

    <!-- Git Content (Commit Box + Changes Accordions) -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Commit Box Area -->
      <div class="p-2.5 bg-[#080d16]/70 border-b border-white/[0.06] space-y-2 flex-shrink-0">
        <!-- Commit Textarea with AI Magic Button -->
        <div
          class="relative bg-[#0b101b] border border-white/[0.08] focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 rounded-xl p-2 transition-all duration-200"
          :class="{ 'border-emerald-500/40 ring-1 ring-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.15)]': gitStore.isGeneratingMessage }"
        >
          <textarea
            v-model="gitStore.commitMessage"
            @keydown="handleCommitKeydown"
            placeholder="Pesan commit (Ctrl+Enter untuk Commit)..."
            rows="3"
            class="w-full bg-transparent border-none text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none p-0 leading-relaxed font-sans min-h-[50px] max-h-[140px] custom-scrollbar"
          ></textarea>

          <!-- AI Magic Commit Generator Button -->
          <div class="flex items-center justify-between pt-1.5 border-t border-white/[0.04]">
            <button
              @click="gitStore.generateCommitMessage()"
              :disabled="gitStore.isGeneratingMessage"
              @mouseenter="showActionTooltip('Buat pesan commit otomatis dari diff dengan AI', $event, 'Alt+G')"
              @mouseleave="hideActionTooltip"
              class="px-2.5 py-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-[10px] font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <UIcon
                name="i-lucide-sparkles"
                class="size-3 text-emerald-400 group-hover:scale-110 transition-transform"
                :class="{ 'animate-spin text-emerald-300': gitStore.isGeneratingMessage }"
              />
              <span class="tracking-wide">{{ gitStore.isGeneratingMessage ? 'Menganalisis diff...' : 'Generate with AI' }}</span>
              <span class="text-[9px] px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-400/80 font-mono hidden sm:inline-block">Alt+G</span>
            </button>

            <div class="flex items-center gap-1.5">
              <!-- Clear button if text exists -->
              <button
                v-if="gitStore.commitMessage.trim()"
                @click="gitStore.commitMessage = ''"
                @mouseenter="showActionTooltip('Hapus pesan commit', $event)"
                @mouseleave="hideActionTooltip"
                class="w-4 h-4 rounded flex items-center justify-center text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <UIcon name="i-lucide-x" class="size-2.5" />
              </button>
              <span class="text-[9px] font-mono text-slate-500" title="Tekan Ctrl+Enter untuk melakukan commit">Ctrl+↵</span>
            </div>
          </div>
        </div>

        <!-- Primary Commit Button -->
        <button
          @click="gitStore.commit()"
          :disabled="!gitStore.commitMessage.trim() || gitStore.isCommitting"
          class="w-full py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer active:scale-98"
        >
          <UIcon
            :name="gitStore.isCommitting ? 'i-lucide-loader-2' : 'i-lucide-check'"
            class="size-3.5"
            :class="{ 'animate-spin': gitStore.isCommitting }"
          />
          <span>{{ gitStore.isCommitting ? 'Melakukan commit...' : 'Commit' }}</span>
        </button>
      </div>

      <!-- Scrollable Changes Lists -->
      <div class="flex-1 overflow-y-auto p-2 space-y-2.5 text-[11px] custom-scrollbar">
        <!-- 1. STAGED CHANGES ACCORDION -->
        <div class="space-y-1">
          <!-- Accordion Header -->
          <div
            @click="isStagedExpanded = !isStagedExpanded"
            class="flex items-center justify-between px-1.5 py-1 rounded-lg hover:bg-white/[0.04] cursor-pointer text-slate-300 transition-colors group"
          >
            <div class="flex items-center gap-1.5">
              <UIcon
                :name="isStagedExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 text-slate-400"
              />
              <span class="font-bold text-[10px] uppercase tracking-wider text-emerald-400">Staged Changes</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                {{ gitStore.staged.length }}
              </span>
            </div>

            <!-- Unstage All Button -->
            <div v-if="gitStore.staged.length > 0" class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                @click.stop="gitStore.unstageAll()"
                @mouseenter="showActionTooltip('Unstage semua perubahan (-)', $event)"
                @mouseleave="hideActionTooltip"
                class="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                <UIcon name="i-lucide-minus" class="size-3" />
              </button>
            </div>
          </div>

          <!-- Staged Files List -->
          <div v-show="isStagedExpanded" class="space-y-0.5 pl-2">
            <template v-if="gitStore.staged.length > 0">
              <div
                v-for="file in gitStore.staged"
                :key="file.path"
                @click="gitStore.openFileDiff(file, true)"
                @mouseenter="handleFileMouseEnter(file, $event)"
                @mouseleave="handleFileMouseLeave"
                class="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] cursor-pointer group transition-all"
              >
                <!-- File Name & Dir -->
                <div class="flex items-center gap-1.5 min-w-0 pr-1">
                  <UIcon
                    :name="getNuxtFileIcon(file.path).icon"
                    :class="['size-3.5 flex-shrink-0', getNuxtFileIcon(file.path).colorClass]"
                  />
                  <span class="font-medium text-slate-200 truncate text-[11px]">{{ getFileName(file.path) }}</span>
                  <span v-if="getFileDir(file.path)" class="text-[9px] text-slate-500 font-mono truncate">
                    {{ getFileDir(file.path) }}
                  </span>
                </div>

                <!-- Status Badge & Hover Action Buttons -->
                <div class="flex items-center gap-1 flex-shrink-0">
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      @click.stop="gitStore.unstageFile(file.path)"
                      @mouseenter="showActionTooltip('Unstage file ini (-)', $event)"
                      @mouseleave="hideActionTooltip"
                      class="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                    >
                      <UIcon name="i-lucide-minus" class="size-3" />
                    </button>
                  </div>

                  <span
                    :class="[
                      'text-[9px] font-bold px-1.5 py-0.2 rounded border font-mono',
                      getStatusBadgeClass(file.status)
                    ]"
                  >
                    {{ getStatusLetter(file.status) }}
                  </span>
                </div>
              </div>
            </template>
            <div v-else class="text-[10px] text-slate-500 italic py-1 pl-2">
              Tidak ada perubahan yang di-stage
            </div>
          </div>
        </div>

        <!-- 2. UNSTAGED CHANGES & UNTRACKED ACCORDION -->
        <div class="space-y-1 pt-1 border-t border-white/[0.04]">
          <!-- Accordion Header -->
          <div
            @click="isUnstagedExpanded = !isUnstagedExpanded"
            class="flex items-center justify-between px-1.5 py-1 rounded-lg hover:bg-white/[0.04] cursor-pointer text-slate-300 transition-colors group"
          >
            <div class="flex items-center gap-1.5">
              <UIcon
                :name="isUnstagedExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3 text-slate-400"
              />
              <span class="font-bold text-[10px] uppercase tracking-wider text-amber-400">Changes</span>
              <span class="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                {{ gitStore.unstaged.length + gitStore.untracked.length }}
              </span>
            </div>

            <!-- Action Buttons: Discard All & Stage All -->
            <div v-if="gitStore.unstaged.length > 0 || gitStore.untracked.length > 0" class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                @click.stop="gitStore.discardAll()"
                @mouseenter="showActionTooltip('Batalkan semua perubahan (Discard)', $event)"
                @mouseleave="hideActionTooltip"
                class="w-5 h-5 rounded hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <UIcon name="i-lucide-undo-2" class="size-3" />
              </button>
              <button
                @click.stop="gitStore.stageAll()"
                @mouseenter="showActionTooltip('Stage semua perubahan (+)', $event)"
                @mouseleave="hideActionTooltip"
                class="w-5 h-5 rounded hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <UIcon name="i-lucide-plus" class="size-3" />
              </button>
            </div>
          </div>

          <!-- Unstaged & Untracked Files List -->
          <div v-show="isUnstagedExpanded" class="space-y-0.5 pl-2">
            <template v-if="gitStore.unstaged.length > 0 || gitStore.untracked.length > 0">
              <!-- Combined list of unstaged and untracked -->
              <div
                v-for="file in [...gitStore.unstaged, ...gitStore.untracked]"
                :key="file.path"
                @click="gitStore.openFileDiff(file, false)"
                @mouseenter="handleFileMouseEnter(file, $event)"
                @mouseleave="handleFileMouseLeave"
                class="flex items-center justify-between px-2 py-1 rounded-lg hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] cursor-pointer group transition-all"
              >
                <!-- File Name & Dir -->
                <div class="flex items-center gap-1.5 min-w-0 pr-1">
                  <UIcon
                    :name="getNuxtFileIcon(file.path).icon"
                    :class="['size-3.5 flex-shrink-0', getNuxtFileIcon(file.path).colorClass]"
                  />
                  <span class="font-medium text-slate-200 truncate text-[11px]">{{ getFileName(file.path) }}</span>
                  <span v-if="getFileDir(file.path)" class="text-[9px] text-slate-500 font-mono truncate">
                    {{ getFileDir(file.path) }}
                  </span>
                </div>

                <!-- Status Badge & Hover Action Buttons -->
                <div class="flex items-center gap-1 flex-shrink-0">
                  <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <!-- Discard File -->
                    <button
                      @click.stop="gitStore.discardFile(file)"
                      @mouseenter="showActionTooltip('Batalkan perubahan file ini (Discard)', $event)"
                      @mouseleave="hideActionTooltip"
                      class="w-5 h-5 rounded hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-400 cursor-pointer"
                    >
                      <UIcon name="i-lucide-undo-2" class="size-3" />
                    </button>
                    <!-- Stage File -->
                    <button
                      @click.stop="gitStore.stageFile(file.path)"
                      @mouseenter="showActionTooltip('Stage file ini (+)', $event)"
                      @mouseleave="hideActionTooltip"
                      class="w-5 h-5 rounded hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center text-slate-400 cursor-pointer"
                    >
                      <UIcon name="i-lucide-plus" class="size-3" />
                    </button>
                  </div>

                  <span
                    :class="[
                      'text-[9px] font-bold px-1.5 py-0.2 rounded border font-mono',
                      getStatusBadgeClass(file.status)
                    ]"
                  >
                    {{ getStatusLetter(file.status) }}
                  </span>
                </div>
              </div>
            </template>
            <div v-else class="text-[10px] text-slate-500 italic py-1 pl-2">
              Working tree bersih (tidak ada perubahan)
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Independent Git Diff Modal Viewer -->
    <GitDiffModal />

    <!-- Dark Glassmorphism Nuxt UI Style Tooltip for Source Control Files -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-x-1 scale-95"
        enter-to-class="opacity-100 translate-x-0 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-x-0 scale-100"
        leave-to-class="opacity-0 -translate-x-1 scale-95"
      >
        <div
          v-if="hoverTooltip && hoverTooltip.file"
          class="fixed z-[9999] pointer-events-none px-3.5 py-2.5 rounded-2xl bg-[#0b101b]/98 backdrop-blur-3xl border border-white/[0.14] shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex flex-col min-w-[280px] max-w-lg ring-1 ring-white/[0.08]"
          :style="{
            right: `${hoverTooltip.right}px`,
            top: `${hoverTooltip.top}px`
          }"
        >
          <!-- Header: File Name + Status Badge & Project Badge -->
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <UIcon
                :name="getNuxtFileIcon(hoverTooltip.file.path).icon"
                :class="[getNuxtFileIcon(hoverTooltip.file.path).colorClass, 'size-4 flex-shrink-0']"
              />
              <span class="text-xs font-bold text-white font-mono truncate">{{ getFileName(hoverTooltip.file.path) }}</span>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <!-- Git Status Tag -->
              <span
                :class="[
                  'text-[9.5px] font-bold px-2 py-0.5 rounded-md border font-mono uppercase tracking-wider',
                  getStatusBadgeClass(hoverTooltip.file.status)
                ]"
              >
                {{ getStatusLabel(hoverTooltip.file.status) }}
              </span>

              <!-- Project Name Badge -->
              <span
                v-if="getProjectName()"
                class="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 font-mono text-[9.5px] font-bold uppercase tracking-wider"
              >
                {{ getProjectName() }}
              </span>
            </div>
          </div>

          <!-- Full File Path -->
          <div class="text-[11px] text-slate-400 font-mono break-all leading-relaxed mt-1.5 select-text">
            {{ getFullFilePath(hoverTooltip.file.path) }}
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Dark Glassmorphism Action Tooltip for Header & Action Buttons -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="opacity-0 translate-y-1 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-1 scale-95"
      >
        <div
          v-if="actionTooltip"
          class="fixed z-[9999] pointer-events-none px-2.5 py-1.5 rounded-lg bg-[#090e17]/95 backdrop-blur-2xl border border-white/[0.14] shadow-[0_10px_25px_-5px_rgba(0,0,0,0.8)] flex items-center gap-2 ring-1 ring-white/[0.08]"
          :style="{
            right: `${actionTooltip.right}px`,
            top: `${actionTooltip.top}px`
          }"
        >
          <span class="text-[11px] font-medium text-slate-200 whitespace-nowrap">{{ actionTooltip.text }}</span>
          <span
            v-if="actionTooltip.shortcut"
            class="text-[9px] px-1 py-0.2 rounded bg-white/10 text-slate-300 font-mono"
          >
            {{ actionTooltip.shortcut }}
          </span>
        </div>
      </Transition>
    </Teleport>
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
</style>
