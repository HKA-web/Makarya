<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useToast } from 'primevue/usetoast'
import { useWorkspaceStore } from './stores/workspaceStore'
import { useSettingsStore } from './stores/settingsStore'
import { useAgentStore } from './stores/agentStore'
import { ModularAppContainer, useProductionRegistry } from './modules'
import AboutModal from './modules/editor/components/AboutModal.vue'
import iconImg from './assets/icon.jpg'

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const toast = useToast()
const { activeModule } = useProductionRegistry()

const isWindowMaximized = ref(false)
let cleanupWindowStateListener: (() => void) | null = null

// Global Keyboard Shortcuts
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
    }
  } else if (isModifier && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    handleMenuOpenFile()
  } else if (isModifier && event.shiftKey && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    handleMenuAddWorkspace()
  } else if (isModifier && (event.key.toLowerCase() === 'e' || event.key.toLowerCase() === 'p')) {
    event.preventDefault()
    workspaceStore.toggleQuickOpen()
  } else if (isModifier && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    workspaceStore.toggleCommandPalette()
  } else if (isModifier && event.shiftKey && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    workspaceStore.toggleWindowSwitcher()
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeyboard, true)

  if (window.makaryaAPI?.isWindowMaximized) {
    try {
      isWindowMaximized.value = await window.makaryaAPI.isWindowMaximized()
    } catch {
      isWindowMaximized.value = false
    }
  }

  if (window.makaryaAPI?.onWindowStateChange) {
    cleanupWindowStateListener = window.makaryaAPI.onWindowStateChange((maximized) => {
      isWindowMaximized.value = maximized
    })
  }

  // Restore workspace roots, settings, and agent models on startup
  await Promise.all([
    workspaceStore.loadWorkspaceRootsFromStorage(),
    settingsStore.loadSettingsFromDb(),
    agentStore.loadModels()
  ])
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyboard, true)
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
      }
    }
  }
}
</script>

<template>
  <UApp>
    <div class="w-screen h-screen flex flex-col bg-[#090d14] text-slate-100 overflow-hidden font-sans select-none">
      <!-- Top Window Header & Native Controls -->
      <header
        @dblclick="handleMaximizeToggle"
        class="h-9 bg-[#0b101b]/95 backdrop-blur-xl border-b border-white/[0.06] flex items-center justify-between px-3 flex-shrink-0 z-30 shadow-sm select-none"
        style="-webkit-app-region: drag;"
      >
        <!-- Left: Logo & Title (Click to open About Makarya Modal) -->
        <button
          @click="workspaceStore.openAboutModal()"
          class="flex items-center gap-2 cursor-pointer group px-1.5 py-0.5 rounded-lg hover:bg-white/[0.08] transition-colors border border-transparent hover:border-white/[0.1] active:scale-95"
          style="-webkit-app-region: no-drag;"
          title="Tentang Makarya (About)"
        >
          <!-- Makarya Logo Icon -->
          <img :src="iconImg" alt="Makarya Logo" class="h-6 w-auto object-contain drop-shadow-md select-none mr-0.5 group-hover:scale-105 transition-transform" />
          <span class="text-xs font-semibold text-slate-300 group-hover:text-white tracking-wide font-sans">Makarya</span>
        </button>

        <!-- Right Header Actions & Window Controls -->
        <div class="flex items-center gap-2" style="-webkit-app-region: no-drag;">
          <!-- Windows Native Control Buttons (Minimize, Maximize/Restore, Close) -->
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
              title="Close"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      <!-- Main Application Workspace (Pure Modular Architecture) -->
      <div class="flex-1 flex overflow-hidden p-2 pt-1.5 gap-2 bg-[#080c13]">
        <ModularAppContainer />
      </div>

      <!-- Bottom Status Bar -->
      <footer class="h-6 bg-[#090d15] border-t border-white/[0.06] flex items-center justify-between px-3 text-[11px] text-slate-400 font-mono flex-shrink-0">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 text-[#42b883] select-none">
            <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] vue-pulse-dot flex-shrink-0 -translate-y-[0.5px]"></span>
            <span class="font-medium text-[11px] leading-none">Makarya Ready</span>
          </div>

          <span class="text-slate-500">•</span>

          <span class="text-slate-300 font-sans text-[11px]">
            Modul Aktif: <b class="text-[#42b883] font-semibold">{{ activeModule?.manifest.name || 'Selamat Datang' }}</b>
          </span>

          <span v-if="workspaceStore.workspaceRoots.length > 0" class="truncate max-w-xs text-slate-500 text-[10px]">
            ({{ workspaceStore.workspaceRoots[0].path }})
          </span>
        </div>

        <div class="flex items-center gap-3 text-[11px]">
          <span>Engine: <b class="text-slate-300 font-semibold">Modular Plugin</b></span>
          <span>Window: <b class="text-[#42b883]">Active</b></span>
        </div>
      </footer>

      <!-- Global Modals & Services -->
      <AboutModal v-model:visible="workspaceStore.isAboutModalOpen" />
      <Toast position="bottom-right" />
      <ConfirmDialog />
    </div>
  </UApp>
</template>
