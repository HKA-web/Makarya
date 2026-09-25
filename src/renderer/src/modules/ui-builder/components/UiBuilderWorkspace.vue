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

      <!-- Controls Tengah: Pilihan Stack & Tab Tampilan (Pill Membulat Sempurna - Gambar 2) -->
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

        <USeparator orientation="vertical" class="h-4" />

        <div class="relative flex items-center">
          <select
            v-model="store.outputStack"
            class="appearance-none bg-[#131d2e] hover:bg-[#1a273d] text-slate-200 text-xs font-medium py-1.5 pl-3 pr-8 rounded-full border border-white/10 hover:border-emerald-500/40 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer shadow-sm"
          >
            <option value="vue-sfc" class="bg-[#0e1626] text-slate-200">Vue 3 SFC (.vue)</option>
            <option value="html-tailwind" class="bg-[#0e1626] text-slate-200">HTML + Tailwind (.html)</option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
        </div>
      </div>

      <!-- Actions Kanan: Simpan ke Project & Reset -->
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer shadow-sm"
          @click="handleReset"
        >
          <UIcon name="i-lucide-rotate-ccw" class="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>

        <button
          class="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!store.hasGeneratedCode || isSaving"
          @click="handleSaveToWorkspace"
        >
          <UIcon :name="isSaving ? 'i-lucide-loader-2' : 'i-lucide-save'" :class="['w-3.5 h-3.5', isSaving ? 'animate-spin' : '']" />
          <span>Simpan ke Project</span>
        </button>
      </div>
    </header>

    <!-- Main Workspace Splitter (Rounded Left & Right Cards) -->
    <div class="flex-1 flex gap-2 overflow-hidden">
      <!-- Panel Kiri: Input, Varian & Chat Revisi -->
      <div class="w-[390px] rounded-2xl border border-white/10 flex flex-col bg-[#090d14]/90 backdrop-blur-xl flex-shrink-0 overflow-hidden shadow-xl">
        <!-- Area Upload Screenshot -->
        <div class="p-3 border-b border-white/10 flex-shrink-0">
          <DropzoneInput />
        </div>

        <!-- Tab Varian AI -->
        <div class="flex-shrink-0">
          <VariantTabs />
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'
import DropzoneInput from './DropzoneInput.vue'
import VariantTabs from './VariantTabs.vue'
import SlicingChatPanel from './SlicingChatPanel.vue'
import LivePreviewPane from './LivePreviewPane.vue'
import CodeViewPane from './CodeViewPane.vue'

const store = useUiBuilderStore()
const isSaving = ref(false)

function handleReset(): void {
  store.resetAll()
}

async function handleSaveToWorkspace(): Promise<void> {
  if (isSaving.value || !store.hasGeneratedCode) return

  isSaving.value = true
  try {
    const result = await store.saveActiveCodeToWorkspace()
    if (result.success && result.fullPath) {
      store.addChatMessage({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Komponen berhasil disimpan!\n📁 Lokasi berkas:\n\`${result.fullPath}\``,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })
    } else {
      store.addChatMessage({
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Silakan buka folder workspace/project terlebih dahulu di File Explorer sebelum menyimpan berkas.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      })
    }
  } finally {
    isSaving.value = false
  }
}
</script>
