<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'

const workspaceStore = useWorkspaceStore()

const selectedIndex = ref(0)
const listContainerRef = ref<HTMLElement | null>(null)

// Daftar tab yang diurutkan berdasarkan Most Recently Used (MRU)
const tabsToDisplay = computed(() => {
  return workspaceStore.tabsInMruOrder
})

function scrollToSelected(): void {
  nextTick(() => {
    if (!listContainerRef.value) return
    const activeItem = listContainerRef.value.children[selectedIndex.value] as HTMLElement | undefined
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
}

function commitSelection(): void {
  if (!workspaceStore.isTabSwitcherVisible) return
  const target = tabsToDisplay.value[selectedIndex.value]
  if (target) {
    workspaceStore.setActiveTab(target.id)
  }
  workspaceStore.toggleTabSwitcher(false)
}

function cancel(): void {
  workspaceStore.toggleTabSwitcher(false)
}

function selectTab(tabId: string): void {
  workspaceStore.setActiveTab(tabId)
  workspaceStore.toggleTabSwitcher(false)
}

function closeTab(tabId: string, event: MouseEvent): void {
  event.stopPropagation()
  workspaceStore.closeTab(tabId)
  if (tabsToDisplay.value.length === 0) {
    workspaceStore.toggleTabSwitcher(false)
  } else if (selectedIndex.value >= tabsToDisplay.value.length) {
    selectedIndex.value = tabsToDisplay.value.length - 1
  }
}

function formatFilePath(filePath?: string): string {
  if (!filePath) return 'Berkas Editor Baru'
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 3) return normalized
  return '.../' + parts.slice(-3).join('/')
}

// Watch ketika tab switcher terbuka
watch(
  () => workspaceStore.isTabSwitcherVisible,
  (visible) => {
    if (visible) {
      // Jika ada 2 tab atau lebih, sorot tab index ke-1 (file yang baru saja dibuka sebelumnya seperti di VS Code / Antigravity)
      const len = tabsToDisplay.value.length
      selectedIndex.value = len > 1 ? 1 : 0
      scrollToSelected()
    }
  }
)

function handleKeyDown(event: KeyboardEvent): void {
  if (!workspaceStore.isTabSwitcherVisible) return

  const isModifier = event.ctrlKey || event.metaKey

  // Navigasi Tab saat Ctrl ditekan
  if (isModifier && event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    const len = tabsToDisplay.value.length
    if (len <= 1) return

    if (event.shiftKey) {
      selectedIndex.value = (selectedIndex.value - 1 + len) % len
    } else {
      selectedIndex.value = (selectedIndex.value + 1) % len
    }
    scrollToSelected()
    return
  }

  // Navigasi Arrow Keys
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    const len = tabsToDisplay.value.length
    if (len > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % len
      scrollToSelected()
    }
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    const len = tabsToDisplay.value.length
    if (len > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + len) % len
      scrollToSelected()
    }
    return
  }

  // Enter to confirm
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    commitSelection()
    return
  }

  // Escape to cancel
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
    return
  }
}

