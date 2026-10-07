<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { usePluginStore } from '@renderer/stores/pluginStore'
import MonacoEditor from './MonacoEditor.vue'
import FileExplorer from './FileExplorer.vue'
import AgentPanel from './AgentPanel.vue'
import OpenCodePanel from './OpenCodePanel.vue'
import ClaudePanel from './ClaudePanel.vue'
import TerminalPanel from './TerminalPanel.vue'
import CommandPalette from './CommandPalette.vue'
import QuickOpenModal from './QuickOpenModal.vue'
import WindowSwitcherModal from './WindowSwitcherModal.vue'
import TabSwitcherModal from './TabSwitcherModal.vue'
import AboutModal from './AboutModal.vue'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'
import logoImg from '@renderer/assets/logo.png'
import openCodeLogo from '@renderer/assets/opencode-logo.png'
import claudeLogo from '@renderer/assets/claude-logo.svg'

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()
const pluginStore = usePluginStore()

const activeHeaderMenu = ref<'file' | 'help' | null>(null)

function closeHeaderMenu(): void {
  activeHeaderMenu.value = null
}

function handleWindowClick(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (!target.closest('.relative')) {
    activeHeaderMenu.value = null
  }
}

async function handleMenuOpenFile(): Promise<void> {
  closeHeaderMenu()
  if (window.makaryaAPI) {
    const dialogResult = await window.makaryaAPI.openFolderDialog()
    if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
      await workspaceStore.setSingleWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
    }
  }
}

async function handleMenuAddWorkspace(): Promise<void> {
  closeHeaderMenu()
  if (window.makaryaAPI) {
    const dialogResult = await window.makaryaAPI.openFolderDialog()
    if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
      await workspaceStore.addWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
    }
  }
}

async function handleMenuSaveFile(): Promise<void> {
  closeHeaderMenu()
  await workspaceStore.saveActiveFile()
}

function handleMenuSettings(): void {
  closeHeaderMenu()
  settingsStore.openSettings()
}

function handleMenuCommandPalette(): void {
  closeHeaderMenu()
  workspaceStore.toggleCommandPalette()
}

function handleMenuAbout(): void {
  closeHeaderMenu()
  workspaceStore.openAboutModal()
}

function handleTabBarWheel(e: WheelEvent): void {
  const el = e.currentTarget as HTMLElement
  if (el) {
    el.scrollLeft += e.deltaY
  }
}

function handleCloseOtherTabs(): void {
  if (typeof workspaceStore.closeOtherTabs === 'function') {
    workspaceStore.closeOtherTabs(workspaceStore.activeTabId)
  } else {
    workspaceStore.tabList = workspaceStore.tabList.filter((t) => t.id === workspaceStore.activeTabId)
  }
}

