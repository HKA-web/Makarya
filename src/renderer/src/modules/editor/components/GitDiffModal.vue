<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { useGitStore } from '@renderer/stores/gitStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'

const gitStore = useGitStore()
const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

const editorContainerRef = ref<HTMLDivElement | null>(null)
let diffEditorInstance: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: monaco.editor.ITextModel | null = null
let modifiedModel: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null

const isSideBySide = ref(true)

const currentFile = computed(() => gitStore.diffModal.file)
const fileName = computed(() => {
  if (!currentFile.value) return ''
  return currentFile.value.path.split(/[/\\]/).pop() || currentFile.value.path
})
const fileDir = computed(() => {
  if (!currentFile.value) return ''
  const parts = currentFile.value.path.split(/[/\\]/)
  parts.pop()
  return parts.join('/')
})

const fileIconInfo = computed(() => getNuxtFileIcon(fileName.value))

function getStatusBadgeClass(status?: string): string {
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

function cleanupDiffEditor(): void {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (diffEditorInstance) {
    try {
      diffEditorInstance.setModel(null)
      diffEditorInstance.dispose()
    } catch {}
    diffEditorInstance = null
  }
  if (originalModel) {
    try {
      originalModel.dispose()
    } catch {}
    originalModel = null
  }
  if (modifiedModel) {
    try {
      modifiedModel.dispose()
    } catch {}
    modifiedModel = null
  }

  // Restore active user theme
  if (settingsStore.editor?.theme) {
    monaco.editor.setTheme(settingsStore.editor.theme)
  }
}

function initOrUpdateDiffEditor(): void {
  if (!editorContainerRef.value || !gitStore.diffModal.isOpen) return

  // If container DOM element changed (due to v-if remount), dispose old instance
  if (diffEditorInstance && diffEditorInstance.getContainerDomNode() !== editorContainerRef.value) {
    cleanupDiffEditor()
  }

  const lang = gitStore.diffModal.language || 'plaintext'
  const oldOriginal = originalModel
  const oldModified = modifiedModel

  // 1. Create new models
  const newOriginal = monaco.editor.createModel(gitStore.diffModal.originalContent || '', lang)
  const newModified = monaco.editor.createModel(gitStore.diffModal.newContent || '', lang)

  const activeTheme = settingsStore.editor?.theme || 'makarya-dark'
  const activeFontSize = settingsStore.editor?.fontSize || 12
  const activeFontFamily = settingsStore.editor?.fontFamily || "'JetBrains Mono', 'Fira Code', Consolas, monospace"

  // 2. Initialize or update DiffEditor instance
  if (!diffEditorInstance) {
    diffEditorInstance = monaco.editor.createDiffEditor(editorContainerRef.value, {
      readOnly: true,
      automaticLayout: true,
      renderSideBySide: isSideBySide.value,
      theme: activeTheme,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      fontSize: activeFontSize,
      fontFamily: activeFontFamily,
      lineNumbers: 'on',
      folding: true,
      renderIndicators: true,
      originalEditable: false,
      diffCodeLens: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8
      }
    })

    if (!resizeObserver && editorContainerRef.value) {
      resizeObserver = new ResizeObserver(() => {
        diffEditorInstance?.layout()
      })
      resizeObserver.observe(editorContainerRef.value)
    }
  } else {
    diffEditorInstance.updateOptions({
      renderSideBySide: isSideBySide.value,
      fontSize: activeFontSize,
      fontFamily: activeFontFamily
    })
    monaco.editor.setTheme(activeTheme)
  }

  // 3. Attach new models to diff editor (detaches old models safely inside Monaco)
  diffEditorInstance.setModel({
    original: newOriginal,
    modified: newModified
  })

  // 4. Safely dispose previous models now that they are detached
  if (oldOriginal && oldOriginal !== newOriginal) {
    try {
      oldOriginal.dispose()
    } catch {}
  }
  if (oldModified && oldModified !== newModified) {
    try {
      oldModified.dispose()
    } catch {}
  }

  originalModel = newOriginal
  modifiedModel = newModified

  nextTick(() => {
    diffEditorInstance?.layout()
  })
  setTimeout(() => {
    diffEditorInstance?.layout()
  }, 50)
  setTimeout(() => {
    diffEditorInstance?.layout()
  }, 150)
}

