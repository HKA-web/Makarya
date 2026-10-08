<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import logoImg from '@renderer/assets/logo.png'
import { useUpdateStore } from '@renderer/stores/updateStore'

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const updateStore = useUpdateStore()
const appVersion = typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : 'v2026.10.08.22.50'
const buildTimestamp = typeof __APP_BUILD_TIMESTAMP__ !== 'undefined' ? __APP_BUILD_TIMESTAMP__ : '8 Okt 2026, 22.50'
const checkStatusMsg = ref<string | null>(null)

function close(): void {
  checkStatusMsg.value = null
  emit('update:visible', false)
}

async function handleCheckUpdates(): Promise<void> {
  checkStatusMsg.value = null
  const res = await updateStore.checkManual()
  if (res && !res.hasUpdate) {
    checkStatusMsg.value = 'Aplikasi sudah versi terbaru!'
  } else if (!res?.success) {
    checkStatusMsg.value = res?.errorMessage || 'Gagal memeriksa pembaruan.'
  }
}
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
    modal
    :closable="false"
    :dismissableMask="true"
    :style="{ width: '560px', maxWidth: '92vw' }"
    :pt="{
      root: {
        class: 'relative bg-[#0c121e]/95 backdrop-blur-2xl border border-white/[0.12] text-slate-100 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] p-0 overflow-hidden ring-1 ring-white/[0.08] transition-all duration-300'
      },
      mask: {
        class: 'bg-black/70 backdrop-blur-sm transition-all duration-300'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Emerald Ambient Glow Line -->
    <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883] to-transparent"></div>

    <!-- Header Section -->
    <div class="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883] shadow-xs">
          <UIcon name="i-lucide-info" class="size-4.5" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-white tracking-tight leading-tight">About Makarya IDE</h3>
          <p class="text-[10px] text-slate-400">Profil & Informasi Aplikasi</p>
        </div>
      </div>

      <button
        @click="close"
        class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        title="Tutup (Esc)"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </div>

    <!-- Modal Body -->
    <div class="p-6 space-y-5">
      <!-- App Brand & Identity Card -->
      <div class="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] shadow-inner relative overflow-hidden">
        <div class="w-20 h-20 rounded-2xl p-1.5 bg-[#091118] border border-[#42b883]/30 flex items-center justify-center flex-shrink-0 shadow-lg relative group">
          <img :src="logoImg" alt="Makarya Logo" class="w-full h-full object-contain" />
          <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#42b883] border-2 border-[#0c121e] flex items-center justify-center">
            <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
          </div>
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="text-base font-extrabold text-white tracking-tight">Makarya IDE</h4>
            <span class="px-2 py-0.5 rounded-full bg-[#42b883]/20 border border-[#42b883]/40 text-[#42b883] font-mono text-[10px] font-bold">
              {{ appVersion }}
            </span>
          </div>
          <p class="text-xs text-slate-300 mt-1 leading-relaxed">
            IDE-Class Desktop Shell with Monaco Editor & Autonomous AI Copilot
          </p>
          <div class="flex items-center gap-2 mt-2 text-[10px] text-slate-400 font-medium">
            <span class="flex items-center gap-1 text-[#42b883]">
              <UIcon name="i-lucide-shield-check" class="size-3" />
              Production Ready
            </span>
            <span>•</span>
            <span>Author: <b class="text-slate-200">Makarya Team</b></span>
          </div>
        </div>
      </div>

      <!-- System & Engine Environment Grid -->
      <div class="space-y-2">
        <div class="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
          <UIcon name="i-lucide-cpu" class="size-3.5 text-[#42b883]" />
          Spesifikasi Mesin & Runtime
        </div>

        <div class="grid grid-cols-2 gap-2 text-[11px]">
          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <span class="text-slate-400">Core Editor:</span>
            <span class="font-mono text-slate-200 font-semibold">Monaco v0.52.2</span>
          </div>

          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <span class="text-slate-400">Desktop Shell:</span>
            <span class="font-mono text-slate-200 font-semibold">Electron v33.4.4</span>
          </div>

          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <span class="text-slate-400">UI Framework:</span>
            <span class="font-mono text-[#42b883] font-semibold">Vue 3.5 & Vite 5.4</span>
          </div>

          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <span class="text-slate-400">Database Lokal:</span>
            <span class="font-mono text-indigo-300 font-semibold">SQLite (sql.js)</span>
          </div>

          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <span class="text-slate-400">Build Date:</span>
            <span class="font-mono text-cyan-300 font-semibold">{{ buildTimestamp }}</span>
          </div>

          <div class="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
            <span class="text-slate-400">Arsitektur:</span>
            <span class="font-mono text-slate-200 font-semibold">Windows x64</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Footer -->
    <div class="px-6 py-3.5 border-t border-white/[0.08] bg-black/30 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <span class="text-[11px] text-slate-500 font-mono">
          © 2026 Makarya.
        </span>
        <span v-if="checkStatusMsg" class="text-[11px] text-emerald-400 font-medium">
          • {{ checkStatusMsg }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="handleCheckUpdates"
          :disabled="updateStore.isChecking"
          class="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white font-medium text-xs border border-white/10 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
        >
          <UIcon
            :name="updateStore.isChecking ? 'i-lucide-loader-2' : 'i-lucide-refresh-cw'"
            :class="{ 'animate-spin': updateStore.isChecking }"
            class="size-3.5 text-emerald-400"
          />
          <span>{{ updateStore.isChecking ? 'Memeriksa...' : 'Periksa Pembaruan' }}</span>
        </button>

        <button
          @click="close"
          class="px-4 py-1.5 rounded-xl bg-[#42b883] hover:bg-[#34d399] text-[#090d14] font-semibold text-xs shadow-md shadow-[#42b883]/30 active:scale-95 transition-all cursor-pointer"
        >
          Tutup
        </button>
      </div>
    </div>
  </Dialog>
</template>
