<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useToast } from 'primevue/usetoast'
import { useWorkspaceStore } from './stores/workspaceStore'
import { useSettingsStore } from './stores/settingsStore'
import { useAgentStore } from './stores/agentStore'
import CommandPalette from './components/CommandPalette.vue'
import QuickOpenModal from './components/QuickOpenModal.vue'
import WindowSwitcherModal from './components/WindowSwitcherModal.vue'
import TabSwitcherModal from './components/TabSwitcherModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import MonacoEditor from './components/MonacoEditor.vue'
import FileExplorer from './components/FileExplorer.vue'
import AgentPanel from './components/AgentPanel.vue'
import TerminalPanel from './components/TerminalPanel.vue'

import { getNuxtFileIcon } from './utils/languageDetector'
import logoImg from './assets/logo.png'
import iconImg from './assets/icon.jpg'

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const toast = useToast()

// Global Keyboard Shortcuts (Ctrl+S for Save, Ctrl+O for Open Folder)
async function handleGlobalKeyboard(event: KeyboardEvent): Promise<void> {
  const isModifier = event.ctrlKey || event.metaKey

  if (isModifier && event.key.toLowerCase() === 's') {
    event.preventDefault()
    const saveResult = await workspaceStore.saveActiveFile()
    if (saveResult.success) {
      toast.add({
        severity: 'success',
        summary: 'Tersimpan',
        detail: saveResult.message,
        life: 2000
      })
    } else {
      toast.add({
        severity: 'error',
        summary: 'Gagal Menyimpan',
        detail: saveResult.message,
        life: 3000
      })
    }
  } else if (isModifier && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    handleMenuOpenFile()
  } else if (isModifier && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    handleMenuAddWorkspace()
  } else if (isModifier && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    workspaceStore.toggleCopilotPanel()
  } else if (isModifier && (event.key.toLowerCase() === 'e' || event.key.toLowerCase() === 'p')) {
    event.preventDefault()
    workspaceStore.toggleQuickOpen()
  } else if (isModifier && event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    workspaceStore.toggleWindowSwitcher()
  } else if (isModifier && (event.key === '`' || event.key === '~')) {
    event.preventDefault()
    workspaceStore.toggleBottomPanel()
  } else if (isModifier && event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    if (workspaceStore.tabList.length > 0) {
      workspaceStore.toggleTabSwitcher(true)
    }
  } else if (isModifier && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    event.stopPropagation()
    handleTagSelectionToChat()
  }
}

function handleTagSelectionToChat(): void {
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

const isWindowMaximized = ref(false)
let cleanupWindowStateListener: (() => void) | null = null

const activeHeaderMenu = ref<'file' | 'help' | null>(null)

function handleToggleBottomPanel(): void {
  workspaceStore.toggleBottomPanel()
}

function closeHeaderMenu(): void {
  activeHeaderMenu.value = null
}

function handleWindowClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (!target?.closest('.relative')) {
    activeHeaderMenu.value = null
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeyboard, true)
  window.addEventListener('click', handleWindowClick)
  if (window.makaryaAPI?.isWindowMaximized) {
    isWindowMaximized.value = await window.makaryaAPI.isWindowMaximized()
  }
  if (window.makaryaAPI?.onWindowStateChange) {
    cleanupWindowStateListener = window.makaryaAPI.onWindowStateChange((maximized) => {
      isWindowMaximized.value = maximized
    })
  }

  // Restore saved workspace roots, settings from SQLite, and fetch models from 9router on boot
  await Promise.all([
    workspaceStore.loadWorkspaceRootsFromStorage(),
    settingsStore.loadSettingsFromDb(),
    agentStore.loadModels()
  ])
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyboard, true)
  window.removeEventListener('click', handleWindowClick)
  cleanupWindowStateListener?.()
})

function handleMinimize(): void {
  window.makaryaAPI?.minimizeWindow?.()
}

async function handleMaximizeToggle(): Promise<void> {
  if (window.makaryaAPI?.maximizeWindow) {
    const state = await window.makaryaAPI.maximizeWindow()
    isWindowMaximized.value = state
  }
}

function handleClose(): void {
  window.makaryaAPI?.closeWindow?.()
}