function toggleSideBySide(sideBySide: boolean): void {
  isSideBySide.value = sideBySide
  if (diffEditorInstance) {
    diffEditorInstance.updateOptions({
      renderSideBySide: sideBySide
    })
    nextTick(() => {
      diffEditorInstance?.layout()
    })
  }
}

async function handleToggleStage(): Promise<void> {
  if (!currentFile.value) return
  if (gitStore.diffModal.isStaged) {
    await gitStore.unstageFile(currentFile.value.path)
    gitStore.diffModal.isStaged = false
  } else {
    await gitStore.stageFile(currentFile.value.path)
    gitStore.diffModal.isStaged = true
  }
  await gitStore.refreshStatus()
}

async function handleDiscard(): Promise<void> {
  if (!currentFile.value) return
  if (confirm(`Yakin ingin membatalkan semua perubahan pada file "${fileName.value}"? Perubahan lokal akan hilang permanen.`)) {
    await gitStore.discardFile(currentFile.value)
    gitStore.closeDiffModal()
  }
}

async function handleOpenInEditor(): Promise<void> {
  if (!currentFile.value || !gitStore.diffModal.fullPath) return
  const fullPath = gitStore.diffModal.fullPath
  const name = fileName.value
  gitStore.closeDiffModal()
  await workspaceStore.openFile(fullPath, name)
}

function handleKeydown(e: KeyboardEvent): void {
  if (!gitStore.diffModal.isOpen) return

  if (e.key === 'Escape') {
    e.preventDefault()
    gitStore.closeDiffModal()
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault()
    gitStore.nextDiffFile()
  } else if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    gitStore.prevDiffFile()
  } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    handleToggleStage()
  } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
    e.preventDefault()
    handleOpenInEditor()
  }
}

