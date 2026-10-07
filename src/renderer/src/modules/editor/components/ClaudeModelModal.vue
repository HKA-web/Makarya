<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useClaudeStore, type ClaudeModelItem } from '@renderer/stores/claudeStore'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', modelId: string): void
}>()

const claudeStore = useClaudeStore()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)
const listContainerRef = ref<HTMLElement | null>(null)

// Group models by category
const filteredModels = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return claudeStore.models

  return claudeStore.models.filter(
    (m) =>
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      (m.provider && m.provider.toLowerCase().includes(query)) ||
      m.category.toLowerCase().includes(query)
  )
})

const categories = computed(() => {
  const map = new Map<string, ClaudeModelItem[]>()
  for (const model of filteredModels.value) {
    const cat = model.category || 'Claude Models'
    if (!map.has(cat)) {
      map.set(cat, [])
    }
    map.get(cat)!.push(model)
  }
  return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
})

// Flattened list for index navigation
const flatList = computed(() => {
  const list: ClaudeModelItem[] = []
  for (const cat of categories.value) {
    for (const item of cat.items) {
      list.push(item)
    }
  }
  return list
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      searchQuery.value = ''
      claudeStore.loadAvailableModels()
      
      const idx = flatList.value.findIndex(
        (m) => m.id === claudeStore.currentModel || m.name === claudeStore.currentModel
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
    if (flatList.value.length === 0) return
    selectedIndex.value = (selectedIndex.value + 1) % flatList.value.length
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (flatList.value.length === 0) return
    selectedIndex.value = (selectedIndex.value - 1 + flatList.value.length) % flatList.value.length
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (flatList.value[selectedIndex.value]) {
      chooseModel(flatList.value[selectedIndex.value])
    }
  }
}

function chooseModel(model: ClaudeModelItem) {
  claudeStore.selectModel(model.id)
  emit('select', model.id)
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
        <div class="w-6 h-6 rounded-lg bg-[#d97706]/15 border border-[#d97706]/30 flex items-center justify-center text-[#f59e0b]">
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
        </div>
        <div>
          <div class="text-xs font-semibold text-white leading-tight">Pilih Model Claude AI</div>
          <div class="text-[10px] text-slate-400">Pilih model untuk inferensi Claude Agent</div>
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
        placeholder="Cari model Claude, Opus, Sonnet, Haiku..."
        class="w-full bg-[#080d16] border border-white/[0.08] focus:border-[#d97706]/50 focus:ring-1 focus:ring-[#d97706]/20 rounded-xl pl-7 pr-7 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none transition-all font-sans"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
      >
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </div>

    <!-- Scrollable Model List Grouped by Category -->
    <div
      ref="listContainerRef"
      class="flex-1 overflow-y-auto space-y-3 pr-1 custom-scroll"
    >
      <template v-if="categories.length > 0">
        <div v-for="cat in categories" :key="cat.name" class="space-y-1.5">
          <!-- Category Header -->
          <div class="px-1 text-[10px] font-bold text-[#f59e0b] uppercase tracking-wider flex items-center gap-1.5">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-[#d97706]/50"></span>
            <span>{{ cat.name }}</span>
            <span class="text-slate-500 font-normal text-[9px] lowercase">({{ cat.items.length }})</span>
          </div>

          <!-- Cards Grid / Stack -->
          <div class="space-y-1.5">
            <div
              v-for="model in cat.items"
              :key="model.id"
              @click="chooseModel(model)"
              @mouseenter="selectedIndex = flatList.findIndex((m) => m.id === model.id)"
              :class="[
                'p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1 group relative',
                claudeStore.currentModel === model.id
                  ? 'selected-model-card bg-[#d97706]/15 border-[#d97706]/45 shadow-sm shadow-[#d97706]/10 ring-1 ring-[#d97706]/30'
                  : flatList[selectedIndex]?.id === model.id
                    ? 'selected-model-card bg-[#1f1710] border-[#d97706]/30'
                    : 'bg-[#0f1624]/60 hover:bg-[#1f1710] border-white/[0.06] hover:border-white/[0.12]'
              ]"
            >
              <!-- Top Row: Name, Status Dot, Badges -->
              <div class="flex items-center justify-between gap-1.5">
                <div class="flex items-center gap-1.5 min-w-0 pr-1">
                  <span
                    v-if="claudeStore.currentModel === model.id"
                    class="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse flex-shrink-0"
                  ></span>
                  <span
                    :class="[
                      'text-xs font-semibold truncate transition-colors',
                      claudeStore.currentModel === model.id ? 'text-[#f59e0b]' : 'text-slate-100 group-hover:text-[#f59e0b]'
                    ]"
                  >
                    {{ model.name }}
                  </span>
                </div>

                <div class="flex items-center gap-1 flex-shrink-0">
                  <span
                    v-if="claudeStore.currentModel === model.id"
                    class="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d97706]/20 text-[#f59e0b] font-semibold"
                  >
                    Aktif
                  </span>
                  <span
                    v-if="model.isFree"
                    class="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-medium"
                  >
                    Free
                  </span>
                  <span
                    v-else
                    class="text-[9px] px-1.5 py-0.2 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-400 font-medium"
                  >
                    Anthropic
                  </span>
                </div>
              </div>

              <!-- Bottom Row: Provider and Model ID -->
              <div class="flex items-center justify-between text-[9.5px] text-slate-400 pt-0.5 border-t border-white/[0.04]">
                <span class="flex items-center gap-1">
                  <span class="text-slate-400 font-medium">{{ model.provider || 'Anthropic' }}</span>
                  <span class="text-slate-600">•</span>
                  <span class="font-mono text-slate-500 truncate max-w-[150px]">{{ model.id }}</span>
                </span>
                <span class="text-[9px] text-[#f59e0b]/80 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                  Pilih →
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <div v-else class="py-10 text-center flex flex-col items-center justify-center text-slate-500 space-y-2">
        <UIcon name="i-lucide-sparkles" class="size-8 text-slate-600" />
        <p class="text-xs font-medium text-slate-400">
          Model Claude tidak ditemukan
        </p>
        <p class="text-[10px] text-slate-500 max-w-[200px]">
          Tidak ada model yang cocok dengan kata kunci "{{ searchQuery }}"
        </p>
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
  background: rgba(217, 119, 6, 0.25);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(217, 119, 6, 0.45);
}
</style>