async function handleMenuOpenFile(): Promise<void> {
  closeHeaderMenu()
  if (window.makaryaAPI) {
    const dialogResult = await window.makaryaAPI.openFolderDialog()
    if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
      await workspaceStore.setSingleWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
      toast.add({
        severity: 'info',
        summary: 'Folder Dibuka',
        detail: dialogResult.folderPath,
        life: 2500
      })
    }
  }
}

async function handleMenuAddWorkspace(): Promise<void> {
  closeHeaderMenu()
  if (window.makaryaAPI) {
    const dialogResult = await window.makaryaAPI.openFolderDialog()
    if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
      const added = await workspaceStore.addWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
      if (added) {
        toast.add({
          severity: 'success',
          summary: 'Project Ditambahkan',
          detail: dialogResult.folderPath,
          life: 2500
        })
      } else {
        toast.add({
          severity: 'warn',
          summary: 'Project Sudah Ada',
          detail: 'Folder project ini sudah terdapat di dalam daftar Anda.',
          life: 2500
        })
      }
    }
  }
}

async function handleMenuSaveFile(): Promise<void> {
  closeHeaderMenu()
  const saveResult = await workspaceStore.saveActiveFile()
  if (saveResult.success) {
    toast.add({
      severity: 'success',
      summary: 'Tersimpan',
      detail: saveResult.message,
      life: 2000
    })
  }
}

function handleMenuCloseTab(): void {
  closeHeaderMenu()
  if (workspaceStore.activeTabId) {
    workspaceStore.closeTab(workspaceStore.activeTabId)
  }
}

function handleMenuCommandPalette(): void {
  closeHeaderMenu()
  workspaceStore.toggleCommandPalette()
}

function handleMenuToggleCopilot(): void {
  closeHeaderMenu()
  workspaceStore.toggleCopilotPanel()
}
</script>

