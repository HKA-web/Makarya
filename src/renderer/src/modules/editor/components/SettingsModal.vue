<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useAgentStore } from '@renderer/stores/agentStore'

const settingsStore = useSettingsStore()
const agentStore = useAgentStore()
const toast = useToast()

const showApiKey = ref(false)

const availableThemes = [
  { id: 'makarya-dark', name: 'Makarya Emerald (Default)', preview: '#090d14', accent: '#42b883' },
  { id: 'vs-dark', name: 'Visual Studio Dark', preview: '#1e1e1e', accent: '#007acc' },
  { id: 'github-dark', name: 'GitHub Dark', preview: '#0d1117', accent: '#58a6ff' },
  { id: 'monokai', name: 'Monokai Pro', preview: '#272822', accent: '#a6e22e' },
  { id: 'vs-light', name: 'Light Mode', preview: '#ffffff', accent: '#0066b8' }
]

const fontSizes = [12, 13, 14, 15, 16]
const tabSizes = [2, 4]

// Sinkronkan model AI dengan agentStore
function selectAIModel(modelName: string): void {
  settingsStore.ai.defaultModel = modelName
  agentStore.selectedModel = modelName
}

async function handleSync9Router(): Promise<void> {
  if (!settingsStore.ai.baseUrl.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Base URL Kosong',
      detail: 'Masukkan Base URL 9router terlebih dahulu (contoh: http://127.0.0.1:20128/v1)',
      life: 3000
    })
    return
  }

  // Update ke backend process
  if (window.makaryaAPI?.updateAiConfig) {
    await window.makaryaAPI.updateAiConfig({
      baseUrl: settingsStore.ai.baseUrl.trim(),
      apiKey: settingsStore.ai.apiKey.trim()
    })
  }

  await agentStore.loadModels()

  if (agentStore.availableModels.length > 0) {
    toast.add({
      severity: 'success',
      summary: 'Berhasil Terhubung ke 9router',
      detail: `Ditemukan ${agentStore.availableModels.length} model aktif dari router Anda.`,
      life: 3000
    })
    if (!settingsStore.ai.defaultModel || !agentStore.availableModels.includes(settingsStore.ai.defaultModel)) {
      selectAIModel(agentStore.availableModels[0])
    }
  } else {
    toast.add({
      severity: 'error',
      summary: 'Koneksi Gagal',
      detail: 'Tidak dapat mengambil model dari URL tersebut. Pastikan 9router aktif dan token valid.',
      life: 4000
    })
  }
}
</script>

