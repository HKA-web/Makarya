<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import type { FileEntry } from '../../../preload/index'
import FileTreeNode from './FileTreeNode.vue'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useAgentStore } from '../stores/agentStore'
import { getFileIconClass } from '../utils/languageDetector'

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()
const confirm = useConfirm()
const toast = useToast()

const isOpening = ref(false)

// Dynamic Resizable Sidebar Width
const sidebarWidth = ref<number>(270)
const isResizing = ref(false)

function startResize(e: MouseEvent): void {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMouseMove(moveEvent: MouseEvent): void {
    const delta = moveEvent.clientX - startX
    const newWidth = Math.max(200, Math.min(600, startWidth + delta))
    sidebarWidth.value = newWidth
  }

  function onMouseUp(): void {
    isResizing.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Right Click Context Menu State
interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  targetEntry: FileEntry | null
  targetRoot: { path: string; name: string } | null
  isBackground: boolean
}

const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  targetEntry: null,
  targetRoot: null,
  isBackground: false
})

function handleOpenContextMenu(payload: { event: MouseEvent; entry: FileEntry }): void {
  payload.event.preventDefault()
  payload.event.stopPropagation()

  const menuWidth = 210
  const menuHeight = 280
  const x = Math.min(payload.event.clientX, window.innerWidth - menuWidth - 10)
  const y = Math.min(payload.event.clientY, window.innerHeight - menuHeight - 10)

  contextMenu.value = {
    visible: true,
    x,
    y,
    targetEntry: payload.entry,
    targetRoot: null,
    isBackground: false
  }
}

function handleRootContextMenu(event: MouseEvent, root: { path: string; name: string }): void {
  event.preventDefault()
  event.stopPropagation()

  const menuWidth = 220
  const menuHeight = 200
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 10)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 10)

  contextMenu.value = {
    visible: true,
    x,
    y,
    targetEntry: null,
    targetRoot: root,
    isBackground: false
  }
}

function handleBackgroundContextMenu(event: MouseEvent): void {
  event.preventDefault()
  if (workspaceStore.workspaceRoots.length === 0) return

  const menuWidth = 210
  const menuHeight = 180
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 10)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 10)

  contextMenu.value = {
    visible: true,
    x,
    y,
    targetEntry: null,
    targetRoot: null,
    isBackground: true
  }
}

function closeContextMenu(): void {
  contextMenu.value.visible = false
}

onMounted(() => {
  window.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  window.removeEventListener('click', closeContextMenu)
})

// Dialog States
const isCreateFileDialogVisible = ref(false)
const isCreateFolderDialogVisible = ref(false)
const isRenameDialogVisible = ref(false)

const targetParentPath = ref<string>('')
const inputNewName = ref<string>('')
const targetEntryToRename = ref<FileEntry | null>(null)

const folderBaseName = computed(() => {
  if (!workspaceStore.rootFolderPath) return null
  const cleanPath = workspaceStore.rootFolderPath.replace(/[\\/]+$/, '')
  const segments = cleanPath.split(/[\\/]/)
  return segments[segments.length - 1] || workspaceStore.rootFolderPath
})

async function handleOpenFolder(): Promise<void> {
  if (!window.makaryaAPI?.openFolderDialog) {
    alert('API file sistem desktop belum aktif. Harap tutup dan jalankan ulang "npm run dev".')
    return
  }

  isOpening.value = true
  try {
    const dialogResult = await window.makaryaAPI.openFolderDialog()
    if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
      await workspaceStore.setSingleWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
      agentStore.setConnectedWorkspacePath(dialogResult.folderPath)
      toast.add({
        severity: 'info',
        summary: 'Folder Dibuka',
        detail: dialogResult.folderPath,
        life: 2500
      })
    }
  } catch (error) {
    console.error('Error saat membuka folder:', error)
  } finally {
    isOpening.value = false
  }
}

