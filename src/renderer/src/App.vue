<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useToast } from 'primevue/usetoast'
import { useWorkspaceStore } from './stores/workspaceStore'
import { useSettingsStore } from './stores/settingsStore'
import { useAgentStore } from './stores/agentStore'
import { usePluginStore } from './stores/pluginStore'
import { useUpdateStore } from './stores/updateStore'
import { ModularAppContainer, useProductionRegistry } from './modules'
import { globalPluginEvents } from './sdk/runtime'
import AboutModal from './modules/editor/components/AboutModal.vue'
import SettingsModal from './modules/editor/components/SettingsModal.vue'
import PluginManagerModal from './modules/editor/components/PluginManagerModal.vue'
import DatabaseConnectionModal from './modules/editor/components/DatabaseConnectionModal.vue'
import MandatoryUpdateModal from './modules/editor/components/MandatoryUpdateModal.vue'
import iconImg from './assets/icon.jpg'

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const pluginStore = usePluginStore()
const updateStore = useUpdateStore()
const toast = useToast()
const { activeModule } = useProductionRegistry()

const activeFilePath = computed(() => {
  if (workspaceStore.activeTab?.filePath) {
    return workspaceStore.activeTab.filePath
  }
  if (workspaceStore.activeTab?.title && workspaceStore.activeTab.tabType !== 'welcome') {
    return workspaceStore.activeTab.title
  }
  return 'Makarya Ready'
})

