<template>
  <div class="h-full w-full bg-[#060910] text-slate-100 flex flex-col overflow-hidden select-none p-2 gap-2">
    <!-- Header Utama UI Builder (Floating Rounded Card) -->
    <header class="h-13 rounded-2xl border border-white/10 px-4 bg-[#0e1626]/90 backdrop-blur-xl flex items-center justify-between flex-shrink-0 shadow-lg">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
          <UIcon name="i-lucide-layers" class="w-4 h-4" />
        </div>
        <div>
          <div class="text-xs font-bold text-slate-100 flex items-center gap-2">
            <span>UI Builder</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Screenshot to Code
            </span>
          </div>
          <div class="text-[10px] text-slate-400">Slicing AI Multimodal untuk Makarya IDE</div>
        </div>
      </div>

      <!-- Controls Tengah: Tab Tampilan (Pill Membulat Sempurna) -->
      <div class="flex items-center gap-2.5">
        <div class="flex items-center bg-[#090d14] p-1 rounded-full border border-white/10 shadow-inner">
          <button
            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer"
            :class="store.activeTab === 'preview' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
            @click="store.activeTab = 'preview'"
          >
            <UIcon name="i-lucide-eye" class="w-3.5 h-3.5" />
            <span>Live Preview</span>
          </button>
          <button
            class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer"
            :class="store.activeTab === 'code' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' : 'text-slate-400 hover:text-slate-200 border border-transparent'"
            @click="store.activeTab = 'code'"
          >
            <UIcon name="i-lucide-code-2" class="w-3.5 h-3.5" />
            <span>Source Code</span>
          </button>
        </div>
      </div>

      <!-- Actions Kanan: Simpan ke Project & Reset -->
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer shadow-sm"
          @click="openResetConfirm"
        >
          <UIcon name="i-lucide-rotate-ccw" class="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>

        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!store.hasGeneratedCode || isSaving"
          @click="openSaveModal"
        >
          <UIcon :name="isSaving ? 'i-lucide-loader-2' : 'i-lucide-save'" :class="['w-3.5 h-3.5', isSaving ? 'animate-spin' : '']" />
          <span>Simpan ke Project</span>
        </button>
      </div>
    </header>

    <!-- Main Workspace Splitter (Rounded Left & Right Cards) -->
    <div class="flex-1 flex gap-2 overflow-hidden">
      <!-- Panel Kiri: Input & Chat Slicing -->
      <div class="w-[390px] rounded-2xl border border-white/10 flex flex-col bg-[#090d14]/90 backdrop-blur-xl flex-shrink-0 overflow-hidden shadow-xl">
        <!-- Area Upload Screenshot -->
        <div class="p-3 border-b border-white/10 flex-shrink-0">
          <DropzoneInput />
        </div>

        <!-- Chat History & Prompt Panel -->
        <div class="flex-1 overflow-hidden">
          <SlicingChatPanel />
        </div>
      </div>

      <!-- Panel Kanan: Live Preview atau Monaco Source Code -->
      <div class="flex-1 rounded-2xl border border-white/10 overflow-hidden bg-[#070b12] shadow-2xl flex flex-col">
        <LivePreviewPane v-if="store.activeTab === 'preview'" />
        <CodeViewPane v-else />
      </div>
    </div>

    <!-- Modal Konfirmasi Reset Membulat Modern -->
    <UModal v-model:open="showResetModal">
      <template #content>
        <div class="p-5 bg-[#0d131f] rounded-2xl border border-white/10 flex flex-col gap-4 shadow-2xl max-w-md w-full">
          <div class="flex items-start gap-3.5">
            <div class="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400 flex-shrink-0 shadow-inner">
              <UIcon name="i-lucide-alert-triangle" class="w-5 h-5" />
            </div>
            <div class="flex-1">
              <h3 class="text-sm font-bold text-white mb-1">Reset Percakapan & Canvas?</h3>
              <p class="text-xs text-slate-400 leading-relaxed">
                Tindakan ini akan menghapus seluruh riwayat percakapan chat, lampiran berkas gambar/HTML, serta kode komponen di canvas. Anda akan memulai sesi UI Builder dari awal.
              </p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              class="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
              @click="showResetModal = false"
            >
              Batal
            </button>
            <button
              type="button"
              class="px-4 py-1.5 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-all shadow-md shadow-rose-600/20 cursor-pointer flex items-center gap-1.5"
              @click="confirmReset"
            >
              <UIcon name="i-lucide-rotate-ccw" class="w-3.5 h-3.5" />
              <span>Ya, Reset Semua</span>
            </button>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Modal Simpan Berkas ke Path Project Membulat Modern -->
    <UModal v-model:open="showSaveModal">
      <template #content>
        <div class="p-5 bg-[#0d131f] rounded-2xl border border-white/10 flex flex-col gap-4 shadow-2xl max-w-lg w-full">
          <!-- Header Modal -->
          <div class="flex items-center justify-between pb-2 border-b border-white/10">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                <UIcon name="i-lucide-save" class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-sm font-bold text-white">Simpan Berkas Komponen</h3>
                <p class="text-[11px] text-slate-400">Tentukan lokasi dan nama file penyimpanan di workspace</p>
              </div>
            </div>
            <button
              type="button"
              class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              @click="showSaveModal = false"
            >
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </button>
          </div>

          <!-- Form Input Lokasi & Nama Berkas -->
          <div class="space-y-3">
            <!-- Pilihan Workspace Roots yang sedang aktif jika ada -->
            <div v-if="workspaceStore.workspaceRoots.length > 0" class="space-y-1.5">
              <label class="text-[11px] font-medium text-slate-300">Pilih Folder Workspace Aktif:</label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="root in workspaceStore.workspaceRoots"
                  :key="root.id"
                  type="button"
                  class="px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1.5 cursor-pointer"
                  :class="targetDirectory === root.path
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200 border-white/10'"
                  @click="targetDirectory = root.path"
                >
                  <UIcon name="i-lucide-folder" class="w-3 h-3" />
                  <span class="truncate max-w-[180px]">{{ root.name }}</span>
                </button>
              </div>
            </div>

            <!-- Input Path Direktori Tujuan -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-slate-300">Folder Lokasi Penyimpanan:</label>
              <div class="flex items-center gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="targetDirectory"
                    type="text"
                    placeholder="Contoh: D:/Project/MyApp/src"
                    class="w-full bg-[#131d2e] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none font-mono placeholder-slate-500 shadow-inner"
                  />
                </div>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
                  title="Pilih folder dari File Explorer OS"
                  @click="browseFolder"
                >
                  <UIcon name="i-lucide-folder-open" class="w-3.5 h-3.5 text-amber-400" />
                  <span>Pilih Folder...</span>
                </button>
              </div>
            </div>

            <!-- Input Nama Berkas -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-slate-300">Nama Berkas:</label>
              <div class="relative">
                <input
                  v-model="saveFileName"
                  type="text"
                  placeholder="Contoh: index.html atau Component.vue"
                  class="w-full bg-[#131d2e] border border-white/10 focus:border-emerald-500/50 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none font-mono placeholder-slate-500 shadow-inner"
                />
              </div>
            </div>

            <!-- Preview Path Lengkap -->
            <div class="p-2.5 rounded-xl bg-[#080d16] border border-white/5 text-[11px] space-y-1">
              <span class="text-slate-400 text-[10px] uppercase tracking-wider font-semibold block">Pratinjau Path Lengkap:</span>
              <div class="font-mono text-emerald-400 break-all select-text">
                {{ fullResolvedPath }}
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/5">
            <button
              type="button"
              class="px-3.5 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
              @click="showSaveModal = false"
            >
              Batal
            </button>
            <button
              type="button"
              class="px-4 py-1.5 rounded-xl text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isSaving || !saveFileName.trim() || !targetDirectory.trim()"
              @click="executeSaveFile"
            >
              <UIcon :name="isSaving ? 'i-lucide-loader-2' : 'i-lucide-check'" :class="['w-3.5 h-3.5', isSaving ? 'animate-spin' : '']" />
              <span>{{ isSaving ? 'Menyimpan...' : 'Simpan Berkas' }}</span>
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import DropzoneInput from './DropzoneInput.vue'
import SlicingChatPanel from './SlicingChatPanel.vue'
import LivePreviewPane from './LivePreviewPane.vue'
import CodeViewPane from './CodeViewPane.vue'

