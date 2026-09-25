<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { useWorkspaceStore, type RegisteredApp } from '@renderer/stores/workspaceStore'

const workspaceStore = useWorkspaceStore()
const toast = useToast()

const isAddMenuOpen = ref(false)
const isLaunchingId = ref<string | null>(null)
const isStoppingId = ref<string | null>(null)
const runningAppIds = ref<Set<string>>(new Set())

let cleanupStatusListener: (() => void) | null = null

async function refreshRunningApps(): Promise<void> {
  if (window.makaryaAPI?.getRunningApps) {
    try {
      const activeIds = await window.makaryaAPI.getRunningApps()
      runningAppIds.value = new Set(activeIds || [])
    } catch (err) {
      console.warn('Gagal memuat status program berjalan:', err)
    }
  }
}

onMounted(() => {
  refreshRunningApps()
  if (window.makaryaAPI?.onAppStatusChange) {
    cleanupStatusListener = window.makaryaAPI.onAppStatusChange(({ appId, isRunning }) => {
      if (isRunning) {
        runningAppIds.value.add(appId)
      } else {
        runningAppIds.value.delete(appId)
      }
    })
  }
})

onUnmounted(() => {
  cleanupStatusListener?.()
})

watch(
  () => workspaceStore.isWindowSwitcherVisible,
  (visible) => {
    if (visible) {
      refreshRunningApps()
    }
  }
)

async function handleOpenNewMakaryaWindow(): Promise<void> {
  isAddMenuOpen.value = false
  if (window.makaryaAPI?.openNewWindow) {
    try {
      const res = await window.makaryaAPI.openNewWindow()
      if (res.success) {
        toast.add({
          severity: 'success',
          summary: 'Jendela Baru Dibuka',
          detail: 'Jendela Makarya IDE baru berhasil diluncurkan.',
          life: 3000
        })
        workspaceStore.refreshActiveWindows()
      }
    } catch (err: any) {
      toast.add({
        severity: 'error',
        summary: 'Gagal Membuka Jendela',
        detail: err?.message || 'Terjadi kesalahan sistem saat membuka jendela baru.',
        life: 3500
      })
    }
  }
}

async function handlePickAndRegisterExe(): Promise<void> {
  isAddMenuOpen.value = false
  if (window.makaryaAPI?.pickExeFile) {
    try {
      const res = await window.makaryaAPI.pickExeFile()
      if (!res.canceled && res.filePath && res.fileName) {
        // Bersihkan ekstensi .exe untuk display name
        const cleanName = res.fileName.replace(/\.exe$/i, '')
        await workspaceStore.addRegisteredApp({
          name: cleanName,
          exePath: res.filePath
        })
        toast.add({
          severity: 'success',
          summary: 'Program Ditambahkan',
          detail: `${res.fileName} berhasil disimpan ke daftar peluncur.`,
          life: 3000
        })
      }
    } catch (err: any) {
      toast.add({
        severity: 'error',
        summary: 'Gagal Memilih Program',
        detail: err?.message || 'Terjadi kendala saat memilih berkas .exe.',
        life: 3500
      })
    }
  }
}

async function handleLaunchExe(app: RegisteredApp): Promise<void> {
  // Guard: Jika program sudah berjalan, jangan jalankan dobel
  if (runningAppIds.value.has(app.id)) {
    toast.add({
      severity: 'info',
      summary: 'Program Sedang Aktif',
      detail: `${app.name} sudah berjalan. Tekan tombol "Stop Program" untuk menutupnya.`,
      life: 2500
    })
    return
  }

  if (window.makaryaAPI?.launchExe) {
    isLaunchingId.value = app.id
    try {
      const res = await window.makaryaAPI.launchExe(app.exePath, app.id)
      if (res.success) {
        runningAppIds.value.add(app.id)
        toast.add({
          severity: 'success',
          summary: 'Program Diluncurkan',
          detail: `${app.name} sedang berjalan.`,
          life: 2500
        })
      } else {
        toast.add({
          severity: 'error',
          summary: 'Gagal Menjalankan Program',
          detail: res.error || 'Aplikasi tidak dapat dieksekusi.',
          life: 4000
        })
      }
    } catch (err: any) {
      toast.add({
        severity: 'error',
        summary: 'Kesalahan Sistem',
        detail: err?.message || 'Gagal meluncurkan berkas .exe.',
        life: 4000
      })
    } finally {
      setTimeout(() => {
        isLaunchingId.value = null
      }, 500)
    }
  }
}

