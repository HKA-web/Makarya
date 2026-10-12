<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useAntigravityStore, type AntigravityModelItem } from '@renderer/stores/antigravityStore'
import antigravityLogo from '@renderer/assets/antigravity-logo.svg'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', modelId: string): void
}>()

const antigravityStore = useAntigravityStore()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)
const listContainerRef = ref<HTMLElement | null>(null)

// Group models by category
const filteredModels = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return antigravityStore.models

  return antigravityStore.models.filter(
    (m) =>
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query) ||
      (m.provider && m.provider.toLowerCase().includes(query)) ||
      m.category.toLowerCase().includes(query)
  )
})

const categories = computed(() => {
  const map = new Map<string, AntigravityModelItem[]>()
  for (const model of filteredModels.value) {
    const cat = model.category || 'Antigravity Models'
    if (!map.has(cat)) {
      map.set(cat, [])
    }
    map.get(cat)!.push(model)
  }
  return Array.from(map.entries())
})

const flattenedList = computed(() => {
  return filteredModels.value
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      searchQuery.value = ''
      selectedIndex.value = 0
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }
)

watch(searchQuery, () => {
  selectedIndex.value = 0
})

function chooseModel(model: AntigravityModelItem) {
  antigravityStore.selectModel(model.id)
  emit('select', model.id)
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.isOpen) return

  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (selectedIndex.value < flattenedList.value.length - 1) {
      selectedIndex.value++
      scrollToSelected()
    }
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (selectedIndex.value > 0) {
      selectedIndex.value--
      scrollToSelected()
    }
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    const target = flattenedList.value[selectedIndex.value]
    if (target) {
      chooseModel(target)
    }
  }
}

function scrollToSelected() {
  nextTick(() => {
    const container = listContainerRef.value
    if (!container) return
    const el = container.querySelector(`[data-index="${selectedIndex.value}"]`) as HTMLElement
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  })
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="isOpen"
    class="absolute inset-0 bg-[#070e1c]/95 backdrop-blur-md z-50 flex flex-col p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none font-sans"
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-[#2563eb]/20 border border-[#2563eb]/40 flex items-center justify-center p-0.5">
          <img :src="antigravityLogo" alt="Antigravity" class="size-4 object-contain" />
        </div>
        <div>
          <div class="text-xs font-semibold text-white leading-tight">Pilih Model Antigravity (agy)</div>
          <div class="text-[10px] text-slate-400">Model kecerdasan buatan dari CLI Antigravity</div>
        </div>
      </div>
      <button
        @click="emit('close')"
        class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        title="Tutup dialog"
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
        placeholder="Cari model Antigravity (Gemini, Claude, GPT)..."
        class="w-full bg-[#0a1326] border border-white/[0.08] focus:border-[#2563eb]/60 focus:ring-1 focus:ring-[#2563eb]/30 rounded-xl pl-7 pr-7 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none transition-all font-sans"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
      >
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </div>

    <!-- Model Groups List -->
    <div ref="listContainerRef" class="flex-1 overflow-y-auto space-y-3.5 pr-1 custom-scroll">
      <div v-for="[categoryName, categoryModels] in categories" :key="categoryName" class="space-y-1.5">
        <!-- Category Title -->
        <div class="text-[10px] font-semibold text-slate-400 px-1 flex items-center justify-between tracking-wide uppercase">
          <span>{{ categoryName }}</span>
          <span class="text-[9px] text-slate-500 font-mono">{{ categoryModels.length }} model</span>
        </div>

        <!-- Category Items -->
        <div class="space-y-1">
          <div
            v-for="model in categoryModels"
            :key="model.id"
            :data-index="flattenedList.indexOf(model)"
            @click="chooseModel(model)"
            @mouseenter="selectedIndex = flattenedList.indexOf(model)"
            class="p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between group relative"
            :class="[
              antigravityStore.currentModel === model.id
                ? 'bg-[#2563eb]/20 border-[#2563eb]/40 shadow-xs shadow-[#2563eb]/10 text-white'
                : selectedIndex === flattenedList.indexOf(model)
                  ? 'bg-white/[0.06] border-white/[0.12] text-slate-100'
                  : 'bg-[#0c162b]/60 border-white/[0.04] hover:border-white/[0.08] text-slate-300'
            ]"
          >
            <div class="flex items-center gap-2 min-w-0 pr-2">
              <!-- Active / Selected Radio Circle -->
              <div
                class="w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors"
                :class="antigravityStore.currentModel === model.id ? 'border-[#2563eb] bg-[#2563eb]' : 'border-slate-600 group-hover:border-slate-400'"
              >
                <div v-if="antigravityStore.currentModel === model.id" class="w-1.5 h-1.5 rounded-full bg-white"></div>
              </div>

              <!-- Model Name & Subtitle -->
              <div class="min-w-0 flex flex-col">
                <div class="text-[11px] font-semibold truncate leading-tight group-hover:text-[#60a5fa] transition-colors">
                  {{ model.name }}
                </div>
                <div class="text-[9px] text-slate-500 font-mono truncate leading-tight mt-0.5">
                  {{ model.id }}
                </div>
              </div>
            </div>

            <!-- Badges -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
              <span
                v-if="model.provider"
                class="text-[9px] px-1.5 py-0.2 rounded-md bg-white/[0.06] text-slate-400 border border-white/[0.04] font-medium"
              >
                {{ model.provider }}
              </span>
              <span
                v-if="antigravityStore.currentModel === model.id"
                class="text-[9px] px-1.5 py-0.2 rounded-md bg-[#2563eb]/30 text-[#93c5fd] border border-[#2563eb]/40 font-semibold"
              >
                Aktif
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredModels.length === 0" class="py-8 text-center text-slate-500 space-y-1.5">
        <div class="w-8 h-8 rounded-lg bg-[#2563eb]/10 flex items-center justify-center mx-auto p-1">
          <img :src="antigravityLogo" alt="Antigravity" class="size-5 object-contain opacity-50" />
        </div>
        <p class="text-xs">Model Antigravity tidak ditemukan</p>
        <p class="text-[10px] text-slate-500">Coba gunakan kata kunci pencarian yang lain.</p>
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
  background: rgba(37, 99, 235, 0.25);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(37, 99, 235, 0.45);
}
</style>
