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

      <div class="flex items-center gap-1 flex-shrink-0">
        <!-- Branch Badge Pill -->
        <span
          v-if="gitStore.isGitRepo"
          class="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-400 font-mono truncate max-w-[100px]"
          :title="`Branch: ${gitStore.branch}`"
        >
          {{ gitStore.branch }}
        </span>

        <!-- Refresh Button -->
        <button
          @click="gitStore.refreshStatus()"
          :disabled="gitStore.isLoadingStatus"
          class="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
          title="Refresh Git Status"
        >
          <UIcon name="i-lucide-rotate-cw" class="size-3.5" :class="{ 'animate-spin': gitStore.isLoadingStatus }" />
        </button>

        <!-- Push Button -->
        <button
          @click="gitStore.push()"
          :disabled="gitStore.isPushing"
          class="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer disabled:opacity-40"
          title="Git Push (Upload ke Remote)"
        >
          <UIcon name="i-lucide-arrow-up" class="size-3.5" :class="{ 'animate-bounce': gitStore.isPushing }" />
        </button>

        <!-- Pull Button -->
        <button
          @click="gitStore.pull()"
          :disabled="gitStore.isPulling"
          class="w-6 h-6 rounded-md hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-sky-400 transition-colors cursor-pointer disabled:opacity-40"
          title="Git Pull (Download dari Remote)"
        >
          <UIcon name="i-lucide-arrow-down" class="size-3.5" :class="{ 'animate-bounce': gitStore.isPulling }" />
        </button>

        <!-- Close / Collapse Panel Button -->
        <button
          @click="workspaceStore.toggleSourceControlPanel()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
          title="Tutup Panel Source Control"
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
              class="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 active:bg-emerald-500/30 border border-emerald-500/25 hover:border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-[10px] font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed group"
              title="Buat pesan commit otomatis dari diff dengan AI (Alt+G)"
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
                class="w-4 h-4 rounded flex items-center justify-center text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                title="Hapus teks commit"
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
                class="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                title="Unstage All Changes (-)"
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
                      class="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
                      title="Unstage file ini"
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
                class="w-5 h-5 rounded hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-400 cursor-pointer"
                title="Discard All Changes (Batalkan semua perubahan)"
              >
                <UIcon name="i-lucide-undo-2" class="size-3" />
              </button>
              <button
                @click.stop="gitStore.stageAll()"
                class="w-5 h-5 rounded hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center text-slate-400 cursor-pointer"
                title="Stage All Changes (+)"
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
                      class="w-5 h-5 rounded hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center text-slate-400 cursor-pointer"
                      title="Batalkan perubahan file ini (Discard)"
                    >
                      <UIcon name="i-lucide-undo-2" class="size-3" />
                    </button>
                    <!-- Stage File -->
                    <button
                      @click.stop="gitStore.stageFile(file.path)"
                      class="w-5 h-5 rounded hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center text-slate-400 cursor-pointer"
                      title="Stage file ini (+)"
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
