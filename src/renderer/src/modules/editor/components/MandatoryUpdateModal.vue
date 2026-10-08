<script setup lang="ts">
import { computed } from 'vue'
import Dialog from 'primevue/dialog'
import { useUpdateStore } from '../../../stores/updateStore'
import logoImg from '../../../assets/logo.png'

const updateStore = useUpdateStore()

// Simple markdown formatter to display formatted release notes without external heavy libs
const formattedNotes = computed(() => {
  const raw = updateStore.updateInfo?.releaseNotes || ''
  if (!raw.trim()) {
    return '<p class="text-slate-400 italic">Tidak ada catatan rilis tertulis.</p>'
  }

  // Escape basic HTML
  let html = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headers (### Header, ## Header, # Header)
  html = html.replace(/^### (.*$)/gim, '<h5 class="text-xs font-bold text-[#42b883] mt-3 mb-1 uppercase tracking-wider">$1</h5>')
  html = html.replace(/^## (.*$)/gim, '<h4 class="text-sm font-extrabold text-white mt-4 mb-2">$1</h4>')
  html = html.replace(/^# (.*$)/gim, '<h3 class="text-base font-black text-white mt-4 mb-2 border-b border-white/10 pb-1">$1</h3>')

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong class="text-slate-100 font-semibold">$1</strong>')
  html = html.replace(/\*(.*?)\*/gim, '<em class="text-slate-300">$1</em>')

  // Inline Code
  html = html.replace(/`([^`]+)`/gim, '<code class="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-emerald-300 font-mono text-[11px]">$1</code>')

  // Unordered list items (- or *)
  html = html.replace(/^\s*[-*]\s+(.*$)/gim, '<li class="flex items-start gap-2 text-xs text-slate-300 my-1"><span class="text-[#42b883] mt-0.5">•</span><span>$1</span></li>')

  // Wrap lists
  html = html.replace(/((?:<li.*<\/li>\s*)+)/gim, '<ul class="my-2 space-y-0.5">$1</ul>')

  // Line breaks to paragraphs where appropriate
  html = html.replace(/\n\n+/g, '<div class="h-2"></div>')

  return html
})

const formattedDate = computed(() => {
  if (!updateStore.updateInfo?.publishedAt) return '-'
  try {
    const d = new Date(updateStore.updateInfo.publishedAt)
    return d.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return updateStore.updateInfo.publishedAt
  }
})

const formattedFileSize = computed(() => {
  return updateStore.formatBytes(updateStore.updateInfo?.fileSizeBytes || 0)
})

function handlePrimaryAction(): void {
  if (updateStore.isReadyToInstall) {
    updateStore.applyInstall()
  } else if (!updateStore.isDownloading) {
    updateStore.startDownload()
  }
}
</script>

<template>
  <Dialog
    :visible="updateStore.modalVisible"
    modal
    :closable="false"
    :dismissableMask="false"
    :closeOnEscape="false"
    :style="{ width: '620px', maxWidth: '94vw' }"
    :pt="{
      root: {
        class: 'relative bg-[#0b101a]/98 backdrop-blur-3xl border border-emerald-500/30 text-slate-100 rounded-3xl shadow-[0_25px_70px_-10px_rgba(0,0,0,0.9)] p-0 overflow-hidden ring-2 ring-emerald-500/20 select-none'
      },
      mask: {
        class: 'bg-black/85 backdrop-blur-md'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Animated Gradient Beam -->
    <div class="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-400 to-[#42b883] animate-pulse"></div>

    <!-- Header Section -->
    <div class="px-6 py-4.5 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
      <div class="flex items-center gap-3">
        <!-- Logo & Warning Beacon -->
        <div class="relative flex-shrink-0">
          <div class="w-10 h-10 rounded-2xl bg-[#091118] border border-emerald-500/40 flex items-center justify-center shadow-lg">
            <img :src="logoImg" alt="Makarya Logo" class="w-7 h-7 object-contain" />
          </div>
          <span class="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-[#0b101a]"></span>
          </span>
        </div>

        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-extrabold text-white tracking-tight leading-tight">
              Pembaruan Wajib Tersedia
            </h3>
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold font-mono uppercase tracking-wider">
              Mandatory
            </span>
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">
            Versi terbaru Makarya IDE diperlukan untuk melanjutkan penggunaan.
          </p>
        </div>
      </div>
    </div>

    <!-- Modal Body -->
    <div class="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
      <!-- Version Diff Comparison Banner -->
      <div class="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/30 via-[#0c1624] to-[#080d16] border border-emerald-500/25 shadow-inner">
        <div class="flex items-center justify-between gap-2 flex-wrap">
          <!-- Current Version -->
          <div class="flex flex-col">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Versi Saat Ini</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 font-mono text-xs font-semibold">
                {{ updateStore.updateInfo?.currentVersion || 'v2026.10.08.22.50' }}
              </span>
            </div>
          </div>

          <!-- Arrow Divider -->
          <div class="w-8 h-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <UIcon name="i-lucide-arrow-right" class="size-4" />
          </div>

          <!-- Target New Version -->
          <div class="flex flex-col items-end">
            <span class="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Versi Terbaru</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold shadow-xs">
                {{ updateStore.updateInfo?.latestVersion || 'Terbaru' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Release Metadata Row -->
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06] text-[11px] text-slate-400">
          <div class="flex items-center gap-1.5">
            <UIcon name="i-lucide-calendar" class="size-3.5 text-slate-400" />
            <span>Rilis: <b class="text-slate-200">{{ formattedDate }}</b></span>
          </div>

          <div v-if="updateStore.updateInfo?.fileSizeBytes" class="flex items-center gap-1.5">
            <UIcon name="i-lucide-hard-drive" class="size-3.5 text-slate-400" />
            <span>Ukuran: <b class="text-slate-200">{{ formattedFileSize }}</b></span>
          </div>
        </div>
      </div>

      <!-- Release Notes / Changelog Card -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <UIcon name="i-lucide-sparkles" class="size-3.5 text-emerald-400" />
            Catatan Perubahan (Release Notes):
          </span>
          <span class="text-[10.5px] text-slate-400 font-mono">
            {{ updateStore.updateInfo?.releaseTitle || 'Makarya IDE Update' }}
          </span>
        </div>

        <div
          class="p-3.5 rounded-xl bg-black/40 border border-white/[0.08] text-slate-200 text-xs leading-relaxed max-h-48 overflow-y-auto custom-scrollbar select-text"
          v-html="formattedNotes"
        ></div>
      </div>

      <!-- Error Message Banner (if any) -->
      <div
        v-if="updateStore.errorMessage"
        class="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2"
      >
        <UIcon name="i-lucide-alert-triangle" class="size-4 text-rose-400 flex-shrink-0 mt-0.5" />
        <div class="flex-1 min-w-0">
          <p class="font-semibold">Gagal mengunduh pembaruan:</p>
          <p class="text-[11px] text-rose-300/80 mt-0.5">{{ updateStore.errorMessage }}</p>
        </div>
      </div>

      <!-- Download Progress Area -->
      <div v-if="updateStore.isDownloading || updateStore.isReadyToInstall" class="space-y-2 p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-300 font-medium flex items-center gap-1.5">
            <UIcon
              :name="updateStore.isReadyToInstall ? 'i-lucide-check-circle-2' : 'i-lucide-download-cloud'"
              :class="updateStore.isReadyToInstall ? 'text-emerald-400' : 'text-emerald-400 animate-bounce'"
              class="size-4"
            />
            {{ updateStore.isReadyToInstall ? 'Unduhan Selesai! Siap Dipasang.' : 'Sedang Mengunduh Installer...' }}
          </span>

          <span class="font-mono text-emerald-400 font-bold">
            {{ updateStore.downloadProgress.percent }}%
          </span>
        </div>

        <!-- Progress Track -->
        <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
          <div
            class="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-[#42b883] transition-all duration-200 rounded-full"
            :style="{ width: `${updateStore.downloadProgress.percent}%` }"
          ></div>
        </div>

        <div class="flex items-center justify-between text-[10.5px] text-slate-400 font-mono">
          <span>
            {{ updateStore.formatBytes(updateStore.downloadProgress.transferredBytes) }} / {{ updateStore.formatBytes(updateStore.downloadProgress.totalBytes) }}
          </span>
          <span v-if="updateStore.isDownloading && updateStore.downloadProgress.speedMbps > 0">
            {{ updateStore.downloadProgress.speedMbps }} MB/s
          </span>
        </div>
      </div>
    </div>

    <!-- Footer Actions -->
    <div class="px-6 py-4 border-t border-white/[0.08] bg-black/30 flex items-center justify-between gap-3">
      <!-- Secondary Fallback Action -->
      <button
        @click="updateStore.openInBrowser"
        class="px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer flex items-center gap-1.5 border border-transparent hover:border-white/10"
        title="Buka rilis di browser"
      >
        <UIcon name="i-lucide-external-link" class="size-3.5" />
        <span>Unduh Manual via Browser</span>
      </button>

      <!-- Primary Action Button -->
      <button
        @click="handlePrimaryAction"
        :disabled="updateStore.isDownloading"
        class="px-5 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-400/30"
      >
        <UIcon
          v-if="updateStore.isDownloading"
          name="i-lucide-loader-2"
          class="size-4 animate-spin text-white"
        />
        <UIcon
          v-else-if="updateStore.isReadyToInstall"
          name="i-lucide-rotate-cw"
          class="size-4 text-white"
        />
        <UIcon
          v-else
          name="i-lucide-download"
          class="size-4 text-white"
        />

        <span>
          {{
            updateStore.isDownloading
              ? 'Mengunduh...'
              : updateStore.isReadyToInstall
                ? 'Pasang Sekarang & Restart'
                : 'Unduh & Pasang Sekarang'
          }}
        </span>
      </button>
    </div>
  </Dialog>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.4);
}
</style>