watch(
  () => workspaceStore.activeTab,
  (tab) => {
    if (tab) {
      globalPluginEvents.emit('workspace:did-change-active-tab', {
        id: tab.id,
        title: tab.title,
        filePath: tab.filePath,
        content: tab.content,
        isDirty: tab.isDirty,
        language: tab.language
      })
    } else {
      globalPluginEvents.emit('workspace:did-change-active-tab', null)
    }
  },
  { immediate: true }
)

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
  } else if (isModifier && event.key === ',') {
    event.preventDefault()
    settingsStore.openSettings()
  } else if (isModifier && event.shiftKey && event.key.toLowerCase() === 'x') {
    event.preventDefault()
    pluginStore.isPluginManagerOpen = !pluginStore.isPluginManagerOpen
  } else if (isModifier && event.key.toLowerCase() === 'w') {
    event.preventDefault()
    workspaceStore.closeTab(workspaceStore.activeTabId)
  } else if (isModifier && event.shiftKey && event.key.toLowerCase() === 'f') {
    // Global Search in Files (Ctrl+Shift+F)
    event.preventDefault()
    workspaceStore.toggleGlobalSearch()
  } else if (isModifier && !event.shiftKey && event.key.toLowerCase() === 'f') {
    // Global Find shortcut: Focus active editor and open Find Widget
    const activeEl = document.activeElement as HTMLElement | null
    const isInsideModalOrInput =
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      !activeEl.classList.contains('inputarea') &&
      !activeEl.closest('.monaco-findInput')

    if (!isInsideModalOrInput) {
      const activeEditor = workspaceStore.getActiveEditorInstance()
      if (activeEditor) {
        event.preventDefault()
        activeEditor.focus()
        const findAction = activeEditor.getAction('actions.find')
        if (findAction) {
          findAction.run()
        } else {
          activeEditor.trigger('keyboard', 'actions.find', {})
        }
      }
    }
  } else if (isModifier && !event.shiftKey && event.key.toLowerCase() === 'h') {
    // Global Find & Replace shortcut
    const activeEl = document.activeElement as HTMLElement | null
    const isInsideModalOrInput =
      activeEl &&
      (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') &&
      !activeEl.classList.contains('inputarea') &&
      !activeEl.closest('.monaco-findInput')

    if (!isInsideModalOrInput) {
      const activeEditor = workspaceStore.getActiveEditorInstance()
      if (activeEditor) {
        event.preventDefault()
        activeEditor.focus()
        const replaceAction = activeEditor.getAction('editor.action.startFindReplaceAction')
        if (replaceAction) {
          replaceAction.run()
        } else {
          activeEditor.trigger('keyboard', 'editor.action.startFindReplaceAction', {})
        }
      }
    }
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

  // Restore workspace roots, settings, agent models, and plugins on startup
  pluginStore.setUiHandlers(
    (opts) => {
      toast.add({
        severity: (opts.type === 'error' ? 'error' : opts.type === 'warn' ? 'warn' : opts.type === 'success' ? 'success' : 'info') as any,
        summary: opts.title || 'Ekstensi Makarya',
        detail: opts.message,
        life: opts.duration || 3000
      })
    },
    (opts) => {
      if (window.confirm(`${opts.title}\n\n${opts.message}`)) {
        opts.onAccept?.()
      } else {
        opts.onReject?.()
      }
    }
  )

  await Promise.all([
    workspaceStore.loadWorkspaceRootsFromStorage(),
    settingsStore.loadSettingsFromDb(),
    agentStore.loadModels()
  ])

  pluginStore.registerBuiltinPlugins()

  // Inisialisasi pengecekan pembaruan wajib (Mandatory Update Check)
  updateStore.initStartupCheck()
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
        >
          <!-- Makarya Logo Icon -->
          <img :src="iconImg" alt="Makarya IDE Logo" class="h-6 w-auto object-contain drop-shadow-md select-none mr-0.5 group-hover:scale-105 transition-transform" />
          <span class="text-xs font-semibold text-slate-300 group-hover:text-white tracking-wide font-sans">Makarya IDE</span>
        </button>

        <!-- Right Header Actions & Window Controls -->
        <div class="flex items-center gap-2" style="-webkit-app-region: no-drag;">
          <!-- Windows Native Control Buttons (Minimize, Maximize/Restore, Close) -->
          <div class="flex items-center gap-0.5">
            <button
              @click="handleMinimize"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors cursor-pointer"
            >
              <UIcon name="i-lucide-minus" class="size-3.5" />
            </button>

            <button
              @click="handleMaximizeToggle"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors cursor-pointer"
            >
              <UIcon :name="isWindowMaximized ? 'i-lucide-copy' : 'i-lucide-square'" class="size-3.5" />
            </button>

            <button
              @click="handleClose"
              class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500 active:bg-rose-600 transition-colors cursor-pointer"
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
          <div
            class="flex items-center gap-1.5 text-[#42b883] select-none max-w-md sm:max-w-xl lg:max-w-2xl truncate"
            :title="workspaceStore.activeTab?.filePath || 'Makarya Ready'"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] vue-pulse-dot flex-shrink-0 -translate-y-[0.5px]"></span>
            <span class="font-medium text-[11px] leading-none truncate font-mono">
              {{ activeFilePath }}
            </span>
          </div>

          <!-- Plugin Contributed Left Status Bar Items -->
          <div
            v-for="item in pluginStore.activeStatusBarItems.filter(i => i.alignment !== 'right')"
            :key="item.id"
            class="flex items-center gap-2"
          >
            <span class="text-slate-600">•</span>
            <button
              @click="item.command && pluginStore.executeCommand(item.command)"
              :title="item.tooltip"
              class="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 font-mono text-[10.5px]"
              :style="{ color: item.color || undefined }"
            >
              <UIcon v-if="item.icon" :name="item.icon" class="size-3.5" />
              <span>{{ item.text }}</span>
            </button>
          </div>
        </div>

        <div class="flex items-center gap-3 text-[11px]">
          <!-- Plugin Contributed Right Status Bar Items -->
          <button
            v-for="item in pluginStore.activeStatusBarItems.filter(i => i.alignment === 'right')"
            :key="item.id"
            @click="item.command && pluginStore.executeCommand(item.command)"
            :title="item.tooltip"
            class="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 font-mono text-[10.5px]"
            :style="{ color: item.color || undefined }"
          >
            <UIcon v-if="item.icon" :name="item.icon" class="size-3.5 text-slate-400" />
            <span>{{ item.text }}</span>
          </button>

          <!-- Extension Manager Quick Link -->
          <button
            @click="pluginStore.isPluginManagerOpen = true"
            class="hover:text-[#42b883] transition-colors cursor-pointer flex items-center gap-1 font-sans text-[11px]"
            title="Buka Plugin & Extension Manager"
          >
            <UIcon name="i-lucide-puzzle" class="size-3 text-[#42b883]" />
            <span>{{ pluginStore.activePlugins.length }} Plugin</span>
          </button>

          <span>Window: <b class="text-[#42b883]">Active</b></span>
        </div>
      </footer>

      <!-- Global Modals & Services -->
      <AboutModal v-model:visible="workspaceStore.isAboutModalOpen" />
      <SettingsModal />
      <PluginManagerModal />
      <DatabaseConnectionModal />
      <MandatoryUpdateModal />
      <Toast position="bottom-right" />
      <ConfirmDialog />
    </div>
  </UApp>
</template>