const store = useUiBuilderStore()
const workspaceStore = useWorkspaceStore()
const toast = useToast()

const isSaving = ref(false)
const showResetModal = ref(false)
const showSaveModal = ref(false)

const targetDirectory = ref<string>('')
const saveFileName = ref<string>('GeneratedComponent.html')

const fullResolvedPath = computed(() => {
  const dir = (targetDirectory.value || '').trim().replace(/\\/g, '/').replace(/\/+$/, '')
  const file = (saveFileName.value || '').trim()
  if (!dir && !file) return '-'
  if (!dir) return file
  return `${dir}/${file}`
})

function openResetConfirm(): void {
  showResetModal.value = true
}

function confirmReset(): void {
  store.resetAll()
  showResetModal.value = false
  toast.add({
    severity: 'info',
    summary: 'Sesi Direset',
    detail: 'Percakapan dan canvas berhasil dibersihkan.',
    life: 2000
  })
}

function openSaveModal(): void {
  if (!store.hasGeneratedCode) return
  // Default target directory to workspace active root or first workspace
  const defaultDir = workspaceStore.activeRootPath || workspaceStore.rootFolderPath || ''
  targetDirectory.value = defaultDir

  // Default file name based on output stack
  const ext = store.outputStack === 'vue-sfc' ? '.vue' : '.html'
  if (store.attachedHtml?.name) {
    saveFileName.value = store.attachedHtml.name
  } else {
    saveFileName.value = `GeneratedComponent${ext}`
  }

  showSaveModal.value = true
}