function handleCloseAllTabs(): void {
  if (typeof workspaceStore.closeAllTabs === 'function') {
    workspaceStore.closeAllTabs()
  } else {
    workspaceStore.tabList = [
      {
        id: 'tab-welcome',
        title: 'Selamat Datang',
        icon: 'pi pi-home',
        tabType: 'welcome',
        content: '',
        savedContent: '',
        isDirty: false,
        language: 'markdown'
      }
    ]
    workspaceStore.activeTabId = 'tab-welcome'
  }
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
  if (typeof workspaceStore.deduplicateTabs === 'function') {
    workspaceStore.deduplicateTabs()
  } else if (Array.isArray(workspaceStore.tabList)) {
    const seen = new Set<string>()
    workspaceStore.tabList = workspaceStore.tabList.filter((tab) => {
      if (!tab.filePath) return true
      const norm = tab.filePath.replace(/\\/g, '/').toLowerCase()
      if (seen.has(norm)) return false
      seen.add(norm)
      return true
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('click', handleWindowClick)
})
</script>

<template>
  <div class="w-full h-full flex flex-col overflow-hidden bg-[#080c13] select-none">
    <!-- Editor Top Bar: File/Help Menus, Folder Breadcrumb, Search (Ctrl+E/Ctrl+K), Layout Toggles -->
    <div class="h-10 px-3 bg-[#0b101b] border-b border-white/[0.06] flex items-center justify-between flex-shrink-0 gap-3">
      <!-- Left: File/Help Menus, Workspace Root Badge -->
      <div class="flex items-center gap-2">
        <!-- File Menu -->
        <div class="relative flex items-center">
          <button
            @click.stop="activeHeaderMenu = activeHeaderMenu === 'file' ? null : 'file'"
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
                <span>Buka Folder Project...</span>
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
              @click="handleMenuSaveFile"
              :disabled="!workspaceStore.activeTab.filePath"
              class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-transparent"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-save" class="size-3.5 text-[#42b883]" />
                <span>Simpan Berkas</span>
              </div>
              <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+S</span>
            </button>

            <div class="h-[1px] bg-white/[0.08] my-1"></div>

            <button
              @click="handleMenuSettings"
              class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-settings" class="size-3.5 text-[#42b883]" />
                <span>Pengaturan...</span>
              </div>
              <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+,</span>
            </button>
          </div>
        </div>

        <!-- Help Menu -->
        <div class="relative flex items-center">
          <button
            @click.stop="activeHeaderMenu = activeHeaderMenu === 'help' ? null : 'help'"
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
              @click="closeHeaderMenu(); workspaceStore.toggleTabSwitcher(true)"
              class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-arrow-left-right" class="size-3.5 text-[#42b883]" />
                <span>Pindah Tab Aktif</span>
              </div>
              <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+Tab</span>
            </button>

            <button
              @click="closeHeaderMenu(); pluginStore.isPluginManagerOpen = true"
              class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-puzzle" class="size-3.5 text-[#42b883]" />
                <span>Ekstensi & Plugin...</span>
              </div>
              <span class="text-[10px] text-slate-500 group-hover:text-[#42b883] font-mono">Ctrl+Shift+X</span>
            </button>

            <div class="h-[1px] bg-white/[0.08] my-1"></div>

            <button
              @click="handleMenuAbout"
              class="w-full px-2.5 py-1.5 rounded-xl flex items-center justify-between text-slate-300 hover:text-white hover:bg-[#42b883]/15 border border-transparent hover:border-[#42b883]/30 cursor-pointer text-left group transition-all"
            >
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-info" class="size-3.5 text-[#42b883]" />
                <span>About Makarya</span>
              </div>
            </button>
          </div>
        </div>

      </div>

      <!-- Center: Quick Search Trigger (Ctrl+E / Ctrl+K) -->
      <div class="flex-1 max-w-sm flex items-center justify-center">
        <button
          @click="workspaceStore.toggleQuickOpen"
          class="w-full h-7 px-3 rounded-full flex items-center justify-between bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-[#42b883]/40 text-slate-400 hover:text-slate-200 transition-all shadow-xs cursor-pointer group"
        >
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-search" class="size-3 text-slate-400 group-hover:text-[#42b883] transition-colors" />
            <span class="text-xs">Cari berkas project...</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="px-1.5 py-0.2 rounded-full text-[9px] text-[#42b883] bg-[#42b883]/10 border border-[#42b883]/20 font-mono font-medium">Ctrl+E</span>
            <span
              @click.stop="workspaceStore.toggleCommandPalette"
              class="px-1.5 py-0.2 rounded-full text-[9px] text-slate-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] font-mono font-medium transition-colors"
              title="Buka Command Palette (Ctrl+K)"
            >
              Ctrl+K
            </span>
          </div>
        </button>
      </div>

      <!-- Right: 3 Layout Panels Toggle Group (Identik dengan Header Editor Gambar 2) -->
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-0.5 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.08]">
          <!-- 1. Toggle Sidebar Kiri -->
          <button
            @click="workspaceStore.toggleSidebar"
            class="w-6.5 h-6.5 rounded-md flex items-center justify-center transition-all cursor-pointer"
            :class="workspaceStore.isSidebarOpen
              ? 'bg-white/[0.1] text-slate-100 shadow-xs'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'"
            title="Toggle Sidebar Kiri (Pohon Berkas)"
          >
            <svg viewBox="0 0 16 16" fill="none" class="size-3.5" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.2" />
              <path v-if="workspaceStore.isSidebarOpen" d="M2 3.5C2 2.67157 2.67157 2 3.5 2H6V14H3.5C2.67157 14 2 13.3284 2 12.5V3.5Z" fill="currentColor" />
              <line v-else x1="6" y1="2" x2="6" y2="14" stroke="currentColor" stroke-width="1.2" />
            </svg>
          </button>

          <!-- 2. Toggle Panel Terminal Bawah -->
          <button
            @click="workspaceStore.toggleBottomPanel"
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
      </div>
    </div>

    <!-- Main Workspace Area: Left Activity Bar + File Explorer + Monaco Editor + Right AI Agent -->
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

        <!-- Quick Open File Search Button (Ctrl+E) -->
        <button
          @click="workspaceStore.toggleQuickOpen"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all duration-200 cursor-pointer"
          title="Pencarian Berkas Project (Ctrl+E)"
        >
          <UIcon name="i-lucide-search" class="size-4" />
        </button>

        <!-- Task View & Multi-Window Hub Button (Ctrl+Shift+N) -->
        <button
          @click="workspaceStore.toggleWindowSwitcher"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative"
          :class="workspaceStore.isWindowSwitcherVisible
            ? 'bg-[#42b883]/20 text-[#42b883] border border-[#42b883]/40 shadow-xs shadow-[#42b883]/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'"
          title="Task View & Multi-Window Hub (Ctrl+Shift+N)"
        >
          <UIcon name="i-lucide-layout-grid" class="size-4" />
        </button>

        <!-- Extensions & Plugins Manager (Ctrl+Shift+X) -->
        <button
          @click="pluginStore.isPluginManagerOpen = true"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative"
          :class="pluginStore.isPluginManagerOpen
            ? 'bg-[#42b883]/20 text-[#42b883] border border-[#42b883]/40 shadow-xs shadow-[#42b883]/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'"
          title="Ekstensi & Plugin (Ctrl+Shift+X)"
        >
          <UIcon name="i-lucide-puzzle" class="size-4" />
        </button>

        <!-- OpenCode Autonomous Agent (CLI) -->
        <button
          @click="workspaceStore.toggleOpenCodePanel()"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative"
          :class="workspaceStore.isOpenCodePanelOpen
            ? 'bg-[#42b883]/20 text-[#42b883] border border-[#42b883]/40 shadow-xs shadow-[#42b883]/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'"
          title="OpenCode CLI Agent"
        >
          <img :src="openCodeLogo" alt="OpenCode" class="size-4 rounded-xs object-contain" />
        </button>

        <!-- Claude Autonomous Agent (CLI) -->
        <button
          @click="workspaceStore.toggleClaudePanel()"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer relative"
          :class="workspaceStore.isClaudePanelOpen
            ? 'bg-[#ea580c]/20 text-[#f97316] border border-[#ea580c]/40 shadow-xs shadow-[#ea580c]/20'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]'"
          title="Claude Code Agent"
        >
          <img :src="claudeLogo" alt="Claude" class="size-4 rounded-xs object-contain" />
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
        <!-- Tab Bar (Single row horizontal scroll, Antigravity sleek design) -->
        <div class="h-9 px-2 bg-[#0b101b]/95 border-b border-white/[0.06] flex items-center justify-between gap-1 flex-shrink-0 select-none">
          <!-- Scrollable Tab Strip -->
          <div
            @wheel.passive="handleTabBarWheel"
            class="flex-1 flex items-center gap-1.5 overflow-x-auto overflow-y-hidden no-scrollbar py-1"
          >
            <div
              v-for="tab in workspaceStore.tabList"
              :key="tab.id"
              @click="workspaceStore.setActiveTab(tab.id)"
              :class="[
                'h-7 px-3 flex items-center gap-1.5 text-xs rounded-full cursor-pointer select-none group relative transition-all flex-shrink-0 border shadow-xs',
                workspaceStore.activeTabId === tab.id
                  ? 'bg-[#131d2e] text-[#42b883] font-semibold border-[#42b883]/45 shadow-sm shadow-[#42b883]/10 ring-1 ring-[#42b883]/20'
                  : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] border-white/[0.04] hover:border-white/[0.1]'
              ]"
              :title="tab.filePath || tab.title"
            >
              <UIcon
                :name="getNuxtFileIcon(tab.title, false).icon"
                :class="[getNuxtFileIcon(tab.title, false).colorClass, 'size-3.5 flex-shrink-0']"
              />
              <span class="truncate max-w-[140px] text-[11px] font-medium">{{ tab.title }}</span>
              <span
                v-if="tab.isDirty"
                class="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50 ml-0.5 flex-shrink-0"
                title="Perubahan belum disimpan (Ctrl+S)"
              ></span>
              <button
                @click.stop="workspaceStore.closeTab(tab.id)"
                class="w-4 h-4 rounded-full flex items-center justify-center ml-0.5 cursor-pointer flex-shrink-0 transition-colors opacity-60 group-hover:opacity-100 hover:opacity-100"
                :class="workspaceStore.activeTabId === tab.id
                  ? 'text-slate-300 hover:text-rose-400 hover:bg-rose-500/20'
                  : 'text-slate-400 hover:text-rose-400 hover:bg-white/[0.08]'"
                title="Tutup tab"
              >
                <UIcon name="i-lucide-x" class="size-2.5" />
              </button>
            </div>
          </div>

          <!-- Tab Bar Right Quick Actions (Close All, Close Others) -->
          <div v-if="workspaceStore.tabList.length > 1" class="flex items-center gap-1 pl-1 flex-shrink-0 border-l border-white/[0.06]">
            <button
              @click="handleCloseOtherTabs"
              class="h-6 px-2.5 rounded-full text-[10px] text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.08] transition-colors cursor-pointer flex items-center gap-1"
              title="Tutup Tab Lainnya"
            >
              <UIcon name="i-lucide-x-circle" class="size-3" />
              <span>Tutup Lainnya</span>
            </button>
            <button
              @click="handleCloseAllTabs"
              class="h-6 w-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-white/[0.04] hover:border-rose-500/30 transition-colors cursor-pointer"
              title="Tutup Semua Tab"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- Tab Body Container (Monaco Editor or Welcome Screen) -->
        <div class="flex-1 overflow-hidden relative">
          <!-- Active Monaco Editor for Current File (Persistent Instance like VS Code / Antigravity) -->
          <div v-show="workspaceStore.activeTab.tabType === 'editor'" class="w-full h-full">
            <MonacoEditor
              :tabId="workspaceStore.activeTab.id"
              :modelValue="workspaceStore.activeTab.content"
              :language="workspaceStore.activeTab.language"
              :filePath="workspaceStore.activeTab.filePath"
            />
          </div>

          <!-- Welcome Screen if no file is open (Premium Hero Aura) -->
          <div
            v-if="workspaceStore.activeTab.tabType !== 'editor'"
            class="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none space-y-5 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#42b883]/12 via-[#0b101b] to-[#090d14]"
          >
            <div class="w-36 h-28 flex items-center justify-center p-2.5 rounded-3xl bg-[#0c121d] border border-[#42b883]/35 shadow-2xl shadow-[#42b883]/20 backdrop-blur-md">
              <img :src="logoImg" alt="Makarya Logo" class="w-full h-full object-contain drop-shadow-xl rounded-2xl" />
            </div>
            <div class="space-y-1.5">
              <h1 class="text-2xl font-bold vue-gradient-text tracking-wide">Makarya Code Editor</h1>
              <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Editor kode modern terintegrasi Monaco Editor dan agen kecerdasan buatan berbasis
                <span class="inline-flex items-center gap-1 font-semibold text-slate-200">
                  <svg class="size-3.5 inline-block -translate-y-[1px]" viewBox="0 0 261.76 226.69">
                    <path d="M161.096.001l-30.225 52.351L100.647.001H0l130.877 226.688L261.755.001h-100.659z" fill="#42b883"/>
                    <path d="M161.096.001l-30.225 52.351L100.647.001H52.846l78.031 135.151 78.037-135.151h-47.818z" fill="#35495e"/>
                  </svg>
                  Vue.js
                </span>.
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

      <!-- Right Copilot AI Panel (Identik dengan Gambar 2) -->
      <AgentPanel v-show="workspaceStore.isCopilotPanelOpen" />

      <!-- OpenCode Autonomous Agent Panel -->
      <OpenCodePanel v-show="workspaceStore.isOpenCodePanelOpen" />

      <!-- Claude Autonomous Agent Panel -->
      <ClaudePanel v-show="workspaceStore.isClaudePanelOpen" />
    </div>

    <!-- Editor Module Modals & Overlays -->
    <TabSwitcherModal />
    <WindowSwitcherModal />
    <QuickOpenModal />
    <CommandPalette />
    <AboutModal v-model:visible="workspaceStore.isAboutModalOpen" />
  </div>
</template>
