<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useAgentStore } from '@renderer/stores/agentStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { usePluginStore } from '@renderer/stores/pluginStore'

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()
const settingsStore = useSettingsStore()
const pluginStore = usePluginStore()

const searchKeyword = ref('')
const selectedIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)

interface CommandItem {
  id: string
  title: string
  category: string
  icon: string
  shortcut?: string
  action: () => void
}

const commandList: CommandItem[] = [
  {
    id: 'cmd-open-settings',
    title: 'Buka Pengaturan (Settings)...',
    category: 'Preferensi',
    icon: 'i-lucide-settings',
    shortcut: 'Ctrl+,',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      settingsStore.openSettings()
    }
  },
  {
    id: 'cmd-quick-open',
    title: 'Cari Berkas pada Project...',
    category: 'Navigasi',
    icon: 'i-lucide-file-search',
    shortcut: 'Ctrl+E',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.isQuickOpenVisible = true
    }
  },
  {
    id: 'cmd-find-in-files',
    title: 'Pencarian Kode Global (Find in Files)...',
    category: 'Pencarian',
    icon: 'i-lucide-search',
    shortcut: 'Ctrl+Shift+F',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.openGlobalSearch()
    }
  },
  {
    id: 'cmd-tab-switcher',
    title: 'Pindah Tab Aktif (Tab Switcher)...',
    category: 'Navigasi',
    icon: 'i-lucide-arrow-left-right',
    shortcut: 'Ctrl+Tab',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.toggleTabSwitcher(true)
    }
  },
  {
    id: 'cmd-window-switcher',
    title: 'Task View & Multi-Window Hub...',
    category: 'Tampilan',
    icon: 'i-lucide-layout-grid',
    shortcut: 'Ctrl+Shift+N',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.toggleWindowSwitcher()
    }
  },
  {
    id: 'cmd-open-folder',
    title: 'Buka Folder Project...',
    category: 'Berkas',
    icon: 'i-lucide-folder-open',
    shortcut: 'Ctrl+O',
    action: async () => {
      workspaceStore.isCommandPaletteVisible = false
      if (window.makaryaAPI) {
        const dialogResult = await window.makaryaAPI.openFolderDialog()
        if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
          await workspaceStore.setSingleWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
          agentStore.setConnectedWorkspacePath(dialogResult.folderPath)
        }
      }
    }
  },
  {
    id: 'cmd-add-workspace',
    title: 'Tambah Folder Project...',
    category: 'Berkas',
    icon: 'i-lucide-folder-plus',
    shortcut: 'Ctrl+Shift+A',
    action: async () => {
      workspaceStore.isCommandPaletteVisible = false
      if (window.makaryaAPI) {
        const dialogResult = await window.makaryaAPI.openFolderDialog()
        if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
          await workspaceStore.addWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
          agentStore.setConnectedWorkspacePath(dialogResult.folderPath)
        }
      }
    }
  },
  {
    id: 'cmd-save-file',
    title: 'Simpan File Aktif',
    category: 'Berkas',
    icon: 'i-lucide-save',
    shortcut: 'Ctrl+S',
    action: async () => {
      workspaceStore.isCommandPaletteVisible = false
      await workspaceStore.saveActiveFile()
    }
  },
  {
    id: 'cmd-close-file',
    title: 'Tutup File Aktif',
    category: 'Tab',
    icon: 'i-lucide-x',
    shortcut: 'Ctrl+W',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.closeTab(workspaceStore.activeTabId)
    }
  },
  {
    id: 'cmd-toggle-sidebar',
    title: 'Toggle File Explorer Sidebar',
    category: 'Tampilan',
    icon: 'i-lucide-panel-left',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.toggleSidebar()
    }
  },
  {
    id: 'cmd-toggle-copilot',
    title: 'Toggle Panel AI Copilot',
    category: 'AI Assistant',
    icon: 'i-lucide-sparkles',
    shortcut: 'Ctrl+B',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      workspaceStore.toggleCopilotPanel()
    }
  },
  {
    id: 'cmd-tag-to-agent',
    title: 'Tag Baris Terpilih ke Chat Agent',
    category: 'AI Assistant',
    icon: 'i-lucide-code-xml',
    shortcut: 'Ctrl+L',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
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
  },
  {
    id: 'cmd-plugin-manager',
    title: 'Kelola Ekstensi & Plugin (Plugin Manager)...',
    category: 'Ekstensi',
    icon: 'i-lucide-puzzle',
    shortcut: 'Ctrl+Shift+X',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      pluginStore.isPluginManagerOpen = true
    }
  },
  {
    id: 'cmd-agent-history',
    title: 'Buka Riwayat Obrolan AI...',
    category: 'AI Assistant',
    icon: 'i-lucide-history',
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      if (!workspaceStore.isCopilotPanelOpen) {
        workspaceStore.toggleCopilotPanel()
      }
      agentStore.loadSessions()
      agentStore.isSessionsModalOpen = true
    }
  }
]

