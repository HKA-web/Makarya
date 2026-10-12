<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAgentStore } from '@renderer/stores/agentStore'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', modelId: string): void
}>()

const agentStore = useAgentStore()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)
const listContainerRef = ref<HTMLElement | null>(null)

const filteredModels = computed(() => {
  const list = agentStore.availableModels
  // Hanya tampilkan model combo (exclude raw sub-models / endpoints seperti ag/...)
  const comboList = list.filter((m) => !m.toLowerCase().startsWith('ag/') && !m.toLowerCase().startsWith('ag-'))
  const baseList = comboList.length > 0 ? comboList : list

  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return baseList

  return baseList.filter((m) => m.toLowerCase().includes(query))
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      searchQuery.value = ''
      agentStore.loadModels()

      const idx = filteredModels.value.findIndex(
        (m) => m === agentStore.selectedModel
      )
      selectedIndex.value = idx >= 0 ? idx : 0

      nextTick(() => {
        searchInputRef.value?.focus()
        scrollToSelected()
      })
    }
  }
)

watch(searchQuery, () => {
  selectedIndex.value = 0
})

function scrollToSelected() {
  nextTick(() => {
    if (!listContainerRef.value) return
    const activeEl = listContainerRef.value.querySelector('.selected-model-card') as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  })
}

function handleKeyDown(e: KeyboardEvent) {
  if (!props.isOpen) return

  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filteredModels.value.length === 0) return
    selectedIndex.value = (selectedIndex.value + 1) % filteredModels.value.length
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filteredModels.value.length === 0) return
    selectedIndex.value = (selectedIndex.value - 1 + filteredModels.value.length) % filteredModels.value.length
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredModels.value[selectedIndex.value]) {
      chooseModel(filteredModels.value[selectedIndex.value])
    }
  }
}

function chooseModel(modelId: string) {
  agentStore.setSelectedModel(modelId)
  emit('select', modelId)
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <!-- Full Overlay matching the Sessions Modal aesthetic -->
  <div
    v-if="isOpen"
    class="absolute inset-0 bg-[#070b13]/92 backdrop-blur-md z-50 flex flex-col p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none font-sans"
    @keydown.stop
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883]">
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
        </div>
        <div>
          <div class="text-xs font-semibold text-white leading-tight">Pilih Model AI Agent</div>
          <div class="text-[10px] text-slate-400">Pilih model untuk inferensi Makarya Agent</div>
        </div>
      </div>
      <button
        @click="emit('close')"
        class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        title="Tutup pilihan model (esc)"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>
    </div>

    <!-- Search Input -->
    <div class="relative flex-shrink-0">
      <UIcon name="i-lucide-search" class="size-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Cari model AI..."
        class="w-full bg-[#080d16] border border-white/[0.08] focus:border-[#42b883]/50 focus:ring-1 focus:ring-[#42b883]/20 rounded-xl pl-7 pr-7 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none transition-all font-sans"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
      >
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </div>

    <!-- Scrollable Model List (Clean Flat List) -->
    <div
      ref="listContainerRef"
      class="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scroll"
    >
      <div v-if="agentStore.isModelsLoading" class="py-12 text-center flex flex-col items-center justify-center space-y-2.5">
        <UIcon name="i-lucide-loader-2" class="size-6 text-[#42b883] animate-spin" />
        <p class="text-xs text-slate-300 font-medium">Memuat model AI...</p>
      </div>

      <template v-else-if="filteredModels.length > 0">
        <div
          v-for="(model, idx) in filteredModels"
          :key="model"
          @click="chooseModel(model)"
          @mouseenter="selectedIndex = idx"
          :class="[
            'p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between group relative',
            agentStore.selectedModel === model
              ? 'selected-model-card bg-[#42b883]/15 border-[#42b883]/45 shadow-sm shadow-[#42b883]/10 ring-1 ring-[#42b883]/30'
              : selectedIndex === idx
                ? 'selected-model-card bg-[#131d2e] border-[#42b883]/30'
                : 'bg-[#0f1624]/60 hover:bg-[#131d2e] border-white/[0.06] hover:border-white/[0.12]'
          ]"
        >
          <!-- Left: Status dot + Model Name -->
          <div class="flex items-center gap-2 min-w-0 pr-2">
            <span
              v-if="agentStore.selectedModel === model"
              class="w-1.5 h-1.5 rounded-full bg-[#42b883] animate-pulse flex-shrink-0"
            ></span>
            <span
              :class="[
                'text-xs font-semibold truncate transition-colors font-mono',
                agentStore.selectedModel === model ? 'text-[#42b883]' : 'text-slate-100 group-hover:text-[#42b883]'
              ]"
            >
              {{ model }}
            </span>
          </div>

          <!-- Right: Active badge / Choose indicator -->
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span
              v-if="agentStore.selectedModel === model"
              class="text-[9px] px-2 py-0.5 rounded-full bg-[#42b883]/20 text-[#42b883] font-semibold"
            >
              Aktif
            </span>
            <span
              v-else
              class="text-[9.5px] text-[#42b883]/80 opacity-0 group-hover:opacity-100 transition-opacity font-medium"
            >
              Pilih →
            </span>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="py-10 text-center flex flex-col items-center justify-center text-slate-500 space-y-2">
        <UIcon name="i-lucide-sparkles" class="size-8 text-slate-600" />
        <p class="text-xs font-medium text-slate-400">
          Model AI tidak ditemukan
        </p>
        <p class="text-[10px] text-slate-500 max-w-[200px]">
          {{ searchQuery ? `Tidak ada model yang cocok dengan kata kunci "${searchQuery}"` : 'Belum ada model AI yang terdeteksi.' }}
        </p>
        <button
          @click="agentStore.loadModels()"
          class="mt-2 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white text-[11px] font-medium border border-white/10 flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3 text-[#42b883]" />
          <span>Muat Ulang Model</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 3.5px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(66, 184, 131, 0.25);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 184, 131, 0.45);
}
</style>