function handleKeyUp(event: KeyboardEvent): void {
  // Ketika tombol Ctrl atau Cmd dilepaskan, konfirmasi dan buka tab yang sedang disorot
  if (workspaceStore.isTabSwitcherVisible) {
    if (event.key === 'Control' || event.key === 'Meta' || (!event.ctrlKey && !event.metaKey)) {
      commitSelection()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown, true)
  window.addEventListener('keyup', handleKeyUp, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown, true)
  window.removeEventListener('keyup', handleKeyUp, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="switcher-fade">
      <div
        v-if="workspaceStore.isTabSwitcherVisible && tabsToDisplay.length > 0"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md select-none p-4"
        @click="cancel"
      >
        <div
          class="w-[520px] max-w-full max-h-[480px] bg-[#0c121d]/95 backdrop-blur-2xl border border-white/[0.12] rounded-2xl shadow-2xl overflow-hidden flex flex-col p-2.5 text-slate-200 transition-all duration-150 animate-scale-in"
          @click.stop
        >
          <!-- Header Bar -->
          <div class="flex items-center justify-between px-3 py-2 border-b border-white/[0.08] mb-1.5 flex-shrink-0">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-arrow-left-right" class="size-4 text-[#42b883]" />
              <span class="text-xs font-bold text-white tracking-wide">Pindah Tab Aktif (Editor)</span>
            </div>

            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                <kbd class="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/10 text-[#42b883] font-semibold">Ctrl+Tab</kbd>
                <span>/</span>
                <kbd class="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/10 text-[#42b883] font-semibold">Shift+Tab</kbd>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#42b883]/15 text-[#42b883] font-semibold font-mono border border-[#42b883]/30">
                {{ tabsToDisplay.length }} Tab
              </span>
            </div>
          </div>

          <!-- Tab List Items -->
          <div
            ref="listContainerRef"
            class="overflow-y-auto max-h-[360px] space-y-1 p-1 custom-tab-scroll flex-1"
          >
            <div
              v-for="(tab, idx) in tabsToDisplay"
              :key="tab.id"
              @mouseenter="selectedIndex = idx"
              @click="selectTab(tab.id)"
              class="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer group"
              :class="idx === selectedIndex
                ? 'bg-[#42b883]/15 border border-[#42b883]/40 text-[#42b883] shadow-md shadow-[#42b883]/10'
                : 'text-slate-300 hover:bg-white/[0.04] border border-transparent'"
            >
              <!-- Left side: File Icon, Name, and Path -->
              <div class="flex items-center gap-2.5 min-w-0">
                <UIcon
                  :name="getNuxtFileIcon(tab.title, false).icon"
                  :class="[getNuxtFileIcon(tab.title, false).colorClass, 'size-4 flex-shrink-0']"
                />
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-xs font-semibold truncate"
                      :class="idx === selectedIndex ? 'text-white' : 'text-slate-200'"
                    >
                      {{ tab.title }}
                    </span>
                    <span
                      v-if="tab.id === workspaceStore.activeTabId"
                      class="text-[9px] px-1.5 py-0.2 rounded-full bg-white/[0.08] text-slate-400 font-mono"
                    >
                      Aktif
                    </span>
                  </div>
                  <span
                    class="text-[10px] text-slate-400 truncate max-w-[340px]"
                    :title="tab.filePath"
                  >
                    {{ formatFilePath(tab.filePath) }}
                  </span>
                </div>
              </div>

              <!-- Right side: Dirty dot, index, close button -->
              <div class="flex items-center gap-2 flex-shrink-0">
                <span
                  v-if="tab.isDirty"
                  class="w-2 h-2 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50"
                  title="Perubahan belum disimpan"
                ></span>

                <!-- Shortcut indicator number -->
                <span
                  class="text-[10px] font-mono w-5 h-5 rounded-md flex items-center justify-center transition-colors"
                  :class="idx === selectedIndex
                    ? 'bg-[#42b883]/20 text-[#42b883] font-bold'
                    : 'text-slate-400/70 group-hover:text-slate-300'"
                >
                  {{ idx + 1 }}
                </span>

                <!-- Quick close tab button on hover -->
                <button
                  @click="(e) => closeTab(tab.id, e)"
                  class="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Tutup tab ini"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </div>
            </div>
          </div>

          <!-- Bottom Footer Navigation Hint -->
          <div class="px-3 py-1.5 text-[10.5px] text-slate-400 flex items-center justify-between border-t border-white/[0.06] mt-1 select-none flex-shrink-0 font-sans">
            <span class="flex items-center gap-1.5">
              <span>Lepaskan</span>
              <kbd class="font-mono text-slate-200 font-semibold px-1 rounded bg-white/[0.08]">Ctrl</kbd>
              <span>untuk berpindah tab</span>
            </span>
            <span class="flex items-center gap-1">
              <kbd class="font-mono text-slate-200 font-semibold px-1 rounded bg-white/[0.08]">Esc</kbd>
              <span>batal</span>
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.switcher-fade-enter-active,
.switcher-fade-leave-active {
  transition: opacity 0.15s ease;
}

.switcher-fade-enter-from,
.switcher-fade-leave-to {
  opacity: 0;
}

@keyframes modalScaleIn {
  from {
    transform: scale(0.97);
    opacity: 0;
  }
  to {
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: modalScaleIn 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.custom-tab-scroll::-webkit-scrollbar {
  width: 5px;
}

.custom-tab-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-tab-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
}

.custom-tab-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.4);
}
</style>