<template>
  <Dialog
    v-model:visible="settingsStore.isSettingsModalOpen"
    modal
    :closable="false"
    :dismissableMask="true"
    :style="{ width: '640px', maxWidth: '92vw' }"
    :pt="{
      root: {
        class: 'relative bg-[#0b101b]/95 backdrop-blur-2xl border border-white/[0.12] text-slate-100 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] p-0 overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300'
      },
      mask: {
        class: 'bg-black/60 backdrop-blur-sm transition-all duration-300'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Glow Line -->
    <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883]/70 to-transparent"></div>

    <!-- Modal Header (Persis seperti Gambar 2) -->
    <div class="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
      <div class="flex items-center gap-2.5">
        <UIcon name="i-lucide-palette" class="size-5 text-[#42b883]" />
        <h3 class="text-base font-bold text-white tracking-tight flex items-center gap-2">
          Application Settings
        </h3>
      </div>

      <!-- Close Button -->
      <button
        @click="settingsStore.closeSettings"
        class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        title="Tutup (Esc)"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </div>

    <!-- 2 Navigation Tabs (Persis seperti Gambar 2) -->
    <div class="flex items-center px-4 pt-2 border-b border-white/[0.08] bg-white/[0.01] gap-1">
      <!-- Tab 1: Appearance & Theme -->
      <button
        @click="settingsStore.activeTab = 'appearance'"
        class="relative px-3.5 py-2.5 rounded-t-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer select-none"
        :class="settingsStore.activeTab === 'appearance'
          ? 'text-[#42b883] bg-white/[0.04] border-t-2 border-[#42b883] font-semibold'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border-t-2 border-transparent'"
      >
        <UIcon name="i-lucide-palette" class="size-4 text-[#42b883]" />
        <span>Appearance & Theme</span>
      </button>

      <!-- Tab 2: AI Provider -->
      <button
        @click="settingsStore.activeTab = 'ai'"
        class="relative px-3.5 py-2.5 rounded-t-xl text-xs font-medium flex items-center gap-2 transition-all cursor-pointer select-none"
        :class="settingsStore.activeTab === 'ai'
          ? 'text-indigo-400 bg-white/[0.04] border-t-2 border-indigo-400 font-semibold'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] border-t-2 border-transparent'"
      >
        <UIcon name="i-lucide-sparkles" class="size-4 text-indigo-400" />
        <span>AI Provider</span>
      </button>
    </div>

    <!-- Tab Contents Body -->
    <div class="p-5 max-h-[65vh] overflow-y-auto custom-scroll space-y-6">
      <!-- ================= TAB 1: APPEARANCE & THEME ================= -->
      <div v-if="settingsStore.activeTab === 'appearance'" class="space-y-5 animate-in fade-in duration-200">
        <!-- Section: Editor Theme -->
        <div class="space-y-2">
          <label class="text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-sun-moon" class="size-3.5 text-[#42b883]" />
              Tema Editor (Monaco Theme)
            </span>
            <span class="text-[10px] text-slate-400 font-mono">{{ settingsStore.editor.theme }}</span>
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              v-for="t in availableThemes"
              :key="t.id"
              @click="settingsStore.editor.theme = t.id"
              class="flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-left group"
              :class="settingsStore.editor.theme === t.id
                ? 'bg-[#42b883]/15 border-[#42b883]/50 text-white shadow-xs'
                : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] text-slate-300 hover:text-white'"
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="w-4 h-4 rounded-full border border-white/20 flex-shrink-0"
                  :style="{ backgroundColor: t.preview, borderColor: t.accent }"
                ></span>
                <span class="text-xs font-medium">{{ t.name }}</span>
              </div>
              <UIcon
                v-if="settingsStore.editor.theme === t.id"
                name="i-lucide-check-circle-2"
                class="size-4 text-[#42b883] flex-shrink-0"
              />
            </button>
          </div>
        </div>

        <!-- Section: Font Size & Tab Size -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/[0.06]">
          <!-- Font Size -->
          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <UIcon name="i-lucide-type" class="size-3.5 text-[#42b883]" />
              Ukuran Font Kode
            </label>
            <div class="flex items-center gap-1.5">
              <button
                v-for="sz in fontSizes"
                :key="sz"
                @click="settingsStore.editor.fontSize = sz"
                class="flex-1 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer"
                :class="settingsStore.editor.fontSize === sz
                  ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883]'
                  : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-slate-300'"
              >
                {{ sz }}px
              </button>
            </div>
          </div>

          <!-- Tab Size -->
          <div class="space-y-2">
            <label class="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <UIcon name="i-lucide-space" class="size-3.5 text-[#42b883]" />
              Indentasi Tab
            </label>
            <div class="flex items-center gap-1.5">
              <button
                v-for="ts in tabSizes"
                :key="ts"
                @click="settingsStore.editor.tabSize = ts"
                class="flex-1 py-1.5 rounded-lg border text-xs font-mono font-medium transition-all cursor-pointer"
                :class="settingsStore.editor.tabSize === ts
                  ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883]'
                  : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08] text-slate-300'"
              >
                {{ ts }} Spasi
              </button>
            </div>
          </div>
        </div>

        <!-- Section: Toggles (Minimap, Word Wrap, Line Numbers) -->
        <div class="space-y-2.5 pt-3 border-t border-white/[0.06]">
          <!-- Minimap -->
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <div class="text-xs font-semibold text-slate-200">Tampilkan Minimap</div>
              <div class="text-[10px] text-slate-400">Peta tinjauan navigasi kode kecil di sisi kanan editor</div>
            </div>
            <button
              @click="settingsStore.editor.minimap = !settingsStore.editor.minimap"
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer"
              :class="settingsStore.editor.minimap ? 'bg-[#42b883]' : 'bg-slate-700'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform"
                :class="settingsStore.editor.minimap ? 'translate-x-4.5' : 'translate-x-0'"
              ></span>
            </button>
          </div>

          <!-- Word Wrap -->
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <div class="text-xs font-semibold text-slate-200">Pembalutan Baris (Word Wrap)</div>
              <div class="text-[10px] text-slate-400">Bungkus teks baris panjang otomatis ke baris berikutnya</div>
            </div>
            <button
              @click="settingsStore.editor.wordWrap = settingsStore.editor.wordWrap === 'on' ? 'off' : 'on'"
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer"
              :class="settingsStore.editor.wordWrap === 'on' ? 'bg-[#42b883]' : 'bg-slate-700'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform"
                :class="settingsStore.editor.wordWrap === 'on' ? 'translate-x-4.5' : 'translate-x-0'"
              ></span>
            </button>
          </div>

          <!-- Line Numbers -->
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <div class="text-xs font-semibold text-slate-200">Nomor Baris (Line Numbers)</div>
              <div class="text-[10px] text-slate-400">Tampilkan penomoran baris pada gutter kiri</div>
            </div>
            <button
              @click="settingsStore.editor.lineNumbers = settingsStore.editor.lineNumbers === 'on' ? 'off' : 'on'"
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer"
              :class="settingsStore.editor.lineNumbers === 'on' ? 'bg-[#42b883]' : 'bg-slate-700'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform"
                :class="settingsStore.editor.lineNumbers === 'on' ? 'translate-x-4.5' : 'translate-x-0'"
              ></span>
            </button>
          </div>
        </div>
      </div>

      <!-- ================= TAB 2: AI PROVIDER ================= -->
      <div v-else class="space-y-5 animate-in fade-in duration-200">
        <!-- AI Connection Banner -->
        <div class="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <UIcon name="i-lucide-bot" class="size-4" />
            </div>
            <div>
              <h4 class="text-xs font-semibold text-indigo-200">Makarya AI Desktop Core</h4>
              <p class="text-[10px] text-indigo-300/80">Layanan agen mandiri terhubung ke 9router lokal</p>
            </div>
          </div>
          <span
            class="text-[9px] px-2 py-0.5 rounded-full font-mono border font-semibold"
            :class="agentStore.availableModels.length > 0
              ? 'bg-[#42b883]/15 text-[#42b883] border-[#42b883]/30'
              : 'bg-amber-500/15 text-amber-300 border-amber-500/30'"
          >
            {{ agentStore.availableModels.length > 0 ? 'Terhubung' : 'Offline / Menunggu' }}
          </span>
        </div>

        <!-- Section: 9router Connection Config (Base URL & API Key) -->
        <div class="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-3">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <UIcon name="i-lucide-router" class="size-3.5 text-indigo-400" />
              Kredensial & Endpoint 9router
            </h4>
            <span class="text-[9px] text-slate-500 font-mono">Tersimpan di SQLite Pribadi</span>
          </div>

          <!-- Base URL Input -->
          <div class="space-y-1">
            <label class="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Base URL (Endpoint API 9router)</span>
              <span class="text-[10px] text-slate-500">Default: http://127.0.0.1:20128/v1</span>
            </label>
            <div class="relative">
              <UIcon name="i-lucide-globe" class="size-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="settingsStore.ai.baseUrl"
                type="text"
                placeholder="http://127.0.0.1:20128/v1"
                class="w-full bg-[#080d16] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none transition-all font-mono"
              />
            </div>
          </div>

          <!-- API Key / Token Input -->
          <div class="space-y-1">
            <label class="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Token / API Key</span>
              <span class="text-[10px] text-slate-500">Diperlukan bila router Anda memakai autentikasi</span>
            </label>
            <div class="relative">
              <UIcon name="i-lucide-key" class="size-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                v-model="settingsStore.ai.apiKey"
                :type="showApiKey ? 'text' : 'password'"
                placeholder="sk-..."
                class="w-full bg-[#080d16] border border-white/[0.08] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none transition-all font-mono"
              />
              <button
                type="button"
                @click="showApiKey = !showApiKey"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer p-0.5"
                :title="showApiKey ? 'Sembunyikan Token' : 'Tampilkan Token'"
              >
                <UIcon :name="showApiKey ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Action Button: Test & Sync Models -->
          <div class="pt-1 flex justify-end">
            <button
              @click="handleSync9Router"
              :disabled="agentStore.isModelsLoading"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
            >
              <UIcon name="i-lucide-refresh-cw" class="size-3" :class="{ 'animate-spin': agentStore.isModelsLoading }" />
              <span>{{ agentStore.isModelsLoading ? 'Menghubungkan...' : 'Simpan & Tes Koneksi 9router' }}</span>
            </button>
          </div>
        </div>

        <!-- Section: Default AI Model -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <UIcon name="i-lucide-cpu" class="size-3.5 text-indigo-400" />
              Pilihan Model AI (Dari 9router)
            </label>
            <div class="flex items-center gap-2">
              <button
                @click="agentStore.loadModels"
                :disabled="agentStore.isModelsLoading"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[10px] text-slate-300 hover:text-indigo-300 transition-all cursor-pointer disabled:opacity-50"
                title="Lookup ulang model dari 9router"
              >
                <UIcon
                  name="i-lucide-refresh-cw"
                  class="size-2.5"
                  :class="{ 'animate-spin': agentStore.isModelsLoading }"
                />
                <span>{{ agentStore.isModelsLoading ? 'Mencari...' : 'Refresh 9router' }}</span>
              </button>
              <span v-if="settingsStore.ai.defaultModel" class="text-[10px] text-indigo-400 font-mono truncate max-w-[140px]" :title="settingsStore.ai.defaultModel">
                {{ settingsStore.ai.defaultModel }}
              </span>
              <span v-else class="text-[10px] text-slate-500 font-mono italic">
                (Belum dipilih)
              </span>
            </div>
          </div>

          <!-- List Models jika tersedia dari 9router -->
          <div v-if="agentStore.availableModels.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scroll pr-0.5">
            <button
              v-for="m in agentStore.availableModels"
              :key="m"
              @click="selectAIModel(m)"
              class="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between"
              :class="settingsStore.ai.defaultModel === m
                ? 'bg-indigo-500/20 border-indigo-500/50 text-white shadow-xs'
                : 'bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] text-slate-300 hover:text-white'"
            >
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs font-bold truncate" :title="m">{{ m }}</span>
                <UIcon v-if="settingsStore.ai.defaultModel === m" name="i-lucide-check-circle-2" class="size-3.5 text-indigo-400 flex-shrink-0" />
              </div>
              <span class="text-[9px] text-slate-500">Autonomous Coding</span>
            </button>
          </div>

          <!-- Empty State jika 9router offline atau belum ada model -->
          <div
            v-else
            class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 flex items-start gap-2.5 text-xs"
          >
            <UIcon name="i-lucide-alert-triangle" class="size-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p class="font-semibold text-amber-200">Tidak ada model AI ditemukan</p>
              <p class="text-[10px] text-amber-300/80 leading-relaxed mt-0.5">
                Pastikan layanan 9router atau gateway AI lokal Anda aktif pada port 20128, lalu klik tombol "Refresh 9router" di atas.
              </p>
            </div>
          </div>
        </div>

        <!-- Section: AI Creativity (Temperature) -->
        <div class="space-y-2 pt-3 border-t border-white/[0.06]">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <UIcon name="i-lucide-sliders" class="size-3.5 text-indigo-400" />
              Kreativitas Jawaban (Temperature)
            </label>
            <span class="text-xs font-mono font-bold text-indigo-400">{{ settingsStore.ai.temperature }}</span>
          </div>
          <input
            v-model.number="settingsStore.ai.temperature"
            type="range"
            min="0"
            max="1"
            step="0.05"
            class="w-full accent-[#42b883] cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div class="flex justify-between text-[10px] text-slate-500 font-sans">
            <span>Presisi & Deterministik (0.0)</span>
            <span>Seimbang (0.4)</span>
            <span>Kreatif (1.0)</span>
          </div>
        </div>

        <!-- Section: Permissions (Auto Execution & Review Policy - Sesuai Gambar 2 Antigravity) -->
        <div class="space-y-3 pt-3 border-t border-white/[0.06]">
          <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <UIcon name="i-lucide-shield-check" class="size-4 text-[#42b883]" />
            Permissions & Execution Policy
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Auto Execution -->
            <div class="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-200 flex items-center gap-1">
                  Auto Execution
                  <span class="text-slate-400 text-[10px] cursor-help" title="Controls whether commands and tools can run automatically or require user approval before execution.">ⓘ</span>
                </span>
              </div>
              <div class="relative">
                <select
                  v-model="settingsStore.ai.autoExecution"
                  class="w-full bg-[#131d2e] border border-white/[0.1] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 pr-7 appearance-none focus:outline-none focus:border-[#42b883]/60 cursor-pointer"
                >
                  <option value="always_proceed">Always Proceed</option>
                  <option value="ask_before">Ask Before Execution</option>
                  <option value="never">Never Execute</option>
                </select>
                <UIcon name="i-lucide-chevron-down" class="size-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p class="text-[10px] text-slate-400">Izinkan eksekusi tool otomatis atau selalu minta konfirmasi.</p>
            </div>

            <!-- Review Policy -->
            <div class="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-200 flex items-center gap-1">
                  Review Policy
                  <span class="text-slate-400 text-[10px] cursor-help" title="Controls how code modifications and file edits are reviewed and applied.">ⓘ</span>
                </span>
              </div>
              <div class="relative">
                <select
                  v-model="settingsStore.ai.reviewPolicy"
                  class="w-full bg-[#131d2e] border border-white/[0.1] text-slate-200 text-xs rounded-lg px-2.5 py-1.5 pr-7 appearance-none focus:outline-none focus:border-[#42b883]/60 cursor-pointer"
                >
                  <option value="request_review">Request Review</option>
                  <option value="auto_apply">Auto Apply</option>
                  <option value="always_ask">Always Ask</option>
                </select>
                <UIcon name="i-lucide-chevron-down" class="size-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <p class="text-[10px] text-slate-400">Tampilkan preview diff atau langsung simpan modifikasi berkas.</p>
            </div>
          </div>
        </div>

        <!-- Section: Context & Thoughts Toggles -->
        <div class="space-y-2.5 pt-3 border-t border-white/[0.06]">
          <!-- Auto Context -->
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <div class="text-xs font-semibold text-slate-200">Sertakan File Aktif Editor Otomatis</div>
              <div class="text-[10px] text-slate-400">Lampirkan isi berkas yang sedang dibuka saat mengirim prompt</div>
            </div>
            <button
              @click="() => {
                settingsStore.ai.autoIncludeActiveFile = !settingsStore.ai.autoIncludeActiveFile
                agentStore.includeActiveFileContext = settingsStore.ai.autoIncludeActiveFile
              }"
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer"
              :class="settingsStore.ai.autoIncludeActiveFile ? 'bg-[#42b883]' : 'bg-slate-700'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform"
                :class="settingsStore.ai.autoIncludeActiveFile ? 'translate-x-4.5' : 'translate-x-0'"
              ></span>
            </button>
          </div>

          <!-- Stream Thoughts -->
          <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div>
              <div class="text-xs font-semibold text-slate-200">Tampilkan Penalaran AI (Thoughts / CoT)</div>
              <div class="text-[10px] text-slate-400">Tampilkan accordion pemikiran langkah demi langkah agen</div>
            </div>
            <button
              @click="settingsStore.ai.streamThoughts = !settingsStore.ai.streamThoughts"
              class="w-10 h-5.5 rounded-full transition-colors relative cursor-pointer"
              :class="settingsStore.ai.streamThoughts ? 'bg-[#42b883]' : 'bg-slate-700'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform"
                :class="settingsStore.ai.streamThoughts ? 'translate-x-4.5' : 'translate-x-0'"
              ></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Footer Actions -->
    <div class="px-5 py-3 border-t border-white/[0.08] bg-black/25 flex items-center justify-between text-xs">
      <button
        @click="settingsStore.resetToDefaults"
        class="text-slate-400 hover:text-rose-400 transition-colors cursor-pointer text-[11px]"
      >
        Reset ke Default
      </button>

      <button
        @click="settingsStore.closeSettings"
        class="px-4 py-1.5 rounded-xl bg-[#42b883] hover:bg-[#34d399] text-[#090d14] font-semibold text-xs shadow-md shadow-[#42b883]/30 active:scale-95 transition-all cursor-pointer"
      >
        Selesai
      </button>
    </div>
  </Dialog>
</template>
