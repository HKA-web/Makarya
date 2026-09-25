<template>
  <div class="h-full w-full flex flex-col bg-[#070b12] overflow-hidden">
    <!-- Toolbar Atas Iframe Membulat -->
    <div class="h-11 border-b border-white/10 px-4 bg-[#0c111a]/90 backdrop-blur flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-2.5">
        <span class="text-xs font-semibold text-slate-200 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse"></span>
          Live Sandbox
        </span>
        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-slate-300 border border-white/10">
          {{ currentDimensionText }}
        </span>
      </div>

      <!-- Kontrol Viewport & Reload Membulat -->
      <div class="flex items-center gap-2">
        <div class="flex items-center bg-[#090d14] p-0.5 rounded-full border border-white/10">
          <button
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            :class="store.viewportMode === 'desktop' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'"
            title="Desktop View (Full Canvas)"
            @click="store.setViewportMode('desktop')"
          >
            <UIcon name="i-lucide-monitor" class="w-3.5 h-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            :class="store.viewportMode === 'tablet' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'"
            title="Tablet View (768px)"
            @click="store.setViewportMode('tablet')"
          >
            <UIcon name="i-lucide-tablet" class="w-3.5 h-3.5" />
          </button>
          <button
            class="w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer"
            :class="store.viewportMode === 'mobile' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-400 hover:text-slate-200'"
            title="Mobile View (375px)"
            @click="store.setViewportMode('mobile')"
          >
            <UIcon name="i-lucide-smartphone" class="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer"
          title="Muat Ulang Preview"
          @click="refreshIframe"
        >
          <UIcon name="i-lucide-rotate-cw" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Area Iframe (Full Edge-to-Edge pada Desktop, Responsive Frame pada Tablet/Mobile) -->
    <div
      class="flex-1 overflow-auto flex items-center justify-center bg-[#070b12]"
      :class="store.viewportMode === 'desktop' ? 'p-0' : 'p-4 bg-dot-grid'"
    >
      <!-- Loading State saat streaming awal belum ada kode -->
      <div
        v-if="!hasCode"
        class="flex flex-col items-center justify-center text-center p-8 text-slate-500 max-w-sm rounded-2xl bg-[#0e1626]/40 border border-white/5 backdrop-blur-sm m-4"
      >
        <div class="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-3 shadow-inner">
          <UIcon name="i-lucide-layout" class="w-7 h-7" />
        </div>
        <div class="text-sm font-semibold text-slate-200 mb-1">Pratinjau Belum Tersedia</div>
        <div class="text-xs text-slate-400 leading-relaxed">
          Unggah screenshot atau ketik prompt di samping untuk merender antarmuka secara langsung di sini.
        </div>
      </div>

      <!-- Iframe Container: Full Canvas Edge-to-Edge pada Desktop -->
      <div
        v-else
        class="bg-white overflow-hidden transition-all duration-300 flex flex-col"
        :class="[
          store.viewportMode === 'desktop'
            ? 'w-full h-full border-0 rounded-none shadow-none'
            : 'h-full rounded-2xl shadow-2xl border border-white/15 ring-1 ring-black/20'
        ]"
        :style="containerStyle"
      >
        <iframe
          ref="iframeRef"
          :key="iframeKey"
          :srcdoc="generatedSrcDoc"
          class="w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-modals allow-forms allow-same-origin"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'

const store = useUiBuilderStore()
const iframeKey = ref(0)
const iframeRef = ref<HTMLIFrameElement | null>(null)

const hasCode = computed(() => {
  return !!store.activeVariant.code && store.activeVariant.code.trim().length > 0
})

const currentDimensionText = computed(() => {
  if (store.viewportMode === 'mobile') return '375 × 667 px'
  if (store.viewportMode === 'tablet') return '768 × 1024 px'
  return 'Desktop (100% Full)'
})

const containerStyle = computed(() => {
  if (store.viewportMode === 'mobile') {
    return { width: '375px', maxHeight: '100%' }
  }
  if (store.viewportMode === 'tablet') {
    return { width: '768px', maxHeight: '100%' }
  }
  return { width: '100%', height: '100%' }
})

function refreshIframe(): void {
  iframeKey.value++
}

/**
 * Menyusun srcdoc yang aman & fungsional
 * Jika kode berupa Vue SFC, bungkus dengan runtime parser (Vue 3 browser runtime)
 */
const generatedSrcDoc = computed(() => {
  const rawCode = store.activeVariant.code || ''
  if (!rawCode) return ''

  // Jika kode adalah HTML lengkap
  if (rawCode.includes('<!DOCTYPE html>') || rawCode.includes('<html')) {
    return rawCode
  }

  // Jika kode adalah Vue SFC (<template>, <script setup>, <style>)
  const templateMatch = rawCode.match(/<template>([\s\S]*?)<\/template>/)
  const scriptMatch = rawCode.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/)
  const styleMatch = rawCode.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/)

  const templateContent = templateMatch ? templateMatch[1] : rawCode
  const scriptContent = scriptMatch ? scriptMatch[1] : ''
  const styleContent = styleMatch ? styleMatch[1] : ''

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"><\/script>
  <script src="https://unpkg.com/lucide@latest"><\/script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; }
    ${styleContent}
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
  <div id="app">
    ${templateContent}
  </div>

  <script>
    // Jalankan ikon Lucide
    if (window.lucide) {
      lucide.createIcons();
    }
  <\/script>
</body>
</html>`
})
</script>

<style scoped>
.bg-dot-grid {
  background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
  background-size: 16px 16px;
}
</style>
