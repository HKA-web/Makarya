<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FileEntry } from '../../../preload/index'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'

const props = defineProps<{
  entry: FileEntry
  depth?: number
}>()

const emit = defineEmits<{
  (event: 'openContextMenu', payload: { event: MouseEvent; entry: FileEntry }): void
}>()

const workspaceStore = useWorkspaceStore()
const isLoadingChildren = ref(false)

const isExpanded = computed(() => !!workspaceStore.expandedFolderPaths[props.entry.path])
const childEntries = computed(() => {
  return workspaceStore.directoryChildrenMap[props.entry.path] || props.entry.children || []
})

async function handleClick(): Promise<void> {
  if (props.entry.isDirectory) {
    isLoadingChildren.value = true
    try {
      await workspaceStore.toggleFolderExpanded(props.entry.path)
    } finally {
      isLoadingChildren.value = false
    }
  } else {
    await workspaceStore.openFile(props.entry.path, props.entry.name)
  }
}

function handleDragStart(event: DragEvent): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'

  const payload = {
    path: props.entry.path,
    name: props.entry.name,
    isDirectory: props.entry.isDirectory
  }

  event.dataTransfer.setData('text/plain', props.entry.path)
  event.dataTransfer.setData('application/json', JSON.stringify(payload))
  event.dataTransfer.setData('makarya/file-entry', JSON.stringify(payload))
}
</script>

<template>
  <div class="select-none text-xs">
    <div
      draggable="true"
      @dragstart="handleDragStart"
      @click="handleClick"
      @contextmenu.prevent="emit('openContextMenu', { event: $event, entry: props.entry })"
      :style="{ paddingLeft: `${((props.depth || 0) * 14) + 8}px` }"
      class="flex items-center gap-1.5 py-1 pr-3 hover:bg-white/[0.04] cursor-pointer rounded-md group transition-all relative w-full text-[11px]"
      :class="[
        workspaceStore.activeTab.filePath === entry.path ? 'bg-[#42b883]/10 text-[#42b883] font-medium border-l-2 border-[#42b883]' : 'text-slate-300 hover:text-white',
        workspaceStore.copiedEntry?.path === entry.path ? 'ring-1 ring-dashed ring-[#42b883]/80 bg-[#42b883]/10' : ''
      ]"
      :title="entry.name"
    >
      <UIcon
        v-if="entry.isDirectory"
        :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="size-3 text-slate-500 group-hover:text-slate-300 transition-transform duration-150 flex-shrink-0"
      />
      <span v-else class="w-3 flex-shrink-0"></span>

      <UIcon
        :name="getNuxtFileIcon(entry.name, entry.isDirectory, isExpanded).icon"
        :class="[getNuxtFileIcon(entry.name, entry.isDirectory, isExpanded).colorClass, 'size-3.5 flex-shrink-0']"
      />
      
      <!-- Full name width, no buttons crowding the space -->
      <span class="truncate flex-1 min-w-0 font-normal leading-normal">{{ entry.name }}</span>

      <span v-if="isLoadingChildren" class="ml-auto text-[10px] text-[#42b883] flex-shrink-0">
        <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
      </span>
    </div>

    <!-- Recursive children rendering (synchronized with workspaceStore) -->
    <div v-if="entry.isDirectory && isExpanded">
      <FileTreeNode
        v-for="child in childEntries"
        :key="child.path"
        :entry="child"
        :depth="(props.depth || 0) + 1"
        @openContextMenu="(payload) => emit('openContextMenu', payload)"
      />
      <div
        v-if="childEntries.length === 0 && !isLoadingChildren"
        :style="{ paddingLeft: `${(((props.depth || 0) + 1) * 12) + 8}px` }"
        class="py-0.5 text-[11px] text-zinc-500 italic"
      >
        (Folder kosong)
      </div>
    </div>
  </div>
</template>
