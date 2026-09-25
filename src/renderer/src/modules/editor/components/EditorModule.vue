<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import MonacoEditor from './MonacoEditor.vue'
import FileExplorer from './FileExplorer.vue'
import AgentPanel from './AgentPanel.vue'
import TerminalPanel from './TerminalPanel.vue'
import CommandPalette from './CommandPalette.vue'
import QuickOpenModal from './QuickOpenModal.vue'
import WindowSwitcherModal from './WindowSwitcherModal.vue'
import TabSwitcherModal from './TabSwitcherModal.vue'
import SettingsModal from './SettingsModal.vue'
import AboutModal from './AboutModal.vue'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'
import logoImg from '@renderer/assets/logo.png'

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()

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

function handleMenuCommandPalette(): void {
  closeHeaderMenu()
  workspaceStore.toggleCommandPalette()
}

function handleMenuAbout(): void {
  closeHeaderMenu()
  workspaceStore.openAboutModal()
}

onMounted(() => {
  window.addEventListener('click', handleWindowClick)
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

        <!-- Folder Breadcrumb Badge -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-slate-300">
          <UIcon name="i-lucide-folder" class="size-3.5 text-[#42b883]" />
          <span v-if="workspaceStore.workspaceRoots.length > 0" class="font-mono text-[11px] truncate max-w-[200px]">
            {{ workspaceStore.workspaceRoots[0].name }}
          </span>
          <span v-else class="text-[11px] text-slate-500">Belum ada folder</span>
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

        <!-- Command Palette Button (Ctrl+K) -->
        <button
          @click="workspaceStore.toggleCommandPalette"
          class="w-7.5 h-7.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] transition-all duration-200 cursor-pointer"
          title="Pencarian & Perintah (Ctrl+K)"
        >
          <UIcon name="i-lucide-search" class="size-4" />
        </button>

        <!-- Quick Open File Search Button (Ctrl+E) -->
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
        <div class="min-h-9 py-1 px-1.5 bg-[#0b101b]/95 border-b border-white/[0.06] flex flex-wrap items-center gap-1.5 flex-shrink-0 max-h-32 overflow-y-auto custom-scroll">
          <div
            v-for="tab in workspaceStore.tabList"
            :key="tab.id"
            @click="workspaceStore.setActiveTab(tab.id)"
            :class="[
              'h-7 px-3 flex items-center gap-2 text-xs rounded-xl cursor-pointer select-none group relative transition-colors',
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
    </div>

    <!-- Editor Module Modals & Overlays -->
    <TabSwitcherModal />
    <WindowSwitcherModal />
    <QuickOpenModal />
    <CommandPalette />
    <SettingsModal />
    <AboutModal v-model:visible="workspaceStore.isAboutModalOpen" />
  </div>
</template>