watch(
  () => [
    gitStore.diffModal.isOpen,
    gitStore.diffModal.file?.path,
    gitStore.diffModal.isStaged,
    gitStore.diffModal.originalContent,
    gitStore.diffModal.newContent
  ],
  ([isOpen]) => {
    if (isOpen) {
      nextTick(() => {
        initOrUpdateDiffEditor()
      })
    } else {
      cleanupDiffEditor()
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  if (gitStore.diffModal.isOpen) {
    nextTick(() => {
      initOrUpdateDiffEditor()
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  cleanupDiffEditor()
})
</script>

<template>
  <!-- Modal Overlay -->
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0 scale-98"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-100 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-98"
  >
    <div
      v-if="gitStore.diffModal.isOpen && currentFile"
      class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 select-none"
      @click.self="gitStore.closeDiffModal()"
    >
      <div
        class="w-full max-w-6xl h-[90vh] bg-[#090d14] border border-white/[0.1] rounded-2xl flex flex-col shadow-2xl overflow-hidden relative text-slate-100 font-sans"
      >
        <!-- Modal Top Bar -->
        <div class="h-12 px-4 border-b border-white/[0.08] bg-[#0c121e]/90 backdrop-blur-md flex items-center justify-between flex-shrink-0">
          <!-- Left File Info -->
          <div class="flex items-center gap-2.5 min-w-0">
            <UIcon
              :name="fileIconInfo.icon"
              :class="['size-4.5 flex-shrink-0', fileIconInfo.colorClass]"
            />
            <div class="flex items-baseline gap-2 min-w-0">
              <span class="text-sm font-semibold text-white truncate">{{ fileName }}</span>
              <span v-if="fileDir" class="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">
                {{ fileDir }}
              </span>
            </div>

            <!-- Status Badge -->
            <span
              class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border font-mono"
              :class="getStatusBadgeClass(currentFile.status)"
            >
              {{ currentFile.status }}
            </span>
          </div>

          <!-- Right Action Controls -->
          <div class="flex items-center gap-2 flex-shrink-0">
            <!-- Diff Mode Switcher (Split vs Unified) -->
            <div class="flex items-center p-0.5 rounded-lg bg-black/40 border border-white/[0.08]">
              <button
                @click="toggleSideBySide(true)"
                class="px-2 py-1 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                :class="isSideBySide ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
                title="Tampilan Split (Side by Side)"
              >
                <UIcon name="i-lucide-columns-2" class="size-3" />
                <span>Split</span>
              </button>
              <button
                @click="toggleSideBySide(false)"
                class="px-2 py-1 rounded-md text-[10px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                :class="!isSideBySide ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
                title="Tampilan Unified (Inline Diff)"
              >
                <UIcon name="i-lucide-rows-2" class="size-3" />
                <span>Unified</span>
              </button>
            </div>

            <div class="h-4 w-[1px] bg-white/10 mx-1"></div>

            <!-- Stage / Unstage Button -->
            <button
              @click="handleToggleStage"
              class="px-2.5 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              :class="gitStore.diffModal.isStaged
                ? 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-300'"
              :title="gitStore.diffModal.isStaged ? 'Batalkan Stage file ini (Alt+S)' : 'Stage file ini untuk commit (Alt+S)'"
            >
              <UIcon :name="gitStore.diffModal.isStaged ? 'i-lucide-minus' : 'i-lucide-plus'" class="size-3" />
              <span>{{ gitStore.diffModal.isStaged ? 'Unstage' : 'Stage File' }}</span>
            </button>

            <!-- Discard Changes (if unstaged) -->
            <button
              v-if="!gitStore.diffModal.isStaged && currentFile.status !== 'untracked'"
              @click="handleDiscard"
              class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              title="Batalkan semua perubahan file ini (Revert)"
            >
              <UIcon name="i-lucide-undo-2" class="size-3" />
              <span>Discard</span>
            </button>

            <!-- Open in Standard Editor Tab -->
            <button
              @click="handleOpenInEditor"
              class="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer"
              title="Buka file ini secara normal di editor tab untuk mengedit kode (Alt+E)"
            >
              <UIcon name="i-lucide-external-link" class="size-3 text-slate-400" />
              <span>Buka di Editor</span>
            </button>

            <!-- Close Modal -->
            <button
              @click="gitStore.closeDiffModal()"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-1"
              title="Tutup Diff Viewer (Esc)"
            >
              <UIcon name="i-lucide-x" class="size-4" />
            </button>
          </div>
        </div>

        <!-- Monaco Diff Editor Container -->
        <div class="flex-1 w-full h-full relative overflow-hidden bg-[#090d14]">
          <div ref="editorContainerRef" class="w-full h-full min-h-[300px]"></div>
        </div>

        <!-- Modal Bottom Footer Navigation -->
        <div class="h-10 px-4 border-t border-white/[0.08] bg-[#0c121e]/90 flex items-center justify-between text-[11px] flex-shrink-0">
          <div class="flex items-center gap-3 text-slate-400">
            <span v-if="gitStore.allChangedFiles.length > 0" class="font-medium text-slate-300">
              File <span class="text-emerald-400 font-bold">{{ gitStore.currentDiffIndex + 1 }}</span> dari {{ gitStore.allChangedFiles.length }} perubahan
            </span>
            <span class="text-slate-600">•</span>
            <span class="text-slate-500 font-mono text-[10px]">Original (Kiri) ➔ Modified (Kanan)</span>
          </div>

          <!-- File Pagination Controls -->
          <div class="flex items-center gap-2">
            <button
              @click="gitStore.prevDiffFile()"
              :disabled="gitStore.allChangedFiles.length <= 1"
              class="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="File Sebelumnya (Alt+←)"
            >
              <UIcon name="i-lucide-chevron-left" class="size-3.5" />
              <span>Sebelumnya</span>
            </button>
            <button
              @click="gitStore.nextDiffFile()"
              :disabled="gitStore.allChangedFiles.length <= 1"
              class="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="File Berikutnya (Alt+→)"
            >
              <span>Berikutnya</span>
              <UIcon name="i-lucide-chevron-right" class="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