const allAvailableCommands = computed<CommandItem[]>(() => {
  const pluginCmds: CommandItem[] = pluginStore.allRegisteredCommandsList.map((pCmd) => ({
    id: pCmd.id,
    title: pCmd.title,
    category: pCmd.category || 'Plugin',
    icon: pCmd.icon || 'i-lucide-puzzle',
    shortcut: pCmd.shortcut,
    action: () => {
      workspaceStore.isCommandPaletteVisible = false
      pluginStore.executeCommand(pCmd.id)
    }
  }))

  return [...commandList, ...pluginCmds]
})

const filteredCommandList = computed(() => {
  const list = allAvailableCommands.value
  if (!searchKeyword.value.trim()) return list
  const lowerKeyword = searchKeyword.value.toLowerCase()
  return list.filter(
    (command) =>
      command.title.toLowerCase().includes(lowerKeyword) ||
      command.category.toLowerCase().includes(lowerKeyword)
  )
})

watch(filteredCommandList, () => {
  selectedIndex.value = 0
})

watch(
  () => workspaceStore.isCommandPaletteVisible,
  (visible) => {
    if (visible) {
      searchKeyword.value = ''
      selectedIndex.value = 0
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }
)

function executeSelectedCommand(): void {
  const items = filteredCommandList.value
  if (items.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < items.length) {
    items[selectedIndex.value].action()
  }
}

function handlePaletteKeydown(event: KeyboardEvent): void {
  const items = filteredCommandList.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % items.length
      scrollToSelected()
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + items.length) % items.length
      scrollToSelected()
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    executeSelectedCommand()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    workspaceStore.isCommandPaletteVisible = false
  }
}

