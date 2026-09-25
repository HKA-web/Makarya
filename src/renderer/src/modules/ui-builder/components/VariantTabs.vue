<template>
  <div class="flex items-center gap-1.5 p-1.5 bg-[#090d14] border-b border-white/10 overflow-x-auto">
    <button
      v-for="(variant, idx) in store.variants"
      :key="variant.id"
      class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap shadow-sm"
      :class="[
        store.activeVariantIndex === idx
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-emerald-500/5'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
      ]"
      @click="store.setActiveVariantIndex(idx)"
    >
      <div class="w-4 h-4 rounded-lg flex items-center justify-center bg-white/5">
        <UIcon
          :name="getProviderIcon(variant.provider)"
          class="w-3 h-3"
        />
      </div>
      <span>{{ variant.name }}</span>

      <!-- Status Indicator -->
      <span
        v-if="variant.status === 'generating'"
        class="w-2 h-2 rounded-full bg-amber-400 animate-ping"
      ></span>
      <span
        v-else-if="variant.status === 'ready'"
        class="w-2 h-2 rounded-full bg-emerald-400"
      ></span>
      <span
        v-else-if="variant.status === 'error'"
        class="w-2 h-2 rounded-full bg-red-400"
      ></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useUiBuilderStore } from '../stores/useUiBuilderStore'

const store = useUiBuilderStore()

function getProviderIcon(provider: string): string {
  switch (provider) {
    case 'gemini':
      return 'i-lucide-sparkles'
    case 'anthropic':
      return 'i-lucide-bot'
    case 'openai':
      return 'i-lucide-zap'
    default:
      return 'i-lucide-cpu'
  }
}
</script>