async function handleStopExe(event: Event, app: RegisteredApp): Promise<void> {
  event.stopPropagation()
  if (window.makaryaAPI?.stopExe) {
    isStoppingId.value = app.id
    try {
      const res = await window.makaryaAPI.stopExe(app.id)
      if (res.success) {
        runningAppIds.value.delete(app.id)
        toast.add({
          severity: 'warn',
          summary: 'Program Ditutup',
          detail: `${app.name} telah dihentikan.`,
          life: 2500
        })
      } else {
        toast.add({
          severity: 'error',
          summary: 'Gagal Menghentikan Program',
          detail: res.error || 'Tidak dapat mematikan proses aplikasi.',
          life: 3500
        })
      }
    } catch (err: any) {
      console.error('Stop exe error:', err)
    } finally {
      isStoppingId.value = null
    }
  }
}

function handleFocusWindow(windowId: number): void {
  if (window.makaryaAPI?.focusWindow) {
    window.makaryaAPI.focusWindow(windowId)
    workspaceStore.closeWindowSwitcher()
  }
}

async function handleRemoveApp(event: Event, appId: string): Promise<void> {
  event.stopPropagation()
  await workspaceStore.removeRegisteredApp(appId)
  toast.add({
    severity: 'info',
    summary: 'Dihapus',
    detail: 'Program telah dihapus dari daftar bingkai.',
    life: 2000
  })
}
</script>

