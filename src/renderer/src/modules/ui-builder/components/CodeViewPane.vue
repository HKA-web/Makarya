<template>
  <div class="h-full w-full flex flex-col bg-[#070b12] overflow-hidden">
    <!-- Header Bar Kode Membulat -->
    <div class="h-11 border-b border-white/10 px-4 bg-[#0c111a]/90 backdrop-blur flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <UIcon name="i-lucide-code-2" class="w-3.5 h-3.5" />
        </div>
        <span class="text-xs font-semibold text-slate-200">
          {{ store.outputStack === 'vue-sfc' ? 'Vue 3 Single File Component (.vue)' : 'HTML + Tailwind (.html)' }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer shadow-sm"
          @click="copyCode"
        >
          <UIcon :name="copied ? 'i-lucide-check' : 'i-lucide-copy'" :class="['w-3.5 h-3.5', copied ? 'text-emerald-400' : '']" />
          <span>{{ copied ? 'Tersalin!' : 'Salin Kode' }}</span>
        </button>
      </div>
    </div>

    <!-- Area Text Editor Kode Membulat -->
    <div class="flex-1 overflow-auto p-4 bg-[#090d14] font-mono text-xs">
      <textarea
        v-model="editableCode"
        class="w-full h-full bg-transparent text-slate-100 resize-none outline-none leading-relaxed border-0 font-mono text-xs selection:bg-emerald-500/30 p-2 rounded-xl focus:bg-white/[0.02]"
        placeholder="Kode belum tersedia..."
        spellcheck="false"
      ></textarea>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'

const store = useUiBuilderStore()
const copied = ref(false)

const editableCode = computed({
  get: () => store.activeVariant.code || '',
  set: (val: string) => store.setVariantCode(store.activeVariantIndex, val)
})

async function copyCode(): Promise<void> {
  if (!editableCode.value) return
  await navigator.clipboard.writeText(editableCode.value)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>