async function handleAddWorkspace(): Promise<void> {
  if (!window.makaryaAPI?.openFolderDialog) {
    alert('API file sistem desktop belum aktif. Harap tutup dan jalankan ulang "npm run dev".')
    return
  }

  isOpening.value = true
  try {
    const dialogResult = await window.makaryaAPI.openFolderDialog()
    if (!dialogResult.canceled && dialogResult.folderPath && dialogResult.entries) {
      const added = await workspaceStore.addWorkspaceRoot(dialogResult.folderPath, dialogResult.entries)
      agentStore.setConnectedWorkspacePath(dialogResult.folderPath)
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
  } catch (error) {
    console.error('Error saat menambah project:', error)
  } finally {
    isOpening.value = false
  }
}

function confirmRemoveWorkspace(root: { path: string; name: string }): void {
  confirm.require({
    message: `Hapus "${root.name}" dari daftar project? Berkas di komputer Anda tidak akan terhapus.`,
    header: 'Hapus Project',
    icon: 'pi pi-info-circle',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    accept: () => {
      workspaceStore.removeWorkspaceRoot(root.path)
      toast.add({
        severity: 'info',
        summary: 'Project Dihapus',
        detail: `Project "${root.name}" telah dihapus dari daftar project aktif`,
        life: 2000
      })
    }
  })
}

async function handleRefresh(): Promise<void> {
  await workspaceStore.refreshFileTree()
  toast.add({ severity: 'info', summary: 'Refresh Berhasil', detail: 'Pohon file telah diperbarui', life: 1500 })
}

// Create File Handlers
function openCreateFileDialog(parentPath?: string): void {
  targetParentPath.value = parentPath || workspaceStore.rootFolderPath || ''
  inputNewName.value = ''
  isCreateFileDialogVisible.value = true
}

async function submitCreateFile(): Promise<void> {
  if (!inputNewName.value.trim() || !targetParentPath.value) return

  const fileName = inputNewName.value.trim()
  const result = await workspaceStore.createFile(targetParentPath.value, fileName)
  isCreateFileDialogVisible.value = false

  if (result.success) {
    toast.add({ severity: 'success', summary: 'File Dibuat', detail: result.message, life: 2500 })
  } else {
    toast.add({ severity: 'error', summary: 'Gagal Membuat File', detail: result.message, life: 3000 })
  }
}

// Create Folder Handlers
function openCreateFolderDialog(parentPath?: string): void {
  targetParentPath.value = parentPath || workspaceStore.rootFolderPath || ''
  inputNewName.value = ''
  isCreateFolderDialogVisible.value = true
}

async function submitCreateFolder(): Promise<void> {
  if (!inputNewName.value.trim() || !targetParentPath.value) return

  const folderName = inputNewName.value.trim()
  const result = await workspaceStore.createFolder(targetParentPath.value, folderName)
  isCreateFolderDialogVisible.value = false

  if (result.success) {
    toast.add({ severity: 'success', summary: 'Folder Dibuat', detail: result.message, life: 2500 })
  } else {
    toast.add({ severity: 'error', summary: 'Gagal Membuat Folder', detail: result.message, life: 3000 })
  }
}

// Rename Handlers
function openRenameDialog(entry: FileEntry): void {
  targetEntryToRename.value = entry
  inputNewName.value = entry.name
  isRenameDialogVisible.value = true
}

async function submitRename(): Promise<void> {
  if (!targetEntryToRename.value || !inputNewName.value.trim()) return

  const newName = inputNewName.value.trim()
  const result = await workspaceStore.renameEntry(targetEntryToRename.value.path, newName)
  isRenameDialogVisible.value = false

  if (result.success) {
    toast.add({ severity: 'success', summary: 'Nama Diubah', detail: result.message, life: 2500 })
  } else {
    toast.add({ severity: 'error', summary: 'Gagal Mengubah Nama', detail: result.message, life: 3000 })
  }
}

// Delete Handlers
function confirmDeleteEntry(entry: FileEntry): void {
  confirm.require({
    message: `Apakah Anda yakin ingin menghapus "${entry.name}" secara permanen?`,
    header: 'Konfirmasi Hapus',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger text-xs',
    rejectClass: 'p-button-secondary text-xs',
    acceptLabel: 'Hapus',
    rejectLabel: 'Batal',
    accept: async () => {
      const result = await workspaceStore.deleteEntry(entry.path)
      if (result.success) {
        toast.add({ severity: 'success', summary: 'Dihapus', detail: `"${entry.name}" berhasil dihapus`, life: 2500 })
      } else {
        toast.add({ severity: 'error', summary: 'Gagal Menghapus', detail: result.message, life: 3000 })
      }
    }
  })
}

// Copy, Duplicate, and Paste Handlers
function handleCopyEntry(entry: FileEntry): void {
  workspaceStore.setCopiedEntry(entry)
  toast.add({
    severity: 'info',
    summary: 'Disalin ke Clipboard',
    detail: `"${entry.name}" siap di-paste`,
    life: 2000
  })
}

async function handleDuplicateEntry(entry: FileEntry): Promise<void> {
  const result = await workspaceStore.duplicateEntry(entry)
  if (result.success) {
    toast.add({ severity: 'success', summary: 'Duplikasi Berhasil', detail: result.message, life: 2500 })
  } else {
    toast.add({ severity: 'error', summary: 'Gagal Menduplikasi', detail: result.message, life: 3000 })
  }
}

async function handlePasteEntry(targetFolderPath?: string): Promise<void> {
  const destinationPath = targetFolderPath || workspaceStore.rootFolderPath
  if (!destinationPath) return

  const result = await workspaceStore.pasteCopiedEntry(destinationPath)
  if (result.success) {
    toast.add({ severity: 'success', summary: 'Paste Berhasil', detail: result.message, life: 2500 })
  } else {
    toast.add({ severity: 'error', summary: 'Gagal Paste', detail: result.message, life: 3000 })
  }
}
</script>

<template>
  <div
    :style="{ width: `${sidebarWidth}px` }"
    class="h-full flex flex-col bg-[#0c111a] rounded-2xl border border-white/[0.08] select-none flex-shrink-0 relative overflow-hidden shadow-sm"
  >
    <!-- Draggable Sidebar Width Handle -->
    <div
      @mousedown="startResize"
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#42b883]/70 transition-colors z-20 group"
      :class="{ 'bg-[#42b883]': isResizing }"
      title="Geser untuk mengatur lebar sidebar"
    ></div>

    <!-- Explorer Header Toolbar -->
    <div class="h-10 px-3 border-b border-white/[0.06] flex items-center justify-between text-xs text-slate-400 font-semibold tracking-wider uppercase bg-[#0c111c]/80 backdrop-blur-md">
      <span class="flex items-center gap-1.5 text-slate-200">
        <UIcon name="i-lucide-folder" class="size-4 text-[#42b883]" />
        <span class="text-[11px] font-bold tracking-wider font-mono">
          {{ workspaceStore.workspaceRoots.length > 1 ? 'DAFTAR PROJECT' : 'EXPLORER' }}
        </span>
        <span
          v-if="workspaceStore.workspaceRoots.length > 1"
          class="px-1.5 py-0.5 rounded-full text-[10px] bg-[#42b883]/20 text-[#42b883] font-mono font-bold leading-none"
        >
          {{ workspaceStore.workspaceRoots.length }}
        </span>
      </span>
      <div v-if="workspaceStore.workspaceRoots.length > 0" class="flex items-center gap-1">
        <button
          v-if="workspaceStore.hasCopiedEntry"
          @click="handlePasteEntry()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-[#42b883] hover:bg-[#42b883]/15 transition-colors cursor-pointer"
          :title="`Paste '${workspaceStore.copiedEntry?.name}' ke Root`"
        >
          <UIcon name="i-lucide-clipboard-paste" class="size-3.5" />
        </button>
        <button
          @click="openCreateFileDialog()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="File Baru di Root"
        >
          <UIcon name="i-lucide-file-plus" class="size-3.5" />
        </button>
        <button
          @click="openCreateFolderDialog()"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Folder Baru di Root"
        >
          <UIcon name="i-lucide-folder-plus" class="size-3.5" />
        </button>
        <button
          @click="handleRefresh"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Refresh Semua Project"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
        </button>
        <button
          @click="handleAddWorkspace"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Tambah Folder Project (Ctrl+Shift+A)..."
        >
          <UIcon name="i-lucide-folder-git-2" class="size-3.5" />
        </button>
        <button
          @click="handleOpenFolder"
          class="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Buka Folder Tunggal (Ganti Project)..."
        >
          <UIcon name="i-lucide-folder-open" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- No Folder Opened State -->
    <div
      v-if="workspaceStore.workspaceRoots.length === 0"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-400 space-y-3"
    >
      <div class="w-14 h-14 rounded-2xl bg-[#42b883]/10 border border-[#42b883]/25 flex items-center justify-center text-[#42b883] shadow-lg shadow-[#42b883]/10">
        <UIcon name="i-lucide-folder-git-2" class="size-7" />
      </div>
      <p class="leading-relaxed text-slate-300 max-w-[200px]">Belum ada folder project yang dibuka.</p>
      <button
        :disabled="isOpening"
        @click="handleOpenFolder"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs font-semibold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-md shadow-[#42b883]/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
      >
        <UIcon v-if="isOpening" name="i-lucide-loader-2" class="size-3.5 animate-spin" />
        <UIcon v-else name="i-lucide-folder-open" class="size-3.5" />
        <span>Buka Folder Project</span>
      </button>
    </div>

    <!-- File Tree Opened State -->
    <div v-else class="flex-1 flex flex-col overflow-hidden">
      <!-- Copied Banner Indicator (Dismissable) -->
      <div
        v-if="workspaceStore.hasCopiedEntry"
        class="px-3 py-1.5 bg-[#42b883]/10 border-b border-[#42b883]/30 flex items-center justify-between text-[11px] text-[#42b883]"
      >
        <div class="flex items-center gap-1.5 truncate">
          <UIcon name="i-lucide-clipboard-copy" class="size-3 text-[#42b883] flex-shrink-0" />
          <span class="truncate">Disalin: <b class="text-slate-100">{{ workspaceStore.copiedEntry?.name }}</b></span>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <button
            @click="handlePasteEntry()"
            class="text-[10px] px-2 py-0.5 rounded-md bg-[#42b883] hover:bg-[#33a06f] text-[#090d14] font-bold transition-colors cursor-pointer"
            title="Paste ke Folder Root"
          >
            Paste
          </button>
          <button
            @click="workspaceStore.clearCopiedEntry()"
            class="text-[10px] w-4 h-4 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-[#131c2a] transition-colors cursor-pointer"
            title="Batal Salin"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
      </div>

      <!-- Single Project Banner & Tree (When only 1 root) -->
      <template v-if="workspaceStore.workspaceRoots.length === 1">
        <div class="px-3 py-2 bg-[#0e1626]/80 border-b border-white/[0.06] flex items-center justify-between text-xs font-semibold text-slate-200 group">
          <div class="flex items-center gap-2 truncate">
            <UIcon name="i-lucide-folder-open" class="size-4 text-[#42b883] flex-shrink-0" />
            <span class="truncate font-mono text-[11px]" :title="workspaceStore.workspaceRoots[0].path">
              {{ workspaceStore.workspaceRoots[0].name }}
            </span>
          </div>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              @click.stop="openCreateFileDialog(workspaceStore.workspaceRoots[0].path)"
              class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
              title="File Baru di Root"
            >
              <UIcon name="i-lucide-file-plus" class="size-3" />
            </button>
            <button
              @click.stop="openCreateFolderDialog(workspaceStore.workspaceRoots[0].path)"
              class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
              title="Folder Baru di Root"
            >
              <UIcon name="i-lucide-folder-plus" class="size-3" />
            </button>
            <button
              @click.stop="handleAddWorkspace"
              class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-white/[0.08]"
              title="Tambah Folder Project Lain..."
            >
              <UIcon name="i-lucide-plus" class="size-3" />
            </button>
          </div>
        </div>

        <div
          class="flex-1 overflow-y-auto overflow-x-hidden py-1"
          @contextmenu.prevent="handleBackgroundContextMenu"
        >
          <FileTreeNode
            v-for="entry in workspaceStore.workspaceRoots[0].entries"
            :key="entry.path"
            :entry="entry"
            :depth="0"
            @openContextMenu="handleOpenContextMenu"
          />
          <div
            v-if="workspaceStore.workspaceRoots[0].entries.length === 0"
            class="px-4 py-2 text-[11px] text-slate-500 italic"
          >
            (Folder project kosong)
          </div>
        </div>
      </template>

      <!-- Multi-Root Project Accordion / Section View (When > 1 roots) -->
      <div
        v-else
        class="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-white/[0.04]"
        @contextmenu.prevent="handleBackgroundContextMenu"
      >
        <div
          v-for="root in workspaceStore.workspaceRoots"
          :key="root.id"
          class="select-none"
        >
          <!-- Root Project Bar -->
          <div
            @click="workspaceStore.toggleRootExpanded(root.path); workspaceStore.activeRootPath = root.path"
            @contextmenu.prevent="handleRootContextMenu($event, root)"
            class="px-2.5 py-1.5 bg-[#0a0f19] hover:bg-white/[0.04] flex items-center justify-between text-xs font-bold text-slate-200 cursor-pointer select-none group transition-colors border-y border-white/[0.04]"
            :class="workspaceStore.activeRootPath === root.path ? 'border-l-2 border-l-[#42b883] bg-[#42b883]/5' : ''"
          >
            <div class="flex items-center gap-1.5 truncate">
              <UIcon
                :name="root.isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-3.5 text-slate-400 group-hover:text-white transition-transform flex-shrink-0"
              />
              <UIcon
                :name="root.isExpanded ? 'i-lucide-folder-open' : 'i-lucide-folder'"
                class="size-3.5 text-[#42b883] flex-shrink-0"
              />
              <span class="truncate font-mono text-[11px] uppercase tracking-wider text-slate-100" :title="root.path">
                {{ root.name }}
              </span>
            </div>

            <!-- Root Action Buttons (Hover) -->
            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button
                @click.stop="openCreateFileDialog(root.path)"
                class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
                title="File Baru di Project Ini"
              >
                <UIcon name="i-lucide-file-plus" class="size-3" />
              </button>
              <button
                @click.stop="openCreateFolderDialog(root.path)"
                class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08]"
                title="Folder Baru di Project Ini"
              >
                <UIcon name="i-lucide-folder-plus" class="size-3" />
              </button>
              <button
                @click.stop="confirmRemoveWorkspace(root)"
                class="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                title="Hapus dari Daftar Project"
              >
                <UIcon name="i-lucide-x" class="size-3" />
              </button>
            </div>
          </div>

          <!-- Root Project File Nodes -->
          <div v-if="root.isExpanded" class="py-0.5 pl-1.5">
            <FileTreeNode
              v-for="entry in root.entries"
              :key="entry.path"
              :entry="entry"
              :depth="0"
              @openContextMenu="handleOpenContextMenu"
            />
            <div
              v-if="root.entries.length === 0"
              class="px-5 py-1 text-[11px] text-slate-500 italic"
            >
              (Folder project kosong)
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Floating Right-Click Context Menu -->
    <div
      v-if="contextMenu.visible"
      :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
      class="fixed z-50 min-w-[210px] bg-[#0c111a]/95 backdrop-blur-md border border-[#35495e]/70 rounded-xl shadow-2xl py-1 text-xs text-slate-200 select-none animate-in fade-in zoom-in-95 duration-75"
      @click.stop
    >
      <!-- Item header info -->
      <div v-if="contextMenu.targetEntry" class="px-3 py-1.5 border-b border-[#35495e]/40 text-[11px] text-slate-400 font-medium flex items-center gap-1.5 truncate">
        <i :class="[getFileIconClass(contextMenu.targetEntry.name, contextMenu.targetEntry.isDirectory), 'text-xs flex-shrink-0']"></i>
        <span class="truncate font-semibold text-slate-200">{{ contextMenu.targetEntry.name }}</span>
      </div>

      <!-- Context Menu for Folder -->
      <template v-if="contextMenu.targetEntry?.isDirectory">
        <button
          @click="openCreateFileDialog(contextMenu.targetEntry.path); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-file-plus" class="size-3.5 text-[#42b883]" /> File Baru...</span>
        </button>
        <button
          @click="openCreateFolderDialog(contextMenu.targetEntry.path); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-folder-plus" class="size-3.5 text-[#42b883]" /> Folder Baru...</span>
        </button>
        <div class="my-1 border-t border-white/[0.06]"></div>
        <button
          @click="handleCopyEntry(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-copy" class="size-3.5" /> Salin Folder</span>
          <span class="text-[10px] text-slate-500">Ctrl+C</span>
        </button>
        <button
          @click="handleDuplicateEntry(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-copy-plus" class="size-3.5" /> Duplikat Folder</span>
        </button>
        <button
          v-if="workspaceStore.hasCopiedEntry"
          @click="handlePasteEntry(contextMenu.targetEntry.path); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-clipboard-paste" class="size-3.5" /> Paste ke Folder Ini</span>
          <span class="text-[10px] text-slate-500">Ctrl+V</span>
        </button>
        <div class="my-1 border-t border-white/[0.06]"></div>
        <button
          @click="openRenameDialog(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-pencil" class="size-3.5" /> Ubah Nama</span>
          <span class="text-[10px] text-slate-500">F2</span>
        </button>
        <button
          @click="confirmDeleteEntry(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-rose-600 hover:text-white text-rose-400 text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-trash-2" class="size-3.5" /> Hapus Folder</span>
          <span class="text-[10px] text-slate-500">Del</span>
        </button>
      </template>

      <!-- Context Menu for File -->
      <template v-else-if="contextMenu.targetEntry && !contextMenu.targetEntry.isDirectory">
        <button
          @click="workspaceStore.openFile(contextMenu.targetEntry.path, contextMenu.targetEntry.name); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-file-text" class="size-3.5" /> Buka di Editor</span>
        </button>
        <div class="my-1 border-t border-white/[0.06]"></div>
        <button
          @click="handleCopyEntry(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-copy" class="size-3.5" /> Salin Berkas</span>
          <span class="text-[10px] text-slate-500">Ctrl+C</span>
        </button>
        <button
          @click="handleDuplicateEntry(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-copy-plus" class="size-3.5" /> Duplikat Berkas</span>
        </button>
        <button
          v-if="workspaceStore.hasCopiedEntry"
          @click="handlePasteEntry(workspaceStore.getParentDirectoryPath(contextMenu.targetEntry.path)); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-clipboard-paste" class="size-3.5" /> Paste di Folder Ini</span>
          <span class="text-[10px] text-slate-500">Ctrl+V</span>
        </button>
        <div class="my-1 border-t border-white/[0.06]"></div>
        <button
          @click="openRenameDialog(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-pencil" class="size-3.5" /> Ubah Nama</span>
          <span class="text-[10px] text-slate-500">F2</span>
        </button>
        <button
          @click="confirmDeleteEntry(contextMenu.targetEntry); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-rose-600 hover:text-white text-rose-400 text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-trash-2" class="size-3.5" /> Hapus Berkas</span>
          <span class="text-[10px] text-slate-500">Del</span>
        </button>
      </template>

      <!-- Context Menu for Root Project Section -->
      <template v-else-if="contextMenu.targetRoot">
        <div class="px-3 py-1.5 border-b border-[#35495e]/40 text-[11px] text-slate-400 font-medium flex items-center gap-1.5 truncate">
          <UIcon name="i-lucide-folder" class="size-3.5 text-[#42b883] flex-shrink-0" />
          <span class="truncate font-semibold text-slate-200">{{ contextMenu.targetRoot.name }}</span>
        </div>
        <button
          @click="openCreateFileDialog(contextMenu.targetRoot.path); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-file-plus" class="size-3.5 text-[#42b883]" /> File Baru di {{ contextMenu.targetRoot.name }}...</span>
        </button>
        <button
          @click="openCreateFolderDialog(contextMenu.targetRoot.path); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-folder-plus" class="size-3.5 text-[#42b883]" /> Folder Baru di {{ contextMenu.targetRoot.name }}...</span>
        </button>
        <button
          v-if="workspaceStore.hasCopiedEntry"
          @click="handlePasteEntry(contextMenu.targetRoot.path); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-clipboard-paste" class="size-3.5" /> Paste ke {{ contextMenu.targetRoot.name }}</span>
          <span class="text-[10px] text-slate-500">Ctrl+V</span>
        </button>
        <div class="my-1 border-t border-white/[0.06]"></div>
        <button
          @click="confirmRemoveWorkspace(contextMenu.targetRoot); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-rose-600 hover:text-white text-rose-400 text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-folder-minus" class="size-3.5" /> Hapus dari Daftar Project</span>
        </button>
      </template>

      <!-- Context Menu for Empty Background Space -->
      <template v-else-if="contextMenu.isBackground">
        <button
          @click="openCreateFileDialog(); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-file-plus" class="size-3.5 text-[#42b883]" /> File Baru di Root...</span>
        </button>
        <button
          @click="openCreateFolderDialog(); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-folder-plus" class="size-3.5 text-[#42b883]" /> Folder Baru di Root...</span>
        </button>
        <button
          v-if="workspaceStore.hasCopiedEntry"
          @click="handlePasteEntry(); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-clipboard-paste" class="size-3.5" /> Paste ke Root</span>
          <span class="text-[10px] text-slate-500">Ctrl+V</span>
        </button>
        <div class="my-1 border-t border-white/[0.06]"></div>
        <button
          @click="handleRefresh(); closeContextMenu()"
          class="w-full px-3 py-1.5 flex items-center justify-between hover:bg-[#42b883]/15 hover:text-[#42b883] text-left transition-colors cursor-pointer"
        >
          <span class="flex items-center gap-2"><UIcon name="i-lucide-refresh-cw" class="size-3.5" /> Refresh Pohon File</span>
        </button>
      </template>
    </div>

    <!-- Dialog: Buat File Baru -->
    <Dialog
      v-model:visible="isCreateFileDialogVisible"
      header="Buat File Baru"
      modal
      :style="{ width: '380px' }"
      :pt="{
        root: { class: 'bg-[#0c111a] border border-[#35495e]/70 text-slate-100 rounded-xl p-0 overflow-hidden shadow-2xl' },
        header: { class: 'p-3 border-b border-[#35495e]/40 text-sm font-semibold text-[#42b883]' },
        content: { class: 'p-4' }
      }"
    >
      <div class="space-y-3">
        <p class="text-xs text-slate-400">Ketik nama file lengkap beserta ekstensinya (misal: <code>index.php</code>, <code>style.css</code>):</p>
        <InputText
          v-model="inputNewName"
          placeholder="contoh: handler.php"
          class="w-full bg-[#090d14] border border-[#35495e]/60 focus:border-[#42b883] text-xs p-2 rounded-lg text-slate-100"
          autofocus
          @keydown.enter="submitCreateFile"
        />
        <div class="flex items-center justify-end gap-2 pt-2">
          <Button label="Batal" text size="small" @click="isCreateFileDialogVisible = false" class="text-xs text-slate-400" />
          <Button label="Buat File" size="small" @click="submitCreateFile" class="bg-gradient-to-r from-[#42b883] to-[#33a06f] hover:from-[#33a06f] hover:to-[#2a9464] border-none text-[#090d14] font-bold text-xs px-3 py-1.5 rounded-lg" />
        </div>
      </div>
    </Dialog>

    <!-- Dialog: Buat Folder Baru -->
    <Dialog
      v-model:visible="isCreateFolderDialogVisible"
      header="Buat Folder Baru"
      modal
      :style="{ width: '380px' }"
      :pt="{
        root: { class: 'bg-[#0c111a] border border-[#35495e]/70 text-slate-100 rounded-xl p-0 overflow-hidden shadow-2xl' },
        header: { class: 'p-3 border-b border-[#35495e]/40 text-sm font-semibold text-[#42b883]' },
        content: { class: 'p-4' }
      }"
    >
      <div class="space-y-3">
        <p class="text-xs text-slate-400">Ketik nama folder baru:</p>
        <InputText
          v-model="inputNewName"
          placeholder="contoh: controllers"
          class="w-full bg-[#090d14] border border-[#35495e]/60 focus:border-[#42b883] text-xs p-2 rounded-lg text-slate-100"
          autofocus
          @keydown.enter="submitCreateFolder"
        />
        <div class="flex items-center justify-end gap-2 pt-2">
          <Button label="Batal" text size="small" @click="isCreateFolderDialogVisible = false" class="text-xs text-slate-400" />
          <Button label="Buat Folder" size="small" @click="submitCreateFolder" class="bg-gradient-to-r from-[#42b883] to-[#33a06f] hover:from-[#33a06f] hover:to-[#2a9464] border-none text-[#090d14] font-bold text-xs px-3 py-1.5 rounded-lg" />
        </div>
      </div>
    </Dialog>

    <!-- Dialog: Rename -->
    <Dialog
      v-model:visible="isRenameDialogVisible"
      header="Ubah Nama"
      modal
      :style="{ width: '380px' }"
      :pt="{
        root: { class: 'bg-[#0c111a] border border-[#35495e]/70 text-slate-100 rounded-xl p-0 overflow-hidden shadow-2xl' },
        header: { class: 'p-3 border-b border-[#35495e]/40 text-sm font-semibold text-[#42b883]' },
        content: { class: 'p-4' }
      }"
    >
      <div class="space-y-3">
        <p class="text-xs text-slate-400">Masukkan nama baru untuk <code>{{ targetEntryToRename?.name }}</code>:</p>
        <InputText
          v-model="inputNewName"
          class="w-full bg-[#090d14] border border-[#35495e]/60 focus:border-[#42b883] text-xs p-2 rounded-lg text-slate-100"
          autofocus
          @keydown.enter="submitRename"
        />
        <div class="flex items-center justify-end gap-2 pt-2">
          <Button label="Batal" text size="small" @click="isRenameDialogVisible = false" class="text-xs text-slate-400" />
          <Button label="Simpan Perubahan" size="small" @click="submitRename" class="bg-gradient-to-r from-[#42b883] to-[#33a06f] hover:from-[#33a06f] hover:to-[#2a9464] border-none text-[#090d14] font-bold text-xs px-3 py-1.5 rounded-lg" />
        </div>
      </div>
    </Dialog>
  </div>
</template>