<template>
  <Dialog
    v-model:visible="workspaceStore.isWindowSwitcherVisible"
    modal
    :closable="false"
    :dismissableMask="true"
    :style="{ width: '880px', maxWidth: '94vw' }"
    :pt="{
      root: {
        class: 'relative bg-[#0b101b]/95 backdrop-blur-2xl border border-white/[0.12] text-slate-100 rounded-3xl shadow-[0_30px_70px_-15px_rgba(0,0,0,0.9)] p-0 overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300'
      },
      mask: {
        class: 'bg-black/70 backdrop-blur-md transition-all duration-300'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Glow Line -->
    <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-indigo-500/80 to-transparent"></div>

    <!-- Modal Header (Windows Task View Style) -->
    <div class="px-6 py-4.5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm">
          <UIcon name="i-lucide-layout-grid" class="size-5" />
        </div>
        <div>
          <h3 class="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <span>Task View & Multi-Window Hub</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              Win+Tab Mode
            </span>
          </h3>
          <p class="text-xs text-slate-400 mt-0.5">
            Buka jendela Makarya IDE baru atau daftarkan & jalankan file .exe eksternal
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-[10px] text-slate-400 bg-white/[0.04] border border-white/[0.08] px-2.5 py-1 rounded-lg font-mono">
          Ctrl+Shift+N
        </span>
        <button
          @click="workspaceStore.closeWindowSwitcher"
          class="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          title="Tutup (Esc)"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
    </div>

    <!-- Modal Body: Task View Card Frames -->
    <div class="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
      <!-- Section 1: Active Makarya IDE Windows -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
            <UIcon name="i-lucide-app-window" class="size-3.5 text-[#42b883]" />
            <span>Jendela Makarya IDE Aktif</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-400 font-mono">
              {{ workspaceStore.activeWindows.length || 1 }}
            </span>
          </h4>
          <button
            @click="workspaceStore.refreshActiveWindows"
            class="text-[11px] text-slate-400 hover:text-[#42b883] flex items-center gap-1 transition-colors cursor-pointer"
            title="Segarkan daftar jendela"
          >
            <UIcon name="i-lucide-refresh-cw" class="size-3" />
            <span>Segarkan</span>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          <!-- Fallback or Active Window Cards -->
          <div
            v-for="(win, idx) in (workspaceStore.activeWindows.length > 0 ? workspaceStore.activeWindows : [{ id: 1, title: 'Makarya IDE (Jendela Utama)', isFocused: true }])"
            :key="win.id"
            @click="handleFocusWindow(win.id)"
            class="group relative rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] hover:border-[#42b883]/50 p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden"
          >
            <!-- Miniature Window Frame Preview Graphic -->
            <div class="w-full h-20 rounded-xl bg-[#070b12] border border-white/[0.06] p-2 flex flex-col justify-between mb-3 overflow-hidden group-hover:border-[#42b883]/30 transition-colors">
              <div class="flex items-center justify-between border-b border-white/[0.06] pb-1.5">
                <div class="flex items-center gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-rose-500/70"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-amber-500/70"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-emerald-500/70"></div>
                </div>
                <div class="text-[8px] text-slate-500 font-mono truncate max-w-[120px]">
                  Makarya Window #{{ idx + 1 }}
                </div>
              </div>
              <div class="space-y-1">
                <div class="h-1.5 w-3/4 rounded bg-white/[0.08]"></div>
                <div class="h-1.5 w-1/2 rounded bg-[#42b883]/20"></div>
                <div class="h-1.5 w-5/6 rounded bg-white/[0.04]"></div>
              </div>
            </div>

            <!-- Window Info & Indicator -->
            <div class="flex items-center justify-between">
              <div class="min-w-0 pr-2">
                <h5 class="text-xs font-semibold text-slate-200 truncate group-hover:text-white transition-colors">
                  {{ win.title || `Makarya Window #${idx + 1}` }}
                </h5>
                <span class="text-[10px] text-slate-500 font-mono">ID: {{ win.id }}</span>
              </div>
              <span
                v-if="win.isFocused"
                class="text-[9px] px-1.5 py-0.5 rounded-md font-mono bg-[#42b883]/15 text-[#42b883] border border-[#42b883]/30 flex items-center gap-1 flex-shrink-0"
              >
                <span class="w-1 h-1 rounded-full bg-[#42b883] animate-pulse"></span>
                <span>Fokus</span>
              </span>
              <span
                v-else
                class="text-[9px] px-1.5 py-0.5 rounded-md font-mono bg-white/[0.04] text-slate-400 border border-white/[0.08] flex-shrink-0"
              >
                Beralih
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Registered .exe Applications & "+ Add" Frame -->
      <div class="space-y-3 pt-2">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2 font-mono">
            <UIcon name="i-lucide-box" class="size-3.5 text-indigo-400" />
            <span>Program & Aplikasi (.exe) Terdaftar</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-400 font-mono">
              {{ workspaceStore.registeredApps.length }}
            </span>
          </h4>
          <span class="text-[11px] text-slate-500 font-mono">Tersimpan di SQLite Lokal</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          <!-- Registered App Cards -->
          <div
            v-for="app in workspaceStore.registeredApps"
            :key="app.id"
            @click="handleLaunchExe(app)"
            class="group relative rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border p-4 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between overflow-hidden"
            :class="runningAppIds.has(app.id)
              ? 'border-emerald-500/40 bg-emerald-500/[0.03] shadow-emerald-500/5'
              : 'border-white/[0.08] hover:border-indigo-500/50'"
          >
            <!-- Top App Header -->
            <div class="flex items-start justify-between mb-3">
              <div
                class="w-10 h-10 rounded-xl border flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs"
                :class="runningAppIds.has(app.id)
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                  : 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-500/30 text-indigo-400'"
              >
                <UIcon name="i-lucide-binary" class="size-5" />
              </div>

              <div class="flex items-center gap-1.5">
                <!-- Status Badge Active / Running -->
                <span
                  v-if="runningAppIds.has(app.id)"
                  class="text-[9px] px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-xs"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>Aktif</span>
                </span>

                <!-- Delete Button (Hanya jika sedang tidak berjalan) -->
                <button
                  v-if="!runningAppIds.has(app.id)"
                  @click="handleRemoveApp($event, app.id)"
                  class="w-6 h-6 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  title="Hapus dari daftar"
                >
                  <UIcon name="i-lucide-trash-2" class="size-3.5" />
                </button>
              </div>
            </div>

            <!-- App Details -->
            <div class="space-y-1">
              <h5 class="text-xs font-bold text-slate-200 truncate group-hover:text-white transition-colors flex items-center gap-1.5">
                <span>{{ app.name }}</span>
                <span class="text-[8px] font-mono px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 uppercase">EXE</span>
              </h5>
              <p class="text-[10px] text-slate-500 truncate font-mono" :title="app.exePath">
                {{ app.exePath }}
              </p>
            </div>

            <!-- Card Action Footer -->
            <div class="mt-3.5 pt-2.5 border-t border-white/[0.06]">
              <!-- Tombol STOP saat program sedang aktif/berjalan -->
              <div v-if="runningAppIds.has(app.id)" class="w-full">
                <button
                  @click.stop="handleStopExe($event, app)"
                  class="w-full py-1.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 hover:border-rose-500/60 text-rose-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95 group/stop"
                >
                  <UIcon
                    :name="isStoppingId === app.id ? 'i-lucide-loader-2' : 'i-lucide-square'"
                    class="size-3 text-rose-400 fill-rose-400 group-hover/stop:scale-110 transition-transform"
                    :class="{ 'animate-spin': isStoppingId === app.id }"
                  />
                  <span>{{ isStoppingId === app.id ? 'Menutup Program...' : 'Stop Program' }}</span>
                </button>
              </div>

              <!-- Tombol Launch saat program sedang idle -->
              <div v-else class="flex items-center justify-between">
                <span class="text-[10px] text-slate-400 flex items-center gap-1 group-hover:text-indigo-300 transition-colors">
                  <UIcon
                    :name="isLaunchingId === app.id ? 'i-lucide-loader-2' : 'i-lucide-play'"
                    class="size-3 text-indigo-400"
                    :class="{ 'animate-spin': isLaunchingId === app.id }"
                  />
                  <span>{{ isLaunchingId === app.id ? 'Meluncurkan...' : 'Klik untuk Jalankan' }}</span>
                </span>
                <UIcon name="i-lucide-external-link" class="size-3 text-slate-500 group-hover:text-white transition-colors" />
              </div>
            </div>
          </div>

          <!-- BINGKAI TAMBAH (+) KHAS WINDOWS TAB (Task View New Frame) -->
          <div class="relative">
            <button
              @click="isAddMenuOpen = !isAddMenuOpen"
              class="w-full h-full min-h-[140px] rounded-2xl border-2 border-dashed border-white/[0.12] hover:border-indigo-400/60 bg-white/[0.01] hover:bg-indigo-500/[0.04] p-4 flex flex-col items-center justify-center gap-2.5 transition-all duration-200 cursor-pointer group text-center"
            >
              <div class="w-10 h-10 rounded-2xl bg-white/[0.04] group-hover:bg-indigo-500/20 border border-white/[0.08] group-hover:border-indigo-500/40 flex items-center justify-center text-slate-400 group-hover:text-indigo-300 transition-all shadow-xs group-hover:scale-110">
                <UIcon name="i-lucide-plus" class="size-5 font-bold" />
              </div>
              <div class="space-y-0.5">
                <span class="text-xs font-semibold text-slate-300 group-hover:text-white transition-colors block">
                  Tambah Bingkai Baru (+)
                </span>
                <span class="text-[10px] text-slate-500 block">
                  Jendela Makarya atau Program .exe
                </span>
              </div>
            </button>

            <!-- Dropdown Options Menu saat Bingkai (+) Diklik -->
            <div
              v-if="isAddMenuOpen"
              class="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 rounded-2xl bg-[#0e1422] border border-white/[0.12] shadow-2xl p-2 z-50 space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
            >
              <!-- Option 1: New Makarya IDE Window -->
              <button
                @click="handleOpenNewMakaryaWindow"
                class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.06] text-xs text-slate-200 hover:text-white flex items-center gap-2.5 transition-colors cursor-pointer group"
              >
                <div class="w-7 h-7 rounded-lg bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883] flex-shrink-0 group-hover:scale-105 transition-transform">
                  <UIcon name="i-lucide-plus-square" class="size-4" />
                </div>
                <div>
                  <div class="font-semibold text-slate-100 group-hover:text-white">Jendela Makarya Baru</div>
                  <div class="text-[9px] text-slate-400">Buka IDE window terpisah (Ctrl+Shift+N)</div>
                </div>
              </button>

              <!-- Option 2: Pick and Register External .exe File -->
              <button
                @click="handlePickAndRegisterExe"
                class="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.06] text-xs text-slate-200 hover:text-white flex items-center gap-2.5 transition-colors cursor-pointer group"
              >
                <div class="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0 group-hover:scale-105 transition-transform">
                  <UIcon name="i-lucide-folder-cog" class="size-4" />
                </div>
                <div>
                  <div class="font-semibold text-slate-100 group-hover:text-white">Pilih Berkas .exe...</div>
                  <div class="text-[9px] text-slate-400">Daftarkan aplikasi eksternal dari disk</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Footer -->
    <div class="px-6 py-3 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">Ctrl+Shift+N</kbd>
          <span class="text-slate-500">Toggle Hub</span>
        </span>
        <span class="flex items-center gap-1.5">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">Esc</kbd>
          <span class="text-slate-500">Tutup</span>
        </span>
      </div>

      <div class="text-[10px] text-slate-500 font-mono">
        Dikelola oleh Single-Process Electron Multi-Window
      </div>
    </div>
  </Dialog>
</template>