function scrollToSelected(): void {
  nextTick(() => {
    const el = document.getElementById(`cmd-item-${selectedIndex.value}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
</script>

<template>
  <Dialog
    v-model:visible="workspaceStore.isCommandPaletteVisible"
    modal
    :closable="false"
    :dismissableMask="true"
    :style="{ width: '580px', maxWidth: '92vw' }"
    :pt="{
      root: {
        class: 'relative bg-[#0b101b]/80 backdrop-blur-2xl border border-white/[0.12] text-slate-100 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] p-0 overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300'
      },
      mask: {
        class: 'bg-black/55 backdrop-blur-sm transition-all duration-300'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Subtle Accent Glow Line -->
    <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883]/60 to-transparent"></div>

    <!-- Search Input Row -->
    <div class="flex items-center px-4 py-3.5 border-b border-white/[0.08] gap-3 bg-white/[0.02]">
      <UIcon name="i-lucide-search" class="size-4 text-[#42b883] flex-shrink-0" />
      <input
        ref="searchInputRef"
        v-model="searchKeyword"
        type="text"
        placeholder="Ketik perintah, aksi, atau nama menu..."
        class="w-full bg-transparent border-none text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 text-sm font-sans tracking-wide"
        @keydown="handlePaletteKeydown"
      />
      <div class="flex items-center gap-1.5 flex-shrink-0">
        <span class="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-[10px] text-slate-400 font-mono tracking-wider font-semibold shadow-xs">
          ESC
        </span>
      </div>
    </div>

    <!-- Commands List -->
    <div class="max-h-80 overflow-y-auto p-2 space-y-1 custom-scroll">
      <div
        v-for="(command, idx) in filteredCommandList"
        :id="`cmd-item-${idx}`"
        :key="command.id"
        @click="command.action"
        @mouseenter="selectedIndex = idx"
        class="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 text-sm group select-none border"
        :class="selectedIndex === idx
          ? 'bg-gradient-to-r from-[#42b883]/20 via-[#42b883]/10 to-transparent border-[#42b883]/40 text-white shadow-sm shadow-[#42b883]/10 translate-x-1'
          : 'border-transparent text-slate-300 hover:text-white hover:bg-white/[0.03]'"
      >
        <div class="flex items-center gap-3 min-w-0">
          <!-- Icon with soft badge container -->
          <div
            class="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all duration-150"
            :class="selectedIndex === idx
              ? 'bg-[#42b883]/25 border-[#42b883]/50 text-[#42b883] shadow-xs'
              : 'bg-white/[0.04] border-white/[0.08] text-slate-400 group-hover:text-[#42b883] group-hover:border-[#42b883]/30'"
          >
            <UIcon :name="command.icon" class="size-3.5" />
          </div>

          <!-- Title and Category -->
          <div class="flex items-center gap-2 truncate">
            <span
              class="font-medium truncate transition-colors text-[13px]"
              :class="selectedIndex === idx ? 'text-white' : 'text-slate-200 group-hover:text-white'"
            >
              {{ command.title }}
            </span>
            <span
              class="text-[10px] px-1.5 py-0.5 rounded-md font-sans border transition-colors flex-shrink-0"
              :class="selectedIndex === idx
                ? 'bg-[#42b883]/15 text-[#42b883] border-[#42b883]/30'
                : 'bg-white/[0.04] text-slate-500 border-white/[0.06] group-hover:text-slate-400'"
            >
              {{ command.category }}
            </span>
          </div>
        </div>

        <!-- Shortcut Pill -->
        <span
          v-if="command.shortcut"
          class="ml-3 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium transition-all shadow-xs flex-shrink-0 border"
          :class="selectedIndex === idx
            ? 'bg-[#42b883]/20 text-[#42b883] border-[#42b883]/40 font-semibold shadow-xs'
            : 'bg-white/[0.04] text-slate-400 border-white/[0.08] group-hover:text-slate-300'"
        >
          {{ command.shortcut }}
        </span>
      </div>

      <!-- Empty State -->
      <div v-if="filteredCommandList.length === 0" class="text-center py-8 text-slate-500 text-xs">
        <UIcon name="i-lucide-search-x" class="size-6 text-slate-600 mx-auto mb-2" />
        <p>Tidak ada perintah yang cocok dengan <span class="text-slate-400 font-medium">"{{ searchKeyword }}"</span></p>
      </div>
    </div>

    <!-- Bottom Navigation Hint Bar -->
    <div class="px-4 py-2 border-t border-white/[0.06] bg-black/20 flex items-center justify-between text-[11px] text-slate-500 select-none">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1">
          <kbd class="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-[9px] font-mono text-slate-400">↑</kbd>
          <kbd class="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-[9px] font-mono text-slate-400">↓</kbd>
          <span class="text-[10px]">navigasi</span>
        </span>
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-[9px] font-mono text-slate-400">↵</kbd>
          <span class="text-[10px]">pilih</span>
        </span>
      </div>
      <span class="text-[10px] text-slate-500 font-mono">
        {{ filteredCommandList.length }} perintah
      </span>
    </div>
  </Dialog>
</template>