async function browseFolder(): Promise<void> {
  if (window.makaryaAPI?.openFolderDialog) {
    try {
      const res = await window.makaryaAPI.openFolderDialog()
      if (!res.canceled && res.folderPath) {
        targetDirectory.value = res.folderPath
      }
    } catch (err) {
      console.warn('Gagal membuka dialog folder:', err)
    }
  }
}

async function executeSaveFile(): Promise<void> {
  if (isSaving.value || !store.hasGeneratedCode) return
  if (!targetDirectory.value.trim() || !saveFileName.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Periksa Input',
      detail: 'Folder tujuan dan nama berkas harus diisi.',
      life: 3000
    })
    return
  }

  isSaving.value = true
  try {
    const result = await store.saveActiveCodeToWorkspace({
      fileName: saveFileName.value.trim(),
      targetDirectory: targetDirectory.value.trim()
    })

    if (result.success && result.fullPath) {
      if (workspaceStore.workspaceRoots && workspaceStore.workspaceRoots.length === 0 && targetDirectory.value.trim() && typeof workspaceStore.addWorkspaceRoot === 'function') {
        await workspaceStore.addWorkspaceRoot(targetDirectory.value.trim())
      }
      if (typeof workspaceStore.recordRecentFile === 'function') {
        workspaceStore.recordRecentFile(result.fullPath, result.fileName || saveFileName.value.trim())
      }
      if (typeof workspaceStore.refreshFileTree === 'function') {
        await workspaceStore.refreshFileTree()
      }

      showSaveModal.value = false
      toast.add({
        severity: 'success',
        summary: 'Berkas Tersimpan',
        detail: `Berkas berhasil disimpan ke: ${result.fullPath}`,
        life: 3000
      })

      store.addChatMessage({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Komponen berhasil disimpan!\nLokasi berkas:\n\`${result.fullPath}\``,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })
    } else {
      toast.add({
        severity: 'error',
        summary: 'Gagal Menyimpan',
        detail: result.error || 'Terjadi kesalahan saat menyimpan berkas.',
        life: 3500
      })
    }
  } finally {
    isSaving.value = false
  }
}
</script>