<template>
  <UApp>
    <div class="w-screen h-screen flex flex-col bg-[#090d14] text-slate-100 overflow-hidden font-sans select-none">
      <!-- Top Header & App Bar (Sleek Glassmorphic Shell with Window Dragging) -->
      <header
        @dblclick="handleMaximizeToggle"
        class="h-11 bg-[#0b101b]/95 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-3 flex-shrink-0 z-30 shadow-sm select-none"
        style="-webkit-app-region: drag;"
      >
        <!-- Left: Logo & Project Folder -->
        <div class="flex items-center gap-2.5" style="-webkit-app-region: no-drag;">
          <!-- Makarya Logo (Icon Only) -->
          <img :src="iconImg" alt="Makarya Logo" class="h-7 w-auto object-contain drop-shadow-md select-none mr-1" />

          <!-- File Menu Button & Popup -->
          <div class="relative flex items-center">
            <button
              @click="activeHeaderMenu = activeHeaderMenu === 'file' ? null : 'file'"
              class="h-6 px-3 rounded-full font-semibold font-mono tracking-wider text-[11px] border shadow-xs transition-all cursor-pointer flex items-center justify-center leading-none"
              :class="activeHeaderMenu === 'file'
                ? 'bg-[#42b883] text-[#090d14] border-[#42b883] font-bold'
                : 'bg-[#42b883]/15 text-[#42b883] border-[#42b883]/30 hover:bg-[#42b883]/25 hover:border-[#42b883]/50'"
            >
              File
            </button>

            <!-- File Dropdown -->
            <div
              v-if="activeHeaderMenu === 'file'"
              class="absolute left-0 top-full mt-2 w-56 bg-[#0c121d]/95 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-1.5 shadow-2xl z-50 text-[11px] space-y-0.5"
            >
              <button
                @click="handleMenuOpenFile"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder-open" class="size-3.5 text-[#42b883]" />
                  <span>Buka Folder...</span>
                </div>
                <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+O</span>
              </button>

              <button
                @click="handleMenuAddWorkspace"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder-plus" class="size-3.5 text-[#42b883]" />
                  <span>Tambah Folder Project...</span>
                </div>
                <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+Shift+A</span>
              </button>

              <div class="h-[1px] bg-white/[0.08] my-1"></div>

              <button
                v-if="workspaceStore.activeTab.filePath"
                @click="handleMenuSaveFile"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-save" class="size-3.5 text-amber-400" />
                  <span>Simpan Berkas</span>
                </div>
                <span class="text-[10px] text-slate-500 group-hover:text-amber-400 font-mono">Ctrl+S</span>
              </button>

              <button
                v-if="workspaceStore.activeTabId"
                @click="handleMenuCloseTab"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-x" class="size-3.5 text-rose-400" />
                  <span>Tutup Berkas</span>
                </div>
                <span class="text-[10px] text-slate-500 group-hover:text-rose-400 font-mono">Ctrl+W</span>
              </button>

              <div class="h-[1px] bg-white/[0.08] my-1"></div>

              <button
                @click="handleClose"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-rose-300 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-log-out" class="size-3.5 text-rose-400" />
                  <span>Keluar</span>
                </div>
              </button>
            </div>
          </div>

          <!-- Help Menu Button & Popup -->
          <div class="relative flex items-center">
            <button
              @click="activeHeaderMenu = activeHeaderMenu === 'help' ? null : 'help'"
              class="h-6 px-3 rounded-full font-semibold font-mono tracking-wider text-[11px] border shadow-xs transition-all cursor-pointer flex items-center justify-center leading-none"
              :class="activeHeaderMenu === 'help'
                ? 'bg-[#42b883] text-[#090d14] border-[#42b883] font-bold'
                : 'bg-[#42b883]/15 text-[#42b883] border-[#42b883]/30 hover:bg-[#42b883]/25 hover:border-[#42b883]/50'"
            >
              Help
            </button>

            <!-- Help Dropdown -->
            <div
              v-if="activeHeaderMenu === 'help'"
              class="absolute left-0 top-full mt-2 w-56 bg-[#0c121d]/95 backdrop-blur-xl border border-white/[0.1] rounded-2xl p-1.5 shadow-2xl z-50 text-[11px] space-y-0.5"
            >
              <button
                @click="handleMenuCommandPalette"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-command" class="size-3.5 text-[#42b883]" />
                  <span>Command Palette</span>
                </div>
                <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+K</span>
              </button>

              <button
                @click="handleMenuToggleCopilot"
                class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-sparkles" class="size-3.5 text-[#42b883]" />
                  <span>Toggle AI Agent</span>
                </div>
                <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+B</span>
              </button>

              <div class="h-[1px] bg-white/[0.08] my-1"></div>

              <div class="px-2.5 py-1.5 text-[10px] text-slate-400 space-y-0.5">
                <div class="font-semibold text-slate-200">Makarya IDE v0.1.0</div>
                <div>IDE-Class Desktop Shell with Monaco & AI</div>
              </div>
            </div>
          </div>

          <span
            v-if="workspaceStore.workspaceRoots.length > 0"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-white/[0.03] text-slate-300 border border-white/[0.08] max-w-sm truncate"
            :title="workspaceStore.workspaceRoots.map((r) => r.path).join('\n')"
          >
            <UIcon name="i-lucide-folder" class="size-3.5 text-[#42b883]" />
            <span v-if="workspaceStore.workspaceRoots.length === 1" class="truncate">{{ workspaceStore.workspaceRoots[0].path }}</span>
            <span v-else class="truncate">Project ({{ workspaceStore.workspaceRoots.length }}): {{ workspaceStore.workspaceRoots.map((r) => r.name).join(', ') }}</span>
          </span>
        </div>

        <!-- Center: Quick Open File Search Button (Ctrl+E) -->
        <div class="flex-1 flex justify-center max-w-md mx-4" style="-webkit-app-region: no-drag;">
          <button
            @click="workspaceStore.toggleQuickOpen"
            class="w-full max-w-sm h-8 px-3 rounded-full flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-[#42b883]/40 text-slate-400 hover:text-slate-200 transition-all shadow-xs cursor-pointer group"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-search" class="size-3.5 text-slate-400 group-hover:text-[#42b883] transition-colors" />
              <span class="text-xs">Cari berkas project...</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-full text-[10px] text-[#42b883] bg-[#42b883]/10 border border-[#42b883]/20 font-mono font-medium">Ctrl+E</span>
              <span
                @click.stop="workspaceStore.toggleCommandPalette"
                class="px-2 py-0.5 rounded-full text-[10px] text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] font-mono font-medium transition-colors"
                title="Buka Command Palette (Ctrl+K)"
              >
                Ctrl+K
              </span>
            </div>
          </button>
        </div>

        <!-- Right Header Actions & Window Controls -->
        <div class="flex items-center gap-2" style="-webkit-app-region: no-drag;">
          <button
            v-if="workspaceStore.activeTab.filePath"
            @click="workspaceStore.saveActiveFile"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer"
            :class="workspaceStore.activeTab.isDirty
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
              : 'bg-white/[0.03] text-slate-300 border border-white/[0.08] hover:bg-white/[0.08]'"
            title="Simpan File (Ctrl+S)"
          >
            <UIcon name="i-lucide-save" class="size-3.5" :class="workspaceStore.activeTab.isDirty ? 'text-amber-400' : 'text-slate-400'" />
            <span>Simpan</span>
          </button>

          <!-- Settings Modal Trigger (Gear Button - Gambar 1 Box) -->
          <button
            @click="settingsStore.openSettings('appearance')"
            class="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-all cursor-pointer bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-[#42b883]/40 text-slate-400 hover:text-[#42b883]"
            title="Pengaturan Editor & Aplikasi (Settings)"
          >
            <UIcon name="i-lucide-settings" class="size-3.5" />
          </button>

          <!-- Layout Panels Toggle Group (Gambar 2 Style) -->
          <div class="flex items-center gap-0.5 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08]">
            <!-- 1. Toggle Sidebar Kiri -->
            <button
              @click="workspaceStore.toggleSidebar"
              class="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-all cursor-pointer"
              :class="workspaceStore.isSidebarOpen
                ? 'bg-white/[0.1] text-slate-100 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'"
              title="Toggle Sidebar Kiri"
            >
              <svg viewBox="0 0 16 16" fill="none" class="size-3.5" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2" />
                <path v-if="workspaceStore.isSidebarOpen" d="M2 3.5C2 2.67157 2.67157 2 3.5 2H6V14H3.5C2.67157 14 2 13.3284 2 12.5V3.5Z" fill="currentColor" />
                <line v-else x1="6" y1="2" x2="6" y2="14" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>

            <!-- 2. Toggle Panel Bawah -->
            <button
              @click="handleToggleBottomPanel"
              class="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-all cursor-pointer"
              :class="workspaceStore.isBottomPanelOpen
                ? 'bg-white/[0.1] text-slate-100 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'"
              title="Toggle Panel Terminal Bawah (Ctrl+`)"
            >
              <svg viewBox="0 0 16 16" fill="none" class="size-3.5" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2" />
                <path v-if="workspaceStore.isBottomPanelOpen" d="M2 10H14V12.5C14 13.3284 13.3284 14 12.5 14H3.5C2.67157 14 2 13.3284 2 12.5V10Z" fill="currentColor" />
                <line v-else x1="2" y1="10" x2="14" y2="10" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>

            <!-- 3. Toggle Panel AI Agent Kanan -->
            <button
              @click="workspaceStore.toggleCopilotPanel"
              class="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-all cursor-pointer"
              :class="workspaceStore.isCopilotPanelOpen
                ? 'bg-white/[0.12] text-slate-100 shadow-xs border border-white/[0.08]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'"
              title="Toggle Panel AI Agent (Ctrl+B)"
            >
              <svg viewBox="0 0 16 16" fill="none" class="size-3.5" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2" />
                <path v-if="workspaceStore.isCopilotPanelOpen" d="M10 2H12.5C13.3284 2 14 2.67157 14 3.5V12.5C14 13.3284 13.3284 14 12.5 14H10V2Z" fill="currentColor" />
                <line v-else x1="10" y1="2" x2="10" y2="14" stroke="currentColor" stroke-width="1.2" />
              </svg>
            </button>
          </div>

          <!-- Divider -->
          <div class="w-[1px] h-4 bg-white/[0.1] mx-0.5"></div>

          <!-- Windows Control Buttons (Minimize, Maximize/Restore, Close) -->
          <div class="flex items-center gap-0.5">
            <button
              @click="handleMinimize"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors cursor-pointer"
              title="Minimize"
            >
              <UIcon name="i-lucide-minus" class="size-3.5" />
            </button>

            <button
              @click="handleMaximizeToggle"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors cursor-pointer"
              :title="isWindowMaximized ? 'Restore' : 'Maximize'"
            >
              <UIcon :name="isWindowMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="size-3.5" />
            </button>

            <button
              @click="handleClose"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500 active:bg-rose-600 transition-colors cursor-pointer"
              title="Tutup"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>
      </header>

    <!-- Main Workspace Area (Floating Rounded Panels) -->
    <div class="flex-1 flex overflow-hidden p-2 pt-1.5 gap-2 bg-[#080c13]">
      <!-- Left Activity Bar (Rounded Modern Strip) -->
      <nav class="w-11 bg-[#0b101b]/95 backdrop-blur-md rounded-2xl border border-white/[0.08] flex flex-col items-center py-2.5 space-y-2 flex-shrink-0 z-20 shadow-sm">
        <!-- File Explorer Tab Button -->
        <button
          @click="
            if (workspaceStore.isSidebarOpen && workspaceStore.activeSidebarTab === 'explorer') {
              workspaceStore.isSidebarOpen = false;
            } else {
              workspaceStore.activeSidebarTab = 'explorer';
              workspaceStore.isSidebarOpen = true;
            }
          "
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative"
          :class="workspaceStore.isSidebarOpen && workspaceStore.activeSidebarTab === 'explorer'
            ? 'bg-[#42b883]/15 text-[#42b883] border border-[#42b883]/30 shadow-xs shadow-[#42b883]/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'"
          title="File Explorer (Pohon Berkas)"
        >
          <UIcon name="i-lucide-folder" class="size-4" />
        </button>

        <!-- Command Palette / Action Trigger Button -->
        <button
          @click="workspaceStore.toggleCommandPalette"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all duration-200 cursor-pointer"
          title="Pencarian & Perintah (Ctrl+K)"
        >
          <UIcon name="i-lucide-search" class="size-4" />
        </button>

        <!-- Quick Open File Search Button -->
        <button
          @click="workspaceStore.toggleQuickOpen"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all duration-200 cursor-pointer"
          title="Pencarian Berkas Project (Ctrl+E)"
        >
          <UIcon name="i-lucide-file-search" class="size-4" />
        </button>

        <!-- Task View & Multi-Window Hub Button (Ctrl+Shift+N) -->
        <button
          @click="workspaceStore.toggleWindowSwitcher"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative"
          :class="workspaceStore.isWindowSwitcherVisible
            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 shadow-xs shadow-indigo-500/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'"
          title="Task View & Multi-Window Hub (Ctrl+Shift+N)"
        >
          <UIcon name="i-lucide-layout-grid" class="size-4" />
        </button>

        <div class="flex-1"></div>

        <!-- Sidebar Collapse / Expand Toggle Button -->
        <button
          @click="workspaceStore.toggleSidebar"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all duration-200 cursor-pointer"
          :title="workspaceStore.isSidebarOpen ? 'Tutup Sidebar' : 'Buka Sidebar'"
        >
          <UIcon :name="workspaceStore.isSidebarOpen ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'" class="size-4" />
        </button>
      </nav>

      <!-- Sidebar (File Explorer) -->
      <FileExplorer v-show="workspaceStore.isSidebarOpen" />

      <!-- Center Code Editor & Tabs Area (Rounded Floating Panel) -->
      <main class="flex-1 flex flex-col overflow-hidden bg-[#090d14] rounded-2xl border border-white/[0.08] shadow-sm">
        <!-- Tab Bar (Multi-line wrap, no horizontal scroll) -->
        <div class="min-h-9 py-1 px-1.5 bg-[#0b101b]/95 border-b border-white/[0.06] flex flex-wrap items-center gap-1.5 flex-shrink-0 max-h-32 overflow-y-auto">
          <div
            v-for="tab in workspaceStore.tabList"
            :key="tab.id"
            @click="workspaceStore.setActiveTab(tab.id)"
            :class="[
              'h-7 px-3 flex items-center gap-2 text-xs rounded-xl cursor-pointer select-none group relative',
              workspaceStore.activeTabId === tab.id
                ? 'bg-[#131d2e] text-[#42b883] font-medium border border-[#42b883]/30 shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
            ]"
          >
            <UIcon
              :name="getNuxtFileIcon(tab.title, false).icon"
              :class="[getNuxtFileIcon(tab.title, false).colorClass, 'size-3.5 flex-shrink-0']"
            />
            <span class="truncate max-w-[160px] text-[11px]">{{ tab.title }}</span>
            <span
              v-if="tab.isDirty"
              class="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50 ml-0.5"
              title="Perubahan belum disimpan (Ctrl+S)"
            ></span>
            <button
              @click.stop="workspaceStore.closeTab(tab.id)"
              class="w-4 h-4 rounded-md flex items-center justify-center ml-1 cursor-pointer flex-shrink-0"
              :class="workspaceStore.activeTabId === tab.id
                ? 'text-slate-300 hover:text-rose-400 hover:bg-rose-500/20'
                : 'text-slate-400/80 hover:text-rose-400 hover:bg-white/[0.08]'"
              title="Tutup tab"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </div>
        </div>

        <!-- Tab Body Container (Monaco Editor or Welcome Screen) -->
        <div class="flex-1 overflow-hidden relative">
          <!-- Active Monaco Editor for Current File -->
          <div v-if="workspaceStore.activeTab.tabType === 'editor'" class="w-full h-full">
            <MonacoEditor
              :key="workspaceStore.activeTab.id"
              :tabId="workspaceStore.activeTab.id"
              :modelValue="workspaceStore.activeTab.content"
              :language="workspaceStore.activeTab.language"
              :filePath="workspaceStore.activeTab.filePath"
              @update:modelValue="(val) => workspaceStore.updateTabContent(workspaceStore.activeTab.id, val)"
            />
          </div>

          <!-- Welcome Screen if no file is open (Premium Hero Aura) -->
          <div
            v-else
            class="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none space-y-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#42b883]/12 via-[#0b101b] to-[#090d14]"
          >
            <div class="w-36 h-28 flex items-center justify-center p-2.5 rounded-3xl bg-[#0c121d] border border-[#42b883]/35 shadow-2xl shadow-[#42b883]/20 backdrop-blur-md">
              <img :src="logoImg" alt="Makarya Logo" class="w-full h-full object-contain drop-shadow-xl rounded-2xl" />
            </div>
            <div class="space-y-1.5">
              <h1 class="text-2xl font-bold vue-gradient-text tracking-wide">Makarya Code Editor</h1>
              <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Editor kode modern terintegrasi Monaco Editor dan agen kecerdasan buatan berbasis Nuxt UI v4 & Vue.js.
              </p>
            </div>
            <div class="flex items-center gap-3 pt-1">
              <button
                @click="workspaceStore.toggleCommandPalette"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-lg shadow-[#42b883]/25 transition-all cursor-pointer active:scale-95 group"
              >
                <UIcon name="i-lucide-command" class="size-4" />
                <span>Cari Perintah (Ctrl+K)</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Integrated Terminal Panel (Slide from bottom) -->
        <TerminalPanel v-show="workspaceStore.isBottomPanelOpen" />
      </main>

      <!-- Right Copilot AI Panel -->
      <AgentPanel v-show="workspaceStore.isCopilotPanelOpen" />
    </div>

    <!-- Bottom Status Bar -->
    <footer class="h-6 bg-[#090d15] border-t border-white/[0.06] flex items-center justify-between px-3 text-[11px] text-slate-400 font-mono flex-shrink-0">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 text-[#42b883] select-none">
          <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] vue-pulse-dot flex-shrink-0 -translate-y-[0.5px]"></span>
          <span class="font-medium text-[11px] leading-none">Editor Siap</span>
        </div>
        <span v-if="workspaceStore.activeTab.filePath" class="truncate max-w-md text-slate-500 text-[10px]">
          {{ workspaceStore.activeTab.filePath }}
        </span>
      </div>

      <div class="flex items-center gap-3 text-[11px]">
        <span>Bahasa: <b class="text-slate-300 font-semibold">{{ workspaceStore.activeTab.language.toUpperCase() }}</b></span>
        <span>UTF-8</span>
        <span :class="workspaceStore.activeTab.isDirty ? 'text-amber-400 font-semibold' : 'text-slate-500'">
          {{ workspaceStore.activeTab.isDirty ? '● Unsaved' : 'Saved' }}
        </span>
      </div>
    </footer>

    <!-- Global Modals & Services -->
    <TabSwitcherModal />
    <WindowSwitcherModal />
    <QuickOpenModal />
    <CommandPalette />
    <SettingsModal />
    <Toast position="bottom-right" />
    <ConfirmDialog />
  </div>
  </UApp>
</template>
